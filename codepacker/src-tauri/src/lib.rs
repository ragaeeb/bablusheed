pub mod commands;
pub mod models;

use commands::ast::analyze_reachability;
use commands::fs::walk_directory;
use commands::pack::pack_files;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            walk_directory,
            pack_files,
            analyze_reachability,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
