use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskResult {
    pub elapsed: Duration,
    pub tokens: Option<u64>,
    pub diff: Diff,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Diff {
    pub file_changes: Vec<FileChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileChange {
    pub absolute_path: PathBuf,
    pub name_and_extension: String,
    pub original_content: String,
    pub final_content: String,
    pub git_style_diff: String,
}

#[derive(Debug, Clone)]
pub enum ClaudeCodeTaskResult {
    Success(TaskResult),
    CantStartClaudeCodeNotInstalled,
    CantStartLoginRequired,
    Error(String),
}

#[derive(Debug, Clone)]
pub struct TuiLine {
    pub content: String,
    pub timestamp: std::time::Instant,
}

#[derive(Debug, Clone)]
pub enum KeyboardKey {
    Char(char),
    Ctrl(char),
    Alt(char),
    CtrlAlt(char),
    ArrowUp,
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    Enter,
    Escape,
    Tab,
    Backspace,
    Delete,
}

impl std::fmt::Display for KeyboardKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            KeyboardKey::Char(c) => write!(f, "{}", c),
            KeyboardKey::Ctrl(c) => write!(f, "Ctrl+{}", c),
            KeyboardKey::Alt(c) => write!(f, "Alt+{}", c),
            KeyboardKey::CtrlAlt(c) => write!(f, "Ctrl+Alt+{}", c),
            KeyboardKey::ArrowUp => write!(f, "ArrowUp"),
            KeyboardKey::ArrowDown => write!(f, "ArrowDown"),
            KeyboardKey::ArrowLeft => write!(f, "ArrowLeft"),
            KeyboardKey::ArrowRight => write!(f, "ArrowRight"),
            KeyboardKey::Enter => write!(f, "Enter"),
            KeyboardKey::Escape => write!(f, "Escape"),
            KeyboardKey::Tab => write!(f, "Tab"),
            KeyboardKey::Backspace => write!(f, "Backspace"),
            KeyboardKey::Delete => write!(f, "Delete"),
        }
    }
}