//! HoYoLAB account link.
//!
//! Login happens in a separate app window that shows the real hoyolab.com site.
//! Once the user is logged in, the HoYoLAB login cookies are read from the webview,
//! stored in the OS credential store (Windows Credential Manager / macOS Keychain),
//! and the window closes. The cookies never leave this PC except in requests to HoYoLAB.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, Url, WebviewUrl, WebviewWindowBuilder};

const LOGIN_LABEL: &str = "hoyolab-login";
const LOGIN_URL: &str = "https://www.hoyolab.com/home";
const KEYRING_SERVICE: &str = "StarRail Archive";
const KEYRING_USER: &str = "hoyolab";
/// Salt for the DS header used by HoYoLAB's overseas web endpoints.
const DS_SALT: &str = "6s25p5ox5y14umn1p61aqyyvbvvl3lrt";
const RECORD_API: &str = "https://bbs-api-os.hoyolab.com/game_record/hkrpg/api";
const ROLES_API: &str =
    "https://api-account-os.hoyolab.com/account/binding/api/getUserGameRolesByCookie?game_biz=hkrpg_global";

#[derive(Serialize, Deserialize, Clone)]
struct Credentials {
    ltuid_v2: String,
    ltoken_v2: String,
    ltmid_v2: Option<String>,
}

impl Credentials {
    fn cookie_header(&self) -> String {
        let mut s = format!("ltuid_v2={}; ltoken_v2={}", self.ltuid_v2, self.ltoken_v2);
        if let Some(mid) = &self.ltmid_v2 {
            s.push_str(&format!("; ltmid_v2={mid}"));
        }
        s
    }
}

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())
}

fn load_creds() -> Option<Credentials> {
    let raw = entry().ok()?.get_password().ok()?;
    serde_json::from_str(&raw).ok()
}

fn save_creds(c: &Credentials) -> Result<(), String> {
    let raw = serde_json::to_string(c).map_err(|e| e.to_string())?;
    entry()?.set_password(&raw).map_err(|e| e.to_string())
}

/// Shown on top of hoyolab.com inside the login window.
const LOGIN_BANNER: &str = r#"
(function () {
  function add() {
    if (!document.body || document.getElementById('sra-banner')) return;
    var b = document.createElement('div');
    b.id = 'sra-banner';
    b.textContent = 'StarRail Archive · 오른쪽 위에서 로그인하면 이 창은 자동으로 닫혀요';
    b.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483647;' +
      'padding:10px 20px;border-radius:20px;background:#efe8d6;color:#17181d;font:600 14px sans-serif;' +
      'box-shadow:0 6px 24px rgba(0,0,0,.35);pointer-events:none';
    document.body.appendChild(b);
  }
  document.addEventListener('DOMContentLoaded', add);
  setInterval(add, 1500);
})();
"#;

/// Returns the linked HoYoLAB account id (ltuid), or None when not linked.
#[tauri::command]
pub async fn hoyolab_status() -> Option<String> {
    load_creds().map(|c| c.ltuid_v2)
}

