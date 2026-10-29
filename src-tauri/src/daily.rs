//! Daily HoYoLAB features: real-time note (Trailblaze Power), daily check-in,
//! monthly income (Trailblaze calendar) and the official enhancement calculator.
//! All of them use the linked HoYoLAB login (see hoyolab.rs).

use crate::hoyolab::{call_event, client, creds_with_extra, record, role_query, roles, Credentials};
use serde_json::{json, Value};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

/// Debug builds keep the last response of each call in the app data folder for troubleshooting.
fn dump(app: &AppHandle, name: &str, v: &Result<Value, String>) {
    if !cfg!(debug_assertions) {
        return;
    }
    if let Ok(dir) = app.path().app_data_dir() {
        let body = match v {
            Ok(v) => v.clone(),
            Err(e) => json!({ "error": e }),
        };
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(dir.join(format!("debug_{name}.json")), serde_json::to_vec_pretty(&body).unwrap_or_default());
    }
}

const EVENT_API: &str = "https://sg-public-api.hoyolab.com/event";
const CHECKIN_ACT: &str = "e202303301540311";

/// Role lookups cost a request; the chosen role rarely changes while the app runs.
static ROLE: Mutex<Option<(Option<String>, Value)>> = Mutex::new(None);

async fn session(app: &AppHandle, uid: Option<String>) -> Result<(reqwest::Client, Credentials, Value), String> {
    let creds = creds_with_extra(app).await?;
    let http = client()?;
    let cached = ROLE.lock().ok().and_then(|r| r.clone()).filter(|(u, _)| *u == uid).map(|(_, r)| r);
    let role = match cached {
        Some(r) => r,
        None => {
            let (_, r) = roles(&http, &creds, uid.as_deref()).await?;
            if let Ok(mut slot) = ROLE.lock() {
                *slot = Some((uid.clone(), r.clone()));
            }
            r
        }
    };
    Ok((http, creds, role))
}

/// Real-time note: Trailblaze Power, Reserve, daily training, weekly bosses, dispatches.
#[tauri::command]
pub async fn daily_note(app: AppHandle, uid: Option<String>) -> Result<Value, String> {
    let (http, creds, role) = session(&app, uid).await?;
    let (server, role_id) = role_query(&role);
    let note = record(&http, &creds, &format!("note?server={server}&role_id={role_id}")).await?;
    Ok(json!({ "uid": role_id, "nickname": role["nickname"], "note": note }))
}

/// Daily check-in status, and the check-in itself when `sign` is set and today is not done yet.
/// A security check (captcha) is never solved here; it is reported as `captcha: true`.
#[tauri::command]
pub async fn daily_checkin(app: AppHandle, sign: bool) -> Result<Value, String> {
    let creds = creds_with_extra(&app).await?;
    let http = client()?;
    let headers = [("x-rpc-signgame", "hkrpg")];
    let base = format!("{EVENT_API}/luna/hkrpg/os");
    let info_url = format!("{base}/info?lang=ko-kr&act_id={CHECKIN_ACT}");
    let mut info = call_event(&http, &creds, reqwest::Method::GET, &info_url, None, &headers).await?;
    let home = call_event(&http, &creds, reqwest::Method::GET, &format!("{base}/home?lang=ko-kr&act_id={CHECKIN_ACT}"), None, &headers)
        .await
        .unwrap_or(Value::Null);

    let mut signed_now = false;
    let mut captcha = false;
    if sign && info["is_sign"] == json!(false) {
        let body = json!({ "act_id": CHECKIN_ACT });
        match call_event(&http, &creds, reqwest::Method::POST, &format!("{base}/sign?lang=ko-kr"), Some(body), &headers).await {
            Ok(res) => {
                let risk = &res["gt_result"];
                if risk["is_risk"] == json!(true) || risk["risk_code"].as_i64().unwrap_or(0) != 0 {
                    captcha = true;
                } else {
                    signed_now = true;
                }
            }
            // Already checked in today
            Err(e) if e.starts_with("HOYOLAB_5003") => {}
            Err(e) => return Err(e),
        }
        if signed_now
            && let Ok(fresh) = call_event(&http, &creds, reqwest::Method::GET, &info_url, None, &headers).await
        {
            info = fresh;
        }
    }
    let res = Ok(json!({ "info": info, "awards": home["awards"], "signedNow": signed_now, "captcha": captcha }));
    dump(&app, "checkin", &res);
    res
}

/// Trailblaze calendar (monthly Stellar Jade and Star Rail Pass income). `month` is YYYYMM; empty = current.
#[tauri::command]
pub async fn ledger_month(app: AppHandle, uid: Option<String>, month: Option<String>) -> Result<Value, String> {
    let (http, creds, role) = session(&app, uid).await?;
    let (region, role_id) = role_query(&role);
    let month = month.unwrap_or_default();
    let url = format!("{EVENT_API}/srledger/month_info?lang=ko-kr&uid={role_id}&region={region}&month={month}");
    let res = call_event(&http, &creds, reqwest::Method::GET, &url, None, &[("x-requested-with", "com.mihoyo.hoyolab")]).await;
    dump(&app, "ledger", &res);
    res
}

/// Characters for the calculator (owned ones, with current levels).
#[tauri::command]
pub async fn calc_avatars(app: AppHandle, uid: Option<String>) -> Result<Value, String> {
    let (http, creds, role) = session(&app, uid).await?;
    let (region, role_id) = role_query(&role);
    let mut all = Vec::new();
    for page in 1..=5 {
        let url = format!(
            "{EVENT_API}/rpgcalc/avatar/list?game=hkrpg&uid={role_id}&region={region}&lang=ko-kr&tab_from=TabOwned&page={page}&size=100"
        );
        let v = call_event(&http, &creds, reqwest::Method::GET, &url, None, &[]).await?;
        let list = v["list"].as_array().cloned().unwrap_or_default();
        let n = list.len();
        all.extend(list);
        if n < 100 {
            break;
        }
    }
    Ok(Value::Array(all))
}

/// One character's current level, traces and light cone as the calculator sees them.
#[tauri::command]
pub async fn calc_detail(app: AppHandle, uid: Option<String>, item_id: String) -> Result<Value, String> {
    let (http, creds, role) = session(&app, uid).await?;
    let (region, role_id) = role_query(&role);
    let id: String = item_id.chars().filter(|c| c.is_ascii_digit()).collect();
    let url = format!(
        "{EVENT_API}/rpgcalc/avatar/detail?game=hkrpg&lang=ko-kr&item_id={id}&tab_from=TabOwned&change_target_level=0&uid={role_id}&region={region}"
    );
    call_event(&http, &creds, reqwest::Method::GET, &url, None, &[]).await
}

/// Materials needed to go from the current to the target levels, plus what the account owns.
/// `body` holds `avatar`, `skill_list` and `equipment` as the HoYoLAB calculator expects.
#[tauri::command]
pub async fn calc_compute(app: AppHandle, uid: Option<String>, body: Value) -> Result<Value, String> {
    let (http, creds, role) = session(&app, uid).await?;
    let (region, role_id) = role_query(&role);
    let mut b = body;
    b["game"] = json!("hkrpg");
    b["lang"] = json!("ko-kr");
    b["uid"] = json!(role_id);
    b["region"] = json!(region);
    call_event(&http, &creds, reqwest::Method::POST, &format!("{EVENT_API}/rpgcalc/compute?game=hkrpg"), Some(b), &[]).await
}
