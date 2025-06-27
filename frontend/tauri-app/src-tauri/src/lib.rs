// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(
	all(not(debug_assertions), target_os = "windows"),
	windows_subsystem = "windows"
)]

use std::sync::Arc;
use tauri::State;

mod terminal;
use terminal::{TerminalConfig, TerminalManager};

mod custom_terminal;
mod custom_terminal_commands;

#[cfg(test)]
mod cli_agents_test;
use custom_terminal_commands::{
	custom_connect_terminal, custom_kill_terminal, custom_reconnect_terminal,
	custom_resize_terminal, custom_send_ctrl_c, custom_send_ctrl_d,
	custom_send_input_lines, custom_send_raw_input, custom_send_scroll_down,
	custom_send_scroll_up, AppState,
};

mod file_tree;
use file_tree::{read_directory, FileNode};

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

#[tauri::command]
async fn cleanup_dead_connections(
	terminal_manager: State<'_, Arc<TerminalManager>>,
) -> Result<(), String> {
	terminal_manager
		.cleanup_dead_connections()
		.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_current_dir() -> Result<String, String> {
	std::env::current_dir()
		.map(|p| p.to_string_lossy().to_string())
		.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_file_tree(path: String) -> Result<Vec<FileNode>, String> {
	read_directory(&path).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn open_directory_picker(app: tauri::AppHandle) -> Result<Option<String>, String> {
	use tauri_plugin_dialog::DialogExt;
	use std::sync::{Arc, Mutex};
	use std::time::Duration;
	use tokio::time;
	
	let result = Arc::new(Mutex::new(None));
	let result_clone = result.clone();
	let done = Arc::new(Mutex::new(false));
	let done_clone = done.clone();
	
	app.dialog().file().pick_folder(move |folder_path| {
		{
			let mut r = result_clone.lock().unwrap();
			*r = Some(folder_path);
		}
		{
			let mut d = done_clone.lock().unwrap();
			*d = true;
		}
	});
	
	// Wait for the dialog to complete, but with a timeout
	let mut attempts = 0;
	while attempts < 300 { // 30 seconds max
		{
			let is_done = *done.lock().unwrap();
			if is_done {
				break;
			}
		}
		time::sleep(Duration::from_millis(100)).await;
		attempts += 1;
	}
	
	let final_result = result.lock().unwrap().clone();
	match final_result {
		Some(Some(path)) => Ok(Some(path.to_string())),
		Some(None) => Ok(None),
		None => Err("Dialog timed out".to_string()),
	}
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
	let terminal_manager = Arc::new(TerminalManager::new());
	let custom_terminal_state = AppState::new();

	tauri::Builder::default()
		.plugin(tauri_plugin_store::Builder::new().build())
		.plugin(tauri_plugin_fs::init())
		.plugin(tauri_plugin_dialog::init())
		.manage(terminal_manager)
		.manage(custom_terminal_state)
		.invoke_handler(tauri::generate_handler![
			// Original terminal commands
			create_terminal_connection,
			send_terminal_data,
			resize_terminal,
			close_terminal_connection,
			get_available_terminal_types,
			validate_terminal_config,
			cleanup_dead_connections,
			// New custom terminal commands
			custom_connect_terminal,
			custom_reconnect_terminal,
			custom_kill_terminal,
			custom_send_input_lines,
			custom_send_raw_input,
			custom_send_ctrl_c,
			custom_send_ctrl_d,
			custom_send_scroll_up,
			custom_send_scroll_down,
			custom_resize_terminal,
			// File tree commands
			get_current_dir,
			get_file_tree,
			open_directory_picker
		])
		.run(tauri::generate_context!())
		.expect("error while running tauri application");
}
