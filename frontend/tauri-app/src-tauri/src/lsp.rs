use anyhow::{anyhow, Context, Result};
use async_lsp::{router::Router, MainLoop, ServerSocket};
use log::{debug, error, info, warn};
use lsp_types::{
	notification, request, DiagnosticSeverity, DidChangeTextDocumentParams,
	DidOpenTextDocumentParams, InitializeParams, InitializedParams, TextDocumentItem,
	Url,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::ops::ControlFlow;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{Mutex, RwLock};
use tokio_util::compat::{TokioAsyncReadCompatExt, TokioAsyncWriteCompatExt};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LspDiagnostic {
	pub message: String,
	pub severity: String,
	pub line: u32,
	pub column: u32,
	pub end_line: u32,
	pub end_column: u32,
}

struct LspProcessHandle {
	server: ServerSocket,
	_process_handle: tokio::task::JoinHandle<Result<(), async_lsp::Error>>,
	_child_process: Option<Child>,
}

// Custom client that handles diagnostics
struct DiagnosticsClient {
	server: ServerSocket,
	diagnostics: Arc<RwLock<HashMap<String, Vec<LspDiagnostic>>>>,
}

pub struct LspManager {
	processes: Arc<Mutex<HashMap<String, LspProcessHandle>>>,
	diagnostics: Arc<RwLock<HashMap<String, Vec<LspDiagnostic>>>>,
}

impl LspManager {
	pub fn new() -> Self {
		Self {
			processes: Arc::new(Mutex::new(HashMap::new())),
			diagnostics: Arc::new(RwLock::new(HashMap::new())),
		}
	}

	pub async fn start_typescript_lsp(&self, ts_ls_path: &str) -> Result<()> {
		info!("Starting TypeScript LSP from: {ts_ls_path}");

		// Check if already running
		{
			let processes = self.processes.lock().await;
			if processes.contains_key("typescript") {
				warn!("TypeScript LSP already running");
				return Ok(());
			}
		}

		// Validate the LSP path
		let lsp_path = Path::new(ts_ls_path);
		let final_path = if !lsp_path.exists() {
			// Try common locations if the provided path doesn't exist
			let common_paths = [
				"typescript-language-server",
				"/usr/local/bin/typescript-language-server",
				"/opt/homebrew/bin/typescript-language-server",
			];

			let available_path = common_paths
				.iter()
				.find(|p| Path::new(p).exists())
				.map(|p| p.to_string());

			match available_path {
				Some(found_path) => {
					info!("Found TypeScript LSP at: {found_path}");
					found_path
				}
				None => {
					return Err(anyhow!(
						"TypeScript language server not found at: {} or in common locations",
						ts_ls_path
					));
				}
			}
		} else {
			ts_ls_path.to_string()
		};

		info!("Spawning TypeScript LSP process...");
		let mut process = Command::new(&final_path)
			.arg("--stdio")
			.stdin(std::process::Stdio::piped())
			.stdout(std::process::Stdio::piped())
			.stderr(std::process::Stdio::piped())
			.kill_on_drop(true)
			.spawn()
			.with_context(|| {
				format!("Failed to spawn TypeScript LSP from {}", final_path)
			})?;

		info!("Process spawned with PID: {:?}", process.id());

		let stdin = process.stdin.take().context("Failed to open LSP stdin")?;
		let stdout = process.stdout.take().context("Failed to open LSP stdout")?;
		let stderr = process.stderr.take().context("Failed to open LSP stderr")?;

		// spawn task to read LSP stderr
		tokio::spawn(async move {
			let reader = BufReader::new(stderr);
			let mut lines = reader.lines();
			while let Ok(Some(line)) = lines.next_line().await {
				debug!("[LSP STDERR] {}", line);
			}
		});

		let diagnostics = self.diagnostics.clone();

		// Create the client and main loop
		let (main_loop, server) = MainLoop::new_client(|server| {
			let mut router = Router::new(DiagnosticsClient {
				server: server.clone(),
				diagnostics: diagnostics.clone(),
			});
			router
				.notification::<lsp_types::notification::PublishDiagnostics>(
					|client, params| {
						debug!("Publishing diagnostics!");
						handle_diagnostics(params, &client.diagnostics);
						ControlFlow::Continue(())
					},
				)
				.notification::<lsp_types::notification::LogMessage>(|_client, params| {
					debug!("[LSP window/logMessage] {}", params.message);
					ControlFlow::Continue(())
				})
				.notification::<lsp_types::notification::ShowMessage>(
					|_client, params| {
						debug!("[LSP window/showMessage] {}", params.message);
						ControlFlow::Continue(())
					},
				);
			router
		});

		let server_clone = server.clone();

		// Spawn the main loop task
		let process_handle = tokio::spawn(async move {
			main_loop
				.run_buffered(stdout.compat(), stdin.compat_write())
				.await
		});

		// Initialize the LSP
		info!("Starting initialization sequence...");

		match self.send_initialize(&server_clone).await {
			Ok(_) => info!("send_initialize completed successfully"),
			Err(e) => {
				error!("send_initialize failed: {:?}", e);
				return Err(e);
			}
		}

		info!("Initialization sequence completed");

		let mut processes = self.processes.lock().await;
		processes.insert(
			"typescript".to_string(),
			LspProcessHandle {
				server: server_clone,
				_process_handle: process_handle,
				_child_process: Some(process),
			},
		);
		info!("TypeScript LSP registered and ready");

		Ok(())
	}

	async fn send_initialize(&self, server: &ServerSocket) -> Result<()> {
		debug!("send_initialize: starting");

		// Use the parent directory (frontend/tauri-app) as root since it has a tsconfig.json
		let cwd = std::env::current_dir().context("Failed to get current directory")?;
		debug!("Current working directory: {cwd:?}");

		// Look for tsconfig.json in current dir and parent dirs
		let project_root = find_project_root(&cwd).unwrap_or_else(|| {
			warn!("Could not find tsconfig.json, using parent directory as fallback");
			cwd.parent().unwrap_or(&cwd).to_path_buf()
		});
		debug!("Project root: {project_root:?}");

		let root_uri = Url::from_file_path(&project_root).map_err(|_| {
			anyhow!("Failed to create root URI from path: {project_root:?}")
		})?;

		debug!("Initializing with root URI: {root_uri}");

		// Create capabilities with text document sync
		let capabilities = lsp_types::ClientCapabilities {
			text_document: Some(lsp_types::TextDocumentClientCapabilities {
				synchronization: Some(lsp_types::TextDocumentSyncClientCapabilities {
					dynamic_registration: Some(false),
					will_save: Some(false),
					will_save_wait_until: Some(false),
					did_save: Some(true),
				}),
				publish_diagnostics: Some(
					lsp_types::PublishDiagnosticsClientCapabilities {
						related_information: Some(true),
						tag_support: None,
						version_support: Some(true),
						code_description_support: Some(true),
						data_support: Some(true),
					},
				),
				..Default::default()
			}),
			..Default::default()
		};

		#[allow(deprecated)]
		let initialize_params = InitializeParams {
			process_id: Some(std::process::id()),
			root_uri: Some(root_uri.clone()),
			capabilities,
			initialization_options: None,
			client_info: Some(lsp_types::ClientInfo {
				name: "ariana-ide".to_string(),
				version: Some("0.1.0".to_string()),
			}),
			locale: None,
			root_path: Some(project_root.to_string_lossy().to_string()),
			trace: None,
			workspace_folders: None,
			work_done_progress_params: lsp_types::WorkDoneProgressParams {
				work_done_token: None,
			},
		};

		debug!("About to send initialize request...");
		let response = server
			.request::<request::Initialize>(initialize_params)
			.await
			.map_err(|e| {
				error!("Initialize request failed: {:?}", e);
				anyhow!("Initialize request failed: {:?}", e)
			})?;

		debug!("Initialize response: {response:?}");

		debug!("Sending initialized notification...");
		server
			.notify::<lsp_types::notification::Initialized>(InitializedParams {})
			.map_err(|e| {
				error!("Failed to send initialized notification: {:?}", e);
				anyhow!("Failed to send initialized notification: {:?}", e)
			})?;

		info!("send_initialize completed successfully");
		Ok(())
	}

	pub async fn open_document(
		&self,
		uri: String,
		text: String,
		language_id: String,
	) -> Result<()> {
		let processes = self.processes.lock().await;
		let lsp = processes
			.get("typescript")
			.ok_or_else(|| anyhow!("TypeScript LSP not running"))?;

		debug!("Opening document: {uri} (language: {language_id})");
		debug!("Document text length: {} chars", text.len());

		// Validate URI format
		let parsed_uri =
			Url::parse(&uri).with_context(|| format!("Invalid URI format: {}", uri))?;

		let params = DidOpenTextDocumentParams {
			text_document: TextDocumentItem {
				uri: parsed_uri,
				language_id,
				version: 1,
				text,
			},
		};

		lsp.server
			.notify::<notification::DidOpenTextDocument>(params)
			.map_err(|e| anyhow!("Failed to send didOpen notification: {:?}", e))?;

		info!("Document opened successfully: {uri}");
		Ok(())
	}

	pub async fn update_document(
		&self,
		uri: String,
		text: String,
		version: i32,
	) -> Result<()> {
		let processes = self.processes.lock().await;
		let lsp = processes
			.get("typescript")
			.ok_or_else(|| anyhow!("TypeScript LSP not running"))?;

		debug!("Updating document: {uri} (version: {version})");

		// Validate URI format
		let parsed_uri =
			Url::parse(&uri).with_context(|| format!("Invalid URI format: {}", uri))?;

		let params = DidChangeTextDocumentParams {
			text_document: lsp_types::VersionedTextDocumentIdentifier {
				uri: parsed_uri,
				version,
			},
			content_changes: vec![lsp_types::TextDocumentContentChangeEvent {
				range: None,
				range_length: None,
				text,
			}],
		};

		lsp.server
			.notify::<notification::DidChangeTextDocument>(params)
			.map_err(|e| anyhow!("Failed to send didChange notification: {:?}", e))?;

		Ok(())
	}

	pub async fn get_diagnostics(&self, uri: &str) -> Vec<LspDiagnostic> {
		let diagnostics = self.diagnostics.read().await;
		debug!("get_diagnostics: {diagnostics:?}");
		diagnostics.get(uri).cloned().unwrap_or_default()
	}

	pub async fn shutdown(&self) -> Result<()> {
		info!("Shutting down LSP servers...");
		let mut processes = self.processes.lock().await;
		for (name, lsp) in processes.drain() {
			info!("Shutting down {} LSP", name);

			// Send shutdown request
			match lsp.server.request::<request::Shutdown>(()).await {
				Ok(_) => debug!("Shutdown request succeeded for {}", name),
				Err(e) => error!("Shutdown request failed for {}: {:?}", name, e),
			}

			// Send exit notification
			let _ = lsp.server.notify::<lsp_types::notification::Exit>(());

			// Kill the child process if it still exists
			if let Some(mut child) = lsp._child_process {
				match child.kill().await {
					Ok(_) => debug!("Child process killed for {}", name),
					Err(e) => {
						error!("Failed to kill child process for {}: {:?}", name, e)
					}
				}
			}
		}

		// Clear diagnostics
		self.diagnostics.write().await.clear();

		Ok(())
	}
}

// Helper function to find project root by looking for tsconfig.json
fn find_project_root(start_dir: &Path) -> Option<PathBuf> {
	let mut current = start_dir;
	loop {
		if current.join("tsconfig.json").exists() {
			return Some(current.to_path_buf());
		}
		current = current.parent()?;
	}
}

fn handle_diagnostics(
	params: lsp_types::PublishDiagnosticsParams,
	diagnostics_store: &Arc<RwLock<HashMap<String, Vec<LspDiagnostic>>>>,
) {
	let uri = params.uri.to_string();
	debug!("Processing diagnostics for: {uri}");
	debug!("Found {} diagnostics", params.diagnostics.len());

	let mut lsp_diagnostics = Vec::new();

	for diagnostic in params.diagnostics {
		let severity = match diagnostic.severity {
			Some(DiagnosticSeverity::ERROR) => "error",
			Some(DiagnosticSeverity::WARNING) => "warning",
			Some(DiagnosticSeverity::INFORMATION) => "info",
			Some(DiagnosticSeverity::HINT) => "hint",
			_ => "error",
		};

		lsp_diagnostics.push(LspDiagnostic {
			message: diagnostic.message,
			severity: severity.to_string(),
			line: diagnostic.range.start.line,
			column: diagnostic.range.start.character,
			end_line: diagnostic.range.end.line,
			end_column: diagnostic.range.end.character,
		});
	}

	// Use tokio::task::block_in_place if we're in an async context but need sync behavior
	let store_clone = diagnostics_store.clone();
	tokio::task::block_in_place(|| {
		let rt = tokio::runtime::Handle::current();
		rt.block_on(async {
			let mut store = store_clone.write().await;
			store.insert(uri, lsp_diagnostics);
		});
	});
}
