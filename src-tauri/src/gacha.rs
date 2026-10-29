//! Warp (gacha) history.
//!
//! HoYoLAB cookies can't read warp history. The game itself opens the history page with a
//! temporary key (`authkey`, valid ~24h) and that page's address ends up in the game's web cache.
//! On a PC that runs the game we find the newest such address and page through the official
//! history API with it. Nothing is sent anywhere except to HoYoverse's own API.

use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Url};

const API_OS: &str = "https://public-operation-hkrpg-sg.hoyoverse.com/common/hkrpg_gacha_record/api/getGachaLog";
const API_CN: &str = "https://public-operation-hkrpg.mihoyo.com/common/hkrpg_gacha_record/api/getGachaLog";

/// Where a cached warp-history address can start (web page or API form).
const URL_PREFIXES: [&str; 4] = [
    "https://gs.hoyoverse.com/hkrpg/event/e20211215gacha",
    "https://webstatic.mihoyo.com/hkrpg/event/e20211215gacha",
    "https://public-operation-hkrpg-sg.hoyoverse.com/common/",
    "https://public-operation-hkrpg.mihoyo.com/common/",
];

/// Character event, light cone event, collab character, collab light cone, standard, departure.
const GACHA_TYPES: [&str; 6] = ["11", "12", "21", "22", "1", "2"];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundUrl {
    url: String,
    /// When the game last wrote the cache file (ms since epoch)
    cached_at: u64,
}

fn player_logs() -> Vec<PathBuf> {
    let Some(base) = std::env::var_os("USERPROFILE").map(PathBuf::from) else {
        return vec![];
    };
    let low = base.join("AppData").join("LocalLow");
    let mut out = vec![];
    for dir in [low.join("Cognosphere").join("Star Rail"), low.join("miHoYo").join("崩坏：星穹铁道")] {
        for f in ["Player.log", "Player-prev.log"] {
            let p = dir.join(f);
            if p.exists() {
                out.push(p);
            }
        }
    }
    out
}

/// `.../StarRail_Data` folder, read from the game's own log.
fn game_data_dir() -> Option<PathBuf> {
    for log in player_logs() {
        let Ok(bytes) = std::fs::read(&log) else { continue };
        let text = String::from_utf8_lossy(&bytes);
        for line in text.lines() {
            if let Some(rest) = line.strip_prefix("Loading player data from ") {
                let p = PathBuf::from(rest.trim());
                if let Some(dir) = p.parent() {
                    if dir.exists() {
                        return Some(dir.to_path_buf());
                    }
                }
            }
            if let Some(i) = line.find("StarRail_Data") {
                // Fallback for log formats without the line above: take the drive path up to StarRail_Data.
                if let Some(start) = line[..i].rfind(|c: char| c == ' ' || c == '\'' || c == '"') {
                    let dir = PathBuf::from(&line[start + 1..i + "StarRail_Data".len()]);
                    if dir.is_absolute() && dir.exists() {
                        return Some(dir);
                    }
                }
            }
        }
    }
    None
}

/// Newest `webCaches/<version>/Cache/Cache_Data/data_2`.
fn newest_cache_file(data_dir: &Path) -> Option<(PathBuf, u64)> {
    let web = data_dir.join("webCaches");
    let mut candidates = vec![web.join("Cache").join("Cache_Data").join("data_2")];
    if let Ok(rd) = std::fs::read_dir(&web) {
        for e in rd.flatten() {
            candidates.push(e.path().join("Cache").join("Cache_Data").join("data_2"));
        }
    }
    candidates
        .into_iter()
        .filter_map(|p| {
            let t = std::fs::metadata(&p).ok()?.modified().ok()?;
            Some((p, t.duration_since(UNIX_EPOCH).ok()?.as_millis() as u64))
        })
        .max_by_key(|(_, t)| *t)
}

