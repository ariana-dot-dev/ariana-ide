use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::io::{Read, Write};
use std::thread;

use anyhow::{Result, anyhow};
use portable_pty::{PtySize, CommandBuilder, Child, PtyPair};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "$type")]
pub enum TerminalKind {
    #[serde(rename = "ssh")]
    Ssh {
        host: String,
        username: String,
        port: Option<u16>,
    },
    #[serde(rename = "git-bash")]
    GitBash {
        #[serde(rename = "workingDirectory")]
        working_directory: Option<String>,
    },
    #[serde(rename = "wsl")]
    Wsl {
        distribution: Option<String>,
        #[serde(rename = "workingDirectory")]
        working_directory: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalConfig {
    pub kind: TerminalKind,
    pub environment: Option<HashMap<String, String>>,
    #[serde(rename = "shellCommand")]
    pub shell_command: Option<String>,
    #[serde(rename = "colorScheme")]
    pub color_scheme: Option<String>,
    #[serde(rename = "fontSize")]
    pub font_size: Option<u32>,
    #[serde(rename = "fontFamily")]
    pub font_family: Option<String>,
}

pub struct TerminalConnection {
    pub id: String,
    pub config: TerminalConfig,
    pub pty_pair: PtyPair,
    pub child: Box<dyn Child + Send + Sync>,
    pub app_handle: AppHandle,
}

impl TerminalConnection {
    pub fn new(id: String, config: TerminalConfig, app_handle: AppHandle) -> Result<Self> {
        let pty_system = portable_pty::native_pty_system();
        
        let pty_pair = pty_system.openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        let cmd = Self::build_command(&config)?;
        let child = pty_pair.slave.spawn_command(cmd)?;

        Ok(Self {
            id,
            config,
            pty_pair,
            child,
            app_handle,
        })
    }

    fn build_command(config: &TerminalConfig) -> Result<CommandBuilder> {
        let mut cmd = match &config.kind {
            TerminalKind::Ssh { host, username, port } => {
                let mut cmd = CommandBuilder::new("ssh");
                cmd.arg("-p");
                cmd.arg(port.unwrap_or(22).to_string());
                cmd.arg(format!("{}@{}", username, host));
                cmd
            },
            TerminalKind::GitBash { working_directory } => {
                #[cfg(target_os = "windows")]
                {
                    // Try common Git Bash locations
                    let git_bash_paths = [
                        "C:\\Program Files\\Git\\bin\\bash.exe",
                        "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
                        "C:\\Git\\bin\\bash.exe",
                    ];
                    
                    let mut cmd = None;
                    for path in &git_bash_paths {
                        if std::path::Path::new(path).exists() {
                            cmd = Some(CommandBuilder::new(path));
                            break;
                        }
                    }
                    
                    let mut cmd = cmd.ok_or_else(|| anyhow!("Git Bash not found"))?;
                    cmd.arg("--login");
                    
                    if let Some(working_dir) = working_directory {
                        cmd.cwd(working_dir);
                    }
                    
                    cmd
                }
                #[cfg(not(target_os = "windows"))]
                {
                    return Err(anyhow!("Git Bash is only available on Windows"));
                }
            },
            TerminalKind::Wsl { distribution, working_directory } => {
                #[cfg(target_os = "windows")]
                {
                    let mut cmd = CommandBuilder::new("wsl");
                    
                    if let Some(distribution) = distribution {
                        cmd.arg("-d");
                        cmd.arg(distribution);
                    }
                    
                    if let Some(working_dir) = working_directory {
                        cmd.arg("--cd");
                        cmd.arg(working_dir);
                    }
                    
                    cmd
                }
                #[cfg(not(target_os = "windows"))]
                {
                    return Err(anyhow!("WSL is only available on Windows"));
                }
            },
        };

        // Add environment variables
        if let Some(env_vars) = &config.environment {
            for (key, value) in env_vars {
                cmd.env(key, value);
            }
        }

        Ok(cmd)
    }

    pub fn start_io_loop(&self) -> Result<()> {
        let mut reader = self.pty_pair.master.try_clone_reader()?;
        let app_handle = self.app_handle.clone();
        let connection_id = self.id.clone();

        // Spawn thread to read from PTY and send to frontend
        thread::spawn(move || {
            let mut buffer = [0u8; 1024];
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => break, // EOF
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buffer[..n]).to_string();
                        if let Err(e) = app_handle.emit_all(&format!("terminal-data-{}", connection_id), &data) {
                            eprintln!("Failed to emit terminal data: {}", e);
                            break;
                        }
                    }
                    Err(e) => {
                        eprintln!("Error reading from PTY: {}", e);
                        break;
                    }
                }
            }
            
            // Emit disconnect event
            let _ = app_handle.emit_all(&format!("terminal-disconnect-{}", connection_id), ());
        });

        Ok(())
    }



    pub fn resize(&mut self, cols: u16, rows: u16) -> Result<()> {
        self.pty_pair.master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;
        Ok(())
    }
}

