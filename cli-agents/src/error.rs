use thiserror::Error;

#[derive(Error, Debug)]
pub enum CliAgentError {
    #[error("Claude Code is not installed")]
    ClaudeCodeNotInstalled,
    
    #[error("Login required for Claude Code")]
    LoginRequired,
    
    #[error("Failed to start subprocess: {0}")]
    SubprocessError(String),
    
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    
    #[error("File watcher error: {0}")]
    FileWatcherError(String),
    
    #[error("JSON parsing error: {0}")]
    JsonError(#[from] serde_json::Error),
    
    #[error("Task execution failed: {0}")]
    TaskExecutionError(String),
    
    #[error("Timeout waiting for task completion")]
    Timeout,
    
    #[error("Channel communication error: {0}")]
    ChannelError(String),
}