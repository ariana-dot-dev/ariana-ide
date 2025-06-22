//! src/custom_terminal.rs
//!
//! Public API identical to the previous version, but the internal
//! ANSI/VT processing now relies on the vt100 crate (much more
//! accurate and far smaller).

use std::{
    collections::HashMap,
    io::{Read, Write},
    path::Path,
    sync::{Arc, Mutex},
    thread,
};

use anyhow::{anyhow, Result};
use portable_pty::{native_pty_system, Child, CommandBuilder, PtyPair, PtySize};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use unicode_width::UnicodeWidthStr;
use uuid::Uuid;
use vt100::{Cell, Color as VtColor, Parser};

// -------------------------------------------------------------------------------------------------
// Public data‐structures – unchanged
// -------------------------------------------------------------------------------------------------
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
    Default,
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
    NewLines { lines: Vec<Vec<LineItem>> },
    #[serde(rename = "patch")]
    Patch {
        line: u16,
        col: u16,
        items: Vec<LineItem>,
    },
    #[serde(rename = "cursorMove")]
    CursorMove { line: u16, col: u16 },
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

// -------------------------------------------------------------------------------------------------
// TerminalState – thin wrapper around vt100::Parser
// -------------------------------------------------------------------------------------------------

/// How many scroll-back lines to keep.
const HISTORY_LINES: usize = 100_000;

pub struct TerminalState {
    parser: Parser,
    rows: u16,
    cols: u16,
    max_rows_ever: u16,
    scrollback: usize,
    max_scrollback: usize,
    rows_state: Vec<(String, Vec<LineItem>)>,
}

impl TerminalState {
    pub fn new(rows: u16, cols: u16) -> Self {
        Self {
            parser: Parser::new(rows.into(), cols.into(), HISTORY_LINES),
            rows,
            cols,
            max_rows_ever: cols,
            scrollback: 0,
            max_scrollback: HISTORY_LINES,
            rows_state: Vec::new(),
        }
    }

    pub fn resize(&mut self, rows: u16, cols: u16) {
        self.parser.set_size(rows.into(), cols.into());
        self.rows = rows;
        self.cols = cols;
        self.max_rows_ever = self.max_rows_ever.max(rows);
    }

    /// Feed raw bytes coming from the PTY, return events we must emit.
    pub fn process_input(&mut self, data: &[u8]) -> Vec<TerminalEvent> {
        if data.is_empty() {
            return vec![];
        }

        let valid_up_to = match std::str::from_utf8(data) {
            Ok(_) => data.len(),
            Err(e) => e.valid_up_to(),
        };
        let (valid, _) = data.split_at(valid_up_to);
        if !valid.is_empty() {
            self.parser.process(valid);
        }

        vec![self.build_screen_event()]
    }

    /// Used by the scroll wheel handlers.  We simply re-emit the current
    /// screen because vt100 automatically keeps HISTORY_LINES.
    pub fn screen_event(&mut self) -> TerminalEvent {
        self.build_screen_event()
    }