/// All warp-history addresses in the cache, newest (last written) first.
fn urls_in_cache(file: &Path) -> Vec<String> {
    let Ok(bytes) = std::fs::read(file) else { return vec![] };
    let text = String::from_utf8_lossy(&bytes);
    let mut found: Vec<(usize, String)> = vec![];
    for prefix in URL_PREFIXES {
        for (i, _) in text.match_indices(prefix) {
            let rest = &text[i..];
            let end = rest
                .find(|c: char| c == '\0' || c == '"' || c.is_whitespace() || !c.is_ascii() || c.is_ascii_control())
                .unwrap_or(rest.len());
            let url = &rest[..end];
            if url.contains("authkey=") && (prefix.contains("e20211215gacha") || url.contains("GachaLog")) {
                found.push((i, url.to_string()));
            }
        }
    }
    found.sort_by(|a, b| b.0.cmp(&a.0));
    let mut seen = std::collections::HashSet::new();
    found.into_iter().map(|(_, u)| u).filter(|u| seen.insert(u.clone())).take(8).collect()
}

/// Turns any cached address into the API address without paging parameters.
fn api_base(raw: &str) -> Result<Url, String> {
    let src: Url = raw.trim().parse().map_err(|_| "BAD_URL".to_string())?;
    let mut keep: Vec<(String, String)> = src
        .query_pairs()
        .filter(|(k, _)| !matches!(k.as_ref(), "gacha_type" | "page" | "size" | "end_id" | "lang"))
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();
    if !keep.iter().any(|(k, _)| k == "authkey") {
        return Err("BAD_URL".into());
    }
    let cn = keep.iter().any(|(k, v)| k == "game_biz" && v.ends_with("_cn"));
    keep.push(("lang".into(), "ko-kr".into()));
    let mut url: Url = (if cn { API_CN } else { API_OS }).parse().unwrap();
    url.query_pairs_mut().extend_pairs(keep);
    Ok(url)
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())
}

/// One page. Errors: AUTHKEY_EXPIRED, AUTHKEY_INVALID, or a message.
async fn page(http: &reqwest::Client, base: &Url, gacha_type: &str, end_id: &str, size: u32) -> Result<Value, String> {
    let mut url = base.clone();
    if matches!(gacha_type, "21" | "22") {
        url.set_path(&url.path().replace("/getGachaLog", "/getLdGachaLog"));
    }
    url.query_pairs_mut()
        .append_pair("gacha_type", gacha_type)
        .append_pair("page", "1")
        .append_pair("size", &size.to_string())
        .append_pair("end_id", end_id);
    for attempt in 0..5 {
        let body: Value = http
            .get(url.clone())
            .send()
            .await
            .map_err(|e| format!("워프 기록 서버에 연결하지 못했어요: {e}"))?
            .json()
            .await
            .map_err(|e| format!("워프 기록 응답을 읽지 못했어요: {e}"))?;
        match body["retcode"].as_i64().unwrap_or(-1) {
            0 => return Ok(body["data"].clone()),
            -101 => return Err("AUTHKEY_EXPIRED".into()),
            -100 | -102 => return Err("AUTHKEY_INVALID".into()),
            // "visit too frequently"
            -110 if attempt < 4 => tokio::time::sleep(Duration::from_millis(1200)).await,
            code => {
                return Err(format!(
                    "워프 기록을 가져오지 못했어요 ({code}): {}",
                    body["message"].as_str().unwrap_or("")
                ))
            }
        }
    }
    Err("요청이 너무 잦다고 해요. 잠시 후 다시 시도해 주세요.".into())
}

/// Finds the newest working warp-history address on this PC.
/// Errors: NO_GAME (game never ran here), NO_URL (history page not opened yet), AUTHKEY_EXPIRED.
#[tauri::command]
pub async fn gacha_find_url() -> Result<FoundUrl, String> {
    let (file, cached_at) = tauri::async_runtime::spawn_blocking(|| {
        let dir = game_data_dir().ok_or("NO_GAME")?;
        newest_cache_file(&dir).ok_or("NO_URL")
    })
    .await
    .map_err(|e| e.to_string())??;
    let urls = tauri::async_runtime::spawn_blocking(move || urls_in_cache(&file))
        .await
        .map_err(|e| e.to_string())?;
    if urls.is_empty() {
        return Err("NO_URL".into());
    }
    let http = client()?;
    let mut last_err = String::from("AUTHKEY_EXPIRED");
    for raw in urls {
        let Ok(base) = api_base(&raw) else { continue };
        match page(&http, &base, "1", "0", 1).await {
            Ok(_) => return Ok(FoundUrl { url: base.to_string(), cached_at }),
            Err(e) => last_err = e,
        }
    }
    Err(last_err)
}

