use crate::custom_terminal::{CustomTerminalManager, TerminalSpec, ScrollDirection};
use std::sync::Mutex;
use tauri::{AppHandle, State};

pub struct AppState {
    pub terminal_manager: Mutex<CustomTerminalManager>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            terminal_manager: Mutex::new(CustomTerminalManager::new()),
        }
    }
}

#[tauri::command]
pub async fn custom_connect_terminal(
    spec: TerminalSpec,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let terminal_manager = state.terminal_manager.lock().map_err(|e| e.to_string())?;
    terminal_manager
        .connect_terminal(spec, app_handle)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn custom_reconnect_terminal(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let terminal_manager = state.terminal_manager.lock().map_err(|e| e.to_string())?;
    terminal_manager
        .reconnect_terminal(&id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn custom_kill_terminal(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let terminal_manager = state.terminal_manager.lock().map_err(|e| e.to_string())?;
    terminal_manager
        .kill_terminal(&id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn custom_send_input_lines(
    id: String,
    lines: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let terminal_manager = state.terminal_manager.lock().map_err(|e| e.to_string())?;
    terminal_manager
        .send_input_lines(&id, lines)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn custom_send_ctrl_c(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let terminal_manager = state.terminal_manager.lock().map_err(|e| e.to_string())?;
    terminal_manager
        .send_ctrl_c(&id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn custom_send_ctrl_d(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let terminal_manager = state.terminal_manager.lock().map_err(|e| e.to_string())?;
    terminal_manager
        .send_ctrl_d(&id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn custom_send_scroll_up(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let terminal_manager = state.terminal_manager.lock().map_err(|e| e.to_string())?;
    terminal_manager
        .send_scroll(&id, ScrollDirection::Up)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn custom_send_scroll_down(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let terminal_manager = state.terminal_manager.lock().map_err(|e| e.to_string())?;
    terminal_manager
        .send_scroll(&id, ScrollDirection::Down)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn custom_resize_terminal(
    id: String,
    lines: u16,
    cols: u16,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let terminal_manager = state.terminal_manager.lock().map_err(|e| e.to_string())?;
    terminal_manager
        .resize_terminal(&id, lines, cols)
        .map_err(|e| e.to_string())
}