/// Opens the HoYoLAB login window and waits in the background for the login cookies.
/// Emits `hoyolab://linked` (payload: ltuid) or `hoyolab://login-closed`.
#[tauri::command]
pub async fn hoyolab_login(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(LOGIN_LABEL) {
        let _ = w.set_focus();
        return Ok(());
    }
    let url = LOGIN_URL.parse::<Url>().map_err(|e| e.to_string())?;
    let win = WebviewWindowBuilder::new(&app, LOGIN_LABEL, WebviewUrl::External(url))
        .title("HoYoLAB 로그인 — 로그인하면 자동으로 닫혀요")
        .inner_size(1180.0, 820.0)
        .center()
        .initialization_script(LOGIN_BANNER)
        .build()
        .map_err(|e| e.to_string())?;

    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        let cookie_url: Url = "https://www.hoyolab.com/".parse().unwrap();
        // Give the user up to 15 minutes to log in.
        for _ in 0..900 {
            tokio::time::sleep(Duration::from_secs(1)).await;
            if app2.get_webview_window(LOGIN_LABEL).is_none() {
                let _ = app2.emit("hoyolab://login-closed", ());
                return;
            }
            let Ok(cookies) = win.cookies_for_url(cookie_url.clone()) else { continue };
            let get = |name: &str| {
                cookies
                    .iter()
                    .find(|c| c.name() == name && !c.value().is_empty())
                    .map(|c| c.value().to_string())
            };
            if let (Some(ltuid_v2), Some(ltoken_v2)) = (get("ltuid_v2"), get("ltoken_v2")) {
                let creds = Credentials { ltuid_v2: ltuid_v2.clone(), ltoken_v2, ltmid_v2: get("ltmid_v2") };
                match save_creds(&creds) {
                    Ok(()) => {
                        let _ = app2.emit("hoyolab://linked", ltuid_v2);
                    }
                    Err(e) => {
                        let _ = app2.emit("hoyolab://error", format!("로그인 정보를 저장하지 못했어요: {e}"));
                    }
                }
                let _ = win.close();
                return;
            }
        }
        let _ = win.close();
    });
    Ok(())
}

/// Forgets the stored login and removes HoYoLAB cookies from the app's browser storage,
/// so the next link can use a different account.
#[tauri::command]
pub async fn hoyolab_logout(app: AppHandle) -> Result<(), String> {
    if let Ok(e) = entry() {
        let _ = e.delete_credential();
    }
    if let Some(main) = app.get_webview_window("main") {
        if let Ok(cookies) = main.cookies() {
            for c in cookies {
                let domain = c.domain().unwrap_or_default().to_string();
                if domain.contains("hoyolab") || domain.contains("hoyoverse") || domain.contains("mihoyo") {
                    let _ = main.delete_cookie(c);
                }
            }
        }
    }
    Ok(())
}

/// Dynamic secret header HoYoLAB expects on game record requests.
fn ds() -> String {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    let t = now.as_secs();
    // 6 pseudo-random letters; only needs to vary between requests.
    let seed = format!("{:x}", md5::compute(now.as_nanos().to_le_bytes()));
    let r: String = seed.chars().filter(|c| c.is_ascii_alphabetic()).chain("abcdef".chars()).take(6).collect();
    let h = md5::compute(format!("salt={DS_SALT}&t={t}&r={r}"));
    format!("{t},{r},{h:x}")
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36")
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())
}

async fn call(
    http: &reqwest::Client,
    creds: &Credentials,
    method: reqwest::Method,
    url: &str,
    body: Option<Value>,
) -> Result<Value, String> {
    call_lang(http, creds, method, url, body, "en-us").await
}

async fn call_lang(
    http: &reqwest::Client,
    creds: &Credentials,
    method: reqwest::Method,
    url: &str,
    body: Option<Value>,
    lang: &str,
) -> Result<Value, String> {
    let mut req = http
        .request(method, url)
        .header("Cookie", creds.cookie_header())
        .header("DS", ds())
        .header("x-rpc-app_version", "1.5.0")
        .header("x-rpc-client_type", "5")
        .header("x-rpc-language", lang)
        .header("Origin", "https://act.hoyolab.com")
        .header("Referer", "https://act.hoyolab.com/");
    if let Some(b) = body {
        req = req.json(&b);
    }
    let res = req.send().await.map_err(|e| format!("HoYoLAB에 연결하지 못했어요: {e}"))?;
    let status = res.status();
    let v: Value = res
        .json()
        .await
        .map_err(|e| format!("HoYoLAB 응답을 읽지 못했어요 (HTTP {status}): {e}"))?;
    let code = v["retcode"].as_i64().unwrap_or(-1);
    if code == 0 {
        return Ok(v["data"].clone());
    }
    let msg = v["message"].as_str().unwrap_or("").to_string();
    Err(match code {
        -100 | 10001 | -101 => "LOGIN_EXPIRED: HoYoLAB 로그인이 만료됐어요. 다시 연동해 주세요.".into(),
        10102 => "PRIVATE: HoYoLAB 전적에서 '캐릭터 상세 정보'가 비공개예요. HoYoLAB 앱 > 전적 > 설정에서 공개로 바꿔 주세요.".into(),
        10101 | 10103 => format!("HoYoLAB 요청 제한에 걸렸어요. 잠시 후 다시 시도해 주세요. ({code} {msg})"),
        _ => format!("HoYoLAB 오류 {code}: {msg}"),
    })
}

