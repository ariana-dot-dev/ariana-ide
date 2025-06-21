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
        
        thread::spawn(move || {
            let mut buffer = [0u8; 4096];
            let mut ansi_parser = AnsiParser::new();
            
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
        Self {
            buffer: Vec::new(),
            current_style: TextStyle::default(),
        }
    }

    pub fn parse(&mut self, data: &[u8]) -> Vec<TerminalEvent> {
        let mut events = Vec::new();
        
        // Convert bytes to string, handling partial UTF-8 sequences
        let text = String::from_utf8_lossy(data);
        let chars = text.chars().collect::<Vec<_>>();
        let mut pos = 0;
        let mut current_line = Vec::new();
        let mut text_buffer = String::new();
        
        while pos < chars.len() {
            let ch = chars[pos];
            
            if ch == '\x1b' && pos + 1 < chars.len() && chars[pos + 1] == '[' {
                // Start of CSI sequence - finish current text if any
                if !text_buffer.is_empty() {
                    current_line.push(self.create_line_item(text_buffer.clone()));
                    text_buffer.clear();
                }
                
                // Find the end of the escape sequence
                let start_pos = pos;
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
                            // DEC private mode sequences - just ignore them
                            match c {
                                'h' | 'l' => {
                                    // Set/Reset modes like ?2004h (bracketed paste), ?25l (hide cursor), ?25h (show cursor)
                                    // Just ignore these for now
                                },
                                _ => {
                                    // Other DEC private sequences
                                }
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
                                'A' => events.push(TerminalEvent::CursorMove { 
                                    line: self.saturating_sub_u16(0, params.get(0).copied().unwrap_or(1)), 
                                    col: 0 
                                }),
                                'B' => events.push(TerminalEvent::CursorMove { 
                                    line: 0 + params.get(0).copied().unwrap_or(1), 
                                    col: 0 
                                }),
                                'C' => events.push(TerminalEvent::CursorMove { 
                                    line: 0, 
                                    col: 0 + params.get(0).copied().unwrap_or(1) 
                                }),
                                'D' => events.push(TerminalEvent::CursorMove { 
                                    line: 0, 
                                    col: self.saturating_sub_u16(0, params.get(0).copied().unwrap_or(1)) 
                                }),
                                'H' | 'f' => {
                                    let line = params.get(0).copied().unwrap_or(1);
                                    let col = params.get(1).copied().unwrap_or(1);
                                    events.push(TerminalEvent::CursorMove { line, col });
                                },
                                'J' => {
                                    // Clear screen - emit empty lines
                                    events.push(TerminalEvent::NewLines { lines: vec![] });
                                },
                                'K' => {
                                    // Clear line - for now just ignore, could implement as patch
                                },
                                'm' => {
                                    // SGR - handle styling
                                    self.handle_sgr_sequence(&params);
                                },
                                'S' => events.push(TerminalEvent::Scroll { 
                                    direction: ScrollDirection::Up, 
                                    amount: params.get(0).copied().unwrap_or(1) 
                                }),
                                'T' => events.push(TerminalEvent::Scroll { 
                                    direction: ScrollDirection::Down, 
                                    amount: params.get(0).copied().unwrap_or(1) 
                                }),
                                _ => {
                                    // Unknown sequence, ignore
                                }
                            }
                        }
                        pos += 1;
                        break;
                    } else {
                        // Invalid sequence, treat as regular text
                        for i in start_pos..=pos {
                            if i < chars.len() {
                                text_buffer.push(chars[i]);
                            }
                        }
                        pos += 1;
                        break;
                    }
                }
            } else if ch == '\x1b' && pos + 1 < chars.len() && chars[pos + 1] == ']' {
                // OSC (Operating System Command) sequences like ]0;title
                let _start_pos = pos;
                pos += 2; // Skip \x1b]
                
                // Find the terminator (usually \x07 or \x1b\)
                while pos < chars.len() {
                    if chars[pos] == '\x07' || 
                       (chars[pos] == '\x1b' && pos + 1 < chars.len() && chars[pos + 1] == '\\') {
                        if chars[pos] == '\x1b' {
                            pos += 2; // Skip \x1b\
                        } else {
                            pos += 1; // Skip \x07
                        }
                        break;
                    }
                    pos += 1;
                }
            } else if ch == '\x1b' {
                // Other escape sequences, just skip them
                pos += 1;
                if pos < chars.len() {
                    pos += 1; // Skip the next character too
                }
            } else if ch == '\n' {
                // New line - finish current text and emit line
                if !text_buffer.is_empty() {
                    current_line.push(self.create_line_item(text_buffer.clone()));
                    text_buffer.clear();
                }
                
                events.push(TerminalEvent::NewLines { 
                    lines: vec![current_line.clone()] 
                });
                current_line.clear();
                pos += 1;
            } else if ch == '\r' {
                // Carriage return - cursor to beginning of line
                if !text_buffer.is_empty() {
                    current_line.push(self.create_line_item(text_buffer.clone()));
                    text_buffer.clear();
                }
                
                if !current_line.is_empty() {
                    events.push(TerminalEvent::NewLines { 
                        lines: vec![current_line.clone()] 
                    });
                    current_line.clear();
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
            current_line.push(self.create_line_item(text_buffer));
        }
        if !current_line.is_empty() {
            events.push(TerminalEvent::NewLines { 
                lines: vec![current_line] 
            });
        }

        events
    }
    


    fn saturating_sub_u16(&self, a: u16, b: u16) -> u16 {
        a.saturating_sub(b)
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
            // If it's a single character (raw input), send it directly
            if lines.len() == 1 && lines[0].len() <= 4 {
                writer.write_all(lines[0].as_bytes())?;
            } else {
                // Multi-line command, join with backslashes
                let input = lines.join(" \\\n") + "\n";
                writer.write_all(input.as_bytes())?;
            }
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
