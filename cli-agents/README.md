# CLI Coding Agents

A Rust library with Python bindings for wrapping CLI agentic tools like Claude Code. This library allows you to programmatically interact with AI coding assistants and track file changes during task execution.

## Features

- **Rust Core**: High-performance Rust implementation with async support
- **Python Bindings**: Easy-to-use Python API via PyO3
- **File Watching**: Automatic tracking of file changes during task execution
- **Diff Generation**: Git-style diff output for all file modifications
- **Subprocess Management**: Both managed and externally-managed subprocess options

## Installation

### Rust

Add to your `Cargo.toml`:

```toml
[dependencies]
cli-agents = "0.1.0"
```

### Python

```bash
pip install cli-coding-agents
```

## Usage

### Python API

```python
import asyncio
from cli_coding_agents import ClaudeCode

async def main():
    # Initialize Claude Code with a project path
    claude_code = ClaudeCode("/path/to/project")
    
    # Check if Claude Code is installed
    if not ClaudeCode.is_installed():
        await ClaudeCode.install()
    
    # Execute a coding task
    task = await claude_code.prompt("Create a simple hello world program")
    result = await task.wait_till_finish()
    
    print(f"Task completed in {result.elapsed} seconds")
    print(f"Files changed: {len(result.diff.file_changes)}")
    
    for change in result.diff.file_changes:
        print(f"Modified: {change.name_and_extension}")
        print(f"Diff:\n{change.git_style_diff}")

asyncio.run(main())
```

### Rust API

#### Simple Usage

```rust
use cli_agents::{ClaudeCode, ClaudeCodeInterface};
use std::path::PathBuf;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut claude_code = ClaudeCode::new(PathBuf::from("/path/to/project"));
    
    let task = claude_code.prompt("Create a simple hello world program").await;
    let result = task.wait_till_finish().await;
    
    match result {
        ClaudeCodeTaskResult::Success(task_result) => {
            println!("Task completed in {:?}", task_result.elapsed);
            println!("Files changed: {}", task_result.diff.file_changes.len());
        }
        ClaudeCodeTaskResult::CantStartClaudeCodeNotInstalled => {
            ClaudeCode::install().await?;
        }
        ClaudeCodeTaskResult::Error(err) => {
            eprintln!("Error: {}", err);
        }
        _ => {}
    }
    
    Ok(())
}
```

#### Externally Managed Subprocess

```rust
use cli_agents::{ExternallyManagedClaudeCodeBuilder, TuiLine, KeyboardKey};
use crossbeam_channel::unbounded;
use std::path::PathBuf;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let (tui_sender, tui_receiver) = unbounded::<Vec<TuiLine>>();
    let (keyboard_sender, keyboard_receiver) = unbounded::<Vec<KeyboardKey>>();
    
    // Start your custom CLI subprocess management
    let cli_subprocess = std::thread::spawn(move || {
        // Custom code that runs the CLI and handles TUI/keyboard communication
        // Send TUI updates via tui_sender
        // Receive keyboard input via keyboard_receiver
    });
    
    let mut claude_code = ExternallyManagedClaudeCodeBuilder::new()
        .path(PathBuf::from("/path/to/project"))
        .new_tui_line_rx(tui_receiver)
        .keyboard_keys_tx(keyboard_sender)
        .build()?;
    
    let task = claude_code.prompt("Create a simple hello world program").await;
    let result = task.wait_till_finish().await;
    
    // Handle result...
    
    Ok(())
}
```

## Building

### Rust Library

```bash
cargo build --release
```

### Python Package

```bash
# Install build dependencies
pip install setuptools-rust maturin

# Build the package
python setup.py bdist_wheel

# Or use maturin for development
maturin develop --features python
```

## Architecture

The library consists of several key components:

- **`ClaudeCode`**: Simple wrapper that manages subprocess internally
- **`ExternallyManagedClaudeCode`**: Advanced wrapper for custom subprocess management
- **`FileWatcher`**: Tracks file changes and generates diffs
- **`TaskResult`**: Contains execution time, token usage, and file diffs
- **Python Bindings**: PyO3-based bindings with async support

## Requirements

- Rust 1.70+ (for Rust usage)
- Python 3.8+ (for Python usage)
- Claude Code CLI installed on system

## License

MIT License - see LICENSE file for details.