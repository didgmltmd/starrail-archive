mod daily;
mod gacha;
mod hoyolab;

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};

/// When on, closing the main window hides it to the tray so Trailblaze Power alerts keep working.
static KEEP_IN_TRAY: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn set_keep_in_tray(enabled: bool) {
    KEEP_IN_TRAY.store(enabled, Ordering::Relaxed);
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Starting the app again (e.g. from the Start menu while it sits in the tray) opens the running one
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let open = MenuItem::with_id(app, "open", "열기", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            let mut tray = TrayIconBuilder::with_id("main")
                .tooltip("StarRail Archive")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| match e.id().as_ref() {
                    "open" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, e| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                        show_main(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" && KEEP_IN_TRAY.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                    let _ = window.emit("app://hidden-to-tray", ());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            set_keep_in_tray,
            hoyolab::hoyolab_status,
            hoyolab::hoyolab_login,
            hoyolab::hoyolab_logout,
            hoyolab::hoyolab_fetch,
            gacha::gacha_find_url,
            gacha::gacha_fetch,
            daily::daily_note,
            daily::daily_checkin,
            daily::ledger_month,
            daily::calc_avatars,
            daily::calc_detail,
            daily::calc_compute,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