pub struct TerminalManager {
    connections: Arc<Mutex<HashMap<String, TerminalConnection>>>,
    writers: Arc<Mutex<HashMap<String, Box<dyn Write + Send>>>>,
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(Mutex::new(HashMap::new())),
            writers: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn create_connection(&self, config: TerminalConfig, app_handle: AppHandle) -> Result<String> {
        let connection_id = Uuid::new_v4().to_string();
        let connection = TerminalConnection::new(connection_id.clone(), config, app_handle)?;
        
        // Get the writer before starting the IO loop
        let writer = connection.pty_pair.master.take_writer()?;
        
        connection.start_io_loop()?;
        
        let mut connections = self.connections.lock().unwrap();
        let mut writers = self.writers.lock().unwrap();
        
        connections.insert(connection_id.clone(), connection);
        writers.insert(connection_id.clone(), writer);
        
        Ok(connection_id)
    }

    pub fn send_data(&self, connection_id: &str, data: &str) -> Result<()> {
        let mut writers = self.writers.lock().unwrap();
        if let Some(writer) = writers.get_mut(connection_id) {
            writer.write_all(data.as_bytes())?;
            writer.flush()?;
        } else {
            return Err(anyhow!("Connection not found: {}", connection_id));
        }
        Ok(())
    }

    pub fn resize_terminal(&self, connection_id: &str, cols: u16, rows: u16) -> Result<()> {
        let mut connections = self.connections.lock().unwrap();
        if let Some(connection) = connections.get_mut(connection_id) {
            connection.resize(cols, rows)?;
        } else {
            return Err(anyhow!("Connection not found: {}", connection_id));
        }
        Ok(())
    }

    pub fn close_connection(&self, connection_id: &str) -> Result<()> {
        let mut connections = self.connections.lock().unwrap();
        let mut writers = self.writers.lock().unwrap();
        
        if let Some(mut connection) = connections.remove(connection_id) {
            // Kill the child process
            if let Err(e) = connection.child.kill() {
                eprintln!("Failed to kill child process: {}", e);
            }
        }
        
        // Remove the writer as well
        writers.remove(connection_id);
        
        Ok(())
    }

    pub fn get_available_terminal_types() -> Vec<String> {
        let mut types = vec!["ssh".to_string()];
        
        #[cfg(target_os = "windows")]
        {
            // Check for Git Bash
            let git_bash_paths = [
                "C:\\Program Files\\Git\\bin\\bash.exe",
                "C:\\Program Files (x86)\\Git\\bin\\bash.exe", 
                "C:\\Git\\bin\\bash.exe",
            ];
            
            for path in &git_bash_paths {
                if std::path::Path::new(path).exists() {
                    types.push("git-bash".to_string());
                    break;
                }
            }
            
            // Check for WSL
            if std::process::Command::new("wsl").arg("--status").output().is_ok() {
                types.push("wsl".to_string());
            }
        }
        
        types
    }

    pub fn validate_config(config: &TerminalConfig) -> bool {
        match &config.kind {
            TerminalKind::Ssh { host, username, .. } => {
                !host.is_empty() && !username.is_empty()
            },
            TerminalKind::GitBash { .. } => {
                #[cfg(target_os = "windows")]
                {
                    let git_bash_paths = [
                        "C:\\Program Files\\Git\\bin\\bash.exe",
                        "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
                        "C:\\Git\\bin\\bash.exe",
                    ];
                    git_bash_paths.iter().any(|path| std::path::Path::new(path).exists())
                }
                #[cfg(not(target_os = "windows"))]
                false
            },
            TerminalKind::Wsl { .. } => {
                #[cfg(target_os = "windows")]
                {
                    std::process::Command::new("wsl").arg("--status").output().is_ok()
                }
                #[cfg(not(target_os = "windows"))]
                {
                    false
                }
            },
        }
    }
}
