use crate::{
    TaskResult, ClaudeCodeTaskResult, TuiLine, KeyboardKey, FileWatcher,
    CliAgentError
};
use async_trait::async_trait;
use crossbeam_channel::{Receiver, Sender, unbounded};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;
use tokio::time::timeout;

#[async_trait]
pub trait ClaudeCodeInterface {
    async fn prompt(&mut self, message: &str) -> ClaudeCodeTask;
    async fn install() -> Result<(), CliAgentError>;
    fn is_installed() -> bool;
}

pub struct ClaudeCodeTask {
    inner: Arc<Mutex<ClaudeCodeTaskInner>>,
}

struct ClaudeCodeTaskInner {
    start_time: Instant,
    file_watcher: FileWatcher,
    tui_receiver: Receiver<Vec<TuiLine>>,
    keyboard_sender: Sender<Vec<KeyboardKey>>,
    subprocess: Option<Child>,
    completed: bool,
    result: Option<ClaudeCodeTaskResult>,
}

impl ClaudeCodeTask {
    pub async fn wait_till_finish(&self) -> ClaudeCodeTaskResult {
        self.wait_till_finish_with_timeout(Duration::from_secs(300)).await
            .unwrap_or(ClaudeCodeTaskResult::Error("Timeout".to_string()))
    }
    
    pub async fn wait_till_finish_with_timeout(&self, timeout_duration: Duration) -> Result<ClaudeCodeTaskResult, CliAgentError> {
        let result = timeout(timeout_duration, self.wait_internal()).await;
        
        match result {
            Ok(task_result) => Ok(task_result),
            Err(_) => Err(CliAgentError::Timeout),
        }
    }
    
    async fn wait_internal(&self) -> ClaudeCodeTaskResult {
        // TODO: Implement actual TUI parsing logic
        // For now, this is a placeholder that simulates waiting
        
        let mut inner = self.inner.lock().await;
        
        if inner.completed {
            return inner.result.clone().unwrap_or(ClaudeCodeTaskResult::Error("No result".to_string()));
        }
        
        // Simulate waiting for completion
        tokio::time::sleep(Duration::from_secs(1)).await;
        
        // Compute diff at the end
        let diff = match inner.file_watcher.compute_diff() {
            Ok(d) => d,
            Err(e) => {
                return ClaudeCodeTaskResult::Error(format!("Failed to compute diff: {}", e));
            }
        };
        
        let elapsed = inner.start_time.elapsed();
        
        let result = ClaudeCodeTaskResult::Success(TaskResult {
            elapsed,
            tokens: None, // TODO: Parse from TUI output
            diff,
        });
        
        inner.completed = true;
        inner.result = Some(result.clone());
        
        result
    }
    
    pub async fn send_keys(&self, keys: Vec<KeyboardKey>) -> Result<(), CliAgentError> {
        let inner = self.inner.lock().await;
        inner.keyboard_sender.send(keys)
            .map_err(|e| CliAgentError::ChannelError(e.to_string()))?;
        Ok(())
    }
    
    pub async fn get_latest_tui_lines(&self) -> Vec<TuiLine> {
        let inner = self.inner.lock().await;
        if let Ok(lines) = inner.tui_receiver.try_recv() {
            lines
        } else {
            Vec::new()
        }
    }
}

pub struct ExternallyManagedClaudeCode {
    path: PathBuf,
    tui_receiver: Receiver<Vec<TuiLine>>,
    keyboard_sender: Sender<Vec<KeyboardKey>>,
}

pub struct ExternallyManagedClaudeCodeBuilder {
    path: Option<PathBuf>,
    tui_receiver: Option<Receiver<Vec<TuiLine>>>,
    keyboard_sender: Option<Sender<Vec<KeyboardKey>>>,
}

impl ExternallyManagedClaudeCodeBuilder {
    pub fn new() -> Self {
        Self {
            path: None,
            tui_receiver: None,
            keyboard_sender: None,
        }
    }
    
    pub fn path(mut self, path: PathBuf) -> Self {
        self.path = Some(path);
        self
    }
    