    // ---------------------------------------------------------------------
    // helpers
    // ---------------------------------------------------------------------
    fn build_screen_event(&mut self) -> TerminalEvent {
        let screen = self.parser.screen();

        // cursor
        let (cursor_line, cursor_col) = screen.cursor_position();

        // rows & cols are known so we can iterate directly
        let mut current_screen = Vec::with_capacity(self.rows as usize);
        for r in 0..self.rows {
            let mut row_vec = Vec::with_capacity(self.cols as usize);
            let mut visual_col: u16 = 0;
            for c in 0..self.cols {
                let item = cell_to_item(screen.cell(r, c).cloned(), visual_col);
                visual_col += item.width;
                row_vec.push(item);
            }
            let mut cumulated_text = String::new();
            for item in &row_vec {
                cumulated_text.push_str(&item.lexeme);
            }
            current_screen.push((cumulated_text, row_vec));
        }

        if self.rows_state.len() == 0 {
            self.rows_state = current_screen.clone();
        } else {
            let mut best_shift = -1isize;
            let mut best_shift_score = self.cols as usize * self.rows as usize;

            for shift in 0..self.rows_state.len().min(self.max_rows_ever as usize) {
                let mut score = 0usize;
                for (i, (content, _)) in current_screen.iter().enumerate() {
                    let row_in_rows_state = self.rows_state.len() + i - (shift + 1);
                    if row_in_rows_state < self.rows_state.len() {
                        let (existing_content, _) = &self.rows_state[row_in_rows_state];
                        score += similarities_count(&existing_content, content)
                            + (self.cols as usize - content.len().max(existing_content.len()));
                    } else {
                        score += self.cols as usize;
                    }
                }
                if score > best_shift_score {
                    best_shift = shift as isize;
                    best_shift_score = score;
                }
            }

            println!(
                "Current rows: {:#?}",
                self.rows_state
                    .iter()
                    .map(|(content, _)| content)
                    .collect::<Vec<_>>()
            );
            println!(
                "Current screen: {:#?}",
                current_screen
                    .iter()
                    .map(|(content, _)| content)
                    .collect::<Vec<_>>()
            );
            println!("Best shift: {}", best_shift);
            println!("Best shift score: {}", best_shift_score);

            for (i, row) in current_screen.iter().enumerate() {
                let row_in_rows_state =
                    self.rows_state.len() as isize + i as isize - (best_shift + 1);
                if row_in_rows_state < self.rows_state.len() as isize && row_in_rows_state >= 0 {
                    self.rows_state[row_in_rows_state as usize] = row.clone();
                } else if row_in_rows_state >= 0 {
                    self.rows_state.push(row.clone());
                }
            }
        }

        // let result = current_screen.into_iter().map(|(_, row)| row).collect();

        // get last self.rows rows from self.rows_state
        let result: Vec<Vec<LineItem>> = self
            .rows_state
            .iter()
            .skip(self.rows_state.len().saturating_sub(self.rows as usize + self.scrollback))
            .take(self.rows as usize)
            .map(|(_, row)| row.clone())
            .collect();

        println!("Cursor line: {}", cursor_line);
        println!("Cursor col: {}", cursor_col);
        println!(
            "Results: {}",
            result
                .iter()
                .map(|row| {
                    let row = row.iter().map(|item| item.lexeme.clone()).collect::<Vec<_>>();
                    row.join("")
                })
                .collect::<Vec<_>>()
                .join("\n")
        );

        TerminalEvent::ScreenUpdate {
            screen: result,
            cursor_line,
            cursor_col,
        }
    }
}

fn similarities_count(s1: &str, s2: &str) -> usize {
    s1.chars()
        .zip(s2.chars())
        .map(|(c1, c2)| {
            if c1 == c2 {
                2
            } else if (c1.is_whitespace() && !c2.is_whitespace())
                || (!c1.is_whitespace() && c2.is_whitespace())
            {
                1
            } else {
                0
            }
        })
        .sum()
}

const TAB_WIDTH: usize = 4; // was 8 in the legacy code – pick whichever

fn cell_to_item(opt: Option<Cell>, col: u16) -> LineItem {
    let (mut txt, bold, italic, underline, fg, bg) = if let Some(c) = opt {
        (
            c.contents().to_string(),
            c.bold(),
            c.italic(),
            c.underline(),
            vt_color_to_color(Some(c.fgcolor())),
            vt_color_to_color(Some(c.bgcolor())),
        )
    } else {
        (" ".to_owned(), false, false, false, None, None)
    };

    if txt == "\t" {
        let tab_width = TAB_WIDTH - (col as usize % TAB_WIDTH);
        txt = " ".repeat(tab_width);
    }

    LineItem {
        width: UnicodeWidthStr::width(txt.as_str()) as u16,
        lexeme: txt,
        is_bold: bold,
        is_italic: italic,
        is_underline: underline,
        foreground_color: fg,
        background_color: bg,
    }
}

fn vt_color_to_color(opt: Option<VtColor>) -> Option<Color> {
    match opt {
        Some(VtColor::Idx(i)) if i < 8 => Some(ansi_color_to_color(i as u16)),
        Some(VtColor::Idx(i)) if i < 16 => Some(ansi_bright_color_to_color((i - 8) as u16)),
        Some(VtColor::Idx(i)) => Some(Color::Extended(i)),
        Some(VtColor::Rgb(r, g, b)) => Some(Color::Rgb(r, g, b)),
        Some(VtColor::Default) => None,
        None => None,
    }
}

