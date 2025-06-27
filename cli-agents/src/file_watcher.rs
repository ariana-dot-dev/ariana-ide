use crate::{CliAgentError, Diff, FileChange};
use notify::{Event, RecursiveMode, Result as NotifyResult, Watcher};
use similar::{ChangeTag, TextDiff};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use walkdir::WalkDir;

pub struct FileWatcher {
	path: PathBuf,
	initial_files: HashMap<PathBuf, String>,
	_watcher: notify::RecommendedWatcher,
	receiver: mpsc::Receiver<NotifyResult<Event>>,
}

impl FileWatcher {
	pub fn new(path: PathBuf) -> Result<Self, CliAgentError> {
		let (sender, receiver) = mpsc::channel();

		let mut watcher = notify::recommended_watcher(sender)
			.map_err(|e| CliAgentError::FileWatcherError(e.to_string()))?;

		watcher
			.watch(&path, RecursiveMode::Recursive)
			.map_err(|e| CliAgentError::FileWatcherError(e.to_string()))?;

		let initial_files = Self::scan_directory(&path)?;

		Ok(FileWatcher {
			path,
			initial_files,
			_watcher: watcher,
			receiver,
		})
	}

	fn scan_directory(path: &Path) -> Result<HashMap<PathBuf, String>, CliAgentError> {
		let mut files = HashMap::new();

		for entry in WalkDir::new(path).follow_links(false) {
			let entry = entry.map_err(|e| CliAgentError::IoError(e.into()))?;
			let path = entry.path();

			if path.is_file() && Self::should_watch_file(path) {
				match std::fs::read_to_string(path) {
					Ok(content) => {
						files.insert(path.to_path_buf(), content);
					}
					Err(_) => {
						// Skip files that can't be read as text
						continue;
					}
				}
			}
		}

		Ok(files)
	}

	fn should_watch_file(path: &Path) -> bool {
		if let Some(ext) = path.extension() {
			if let Some(ext_str) = ext.to_str() {
				match ext_str.to_lowercase().as_str() {
					"rs" | "py" | "js" | "ts" | "tsx" | "jsx" | "html" | "css"
					| "scss" | "json" | "toml" | "yaml" | "yml" | "md" | "txt"
					| "csv" => {
						// Check file size (skip files larger than 200KB)
						if let Ok(metadata) = std::fs::metadata(path) {
							metadata.len() < 200 * 1024
						} else {
							false
						}
					}
					_ => false,
				}
			} else {
				false
			}
		} else {
			false
		}
	}

	pub fn compute_diff(&self) -> Result<Diff, CliAgentError> {
		let current_files = Self::scan_directory(&self.path)?;
		let mut file_changes = Vec::new();

		// Check for modified and new files
		for (path, current_content) in &current_files {
			let original_content = self
				.initial_files
				.get(path)
				.map(|s| s.as_str())
				.unwrap_or("");

			if original_content != current_content {
				let name_and_extension = path
					.file_name()
					.and_then(|n| n.to_str())
					.unwrap_or("unknown")
					.to_string();

				let git_style_diff = Self::generate_git_diff(
					&path.to_string_lossy(),
					original_content,
					current_content,
				);

				file_changes.push(FileChange {
					absolute_path: path.clone(),
					name_and_extension,
					original_content: original_content.to_string(),
					final_content: current_content.clone(),
					git_style_diff,
				});
			}
		}

		// Check for deleted files
		for (path, original_content) in &self.initial_files {
			if !current_files.contains_key(path) {
				let name_and_extension = path
					.file_name()
					.and_then(|n| n.to_str())
					.unwrap_or("unknown")
					.to_string();

				let git_style_diff = Self::generate_git_diff(
					&path.to_string_lossy(),
					original_content,
					"",
				);

				file_changes.push(FileChange {
					absolute_path: path.clone(),
					name_and_extension,
					original_content: original_content.clone(),
					final_content: String::new(),
					git_style_diff,
				});
			}
		}

		Ok(Diff { file_changes })
	}

	fn generate_git_diff(filename: &str, original: &str, current: &str) -> String {
		let diff = TextDiff::from_lines(original, current);
		let mut result = String::new();

		result.push_str(&format!("--- a/{}\n", filename));
		result.push_str(&format!("+++ b/{}\n", filename));

		for (idx, group) in diff.grouped_ops(3).iter().enumerate() {
			if idx > 0 {
				result.push_str("...\n");
			}

			let mut old_start = group.first().unwrap().old_range().start;
			let mut new_start = group.first().unwrap().new_range().start;
			let old_len = group.iter().map(|op| op.old_range().len()).sum::<usize>();
			let new_len = group.iter().map(|op| op.new_range().len()).sum::<usize>();

			old_start += 1;
			new_start += 1;

			result.push_str(&format!(
				"@@ -{},{} +{},{} @@\n",
				old_start, old_len, new_start, new_len
			));

			for op in group {
				for change in diff.iter_changes(op) {
					let (sign, s) = match change.tag() {
						ChangeTag::Delete => ("-", change.value()),
						ChangeTag::Insert => ("+", change.value()),
						ChangeTag::Equal => (" ", change.value()),
					};
					result.push_str(&format!("{}{}", sign, s));
				}
			}
		}

		result
	}
}