/// Downloads warp history newer than `since` (gacha_type -> newest known record id).
/// Emits `gacha://progress` { gachaType, page, count } while paging.
#[tauri::command]
pub async fn gacha_fetch(app: AppHandle, url: String, since: HashMap<String, String>) -> Result<Value, String> {
    let base = api_base(&url)?;
    let http = client()?;
    let newer = |id: &str, known: &str| id.len() > known.len() || (id.len() == known.len() && id > known);

    let mut records: Vec<Value> = vec![];
    let mut uid: Option<String> = None;
    let mut tz: Option<Value> = None;
    for t in GACHA_TYPES {
        let known = since.get(t).cloned().unwrap_or_default();
        let mut end_id = String::from("0");
        let mut pages = 0;
        'paging: loop {
            pages += 1;
            if pages > 500 {
                break;
            }
            let data = match page(&http, &base, t, &end_id, 20).await {
                Ok(d) => d,
                // Collaboration warps may not exist for every account/server
                Err(e) if matches!(t, "21" | "22") && !e.starts_with("AUTHKEY") => break,
                Err(e) => return Err(e),
            };
            if tz.is_none() {
                tz = data.get("region_time_zone").cloned();
            }
            let list = data["list"].as_array().cloned().unwrap_or_default();
            if list.is_empty() {
                break;
            }
            for item in &list {
                let id = item["id"].as_str().unwrap_or_default().to_string();
                if !known.is_empty() && !newer(&id, &known) {
                    break 'paging;
                }
                if uid.is_none() {
                    uid = item["uid"].as_str().map(String::from);
                }
                end_id = id;
                records.push(item.clone());
            }
            let _ = app.emit("gacha://progress", json!({ "gachaType": t, "page": pages, "count": records.len() }));
            if list.len() < 20 {
                break;
            }
            tokio::time::sleep(Duration::from_millis(250)).await;
        }
    }
    Ok(json!({ "uid": uid, "timeZone": tz, "records": records }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_newest_url_in_cache_and_builds_api_address() {
        let dir = std::env::temp_dir().join("sra-gacha-test");
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("data_2");
        let mut bytes = b"junk\x00\x011/0/https://gs.hoyoverse.com/hkrpg/event/e20211215gacha-v2/index.html?authkey_ver=1&sign_type=2&authkey=OLD%2Bkey&game_biz=hkrpg_global&lang=en\x00more".to_vec();
        bytes.extend_from_slice(b"\xff\xfe1/0/https://public-operation-hkrpg-sg.hoyoverse.com/common/hkrpg_gacha_record/api/getGachaLog?authkey_ver=1&authkey=NEW%3D&game_biz=hkrpg_global&gacha_type=11&page=3&size=5&end_id=99\x00tail");
        bytes.extend_from_slice(b"https://public-operation-hkrpg-sg.hoyoverse.com/common/other?x=1\x00");
        std::fs::write(&file, bytes).unwrap();

        let urls = urls_in_cache(&file);
        assert_eq!(urls.len(), 2);
        assert!(urls[0].contains("NEW%3D"));

        let api = api_base(&urls[1]).unwrap();
        assert!(api.as_str().starts_with(API_OS));
        let q: HashMap<_, _> = api.query_pairs().into_owned().collect();
        assert_eq!(q["authkey"], "OLD+key");
        assert_eq!(q["lang"], "ko-kr");

        let api = api_base(&urls[0]).unwrap();
        let q: HashMap<_, _> = api.query_pairs().into_owned().collect();
        assert_eq!(q["authkey"], "NEW=");
        assert!(!q.contains_key("page") && !q.contains_key("gacha_type") && !q.contains_key("end_id"));
        assert!(api_base("https://example.com/?x=1").is_err());
    }
}