// -------------------------------------------------------------------------------------------------
// One PTY connection
// -------------------------------------------------------------------------------------------------
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
        // create PTY
        let pty_pair = native_pty_system().openpty(PtySize {
            rows: spec.lines,
            cols: spec.cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        // spawn the requested command
        let cmd = Self::build_command(&spec)?;
        let child = pty_pair.slave.spawn_command(cmd)?;

        let state = Arc::new(Mutex::new(TerminalState::new(spec.lines, spec.cols)));

        Ok(Self {
            id,
            spec,
            pty_pair,
            child,
            app_handle,
            terminal_state: state,
        })
    }

    /// Helper to build the command matching the requested TerminalSpec.
    fn build_command(spec: &TerminalSpec) -> Result<CommandBuilder> {
        let mut cmd = match &spec.kind {
            TerminalKind::Ssh {
                host,
                username,
                port,
            } => {
                let mut c = CommandBuilder::new("ssh");
                c.arg("-p");
                c.arg(port.unwrap_or(22).to_string());
                c.arg("-t");
                c.arg(format!("{}@{}", username, host));
                c
            }

            TerminalKind::GitBash { working_directory } => {
                #[cfg(target_os = "windows")]
                {
                    let paths = [
                        "C:\\Program Files\\Git\\bin\\bash.exe",
                        "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
                        "C:\\Git\\bin\\bash.exe",
                    ];
                    let exe = paths
                        .iter()
                        .map(Path::new)
                        .find(|p| p.exists())
                        .ok_or_else(|| anyhow!("Git Bash not found"))?;
                    let mut c = CommandBuilder::new(exe);
                    c.arg("--login");
                    c.arg("-i");
                    if let Some(wd) = working_directory.as_ref().or(spec.working_dir.as_ref()) {
                        c.cwd(wd);
                    }
                    c
                }
                #[cfg(not(target_os = "windows"))]
                {
                    return Err(anyhow!("Git Bash is only available on Windows"));
                }
            }

            TerminalKind::Wsl {
                distribution,
                working_directory,
            } => {
                #[cfg(target_os = "windows")]
                {
                    let mut c = CommandBuilder::new("wsl");
                    if let Some(d) = distribution {
                        c.arg("-d");
                        c.arg(d);
                    }
                    if let Some(wd) = working_directory.as_ref().or(spec.working_dir.as_ref()) {
                        c.arg("--cd");
                        c.arg(wd);
                    }
                    c
                }
                #[cfg(not(target_os = "windows"))]
                {
                    return Err(anyhow!("WSL is only available on Windows"));
                }
            }
        };

        if let Some(sh) = &spec.shell_command {
            cmd.arg("-c");
            cmd.arg(sh);
        }
        if let Some(env) = &spec.environment {
            for (k, v) in env {
                cmd.env(k, v);
            }
        }
        Ok(cmd)
    }

    /// Start the PTY→parser→frontend pump in a separate thread.
    pub fn start_io_loop(&mut self) -> Result<()> {
        let mut reader = self.pty_pair.master.try_clone_reader()?;
        let app = self.app_handle.clone();
        let id = self.id.clone();
        let state = Arc::clone(&self.terminal_state);

        thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break, // EOF
                    Ok(n) => {
                        let events = {
                            let mut s = state.lock().unwrap();
                            // println!("Processing input: {}", String::from_utf8_lossy(&buf[..n]));
                            s.process_input(&buf[..n])
                        };
                        for ev in events {
                            if app
                                .emit_all(&format!("custom-terminal-event-{id}"), &ev)
                                .is_err()
                            {
                                break;
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("PTY read error: {e}");
                        break;
                    }
                }
            }
            let _ = app.emit_all(&format!("custom-terminal-disconnect-{id}"), ());
        });

        Ok(())
    }

    pub fn decrement_scrollback(&mut self) -> Result<()> {
        let mut state = self.terminal_state.lock().unwrap();
        if state.scrollback > 0 {
            let new_offset = state.scrollback - 1;
            // state.parser.set_scrollback(new_offset);
            state.scrollback = new_offset;
            let ev = state.screen_event();
            let _ = self
                .app_handle
                .emit_all(&format!("custom-terminal-event-{}", self.id), &ev);
        }
        Ok(())
    }

    pub fn increment_scrollback(&mut self) -> Result<()> {
        let mut state = self.terminal_state.lock().unwrap();
        // vt100 panics if scrollback offset exceeds current rows_len, so clamp to rows.
        let max_offset = state.rows_state.len() - state.rows as usize;
        if state.scrollback < max_offset {
            let new_offset = state.scrollback + 1;
            // state.parser.set_scrollback(new_offset);
            state.scrollback = new_offset;
            let ev = state.screen_event();
            let _ = self
                .app_handle
                .emit_all(&format!("custom-terminal-event-{}", self.id), &ev);
        }
        Ok(())
    }

    pub fn resize(&mut self, rows: u16, cols: u16) -> Result<()> {
        self.pty_pair.master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;
        self.spec.lines = rows;
        self.spec.cols = cols;
        self.terminal_state.lock().unwrap().resize(rows, cols);
        Ok(())
    }

    pub fn is_alive(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }
}

