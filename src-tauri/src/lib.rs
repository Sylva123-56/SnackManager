//! 零食管家 —— Tauri 应用入口。

mod commands;
mod storage;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        // 单实例：第二次启动时聚焦已有窗口，避免两个进程同时写同一个 JSON
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![
            commands::read_data,
            commands::read_backup,
            commands::write_data,
            commands::restore_from_backup,
            commands::write_side_backup,
            commands::copy_image,
            commands::write_image_bytes,
            commands::remove_image,
            commands::read_image_base64,
            commands::export_text,
            commands::import_text,
            commands::reveal_data_dir,
        ])
        .setup(|app| {
            // 首屏前确保目录存在，失败则让用户看到明确错误
            if let Ok(dir) = app.path().app_config_dir() {
                if let Err(err) = storage::ensure_dirs(&dir) {
                    eprintln!("初始化数据目录失败：{err}");
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("启动零食管家失败");
}
