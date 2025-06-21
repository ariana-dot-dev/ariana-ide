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
    Black,
    Red,
    Green,
    Yellow,
    Blue,
    Magenta,
    Cyan,
    White,
    BrightBlack,
    BrightRed,
    BrightGreen,
    BrightYellow,
    BrightBlue,
    BrightMagenta,
    BrightCyan,
    BrightWhite,
    Extended(u8),
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CursorCommand {
    #[serde(rename = "CUU")]
    CursorUp(u16),
    #[serde(rename = "CUD")]
    CursorDown(u16),
    #[serde(rename = "CUF")]
    CursorForward(u16),
    #[serde(rename = "CUB")]
    CursorBack(u16),
    #[serde(rename = "CNL")]
    CursorNextLine(u16),
    #[serde(rename = "CPL")]
    CursorPrevLine(u16),
    #[serde(rename = "CHA")]
    CursorHorizontalAbsolute(u16),
    #[serde(rename = "CUP")]
    CursorPosition(u16, u16),
    #[serde(rename = "ED")]
    EraseDisplay(u16),
    #[serde(rename = "EL")]
    EraseLine(u16),
    #[serde(rename = "SU")]
    ScrollUp(u16),
    #[serde(rename = "SD")]
    ScrollDown(u16),
}

pub struct CustomTerminalConnection {
    pub id: String,
    pub spec: TerminalSpec,
    pub pty_pair: PtyPair,
    pub child: Box<dyn Child + Send + Sync>,
    pub app_handle: AppHandle,
    pub ansi_parser: AnsiParser,
    pub cursor_line: u16,
    pub cursor_col: u16,
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

