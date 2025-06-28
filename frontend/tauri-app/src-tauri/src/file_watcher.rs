use anyhow::{anyhow, Result};
use notify::{Event, EventKind, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

pub struct FileWatcher {
	app_handle: AppHandle,
	watchers: Arc<Mutex<HashMap<String, notify::RecommendedWatcher>>>,
}

impl FileWatcher {
	pub fn new(app_handle: AppHandle) -> Self {
		Self {
			app_handle,
			watchers: Arc::new(Mutex::new(HashMap::new())),
		}
	}

	pub async fn watch_file(&self, file_path: String) -> Result<()> {
		println!("[FileWatcher] watch_file called with path: {}", file_path);
		let path = PathBuf::from(&file_path);

		// check if file exists
		if !path.exists() {
			println!("[FileWatcher] File does not exist: {}", file_path);
			return Err(anyhow!("File does not exist: {}", file_path));
		}

		let mut watchers = self.watchers.lock().await;

		// check if already watching this file
		if watchers.contains_key(&file_path) {
			println!("[FileWatcher] Already watching file: {}", file_path);
			return Ok(());
		}

		let app_handle = self.app_handle.clone();
		let file_path_clone = file_path.clone();

		println!("[FileWatcher] Creating watcher for: {}", file_path);

		// create watcher
		let mut watcher = notify::recommended_watcher(
			move |res: Result<Event, notify::Error>| {
				match res {
					Ok(event) => {
						println!(
							"[FileWatcher] Received event: {:?} for file: {}",
							event.kind, file_path_clone
						);
						// handle file change events
						match event.kind {
							EventKind::Modify(_) => {
								println!("[FileWatcher] File modified, emitting file-changed event for: {}", file_path_clone);
								// emit event to frontend
								let emit_result =
									app_handle.emit("file-changed", &file_path_clone);
								if let Err(e) = emit_result {
									eprintln!("[FileWatcher] Failed to emit file-changed event: {:?}", e);
								} else {
									println!("[FileWatcher] Successfully emitted file-changed event");
								}
							}
							EventKind::Remove(_) => {
								println!("[FileWatcher] File removed, emitting file-removed event for: {}", file_path_clone);
								// emit event for file removal
								let emit_result =
									app_handle.emit("file-removed", &file_path_clone);
								if let Err(e) = emit_result {
									eprintln!("[FileWatcher] Failed to emit file-removed event: {:?}", e);
								} else {
									println!("[FileWatcher] Successfully emitted file-removed event");
								}
							}
							_ => {
								println!(
									"[FileWatcher] Ignoring event kind: {:?}",
									event.kind
								);
							}
						}
					}
					Err(e) => eprintln!("[FileWatcher] Watch error: {:?}", e),
				}
			},
		)?;

		// watch the specific file
		println!("[FileWatcher] Starting to watch path: {:?}", path);
		watcher.watch(&path, RecursiveMode::NonRecursive)?;

		// store watcher
		watchers.insert(file_path.clone(), watcher);
		println!("[FileWatcher] Successfully watching file: {}", file_path);

		Ok(())
	}

	pub async fn unwatch_file(&self, file_path: String) -> Result<()> {
		println!("[FileWatcher] unwatch_file called with path: {}", file_path);
		let mut watchers = self.watchers.lock().await;

		if let Some(mut watcher) = watchers.remove(&file_path) {
			let path = PathBuf::from(&file_path);
			println!("[FileWatcher] Unwatching path: {:?}", path);
			watcher.unwatch(&path)?;
			println!("[FileWatcher] Successfully unwatched file: {}", file_path);
		} else {
			println!("[FileWatcher] File was not being watched: {}", file_path);
		}

		Ok(())
	}

	pub async fn _unwatch_all(&self) -> Result<()> {
		let mut watchers = self.watchers.lock().await;

		for (file_path, mut watcher) in watchers.drain() {
			let path = PathBuf::from(&file_path);
			let _ = watcher.unwatch(&path);
		}

		Ok(())
	}
}
