// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::sync::Arc;
use tauri::State;

mod terminal;
use terminal::{TerminalManager, TerminalConfig};

#[tauri::command]
async fn create_terminal_connection(
    config: TerminalConfig,
    terminal_manager: State<'_, Arc<TerminalManager>>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    terminal_manager
        .create_connection(config, app_handle)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn send_terminal_data(
    connection_id: String,
    data: String,
    terminal_manager: State<'_, Arc<TerminalManager>>,
) -> Result<(), String> {
    terminal_manager
        .send_data(&connection_id, &data)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn resize_terminal(
    connection_id: String,
    cols: u16,
    rows: u16,
    terminal_manager: State<'_, Arc<TerminalManager>>,
) -> Result<(), String> {
    terminal_manager
        .resize_terminal(&connection_id, cols, rows)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn close_terminal_connection(
    connection_id: String,
    terminal_manager: State<'_, Arc<TerminalManager>>,
) -> Result<(), String> {
    terminal_manager
        .close_connection(&connection_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_available_terminal_types() -> Vec<String> {
    TerminalManager::get_available_terminal_types()
}

#[tauri::command]
async fn validate_terminal_config(config: TerminalConfig) -> bool {
    TerminalManager::validate_config(&config)
}

fn main() {
    let terminal_manager = Arc::new(TerminalManager::new());

    tauri::Builder::default()
        .manage(terminal_manager)
        .invoke_handler(tauri::generate_handler![
            create_terminal_connection,
            send_terminal_data,
            resize_terminal,
            close_terminal_connection,
            get_available_terminal_types,
            validate_terminal_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