    pub fn new_tui_line_rx(mut self, receiver: Receiver<Vec<TuiLine>>) -> Self {
        self.tui_receiver = Some(receiver);
        self
    }
    
    pub fn keyboard_keys_tx(mut self, sender: Sender<Vec<KeyboardKey>>) -> Self {
        self.keyboard_sender = Some(sender);
        self
    }
    
    pub fn build(self) -> Result<ExternallyManagedClaudeCode, CliAgentError> {
        Ok(ExternallyManagedClaudeCode {
            path: self.path.ok_or_else(|| CliAgentError::TaskExecutionError("Path is required".to_string()))?,
            tui_receiver: self.tui_receiver.ok_or_else(|| CliAgentError::TaskExecutionError("TUI receiver is required".to_string()))?,
            keyboard_sender: self.keyboard_sender.ok_or_else(|| CliAgentError::TaskExecutionError("Keyboard sender is required".to_string()))?,
        })
    }
}

#[async_trait]
impl ClaudeCodeInterface for ExternallyManagedClaudeCode {
    async fn prompt(&mut self, message: &str) -> ClaudeCodeTask {
        let file_watcher = FileWatcher::new(self.path.clone())
            .unwrap_or_else(|_| panic!("Failed to create file watcher"));
        
        let inner = ClaudeCodeTaskInner {
            start_time: Instant::now(),
            file_watcher,
            tui_receiver: self.tui_receiver.clone(),
            keyboard_sender: self.keyboard_sender.clone(),
            subprocess: None,
            completed: false,
            result: None,
        };
        
        // Send the prompt message as keyboard input
        let message_keys: Vec<KeyboardKey> = message.chars()
            .map(KeyboardKey::Char)
            .chain(std::iter::once(KeyboardKey::Enter))
            .collect();
        
        let _ = self.keyboard_sender.send(message_keys);
        
        ClaudeCodeTask {
            inner: Arc::new(Mutex::new(inner)),
        }
    }
    
    async fn install() -> Result<(), CliAgentError> {
        // TODO: Implement Claude Code installation logic
        Err(CliAgentError::TaskExecutionError("Installation not implemented".to_string()))
    }
    
    fn is_installed() -> bool {
        // Check if claude command is available
        Command::new("claude")
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }
}

pub struct ClaudeCode {
    pub path: PathBuf,
}

impl ClaudeCode {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }
}

#[async_trait]
impl ClaudeCodeInterface for ClaudeCode {
    async fn prompt(&mut self, message: &str) -> ClaudeCodeTask {
        let file_watcher = FileWatcher::new(self.path.clone())
            .unwrap_or_else(|_| panic!("Failed to create file watcher"));
        
        // Create channels for communication
        let (_tui_sender, tui_receiver) = unbounded::<Vec<TuiLine>>();
        let (keyboard_sender, _keyboard_receiver) = unbounded::<Vec<KeyboardKey>>();
        
        // TODO: Start subprocess with proper TUI handling
        // For now, this is a placeholder
        let mut subprocess = None;
        
        if Self::is_installed() {
            // Try to start the subprocess
            match Command::new("claude")
                .current_dir(&self.path)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
            {
                Ok(child) => subprocess = Some(child),
                Err(_) => {} // Will be handled in task execution
            }
        }
        
        let inner = ClaudeCodeTaskInner {
            start_time: Instant::now(),
            file_watcher,
            tui_receiver,
            keyboard_sender: keyboard_sender.clone(),
            subprocess,
            completed: false,
            result: None,
        };
        
        // Send the prompt message
        let message_keys: Vec<KeyboardKey> = message.chars()
            .map(KeyboardKey::Char)
            .chain(std::iter::once(KeyboardKey::Enter))
            .collect();
        
        let _ = keyboard_sender.send(message_keys);
        
        ClaudeCodeTask {
            inner: Arc::new(Mutex::new(inner)),
        }
    }
    
    async fn install() -> Result<(), CliAgentError> {
        // TODO: Implement Claude Code installation logic
        // This would typically involve downloading and installing the claude binary
        Err(CliAgentError::TaskExecutionError("Installation not implemented".to_string()))
    }
    
    fn is_installed() -> bool {
        Command::new("claude")
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }
}