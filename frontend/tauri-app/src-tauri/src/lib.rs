// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(
	all(not(debug_assertions), target_os = "windows"),
	windows_subsystem = "windows"
)]

use std::sync::Arc;
use std::process::Command;
use std::path::Path;
use tauri::State;

mod terminal;
use terminal::TerminalManager;

mod custom_terminal;
mod custom_terminal_commands;

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

	tauri::Builder::default()
		.plugin(tauri_plugin_os::init())
		.plugin(tauri_plugin_store::Builder::new().build())
		.plugin(tauri_plugin_fs::init())
		.manage(terminals_manager)
		.manage(custom_terminals_manager)
		.manage(git_search_manager)
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
			// Git search commands
			start_git_directories_search,
			get_found_git_directories_so_far,
			list_available_os_session_kinds,
			// Canvas management commands
			copy_directory,
			create_git_branch,
			execute_command,
			execute_command_in_dir,
			// System integration commands
			open_path_in_explorer,
			// Git repository commands
			check_git_repository,
		])
		.run(tauri::generate_context!())
		.expect("error while running tauri application");
}

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
async fn start_git_directories_search(
	os_session_kind: OsSessionKind,
	git_search_manager: State<'_, Arc<GitSearchManager>>,
) -> Result<String, String> {
	let search_id = git_search_manager.start_search(os_session_kind);
	Ok(search_id)
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
async fn execute_command_in_dir(command: String, args: Vec<String>, directory: String) -> Result<String, String> {
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

#[tauri::command]
async fn copy_directory(source: String, destination: String, os_session: OsSession) -> Result<(), String> {
	match os_session {
		OsSession::Local(_) => {
			copy_directory_local(&source, &destination)
		}
		OsSession::Wsl(wsl_session) => {
			copy_directory_wsl(&source, &destination, &wsl_session.distribution)
		}
	}
}

fn copy_directory_local(source: &str, destination: &str) -> Result<(), String> {
	use std::fs;
	use std::path::Path;
	
	let src_path = Path::new(source);
	let dst_path = Path::new(destination);
	
	if !src_path.exists() {
		return Err("Source directory does not exist".to_string());
	}
	
	// Create destination directory if it doesn't exist
	if let Some(parent) = dst_path.parent() {
		fs::create_dir_all(parent)
			.map_err(|e| format!("Failed to create destination parent directory: {}", e))?;
	}
	
	// Use system copy command for better performance
	#[cfg(target_os = "windows")]
	{
		// Use PowerShell Copy-Item for reliable directory copying on Windows
		let ps_command = format!(
			"Copy-Item -Path '{}' -Destination '{}' -Recurse -Force",
			source.replace("'", "''"),
			destination.replace("'", "''")
		);
		
		let output = Command::new("powershell")
			.arg("-Command")
			.arg(&ps_command)
			.output()
			.map_err(|e| format!("Failed to execute PowerShell copy: {}", e))?;
		
		if !output.status.success() {
			let stderr = String::from_utf8_lossy(&output.stderr);
			let stdout = String::from_utf8_lossy(&output.stdout);
			return Err(format!("PowerShell copy failed: {} {}", stderr, stdout));
		}
	}
	
	#[cfg(any(target_os = "linux", target_os = "macos"))]
	{
		let output = Command::new("cp")
			.arg("-r")
			.arg(source)
			.arg(destination)
			.output()
			.map_err(|e| format!("Failed to execute cp: {}", e))?;
		
		if !output.status.success() {
			return Err(format!("cp failed: {}", String::from_utf8_lossy(&output.stderr)));
		}
	}
	
	Ok(())
}

#[cfg(target_os = "windows")]
fn copy_directory_wsl(source: &str, destination: &str, distribution: &str) -> Result<(), String> {
	let output = Command::new("wsl")
		.arg("-d")
		.arg(distribution)
		.arg("cp")
		.arg("-r")
		.arg(source)
		.arg(destination)
		.output()
		.map_err(|e| format!("Failed to execute WSL cp: {}", e))?;
	
	if !output.status.success() {
		return Err(format!("WSL cp failed: {}", String::from_utf8_lossy(&output.stderr)));
	}
	
	Ok(())
}

#[cfg(not(target_os = "windows"))]
fn copy_directory_wsl(_source: &str, _destination: &str, _distribution: &str) -> Result<(), String> {
	Err("WSL is only available on Windows".to_string())
}

#[tauri::command]
async fn create_git_branch(directory: String, branch_name: String, os_session: OsSession) -> Result<(), String> {
	match os_session {
		OsSession::Local(_) => {
			create_git_branch_local(&directory, &branch_name)
		}
		OsSession::Wsl(wsl_session) => {
			create_git_branch_wsl(&directory, &branch_name, &wsl_session.distribution)
		}
	}
}

fn create_git_branch_local(directory: &str, branch_name: &str) -> Result<(), String> {
	let output = Command::new("git")
		.arg("checkout")
		.arg("-B")
		.arg(branch_name)
		.current_dir(directory)
		.output()
		.map_err(|e| format!("Failed to execute git command: {}", e))?;
	
	if !output.status.success() {
		return Err(format!("Git checkout failed: {}", String::from_utf8_lossy(&output.stderr)));
	}
	
	Ok(())
}

#[cfg(target_os = "windows")]
fn create_git_branch_wsl(directory: &str, branch_name: &str, distribution: &str) -> Result<(), String> {
	// Execute git command inside WSL using --cd to change directory
	let output = Command::new("wsl")
		.arg("-d")
		.arg(distribution)
		.arg("--cd")
		.arg(directory)
		.arg("git")
		.arg("checkout")
		.arg("-B")
		.arg(branch_name)
		.output()
		.map_err(|e| format!("Failed to execute WSL git command: {}", e))?;
	
	if !output.status.success() {
		let stderr = String::from_utf8_lossy(&output.stderr);
		let stdout = String::from_utf8_lossy(&output.stdout);
		return Err(format!("WSL git checkout failed: stderr: {} stdout: {}", stderr, stdout));
	}
	
	Ok(())
}

#[cfg(not(target_os = "windows"))]
fn create_git_branch_wsl(_directory: &str, _branch_name: &str, _distribution: &str) -> Result<(), String> {
	Err("WSL is only available on Windows".to_string())
}

#[tauri::command]
async fn open_path_in_explorer(path: String) -> Result<(), String> {
	#[cfg(target_os = "windows")]
	{
		// On Windows, normalize the path and use explorer.exe to open it
		let windows_path = path.replace('/', "\\");
		println!("Opening path in explorer - Original: '{}', Windows path: '{}'", path, windows_path);
		
		// Use /select to open the parent directory and highlight the folder
		// But if it's a directory, just open it directly
		let path_obj = std::path::Path::new(&windows_path);
		println!("Path exists: {}, Is directory: {}", path_obj.exists(), path_obj.is_dir());
		
		let output = if path_obj.is_dir() {
			// Open the directory directly
			println!("Opening directory directly: '{}'", windows_path);
			Command::new("explorer")
				.arg(&windows_path)
				.output()
		} else {
			// If it's a file, open the parent and select it
			println!("Using /select for file: '{}'", windows_path);
			Command::new("explorer")
				.arg("/select,")
				.arg(&windows_path)
				.output()
		};
		
		let result = output.map_err(|e| format!("Failed to open explorer: {}", e))?;
		
		if !result.status.success() {
			return Err(format!("Explorer failed: {}", String::from_utf8_lossy(&result.stderr)));
		}
		
		println!("Explorer command succeeded");
	}
	
	#[cfg(target_os = "macos")]
	{
		// On macOS, use open command
		let output = Command::new("open")
			.arg(&path)
			.output()
			.map_err(|e| format!("Failed to open finder: {}", e))?;
		
		if !output.status.success() {
			return Err(format!("Open failed: {}", String::from_utf8_lossy(&output.stderr)));
		}
	}
	
	#[cfg(target_os = "linux")]
	{
		// On Linux, try various file managers
		let file_managers = ["xdg-open", "nautilus", "dolphin", "thunar", "pcmanfm"];
		let mut success = false;
		
		for manager in &file_managers {
			let result = Command::new(manager)
				.arg(&path)
				.output();
			
			if let Ok(output) = result {
				if output.status.success() {
					success = true;
					break;
				}
			}
		}
		
		if !success {
			return Err("Failed to open file manager on Linux".to_string());
		}
	}
	
	Ok(())
}