// -------------------------------------------------------------------------------------------------
// Manager
// -------------------------------------------------------------------------------------------------
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
        let id = Uuid::new_v4().to_string();
        let mut conn = CustomTerminalConnection::new(id.clone(), spec, app_handle)?;
        let writer = conn.pty_pair.master.take_writer()?;
        conn.start_io_loop()?;

        self.connections.lock().unwrap().insert(id.clone(), conn);
        self.writers.lock().unwrap().insert(id.clone(), writer);

        Ok(id)
    }

    pub fn send_raw_input(&self, id: &str, data: &str) -> Result<()> {
        if let Some(w) = self.writers.lock().unwrap().get_mut(id) {
            println!("Sending raw input: {}", data);
            w.write_all(data.as_bytes())?;
            w.flush()?;
            Ok(())
        } else {
            Err(anyhow!("Terminal connection not found"))
        }
    }

    pub fn send_ctrl_c(&self, id: &str) -> Result<()> {
        self.send_raw_input(id, "\x03")
    }
    pub fn send_ctrl_d(&self, id: &str) -> Result<()> {
        self.send_raw_input(id, "\x04")
    }

    pub fn send_input_lines(&self, id: &str, lines: Vec<String>) -> Result<()> {
        self.send_raw_input(id, &(lines.join("\n") + "\n"))
    }

    pub fn decrement_scrollback(&self, id: &str) -> Result<()> {
        if let Some(conn) = self.connections.lock().unwrap().get_mut(id) {
            conn.decrement_scrollback()
        } else {
            Err(anyhow!("Terminal connection not found"))
        }
    }

    pub fn increment_scrollback(&self, id: &str) -> Result<()> {
        if let Some(conn) = self.connections.lock().unwrap().get_mut(id) {
            conn.increment_scrollback()
        } else {
            Err(anyhow!("Terminal connection not found"))
        }
    }

    pub fn resize_terminal(&self, id: &str, rows: u16, cols: u16) -> Result<()> {
        if let Some(conn) = self.connections.lock().unwrap().get_mut(id) {
            conn.resize(rows, cols)
        } else {
            Err(anyhow!("Terminal connection not found"))
        }
    }

    pub fn kill_terminal(&self, id: &str) -> Result<()> {
        self.connections.lock().unwrap().remove(id);
        self.writers.lock().unwrap().remove(id);
        Ok(())
    }

    pub fn reconnect_terminal(&mut self, id: &str) -> Result<()> {
        let conns = self.connections.lock().unwrap();
        if let Some(conn) = conns.get(id) {
            let mut state = conn.terminal_state.lock().unwrap();
            let ev = state.screen_event();
            conn.app_handle
                .emit_all(&format!("custom-terminal-event-{id}"), &ev)?;
        }
        Ok(())
    }

    pub fn is_terminal_alive(&self, id: &str) -> bool {
        self.connections
            .lock()
            .unwrap()
            .get_mut(id)
            .map_or(false, |c| c.is_alive())
    }
}

// -------------------------------------------------------------------------------------------------
// Colour helpers (same as before)
// -------------------------------------------------------------------------------------------------
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