        Ok(Self {
            id,
            spec,
            pty_pair,
            child,
            app_handle,
            ansi_parser: AnsiParser::new(),
            cursor_line: 0,
            cursor_col: 0,
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
        let rows = self.spec.lines;
        let cols = self.spec.cols;
        
        thread::spawn(move || {
            let mut buffer = [0u8; 4096];
            let mut ansi_parser = AnsiParser::with_size(rows, cols);
            
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = &buffer[..n];
                        let events = ansi_parser.parse(data);
                        
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

    // These methods will work through the manager's shared writer

    pub fn resize(&mut self, lines: u16, cols: u16) -> Result<()> {
        self.pty_pair.master.resize(PtySize {
            rows: lines,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;
        self.spec.lines = lines;
        self.spec.cols = cols;
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

pub struct AnsiParser {
    // Parser state for processing ANSI escape sequences
    buffer: Vec<u8>,
    current_style: TextStyle,
    cursor_line: u16,
    cursor_col: u16,
    screen_buffer: Vec<Vec<LineItem>>, // 2D grid representing the terminal screen
    screen_rows: u16,
    screen_cols: u16,
    is_in_alternate_screen: bool,
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

impl AnsiParser {
    pub fn new() -> Self {
        Self::with_size(24, 80) // Default terminal size
    }

    pub fn with_size(rows: u16, cols: u16) -> Self {
        let mut screen_buffer = Vec::new();
        for _ in 0..rows {
            screen_buffer.push(Vec::new());
        }

        Self {
            buffer: Vec::new(),
            current_style: TextStyle::default(),
            cursor_line: 0,
            cursor_col: 0,
            screen_buffer,
            screen_rows: rows,
            screen_cols: cols,
            is_in_alternate_screen: false,
        }
    }

    pub fn parse(&mut self, data: &[u8]) -> Vec<TerminalEvent> {
        let mut events = Vec::new();
        
        // Convert bytes to string, handling partial UTF-8 sequences
        let text = String::from_utf8_lossy(data);
        let chars = text.chars().collect::<Vec<_>>();
        let mut pos = 0;
        let mut text_buffer = String::new();
        
        while pos < chars.len() {
            let ch = chars[pos];
            
            if ch == '\x1b' && pos + 1 < chars.len() && chars[pos + 1] == '[' {
                // Flush any pending text
                if !text_buffer.is_empty() {
                    self.write_text_to_screen(&text_buffer);
                    text_buffer.clear();
                }
                
                // Parse CSI sequence
                pos += 2; // Skip \x1b[
                
                // Check for DEC private mode sequences that start with ?
                let mut is_dec_private = false;
                if pos < chars.len() && chars[pos] == '?' {
                    is_dec_private = true;
                    pos += 1;
                }
                
                // Collect parameters and find command
                let mut params_str = String::new();
                while pos < chars.len() {
                    let c = chars[pos];
                    if c.is_ascii_digit() || c == ';' {
                        params_str.push(c);
                        pos += 1;
                    } else if c.is_ascii_alphabetic() {
                        // Found command character
                        if is_dec_private {
                            // DEC private mode sequences
                            match c {
                                'h' => {
                                    // Set mode
                                    let params: Vec<u16> = if params_str.is_empty() {
                                        vec![]
                                    } else {
                                        params_str.split(';').filter_map(|s| s.parse().ok()).collect()
                                    };
                                    for param in params {
                                        match param {
                                            1049 => {
                                                // Enable alternate screen buffer
                                                self.is_in_alternate_screen = true;
                                                self.clear_screen();
                                            }
                                            _ => {} // Ignore other modes for now
                                        }
                                    }
                                },
                                'l' => {
                                    // Reset mode
                                    let params: Vec<u16> = if params_str.is_empty() {
                                        vec![]
                                    } else {
                                        params_str.split(';').filter_map(|s| s.parse().ok()).collect()
                                    };
                                    for param in params {
                                        match param {
                                            1049 => {
                                                // Disable alternate screen buffer
                                                self.is_in_alternate_screen = false;
                                                self.clear_screen();
                                            }
                                            _ => {} // Ignore other modes for now
                                        }
                                    }
                                },
                                _ => {} // Ignore other DEC sequences
                            }
                        } else {
                            // Regular CSI sequences
                            let params: Vec<u16> = if params_str.is_empty() {
                                vec![1]
                            } else {
                                params_str.split(';')
                                    .filter_map(|s| s.parse().ok())
                                    .collect()
                            };
                            
                            match c {
                                'A' => {
                                    // Cursor up
                                    let amount = params.get(0).copied().unwrap_or(1);
                                    self.cursor_line = self.cursor_line.saturating_sub(amount);
                                },
                                'B' => {
                                    // Cursor down
                                    let amount = params.get(0).copied().unwrap_or(1);
                                    self.cursor_line = (self.cursor_line + amount).min(self.screen_rows - 1);
                                },
                                'C' => {
                                    // Cursor right
                                    let amount = params.get(0).copied().unwrap_or(1);
                                    self.cursor_col = (self.cursor_col + amount).min(self.screen_cols - 1);
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
                                    self.cursor_line = line.min(self.screen_rows - 1);
                                    self.cursor_col = col.min(self.screen_cols - 1);
                                },
                                'J' => {
                                    // Clear screen
                                    let mode = params.get(0).copied().unwrap_or(0);
                                    match mode {
                                        0 => self.clear_from_cursor_to_end(),
                                        1 => self.clear_from_start_to_cursor(),
                                        2 => self.clear_screen(),
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
                                'm' => {
                                    // SGR - handle styling
                                    self.handle_sgr_sequence(&params);
                                },
                                _ => {} // Ignore unknown sequences
                            }
                        }
                        pos += 1;
                        break;
                    } else {
                        // Invalid sequence, skip
                        pos += 1;
                        break;
                    }
                }
            } else if ch == '\x1b' && pos + 1 < chars.len() && chars[pos + 1] == ']' {
                // OSC sequences - skip for now
                pos += 2;
                while pos < chars.len() && chars[pos] != '\x07' {
                    pos += 1;
                }
                if pos < chars.len() {
                    pos += 1; // Skip \x07
                }
            } else if ch == '\x1b' {
                // Other escape sequences, skip
                pos += 1;
                if pos < chars.len() {
                    pos += 1;
                }
            } else if ch == '\n' {
                // Line feed
                if !text_buffer.is_empty() {
                    self.write_text_to_screen(&text_buffer);
                    text_buffer.clear();
                }
                self.cursor_line = (self.cursor_line + 1).min(self.screen_rows - 1);
                pos += 1;
            } else if ch == '\r' {
                // Carriage return
                if !text_buffer.is_empty() {
                    self.write_text_to_screen(&text_buffer);
                    text_buffer.clear();
                }
                self.cursor_col = 0;
                pos += 1;
            } else if ch == '\x08' {
                // Backspace
                if !text_buffer.is_empty() {
                    self.write_text_to_screen(&text_buffer);
                    text_buffer.clear();
                }
                if self.cursor_col > 0 {
                    self.cursor_col -= 1;
                }
                pos += 1;
            } else if ch.is_control() && ch != '\t' {
                // Skip other control characters except tab
                pos += 1;
            } else {
                // Regular character
                text_buffer.push(ch);
                pos += 1;
            }
        }

        // Handle any remaining text
        if !text_buffer.is_empty() {
            self.write_text_to_screen(&text_buffer);
        }

        // Always emit the entire screen state
        events.push(TerminalEvent::ScreenUpdate { 
            screen: self.get_screen_lines(),
            cursor_line: self.cursor_line,
            cursor_col: self.cursor_col,
        });

        events
    }
    


    fn write_text_to_screen(&mut self, text: &str) {
        for ch in text.chars() {
            if self.cursor_line < self.screen_rows && self.cursor_col < self.screen_cols {
                // Ensure the line exists
                while self.screen_buffer.len() <= self.cursor_line as usize {
                    self.screen_buffer.push(Vec::new());
                }
                
                // Create items first to avoid borrow conflicts
                let space_item = self.create_line_item(" ".to_string());
                let char_item = self.create_line_item(ch.to_string());
                
                // Extend the line if needed
                let line = &mut self.screen_buffer[self.cursor_line as usize];
                while line.len() <= self.cursor_col as usize {
                    line.push(space_item.clone());
                }
                
                // Write the character
                line[self.cursor_col as usize] = char_item;
                self.cursor_col += 1;
                
                // Wrap to next line if needed
                if self.cursor_col >= self.screen_cols {
                    self.cursor_col = 0;
                    self.cursor_line = (self.cursor_line + 1).min(self.screen_rows - 1);
                }
            }
        }
    }

    fn clear_screen(&mut self) {
        self.screen_buffer.clear();
        for _ in 0..self.screen_rows {
            self.screen_buffer.push(Vec::new());
        }
        self.cursor_line = 0;
        self.cursor_col = 0;
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
            
            // Create space item first to avoid borrow conflicts
            let space_item = self.create_line_item(" ".to_string());
            
            let line = &mut self.screen_buffer[self.cursor_line as usize];
            for i in 0..=self.cursor_col as usize {
                if i < line.len() {
                    line[i] = space_item.clone();
                }
            }
        }
    }

    fn clear_from_cursor_to_end(&mut self) {
        // Clear from cursor to end of screen
        self.clear_line_from_cursor();
        for line_idx in (self.cursor_line + 1) as usize..self.screen_buffer.len() {
            self.screen_buffer[line_idx].clear();
        }
    }

    fn clear_from_start_to_cursor(&mut self) {
        // Clear from start of screen to cursor
        for line_idx in 0..self.cursor_line as usize {
            if line_idx < self.screen_buffer.len() {
                self.screen_buffer[line_idx].clear();
            }
        }
        self.clear_line_to_cursor();
    }

    fn get_screen_lines(&self) -> Vec<Vec<LineItem>> {
        let mut result = Vec::new();
        for row in 0..self.screen_rows {
            if row < self.screen_buffer.len() as u16 {
                result.push(self.screen_buffer[row as usize].clone());
            } else {
                result.push(Vec::new());
            }
        }
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



    fn handle_sgr_sequence(&mut self, params: &[u16]) {
        for &param in params {
            match param {
                0 => self.current_style = TextStyle::default(), // Reset
                1 => self.current_style.bold = true,
                3 => self.current_style.italic = true,
                4 => self.current_style.underline = true,
                22 => self.current_style.bold = false,
                23 => self.current_style.italic = false,
                24 => self.current_style.underline = false,
                30..=37 => self.current_style.foreground = Some(ansi_color_to_color(param - 30)),
                40..=47 => self.current_style.background = Some(ansi_color_to_color(param - 40)),
                90..=97 => self.current_style.foreground = Some(ansi_bright_color_to_color(param - 90)),
                100..=107 => self.current_style.background = Some(ansi_bright_color_to_color(param - 100)),
                _ => {} // Ignore unknown parameters
            }
        }
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
        
        let mut connections = self.connections.lock().unwrap();
        let mut writers = self.writers.lock().unwrap();
        
        connections.insert(connection_id.clone(), connection);
        writers.insert(connection_id.clone(), writer);
        
        Ok(connection_id)
    }

    pub fn reconnect_terminal(&self, id: &str) -> Result<()> {
        let connections = self.connections.lock().unwrap();
        if connections.contains_key(id) {
            Ok(())
        } else {
            Err(anyhow!("Terminal not found: {}", id))
        }
    }

    pub fn kill_terminal(&self, id: &str) -> Result<()> {
        let mut connections = self.connections.lock().unwrap();
        let mut writers = self.writers.lock().unwrap();
        
        if let Some(mut writer) = writers.remove(id) {
            let _ = writer.flush();
            drop(writer);
        }
        
        if let Some(mut connection) = connections.remove(id) {
            let _ = connection.child.kill();
            let _ = connection.child.wait();
            drop(connection.pty_pair);
        }
        
        Ok(())
    }

    pub fn send_input_lines(&self, id: &str, lines: Vec<String>) -> Result<()> {
        let mut writers = self.writers.lock().unwrap();
        if let Some(writer) = writers.get_mut(id) {
            // Always send as raw bytes without any processing
            // The terminal will handle echoing and line processing
            for line in lines {
                writer.write_all(line.as_bytes())?;
            }
            writer.flush()?;
            Ok(())
        } else {
            Err(anyhow!("Terminal not found: {}", id))
        }
    }

    pub fn send_raw_input(&self, id: &str, data: &str) -> Result<()> {
        let mut writers = self.writers.lock().unwrap();
        if let Some(writer) = writers.get_mut(id) {
            writer.write_all(data.as_bytes())?;
            writer.flush()?;
            Ok(())
        } else {
            Err(anyhow!("Terminal not found: {}", id))
        }
    }

    pub fn send_ctrl_c(&self, id: &str) -> Result<()> {
        let mut writers = self.writers.lock().unwrap();
        if let Some(writer) = writers.get_mut(id) {
            writer.write_all(&[0x03])?; // Ctrl+C
            writer.flush()?;
            Ok(())
        } else {
            Err(anyhow!("Terminal not found: {}", id))
        }
    }

    pub fn send_ctrl_d(&self, id: &str) -> Result<()> {
        let mut writers = self.writers.lock().unwrap();
        if let Some(writer) = writers.get_mut(id) {
            writer.write_all(&[0x04])?; // Ctrl+D
            writer.flush()?;
            Ok(())
        } else {
            Err(anyhow!("Terminal not found: {}", id))
        }
    }

    pub fn send_scroll(&self, id: &str, direction: ScrollDirection) -> Result<()> {
        let mut writers = self.writers.lock().unwrap();
        if let Some(writer) = writers.get_mut(id) {
            match direction {
                ScrollDirection::Up => writer.write_all(b"\x1b[S")?,
                ScrollDirection::Down => writer.write_all(b"\x1b[T")?,
            }
            writer.flush()?;
            Ok(())
        } else {
            Err(anyhow!("Terminal not found: {}", id))
        }
    }

    pub fn resize_terminal(&self, id: &str, lines: u16, cols: u16) -> Result<()> {
        let mut connections = self.connections.lock().unwrap();
        if let Some(connection) = connections.get_mut(id) {
            connection.resize(lines, cols)
        } else {
            Err(anyhow!("Terminal not found: {}", id))
        }
    }
}