/// Fetches the linked account's Star Rail roles and full character details.
/// Returns raw HoYoLAB JSON; the frontend maps it into app data.
/// A copy is written to <app data>/last_sync.json for troubleshooting.
#[tauri::command]
pub async fn hoyolab_fetch(app: AppHandle, uid: Option<String>) -> Result<Value, String> {
    let creds = load_creds().ok_or("LOGIN_REQUIRED: HoYoLAB 연동이 필요해요.")?;
    let http = client()?;

    let roles = call(&http, &creds, reqwest::Method::GET, ROLES_API, None).await?;
    let list = roles["list"].as_array().cloned().unwrap_or_default();
    let role = match &uid {
        Some(u) => list.iter().find(|r| r["game_uid"].as_str() == Some(u.as_str())).cloned(),
        None => list.iter().max_by_key(|r| r["level"].as_i64().unwrap_or(0)).cloned(),
    }
    .ok_or("NO_ROLE: 이 HoYoLAB 계정에 연결된 붕괴: 스타레일 계정이 없어요.")?;

    let server = role["region"].as_str().unwrap_or_default().to_string();
    let role_id = role["game_uid"].as_str().unwrap_or_default().to_string();
    let q = format!("server={server}&role_id={role_id}");

    // Detailed character list. GET has worked historically; fall back to POST if the API changed.
    let info_url = format!("{RECORD_API}/avatar/info?{q}&need_wiki=true");
    let avatars = match call(&http, &creds, reqwest::Method::GET, &info_url, None).await {
        Ok(v) => v,
        Err(e) if e.starts_with("LOGIN_EXPIRED") || e.starts_with("PRIVATE") => return Err(e),
        Err(_) => {
            let body = json!({ "server": server, "role_id": role_id, "need_wiki": true });
            call(&http, &creds, reqwest::Method::POST, &format!("{RECORD_API}/avatar/info"), Some(body)).await?
        }
    };
    // Basic profile (avatar icon, stats). Optional.
    let index = call(&http, &creds, reqwest::Method::GET, &format!("{RECORD_API}/index?{q}"), None)
        .await
        .unwrap_or(Value::Null);

    // End-game records (Memory of Chaos, Pure Fiction, Apocalyptic Shadow), current and previous period.
    // Korean so period and buff names show as in the game. Each one is optional.
    let mut challenges = serde_json::Map::new();
    for (key, path, extra) in [
        ("moc", "challenge", ""),
        ("pf", "challenge_story", "&type=story"),
        ("as", "challenge_boss", "&type=boss"),
    ] {
        for (when, schedule) in [("current", 1), ("previous", 2)] {
            let url = format!("{RECORD_API}/{path}?{q}&schedule_type={schedule}&need_all=true{extra}");
            let v = call_lang(&http, &creds, reqwest::Method::GET, &url, None, "ko-kr")
                .await
                .unwrap_or(Value::Null);
            challenges.insert(format!("{key}_{when}"), v);
        }
    }

    let out = json!({
        "roles": list,
        "role": role,
        "avatars": avatars,
        "index": index,
        "challenges": Value::Object(challenges),
    });
    if let Ok(dir) = app.path().app_data_dir() {
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(dir.join("last_sync.json"), serde_json::to_vec_pretty(&out).unwrap_or_default());
    }
    Ok(out)
}
