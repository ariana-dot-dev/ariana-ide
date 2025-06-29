use anyhow::{anyhow, Result};
use portable_pty::CommandBuilder;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;
use walkdir::{DirEntry, WalkDir};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum OsSessionKind {
	Local,
	Wsl(String), // WSL distribution name
}

impl OsSessionKind {
	pub fn list_available() -> Result<Vec<Self>> {
		let mut result = Vec::new();

		#[cfg(target_os = "windows")]
		{
			use std::process::Command;

			// Get WSL distributions
			let output = Command::new("wsl").arg("--list").arg("--quiet").output()?;

			if output.status.success() {
				let distributions = String::from_utf8_lossy(&output.stdout);
				for line in distributions.lines() {
					if !line.trim().is_empty() {
						result.push(Self::Wsl(line.trim().to_string()));
					}
				}
			}
		}

		result.push(Self::Local); // Add local session
		Ok(result)
	}
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum OsSession {
	Local(String),
	Wsl(WslSession),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WslSession {
	pub distribution: String,
	pub working_directory: String,
}

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

fn is_hidden_name(name: &str) -> bool {
	name.starts_with('.')
}

impl OsSession {
	pub fn get_working_directory(&self) -> &str {
		match self {
			Self::Local(dir) => dir,
			Self::Wsl(session) => &session.working_directory,
		}
	}

	pub async fn read_directory(&self, path: &str) -> Result<Vec<FileNode>> {
		match self {
			Self::Local(_) => self.read_directory_local(path).await,
			Self::Wsl(session) => {
				self.read_directory_wsl(path, &session.distribution).await
			}
		}
	}

	async fn read_directory_local(&self, path: &str) -> Result<Vec<FileNode>> {
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

	fn convert_path_to_wsl(path: &str) -> String {
		// If path already starts with / or ~, it's already a Unix-style path
		if path.starts_with('/') || path.starts_with('~') {
			return path.to_string();
		}

		// Check for Windows drive letters (C: through K:, both uppercase and lowercase)
		if path.len() >= 2 && path.chars().nth(1) == Some(':') {
			let drive_char = path.chars().nth(0).unwrap().to_ascii_lowercase();
			if matches!(drive_char, 'c'..='k') {
				let rest_of_path = &path[2..];
				let unix_path = rest_of_path.replace('\\', "/");
				return format!("/mnt/{}{}", drive_char, unix_path);
			}
		}

		// If it doesn't match any pattern, return as-is
		path.to_string()
	}

	#[cfg(target_os = "windows")]
	async fn read_directory_wsl(
		&self,
		path: &str,
		distribution: &str,
	) -> Result<Vec<FileNode>> {
		let wsl_path = Self::convert_path_to_wsl(path);

		// Use WSL to execute ls command and parse the output
		let output = Command::new("wsl")
			.arg("-d")
			.arg(distribution)
			.arg("ls")
			.arg("-la")
			.arg("--color=never")
			.arg(&wsl_path)
			.output()?;

		if !output.status.success() {
			let error_msg = String::from_utf8_lossy(&output.stderr);
			return Err(anyhow!("WSL ls command failed: {}", error_msg));
		}

		let output_str = String::from_utf8_lossy(&output.stdout);
		let mut nodes = Vec::new();

		for line in output_str.lines().skip(1) {
			// Skip the "total" line
			if line.trim().is_empty() {
				continue;
			}

			let parts: Vec<&str> = line.split_whitespace().collect();
			if parts.len() < 9 {
				continue; // Skip malformed lines
			}

			let permissions = parts[0];
			let file_name = parts[8..].join(" "); // Handle filenames with spaces

			// Skip . and .. entries, and hidden files
			if file_name == "." || file_name == ".." || is_hidden_name(&file_name) {
				continue;
			}

			let is_directory = permissions.starts_with('d');
			let is_symlink = permissions.starts_with('l');

			// For symlinks, we might want to resolve them or handle them specially
			let actual_name = if is_symlink && file_name.contains(" -> ") {
				file_name
					.split(" -> ")
					.next()
					.unwrap_or(&file_name)
					.to_string()
			} else {
				file_name.clone()
			};

			// Construct full path (WSL style)
			let full_path = if wsl_path.ends_with('/') {
				format!("{}{}", wsl_path, actual_name)
			} else {
				format!("{}/{}", wsl_path, actual_name)
			};

			let extension = if !is_directory {
				Path::new(&actual_name)
					.extension()
					.and_then(|ext| ext.to_str())
					.map(|s| s.to_string())
			} else {
				None
			};

			let node = FileNode {
				name: actual_name,
				path: full_path,
				is_directory,
				children: None,
				extension,
			};

			nodes.push(node);
		}

		// Sort: directories first, then by name
		nodes.sort_by(|a, b| match (a.is_directory, b.is_directory) {
			(true, false) => std::cmp::Ordering::Less,
			(false, true) => std::cmp::Ordering::Greater,
			_ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
		});

		Ok(nodes)
	}

	#[cfg(not(target_os = "windows"))]
	async fn read_directory_wsl(
		&self,
		_path: &str,
		_distribution: &str,
	) -> Result<Vec<FileNode>> {
		Err(anyhow!("WSL is only available on Windows"))
	}

	pub fn build_command(&self, xterm: bool) -> Result<CommandBuilder> {
		let mut cmd = match self {
			Self::Wsl(WslSession {
				working_directory,
				distribution,
			}) => {
				#[cfg(target_os = "windows")]
				{
					let mut cmd = CommandBuilder::new("wsl");

					cmd.arg("-d");
					cmd.arg(distribution);
					cmd.arg("--cd");
					cmd.arg(working_directory);

					cmd
				}
				#[cfg(not(target_os = "windows"))]
				{
					return Err(anyhow::anyhow!("WSL is only available on Windows"));
				}
			}
			Self::Local(working_directory) => {
				#[cfg(any(target_os = "macos", target_os = "linux"))]
				{
					// Try to get default shell from environment
					let shell_path = std::env::var("SHELL").unwrap_or_else(|_| {
						// Fallback priority: zsh (macOS default) -> bash -> sh
						if std::path::Path::new("/bin/zsh").exists() {
							"/bin/zsh".to_string()
						} else if std::path::Path::new("/bin/bash").exists() {
							"/bin/bash".to_string()
						} else {
							"/bin/sh".to_string()
						}
					});

					let mut cmd = CommandBuilder::new(shell_path);
					cmd.arg("-l"); // Login shell

					cmd.cwd(working_directory);

					cmd
				}
				#[cfg(target_os = "windows")]
				{
					// Use git bash if available
					let git_bash_paths = [
						"C:\\Program Files\\Git\\bin\\bash.exe",
						"C:\\Program Files (x86)\\Git\\bin\\bash.exe",
						"C:\\Git\\bin\\bash.exe",
					];

					let git_bash_available = git_bash_paths
						.iter()
						.any(|path| std::path::Path::new(path).exists());

					if git_bash_available {
						// Use Git Bash
						let mut cmd =
							CommandBuilder::new("C:\\Program Files\\Git\\bin\\bash.exe");
						cmd.arg("--login"); // Force login shell
						cmd.arg("-i"); // Force interactive mode

						cmd.cwd(working_directory);

						cmd
					} else {
						// Fallback to PowerShell
						let mut cmd = CommandBuilder::new("powershell.exe");
						cmd.arg("-NoExit"); // Keep the window open
						cmd.cwd(working_directory);
						cmd
					}
				}
			}
		};

		// environment variables for image support
		if xterm {
			cmd.env("TERM", "xterm-256color");
			cmd.env("COLORTERM", "truecolor");
			cmd.env("TERM_PROGRAM", "iTerm.app"); // Identify as iTerm2 for IIP support
			cmd.env("TERM_PROGRAM_VERSION", "3.0.0");
		}

		Ok(cmd)
	}
}
