// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(
	all(not(debug_assertions), target_os = "windows"),
	windows_subsystem = "windows"
)]

use log::LevelFilter;
use std::sync::Arc;
use tauri::{Manager, State};

mod terminal;
use terminal::{TerminalConfig, TerminalManager};

mod file_watcher;
use file_watcher::FileWatcher;

mod custom_terminal;
mod custom_terminal_commands;
mod logger;

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

mod lsp;
use lsp::{LspDiagnostic, LspManager};

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
async fn read_file(path: String) -> Result<String, String> {
	tokio::fs::read_to_string(&path)
		.await
		.map_err(|e| e.to_string())
}

#[tauri::command]
async fn write_file(path: String, content: String) -> Result<(), String> {
	tokio::fs::write(&path, content)
		.await
		.map_err(|e| e.to_string())
}

#[tauri::command]
async fn watch_file(
	path: String,
	file_watcher: State<'_, Arc<FileWatcher>>,
) -> Result<(), String> {
	println!("[Command] watch_file command called with path: {}", path);
	let result = file_watcher
		.watch_file(path.clone())
		.await
		.map_err(|e| e.to_string());
	match &result {
		Ok(_) => println!("[Command] watch_file command succeeded for: {}", path),
		Err(e) => println!("[Command] watch_file command failed for {}: {}", path, e),
	}
	result
}

#[tauri::command]
async fn unwatch_file(
	path: String,
	file_watcher: State<'_, Arc<FileWatcher>>,
) -> Result<(), String> {
	println!("[Command] unwatch_file command called with path: {}", path);
	let result = file_watcher
		.unwatch_file(path.clone())
		.await
		.map_err(|e| e.to_string());
	match &result {
		Ok(_) => println!("[Command] unwatch_file command succeeded for: {}", path),
		Err(e) => println!("[Command] unwatch_file command failed for {}: {}", path, e),
	}
	result
}

#[tauri::command]
async fn start_lsp_for_file(
	file_path: String,
	lsp_manager: State<'_, Arc<LspManager>>,
) -> Result<(), String> {
	log::info!("[Command] start_lsp_for_file called for: {}", file_path);

	let result = lsp_manager
		.start_lsp_for_file(&file_path)
		.await
		.map_err(|e| {
			let err_string = e.to_string();
			log::error!("[Command] start_lsp_for_file failed: {}", err_string);
			err_string
		});

	if result.is_ok() {
		log::info!(
			"[Command] start_lsp_for_file completed successfully for: {}",
			file_path
		);
	}

	result
}

#[tauri::command]
async fn check_lsp_running(
	file_path: String,
	lsp_manager: State<'_, Arc<LspManager>>,
) -> Result<bool, String> {
	if let Some(server_type) = lsp_manager.get_lsp_type_for_file(&file_path) {
		Ok(lsp_manager.is_lsp_running(&server_type).await)
	} else {
		Ok(false)
	}
}

#[tauri::command]
async fn lsp_open_document(
	uri: String,
	text: String,
	language_id: String,
	lsp_manager: State<'_, Arc<LspManager>>,
) -> Result<(), String> {
	lsp_manager
		.open_document(uri, text, language_id)
		.await
		.map_err(|e| e.to_string())
}

#[tauri::command]
async fn lsp_update_document(
	uri: String,
	text: String,
	version: i32,
	lsp_manager: State<'_, Arc<LspManager>>,
) -> Result<(), String> {
	lsp_manager
		.update_document(uri, text, version)
		.await
		.map_err(|e| e.to_string())
}

#[tauri::command]
async fn lsp_get_diagnostics(
	uri: String,
	lsp_manager: State<'_, Arc<LspManager>>,
) -> Result<Vec<LspDiagnostic>, String> {
	Ok(lsp_manager.get_diagnostics(&uri).await)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
	let terminal_manager = Arc::new(TerminalManager::new());
	let custom_terminal_state = AppState::new();
	let lsp_manager = Arc::new(LspManager::new());

	tauri::Builder::default()
		.plugin(tauri_plugin_store::Builder::new().build())
		.plugin(logger::init(LevelFilter::Debug))
		.plugin(tauri_plugin_fs::init())
		.setup(|app| {
			log::debug!("starting ariana-ide tauri");
			let file_watcher = Arc::new(FileWatcher::new(app.handle().clone()));
			app.manage(file_watcher);
			Ok(())
		})
		.manage(terminal_manager)
		.manage(custom_terminal_state)
		.manage(lsp_manager)
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
			read_file,
			write_file,
			// File watcher commands
			watch_file,
			unwatch_file,
			// LSP commands
			start_lsp_for_file,
			check_lsp_running,
			lsp_open_document,
			lsp_update_document,
			lsp_get_diagnostics
		])
		.run(tauri::generate_context!())
		.expect("error while running tauri application");
}
