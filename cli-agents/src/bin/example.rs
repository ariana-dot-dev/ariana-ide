use cli_agents::{ClaudeCode, ClaudeCodeInterface, ExternallyManagedClaudeCodeBuilder, TuiLine, KeyboardKey};
use crossbeam_channel::unbounded;
use std::path::PathBuf;
use std::thread;
use std::time::Duration;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("CLI Agents Library Example");
    
    // Example 1: Using the simplified ClaudeCode wrapper
    println!("\n=== Example 1: Simple ClaudeCode wrapper ===");
    let current_dir = std::env::current_dir()?;
    let mut claude_code = ClaudeCode::new(current_dir.clone());
    
    if ClaudeCode::is_installed() {
        println!("Claude Code is installed, running example...");
        let task = claude_code.prompt("List the files in this directory").await;
        let result = task.wait_till_finish().await;
        
        match result {
            cli_agents::ClaudeCodeTaskResult::Success(task_result) => {
                println!("Task completed successfully!");
                println!("Elapsed time: {:?}", task_result.elapsed);
                println!("File changes: {}", task_result.diff.file_changes.len());
                for change in &task_result.diff.file_changes {
                    println!("  - {}", change.name_and_extension);
                }
            }
            cli_agents::ClaudeCodeTaskResult::CantStartClaudeCodeNotInstalled => {
                println!("Claude Code is not installed");
            }
            cli_agents::ClaudeCodeTaskResult::CantStartLoginRequired => {
                println!("Login required for Claude Code");
            }
            cli_agents::ClaudeCodeTaskResult::Error(err) => {
                println!("Error: {}", err);
            }
        }
    } else {
        println!("Claude Code is not installed, skipping example");
    }
    
    // Example 2: Using the externally managed ClaudeCode wrapper
    println!("\n=== Example 2: Externally managed ClaudeCode wrapper ===");
    
    let (tui_sender, tui_receiver) = unbounded::<Vec<TuiLine>>();
    let (keyboard_sender, keyboard_receiver) = unbounded::<Vec<KeyboardKey>>();
    
    // Simulate a CLI subprocess management thread
    let cli_subprocess = thread::spawn(move || {
        println!("CLI subprocess started (simulated)");
        
        // Simulate receiving TUI output
        thread::sleep(Duration::from_millis(100));
        let _ = tui_sender.send(vec![
            TuiLine {
                content: "Welcome to Claude Code!".to_string(),
                timestamp: std::time::Instant::now(),
            },
            TuiLine {
                content: "Ready for input...".to_string(),
                timestamp: std::time::Instant::now(),
            },
        ]);
        
        // Listen for keyboard inputs
        loop {
            if let Ok(keys) = keyboard_receiver.recv_timeout(Duration::from_millis(100)) {
                println!("Received keyboard input: {:?}", keys);
                
                // Simulate completion after receiving input
                thread::sleep(Duration::from_millis(500));
                let _ = tui_sender.send(vec![
                    TuiLine {
                        content: "Task completed!".to_string(),
                        timestamp: std::time::Instant::now(),
                    },
                ]);
                break;
            }
        }
        
        println!("CLI subprocess finished");
    });
    
    let mut externally_managed = ExternallyManagedClaudeCodeBuilder::new()
        .path(current_dir)
        .new_tui_line_rx(tui_receiver)
        .keyboard_keys_tx(keyboard_sender)
        .build()?;
    
    let task = externally_managed.prompt("Create a simple hello world program").await;
    
    // Check for TUI updates
    tokio::time::sleep(Duration::from_millis(200)).await;
    let tui_lines = task.get_latest_tui_lines().await;
    for line in &tui_lines {
        println!("TUI: {}", line.content);
    }
    
    let result = task.wait_till_finish().await;
    match result {
        cli_agents::ClaudeCodeTaskResult::Success(task_result) => {
            println!("Externally managed task completed!");
            println!("Elapsed time: {:?}", task_result.elapsed);
            println!("File changes: {}", task_result.diff.file_changes.len());
        }
        cli_agents::ClaudeCodeTaskResult::Error(err) => {
            println!("Error: {}", err);
        }
        _ => {
            println!("Task result: {:?}", result);
        }
    }
    
    cli_subprocess.join().expect("CLI subprocess thread failed");
    println!("\nExample completed!");
    
    Ok(())
}