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
pub struct TerminalSpec {
    pub kind: TerminalKind,
    #[serde(rename = "workingDir")]
    pub working_dir: Option<String>,
    #[serde(rename = "shellCommand")]
    pub shell_command: Option<String>,
    pub environment: Option<HashMap<String, String>>,
    pub lines: u16,
    pub cols: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Color {
    /// Default color (let terminal decide)
    Default,
    /// Basic 8 colors
    Black,
    Red,
    Green,
    Yellow,
    Blue,
    Magenta,
    Cyan,
    White,
    /// Bright variants
    BrightBlack,
    BrightRed,
    BrightGreen,
    BrightYellow,
    BrightBlue,
    BrightMagenta,
    BrightCyan,
    BrightWhite,
    /// 256-color palette
    Extended(u8),
    /// RGB color
    Rgb(u8, u8, u8),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LineItem {
    pub lexeme: String,
    pub width: u16,
    pub is_underline: bool,
    pub is_bold: bool,
    pub is_italic: bool,
    pub background_color: Option<Color>,
    pub foreground_color: Option<Color>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum TerminalEvent {
    #[serde(rename = "newLines")]
    NewLines {
        lines: Vec<Vec<LineItem>>,
    },
    #[serde(rename = "patch")]
    Patch {
        line: u16,
        col: u16,
        items: Vec<LineItem>,
    },
    #[serde(rename = "cursorMove")]
    CursorMove {
        line: u16,
        col: u16,
    },
    #[serde(rename = "scroll")]
    Scroll {
        direction: ScrollDirection,
        amount: u16,
    },
    #[serde(rename = "screenUpdate")]
    ScreenUpdate {
        screen: Vec<Vec<LineItem>>,
        cursor_line: u16,
        cursor_col: u16,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ScrollDirection {
    Up,
    Down,
}

pub struct CustomTerminalConnection {
    pub id: String,
    pub spec: TerminalSpec,
    pub pty_pair: PtyPair,
    pub child: Box<dyn Child + Send + Sync>,
    pub app_handle: AppHandle,
    pub terminal_state: Arc<Mutex<TerminalState>>,
}

impl CustomTerminalConnection {
    pub fn new(id: String, spec: TerminalSpec, app_handle: AppHandle) -> Result<Self> {
        let pty_system = portable_pty::native_pty_system();
        
        let pty_pair = pty_system.openpty(PtySize {
            rows: spec.lines,
            cols: spec.cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        let cmd = Self::build_command(&spec)?;
        let child = pty_pair.slave.spawn_command(cmd)?;
        let terminal_state = Arc::new(Mutex::new(TerminalState::new(spec.lines, spec.cols)));

        Ok(Self {
            id,
            spec,
            pty_pair,
            child,
            app_handle,
            terminal_state,
        })
    }

    fn build_command(spec: &TerminalSpec) -> Result<CommandBuilder> {
        let mut cmd = match &spec.kind {
            TerminalKind::Ssh { host, username, port } => {
                let mut cmd = CommandBuilder::new("ssh");
                cmd.arg("-p");
                cmd.arg(port.unwrap_or(22).to_string());
                cmd.arg("-t");
                cmd.arg(format!("{}@{}", username, host));
                cmd
            },
            TerminalKind::GitBash { working_directory } => {
                #[cfg(target_os = "windows")]
                {
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
                    cmd.arg("-i");
                    
                    if let Some(working_dir) = working_directory.as_ref().or(spec.working_dir.as_ref()) {
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
                    
                    if let Some(working_dir) = working_directory.as_ref().or(spec.working_dir.as_ref()) {
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

        if let Some(shell_command) = &spec.shell_command {
            cmd.arg("-c");
            cmd.arg(shell_command);
        }

        if let Some(env_vars) = &spec.environment {
            for (key, value) in env_vars {
                cmd.env(key, value);
            }
        }

        Ok(cmd)
    }

    pub fn start_io_loop(&mut self) -> Result<()> {
        let mut reader = self.pty_pair.master.try_clone_reader()?;
        let app_handle = self.app_handle.clone();
        let connection_id = self.id.clone();
        let terminal_state = self.terminal_state.clone();
        
        thread::spawn(move || {
            let mut buffer = [0u8; 4096];
            
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = &buffer[..n];
                        let events = {
                            let mut state = terminal_state.lock().unwrap();
                            state.process_input(data)
                        };
                        
                        for event in events {
                            if let Err(e) = app_handle.emit_all(&format!("custom-terminal-event-{}", connection_id), &event) {
                                eprintln!("Failed to emit terminal event: {}", e);
                                break;
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("Error reading from PTY: {}", e);
                        break;
                    }
                }
            }
            
            let _ = app_handle.emit_all(&format!("custom-terminal-disconnect-{}", connection_id), ());
        });

        Ok(())
    }

    pub fn resize(&mut self, lines: u16, cols: u16) -> Result<()> {
        self.pty_pair.master.resize(PtySize {
            rows: lines,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;
        println!("Resized terminal to {} rows and {} cols", lines, cols);
        self.spec.lines = lines;
        self.spec.cols = cols;
        
        // Also resize the terminal state
        {
            let mut state = self.terminal_state.lock().unwrap();
            state.resize(lines, cols);
        }
        
        Ok(())
    }

    pub fn is_alive(&mut self) -> bool {
        match self.child.try_wait() {
            Ok(Some(_)) => false,
            Ok(None) => true,
            Err(_) => false,
        }
    }
}

/// Improved ANSI parser using a proper state machine
/// This is much cleaner than our previous implementation
pub struct TerminalState {
    screen_buffer: Vec<Vec<LineItem>>,
    cursor_line: u16,
    cursor_col: u16,
    screen_rows: u16,
    screen_cols: u16,
    current_style: TextStyle,
    saved_cursor_line: u16,
    saved_cursor_col: u16,
    saved_style: TextStyle,
    scrollback_buffer: Vec<Vec<LineItem>>,
    alternate_screen: Option<Vec<Vec<LineItem>>>,
    parser_state: ParserState,
    escape_buffer: String,
}

#[derive(Debug, Clone)]
enum ParserState {
    Ground,
    Escape,
    CSI,
    OSC,
}

#[derive(Debug, Clone)]
struct TextStyle {
    bold: bool,
    italic: bool,
    underline: bool,
    foreground: Option<Color>,
    background: Option<Color>,
}

impl Default for TextStyle {
    fn default() -> Self {
        Self {
            bold: false,
            italic: false,
            underline: false,
            foreground: None,
            background: None,
        }
    }
}

impl TerminalState {
    pub fn new(rows: u16, cols: u16) -> Self {
        println!("Creating terminal state with {} rows and {} cols", rows, cols);
        let mut screen_buffer = Vec::with_capacity(rows as usize);
        for _ in 0..rows {
            screen_buffer.push(Vec::new());
        }

        let mut terminal_state = Self {
            screen_buffer,
            cursor_line: 0,
            cursor_col: 0,
            screen_rows: rows,
            screen_cols: cols,
            current_style: TextStyle::default(),
            saved_cursor_line: 0,
            saved_cursor_col: 0,
            saved_style: TextStyle::default(),
            scrollback_buffer: Vec::new(),
            alternate_screen: None,
            parser_state: ParserState::Ground,
            escape_buffer: String::new(),
        };
        
        // Ensure buffer is properly sized from the start
        terminal_state.ensure_screen_buffer_size();
        terminal_state
    }

    pub fn process_input(&mut self, data: &[u8]) -> Vec<TerminalEvent> {
        let mut events = Vec::new();
        
        // Convert bytes to string, handling partial UTF-8 sequences
        let text = String::from_utf8_lossy(data);
        
        for ch in text.chars() {
            self.process_char(ch);
        }
        
        // Ensure screen buffer size is consistent before emitting
        self.ensure_screen_buffer_size();
        
        // Always emit the entire screen state for now
        // TODO: Optimize to only emit changes
        events.push(TerminalEvent::ScreenUpdate {
            screen: self.get_screen_lines(),
            cursor_line: self.cursor_line,
            cursor_col: self.cursor_col,
        });
        
        events
    }
    
    fn process_char(&mut self, ch: char) {
        match self.parser_state {
            ParserState::Ground => {
                match ch {
                    '\x1b' => {
                        self.parser_state = ParserState::Escape;
                        self.escape_buffer.clear();
                    },
                    '\n' => self.line_feed(),
                    '\r' => self.cursor_col = 0,
                    '\x08' => {
                        // Backspace
                        if self.cursor_col > 0 {
                            self.cursor_col -= 1;
                        }
                    },
                    '\t' => {
                        // Tab - move to next tab stop (every 8 characters)
                        let next_tab = ((self.cursor_col / 8) + 1) * 8;
                        self.cursor_col = next_tab.min(self.screen_cols.saturating_sub(1));
                    },
                    c if c.is_control() => {
                        // Skip other control characters
                    },
                    c => {
                        // Regular character
                        self.write_char_at_cursor(c);
                        self.cursor_col += 1;
                        
                        // Wrap to next line if needed
                        if self.cursor_col >= self.screen_cols {
                            self.cursor_col = 0;
                            self.line_feed();
                        }
                    }
                }
            },
            ParserState::Escape => {
                match ch {
                    '[' => {
                        self.parser_state = ParserState::CSI;
                        self.escape_buffer.clear();
                    },
                    ']' => {
                        self.parser_state = ParserState::OSC;
                        self.escape_buffer.clear();
                    },
                    '7' => {
                        // Save cursor position (DECSC)
                        self.save_cursor();
                        self.parser_state = ParserState::Ground;
                    },
                    '8' => {
                        // Restore cursor position (DECRC)
                        self.restore_cursor();
                        self.parser_state = ParserState::Ground;
                    },
                    _ => {
                        // Unknown escape sequence, go back to ground
                        self.parser_state = ParserState::Ground;
                    }
                }
            },
            ParserState::CSI => {
                if ch.is_ascii_alphabetic() {
                    // End of CSI sequence
                    let buffer = self.escape_buffer.clone();
                    self.handle_csi_sequence(&buffer, ch);
                    self.parser_state = ParserState::Ground;
                    self.escape_buffer.clear();
                } else {
                    // Accumulate parameters
                    self.escape_buffer.push(ch);
                }
            },
            ParserState::OSC => {
                if ch == '\x07' || ch == '\x1b' {
                    // End of OSC sequence (BEL or ESC)
                    let buffer = self.escape_buffer.clone();
                    self.handle_osc_sequence(&buffer);
                    self.parser_state = ParserState::Ground;
                    self.escape_buffer.clear();
                } else {
                    self.escape_buffer.push(ch);
                }
            }
        }
    }
    
    fn handle_csi_sequence(&mut self, params: &str, cmd: char) {
        let mut is_dec_private = false;
        let params_str = if params.starts_with('?') {
            is_dec_private = true;
            &params[1..]
        } else {
            params
        };
        
        let params: Vec<u16> = if params_str.is_empty() {
            vec![]
        } else {
            params_str.split(';')
                .filter_map(|s| s.parse().ok())
                .collect()
        };
        
        if is_dec_private {
            self.handle_dec_private_mode(&params, cmd);
        } else {
            self.handle_standard_csi(&params, cmd);
        }
    }
    
    fn handle_dec_private_mode(&mut self, params: &[u16], cmd: char) {
        match cmd {
            'h' => {
                // Set mode
                for &param in params {
                    match param {
                        1049 => {
                            // Enable alternate screen buffer
                            self.alternate_screen = Some(self.screen_buffer.clone());
                            self.clear_screen();
                        },
                        _ => {} // Ignore other modes
                    }
                }
            },
            'l' => {
                // Reset mode
                for &param in params {
                    match param {
                        1049 => {
                            // Disable alternate screen buffer
                            if let Some(main_screen) = self.alternate_screen.take() {
                                self.screen_buffer = main_screen;
                            }
                        },
                        _ => {} // Ignore other modes
                    }
                }
            },
            _ => {} // Ignore other DEC commands
        }
    }
    
    fn handle_standard_csi(&mut self, params: &[u16], cmd: char) {
        match cmd {
            'A' => {
                // Cursor up
                let amount = params.get(0).copied().unwrap_or(1);
                self.cursor_line = self.cursor_line.saturating_sub(amount);
            },
            'B' => {
                // Cursor down
                let amount = params.get(0).copied().unwrap_or(1);
                self.cursor_line = (self.cursor_line + amount).min(self.screen_rows.saturating_sub(1));
            },
            'C' => {
                // Cursor right
                let amount = params.get(0).copied().unwrap_or(1);
                self.cursor_col = (self.cursor_col + amount).min(self.screen_cols.saturating_sub(1));
            },
            'D' => {
                // Cursor left
                let amount = params.get(0).copied().unwrap_or(1);
                self.cursor_col = self.cursor_col.saturating_sub(amount);
            },
            'H' | 'f' => {
                // Cursor position (1-indexed)
                let line = params.get(0).copied().unwrap_or(1).saturating_sub(1);
                let col = params.get(1).copied().unwrap_or(1).saturating_sub(1);
                self.cursor_line = line.min(self.screen_rows.saturating_sub(1));
                self.cursor_col = col.min(self.screen_cols.saturating_sub(1));
            },
            'J' => {
                // Clear screen
                let mode = params.get(0).copied().unwrap_or(0);
                match mode {
                    0 => self.clear_from_cursor_to_end(),
                    1 => self.clear_from_start_to_cursor(),
                    2 => self.clear_screen(),
                    3 => {
                        self.clear_screen();
                        self.scrollback_buffer.clear();
                    },
                    _ => {}
                }
            },
            'K' => {
                // Clear line
                let mode = params.get(0).copied().unwrap_or(0);
                match mode {
                    0 => self.clear_line_from_cursor(),
                    1 => self.clear_line_to_cursor(),
                    2 => self.clear_line(),
                    _ => {}
                }
            },
            's' => {
                // Save cursor position
                self.save_cursor();
            },
            'u' => {
                // Restore cursor position
                self.restore_cursor();
            },
            'm' => {
                // SGR - Select Graphic Rendition
                self.handle_sgr_sequence(params);
            },
            _ => {} // Ignore unknown sequences
        }
    }
    
    fn handle_osc_sequence(&mut self, _params: &str) {
        // OSC sequences (like setting window title) - ignore for now
    }
    
    fn handle_sgr_sequence(&mut self, params: &[u16]) {
        if params.is_empty() {
            // No parameters means reset
            self.current_style = TextStyle::default();
            return;
        }

        let mut i = 0;
        while i < params.len() {
            let param = params[i];
            match param {
                0 => self.current_style = TextStyle::default(), // Reset all
                1 => self.current_style.bold = true,
                2 => self.current_style.bold = false, // Dim/faint
                3 => self.current_style.italic = true,
                4 => self.current_style.underline = true,
                22 => self.current_style.bold = false, // Normal intensity
                23 => self.current_style.italic = false,
                24 => self.current_style.underline = false,
                30..=37 => self.current_style.foreground = Some(ansi_color_to_color(param - 30)),
                38 => {
                    // Extended foreground color
                    if i + 2 < params.len() && params[i + 1] == 5 {
                        // 256-color mode
                        self.current_style.foreground = Some(Color::Extended(params[i + 2] as u8));
                        i += 2;
                    } else if i + 4 < params.len() && params[i + 1] == 2 {
                        // RGB mode
                        let r = params[i + 2] as u8;
                        let g = params[i + 3] as u8;
                        let b = params[i + 4] as u8;
                        self.current_style.foreground = Some(Color::Rgb(r, g, b));
                        i += 4;
                    }
                },
                39 => self.current_style.foreground = None, // Default foreground
                40..=47 => self.current_style.background = Some(ansi_color_to_color(param - 40)),
                48 => {
                    // Extended background color
                    if i + 2 < params.len() && params[i + 1] == 5 {
                        // 256-color mode
                        self.current_style.background = Some(Color::Extended(params[i + 2] as u8));
                        i += 2;
                    } else if i + 4 < params.len() && params[i + 1] == 2 {
                        // RGB mode
                        let r = params[i + 2] as u8;
                        let g = params[i + 3] as u8;
                        let b = params[i + 4] as u8;
                        self.current_style.background = Some(Color::Rgb(r, g, b));
                        i += 4;
                    }
                },
                49 => self.current_style.background = None, // Default background
                90..=97 => self.current_style.foreground = Some(ansi_bright_color_to_color(param - 90)),
                100..=107 => self.current_style.background = Some(ansi_bright_color_to_color(param - 100)),
                _ => {} // Ignore unknown parameters
            }
            i += 1;
        }
    }
    
    fn write_char_at_cursor(&mut self, ch: char) {
        if self.cursor_line < self.screen_rows {
            // Ensure the line exists
            while self.screen_buffer.len() <= self.cursor_line as usize {
                self.screen_buffer.push(Vec::new());
            }
            
            let space_item = self.create_line_item(" ".to_string());
            let char_item = self.create_line_item(ch.to_string());
            
            // Extend the line if needed
            let line = &mut self.screen_buffer[self.cursor_line as usize];
            while line.len() <= self.cursor_col as usize {
                line.push(space_item.clone());
            }
            
            // Write the character
            if self.cursor_col < self.screen_cols {
                line[self.cursor_col as usize] = char_item;
            }
        }
    }
    
    fn line_feed(&mut self) {
        self.cursor_line += 1;
        
        // If we've gone past the bottom of the screen, scroll up
        if self.cursor_line >= self.screen_rows {
            self.scroll_up(1);
            self.cursor_line = self.screen_rows.saturating_sub(1);
        }
        
        // Ensure we have enough lines in the buffer
        self.ensure_screen_buffer_size();
    }
    
    fn scroll_up(&mut self, amount: u16) {
        for _ in 0..amount {
            if !self.screen_buffer.is_empty() {
                // Move top line to scrollback buffer
                let top_line = self.screen_buffer.remove(0);
                self.scrollback_buffer.push(top_line);
                
                // Limit scrollback buffer size to prevent memory issues
                if self.scrollback_buffer.len() > 10000 {
                    self.scrollback_buffer.remove(0);
                }
                
                // Add empty line at bottom
                self.screen_buffer.push(Vec::new());
            }
        }
        
        // Ensure screen buffer always has the correct number of lines
        self.ensure_screen_buffer_size();
    }
    
    fn clear_screen(&mut self) {
        self.screen_buffer.clear();
        for _ in 0..self.screen_rows {
            self.screen_buffer.push(Vec::new());
        }
        self.cursor_line = 0;
        self.cursor_col = 0;
        // Size should be correct, but let's be sure
        self.ensure_screen_buffer_size();
    }
    
    fn clear_line(&mut self) {
        if self.cursor_line < self.screen_rows {
            while self.screen_buffer.len() <= self.cursor_line as usize {
                self.screen_buffer.push(Vec::new());
            }
            self.screen_buffer[self.cursor_line as usize].clear();
        }
    }
    
    fn clear_line_from_cursor(&mut self) {
        if self.cursor_line < self.screen_rows {
            while self.screen_buffer.len() <= self.cursor_line as usize {
                self.screen_buffer.push(Vec::new());
            }
            let line = &mut self.screen_buffer[self.cursor_line as usize];
            line.truncate(self.cursor_col as usize);
        }
    }
    
    fn clear_line_to_cursor(&mut self) {
        if self.cursor_line < self.screen_rows {
            while self.screen_buffer.len() <= self.cursor_line as usize {
                self.screen_buffer.push(Vec::new());
            }
            
            let space_item = self.create_line_item(" ".to_string());
            let line = &mut self.screen_buffer[self.cursor_line as usize];
            
            for i in 0..=self.cursor_col as usize {
                if i < line.len() {
                    line[i] = space_item.clone();
                } else {
                    line.push(space_item.clone());
                }
            }
        }
    }
    
    fn clear_from_cursor_to_end(&mut self) {
        self.clear_line_from_cursor();
        for line_idx in (self.cursor_line + 1) as usize..self.screen_buffer.len() {
            self.screen_buffer[line_idx].clear();
        }
    }
    
    fn clear_from_start_to_cursor(&mut self) {
        for line_idx in 0..self.cursor_line as usize {
            if line_idx < self.screen_buffer.len() {
                self.screen_buffer[line_idx].clear();
            }
        }
        self.clear_line_to_cursor();
    }
    
    fn save_cursor(&mut self) {
        self.saved_cursor_line = self.cursor_line;
        self.saved_cursor_col = self.cursor_col;
        self.saved_style = self.current_style.clone();
    }
    
    fn restore_cursor(&mut self) {
        self.cursor_line = self.saved_cursor_line.min(self.screen_rows.saturating_sub(1));
        self.cursor_col = self.saved_cursor_col.min(self.screen_cols.saturating_sub(1));
        self.current_style = self.saved_style.clone();
    }
    
    fn get_screen_lines(&self) -> Vec<Vec<LineItem>> {
        let mut result = Vec::with_capacity(self.screen_rows as usize);
        
        // Always return exactly screen_rows lines
        for row in 0..self.screen_rows {
            if let Some(line) = self.screen_buffer.get(row as usize) {
                result.push(line.clone());
            } else {
                result.push(Vec::new());
            }
        }
        
        // Assert that we always return the correct number of lines
        debug_assert_eq!(result.len(), self.screen_rows as usize, 
            "Screen lines mismatch: expected {}, got {}", self.screen_rows, result.len());
        
        result
    }
    
    fn create_line_item(&self, text: String) -> LineItem {
        LineItem {
            width: text.chars().count() as u16,
            lexeme: text,
            is_bold: self.current_style.bold,
            is_italic: self.current_style.italic,
            is_underline: self.current_style.underline,
            foreground_color: self.current_style.foreground.clone(),
            background_color: self.current_style.background.clone(),
        }
    }
    
    /// Resize the terminal state to new dimensions
    pub fn resize(&mut self, rows: u16, cols: u16) {
        println!("Resizing TerminalState from {}x{} to {}x{}", self.screen_cols, self.screen_rows, cols, rows);
        
        // Update dimensions
        self.screen_rows = rows;
        self.screen_cols = cols;
        
        // Ensure cursor is within bounds
        self.cursor_line = self.cursor_line.min(rows.saturating_sub(1));
        self.cursor_col = self.cursor_col.min(cols.saturating_sub(1));
        
        // Update screen buffer size
        self.ensure_screen_buffer_size();
    }

    /// Ensure the screen buffer always has exactly screen_rows lines
    fn ensure_screen_buffer_size(&mut self) {
        let current_len = self.screen_buffer.len();
        let expected_len = self.screen_rows as usize;
        
        if current_len < expected_len {
            // Add missing lines at the end
            self.screen_buffer.reserve(expected_len - current_len);
            for _ in current_len..expected_len {
                self.screen_buffer.push(Vec::new());
            }
        } else if current_len > expected_len {
            // Remove extra lines from the end (shouldn't happen normally)
            self.screen_buffer.truncate(expected_len);
        }
        
        // Final verification
        debug_assert_eq!(self.screen_buffer.len(), self.screen_rows as usize,
            "Screen buffer size verification failed: {} != {}", self.screen_buffer.len(), self.screen_rows);
    }
}

fn ansi_color_to_color(code: u16) -> Color {
    match code {
        0 => Color::Black,
        1 => Color::Red,
        2 => Color::Green,
        3 => Color::Yellow,
        4 => Color::Blue,
        5 => Color::Magenta,
        6 => Color::Cyan,
        7 => Color::White,
        _ => Color::White,
    }
}

fn ansi_bright_color_to_color(code: u16) -> Color {
    match code {
        0 => Color::BrightBlack,
        1 => Color::BrightRed,
        2 => Color::BrightGreen,
        3 => Color::BrightYellow,
        4 => Color::BrightBlue,
        5 => Color::BrightMagenta,
        6 => Color::BrightCyan,
        7 => Color::BrightWhite,
        _ => Color::BrightWhite,
    }
}

pub struct CustomTerminalManager {
    connections: Arc<Mutex<HashMap<String, CustomTerminalConnection>>>,
    writers: Arc<Mutex<HashMap<String, Box<dyn Write + Send>>>>,
}

impl CustomTerminalManager {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(Mutex::new(HashMap::new())),
            writers: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn connect_terminal(&self, spec: TerminalSpec, app_handle: AppHandle) -> Result<String> {
        let connection_id = Uuid::new_v4().to_string();
        let mut connection = CustomTerminalConnection::new(connection_id.clone(), spec, app_handle)?;
        
        let writer = connection.pty_pair.master.take_writer()?;
        connection.start_io_loop()?;
        
        {
            let mut connections = self.connections.lock().unwrap();
            connections.insert(connection_id.clone(), connection);
        }
        
        {
            let mut writers = self.writers.lock().unwrap();
            writers.insert(connection_id.clone(), writer);
        }
        
        Ok(connection_id)
    }

    pub fn send_raw_input(&self, connection_id: &str, data: &str) -> Result<()> {
        let mut writers = self.writers.lock().unwrap();
        if let Some(writer) = writers.get_mut(connection_id) {
            writer.write_all(data.as_bytes())?;
            writer.flush()?;
            Ok(())
        } else {
            Err(anyhow!("Terminal connection not found"))
        }
    }

    pub fn send_ctrl_c(&self, connection_id: &str) -> Result<()> {
        self.send_raw_input(connection_id, "\x03")
    }

    pub fn send_ctrl_d(&self, connection_id: &str) -> Result<()> {
        self.send_raw_input(connection_id, "\x04")
    }

    pub fn reconnect_terminal(&self, connection_id: &str) -> Result<()> {
        // For now, reconnect is not implemented - just check if terminal exists
        let connections = self.connections.lock().unwrap();
        if connections.contains_key(connection_id) {
            Ok(())
        } else {
            Err(anyhow!("Terminal connection not found"))
        }
    }

    pub fn send_input_lines(&self, connection_id: &str, lines: Vec<String>) -> Result<()> {
        let input = lines.join("\n") + "\n";
        self.send_raw_input(connection_id, &input)
    }

    pub fn send_scroll(&self, connection_id: &str, direction: ScrollDirection) -> Result<()> {
        // Send scroll commands as ANSI sequences
        match direction {
            ScrollDirection::Up => self.send_raw_input(connection_id, "\x1b[5~"), // Page Up
            ScrollDirection::Down => self.send_raw_input(connection_id, "\x1b[6~"), // Page Down
        }
    }

    pub fn resize_terminal(&self, connection_id: &str, lines: u16, cols: u16) -> Result<()> {
        let mut connections = self.connections.lock().unwrap();
        if let Some(connection) = connections.get_mut(connection_id) {
            connection.resize(lines, cols)
        } else {
            Err(anyhow!("Terminal connection not found"))
        }
    }

    pub fn kill_terminal(&self, connection_id: &str) -> Result<()> {
        {
            let mut connections = self.connections.lock().unwrap();
            connections.remove(connection_id);
        }
        
        {
            let mut writers = self.writers.lock().unwrap();
            writers.remove(connection_id);
        }
        
        Ok(())
    }

    pub fn is_terminal_alive(&self, connection_id: &str) -> bool {
        let mut connections = self.connections.lock().unwrap();
        if let Some(connection) = connections.get_mut(connection_id) {
            connection.is_alive()
        } else {
            false
        }
    }
}
