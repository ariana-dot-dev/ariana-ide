// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(
	all(not(debug_assertions), target_os = "windows"),
	windows_subsystem = "windows"
)]

use log::LevelFilter;
use std::path::Path;
use std::process::Command;
use std::sync::Arc;
use tauri::{Manager, State};

mod terminal;
use terminal::TerminalManager;

mod file_watcher;
use file_watcher::FileWatcher;

mod custom_terminal;
mod custom_terminal_commands;
mod logger;

mod os;

use custom_terminal_commands::{
	custom_connect_terminal, custom_kill_terminal, custom_resize_terminal,
	custom_send_ctrl_c, custom_send_ctrl_d, custom_send_input_lines,
	custom_send_raw_input, custom_send_scroll_down, custom_send_scroll_up,
};

use crate::{
	custom_terminal::CustomTerminalManager,
	os::{FileNode, GitSearchManager, GitSearchResult, OsSession, OsSessionKind},
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
	let terminals_manager = Arc::new(TerminalManager::new());
	let custom_terminals_manager = Arc::new(CustomTerminalManager::new());
	let git_search_manager = Arc::new(GitSearchManager::new());
	let lsp_manager = Arc::new(LspManager::new());

	tauri::Builder::default()
		.plugin(tauri_plugin_os::init())
		.plugin(tauri_plugin_store::Builder::new().build())
		.plugin(logger::init(LevelFilter::Info))
		.plugin(tauri_plugin_fs::init())
		.setup(|app| {
			log::debug!("starting ariana-ide tauri");
			let file_watcher = Arc::new(FileWatcher::new(app.handle().clone()));
			app.manage(file_watcher);
			Ok(())
		})
		.manage(terminals_manager)
		.manage(custom_terminals_manager)
		.manage(git_search_manager)
		.manage(lsp_manager)
		.invoke_handler(tauri::generate_handler![
			// Original terminal commands
			create_terminal_connection,
			send_terminal_data,
			resize_terminal,
			close_terminal_connection,
			cleanup_dead_connections,
			// New custom terminal commands
			custom_connect_terminal,
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
			// Git search commands
			start_git_directories_search,
			get_found_git_directories_so_far,
			list_available_os_session_kinds,
			// Git repository commands
			check_git_repository,
			execute_command,
			execute_command_in_dir,
			// LSP commands
			start_lsp,
			lsp_open_document,
			lsp_update_document,
			lsp_get_diagnostics
		])
		.run(tauri::generate_context!())
		.expect("error while running tauri application");
}

mod lsp;
use lsp::{LspDiagnostic, LspManager};

#[tauri::command]
async fn create_terminal_connection(
	os_session: OsSession,
	terminal_manager: State<'_, Arc<TerminalManager>>,
	app_handle: tauri::AppHandle,
) -> Result<String, String> {
	terminal_manager
		.create_connection(os_session, app_handle)
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
async fn cleanup_dead_connections(
	terminal_manager: State<'_, Arc<TerminalManager>>,
) -> Result<(), String> {
	terminal_manager
		.cleanup_dead_connections()
		.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_current_dir(os_session: OsSession) -> Result<String, String> {
	Ok(os_session.get_working_directory().to_string())
}

#[tauri::command]
async fn get_file_tree(
	os_session: OsSession,
	path: String,
) -> Result<Vec<FileNode>, String> {
	os_session
		.read_directory(&path)
		.await
		.map_err(|e| e.to_string())
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
async fn start_git_directories_search(
	os_session_kind: OsSessionKind,
	git_search_manager: State<'_, Arc<GitSearchManager>>,
) -> Result<String, String> {
	let search_id = git_search_manager.start_search(os_session_kind);
	Ok(search_id)
}

// todo: generalize this for all lsp's
#[tauri::command]
async fn start_lsp(
	lsp_manager: State<'_, Arc<LspManager>>,
	ts_ls_path: Option<String>,
) -> Result<(), String> {
	log::info!("[Command] start_lsp called");

	// Use provided path or try default locations
	let path = ts_ls_path.unwrap_or_else(|| {
		// Try to find typescript-language-server in PATH first
		if let Ok(output) = std::process::Command::new("which")
			.arg("typescript-language-server")
			.output()
		{
			if output.status.success() {
				if let Ok(path) = String::from_utf8(output.stdout) {
					return path.trim().to_string();
				}
			}
		}

		// Fallback to common locations
		"typescript-language-server".to_string()
	});

	let result = lsp_manager.start_typescript_lsp(&path).await.map_err(|e| {
		let err_string = e.to_string();
		log::error!("[Command] start_lsp failed: {}", err_string);
		err_string
	});

	if result.is_ok() {
		log::info!(
			"[Command] start_lsp completed successfully with path: {}",
			path
		);
	}

	result
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

#[tauri::command]
async fn check_git_repository(directory: String) -> Result<bool, String> {
	let path = Path::new(&directory);

	// Check if the directory exists
	if !path.exists() {
		return Ok(false);
	}

	// Check if .git directory exists
	let git_dir = path.join(".git");
	if git_dir.exists() {
		return Ok(true);
	}

	// Alternatively, try using git command to check if it's a repository
	let output = Command::new("git")
		.arg("rev-parse")
		.arg("--git-dir")
		.current_dir(&directory)
		.output();

	match output {
		Ok(result) => Ok(result.status.success()),
		Err(_) => Ok(false),
	}
}

#[tauri::command]
async fn execute_command(command: String, args: Vec<String>) -> Result<String, String> {
	let output = Command::new(&command)
		.args(&args)
		.output()
		.map_err(|e| format!("Failed to execute command: {}", e))?;

	if output.status.success() {
		Ok(String::from_utf8_lossy(&output.stdout).to_string())
	} else {
		Err(String::from_utf8_lossy(&output.stderr).to_string())
	}
}

#[tauri::command]
async fn execute_command_in_dir(
	command: String,
	args: Vec<String>,
	directory: String,
) -> Result<String, String> {
	let output = Command::new(&command)
		.args(&args)
		.current_dir(&directory)
		.output()
		.map_err(|e| format!("Failed to execute command: {}", e))?;

	if output.status.success() {
		Ok(String::from_utf8_lossy(&output.stdout).to_string())
	} else {
		Err(String::from_utf8_lossy(&output.stderr).to_string())
	}
}

#[tauri::command]
async fn get_found_git_directories_so_far(
	search_id: String,
	git_search_manager: State<'_, Arc<GitSearchManager>>,
) -> Result<GitSearchResult, String> {
	git_search_manager
		.get_results(&search_id)
		.ok_or_else(|| "Search ID not found".to_string())
}

#[tauri::command]
async fn list_available_os_session_kinds() -> Result<Vec<OsSessionKind>, String> {
	OsSessionKind::list_available().map_err(|e| e.to_string())
}
