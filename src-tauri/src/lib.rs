pub mod commands;
pub mod models;

use commands::ast::analyze_reachability;
use commands::fs::{read_file_content, walk_directory, write_file_content};
use commands::pack::pack_files;
#[cfg(target_os = "macos")]
use tauri::menu::{AboutMetadata, MenuBuilder, SubmenuBuilder};

#[cfg(target_os = "macos")]
fn configure_macos_menu<R: tauri::Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    let author = env!("CARGO_PKG_AUTHORS")
        .split(':')
        .find(|value| !value.trim().is_empty())
        .unwrap_or("Unknown");
    let website = env!("CARGO_PKG_HOMEPAGE");
    let repository = env!("CARGO_PKG_REPOSITORY");

    let about_metadata = AboutMetadata {
        name: Some("Bablusheed".to_string()),
        version: Some(env!("CARGO_PKG_VERSION").to_string()),
        credits: Some(format!(
            "Author: {author}\nWebsite: {website}\nRepository: {repository}"
        )),
        website: if website.is_empty() {
            None
        } else {
            Some(website.to_string())
        },
        website_label: Some("Bablusheed Website".to_string()),
        ..Default::default()
    };

    let app_name = app.package_info().name.clone();
    let app_submenu = SubmenuBuilder::new(app, app_name)
        .about(Some(about_metadata))
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .separator()
        .quit()
        .build()?;

    let file_submenu = SubmenuBuilder::new(app, "File")
        .close_window()
        .build()?;

    let edit_submenu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let window_submenu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .close_window()
        .build()?;

    let help_submenu = SubmenuBuilder::new(app, "Help").build()?;

    let menu = MenuBuilder::new(app)
        .item(&app_submenu)
        .item(&file_submenu)
        .item(&edit_submenu)
        .item(&window_submenu)
        .item(&help_submenu)
        .build()?;

    app.set_menu(menu)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(target_os = "macos")]
            configure_macos_menu(app)?;
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            walk_directory,
            read_file_content,
            write_file_content,
            pack_files,
            analyze_reachability,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
