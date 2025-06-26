use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::Path;
use walkdir::{DirEntry, WalkDir};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
	pub name: String,
	pub path: String,
	pub is_directory: bool,
	pub children: Option<Vec<FileNode>>,
	pub extension: Option<String>,
}

fn is_hidden(entry: &DirEntry) -> bool {
	entry
		.file_name()
		.to_str()
		.map(|s| s.starts_with('.'))
		.unwrap_or(false)
}

pub async fn read_directory(path: &str) -> Result<Vec<FileNode>> {
	let path = Path::new(path);
	let mut nodes = Vec::new();

	for entry in WalkDir::new(path)
		.min_depth(1)
		.max_depth(1)
		.into_iter()
		.filter_entry(|e| !is_hidden(e))
		.filter_map(|e| e.ok())
	{
		let metadata = entry.metadata()?;
		let file_name = entry.file_name().to_string_lossy().to_string();
		let file_path = entry.path();
		let path_str = file_path.to_string_lossy().to_string();

		let extension = if metadata.is_file() {
			file_path
				.extension()
				.and_then(|ext| ext.to_str())
				.map(|s| s.to_string())
		} else {
			None
		};

		let node = FileNode {
			name: file_name,
			path: path_str,
			is_directory: metadata.is_dir(),
			children: None,
			extension,
		};

		nodes.push(node);
	}

	nodes.sort_by(|a, b| match (a.is_directory, b.is_directory) {
		(true, false) => std::cmp::Ordering::Less,
		(false, true) => std::cmp::Ordering::Greater,
		_ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
	});

	Ok(nodes)
}
