// Test integration with the CLI agents library

use cli_agents::{ClaudeCode, ClaudeCodeInterface};
use std::path::PathBuf;

#[allow(dead_code)]
pub async fn test_cli_agents_integration() -> Result<(), Box<dyn std::error::Error>> {
    println!("🧪 Testing CLI agents library integration...");
    
    // Test creating a ClaudeCode instance
    let current_dir = std::env::current_dir()?;
    let mut claude_code = ClaudeCode::new(current_dir);
    
    println!("✅ Successfully created ClaudeCode instance");
    
    // Test checking if Claude Code is installed
    let is_installed = ClaudeCode::is_installed();
    println!("🔍 Claude Code installed: {}", is_installed);
    
    // Note: We don't actually start a task here to avoid side effects
    println!("✅ CLI agents library integration test passed");
    
    Ok(())
}

#[allow(dead_code)]
pub fn test_file_watcher() -> Result<(), Box<dyn std::error::Error>> {
    use cli_agents::FileWatcher;
    use std::path::PathBuf;
    
    println!("🧪 Testing FileWatcher...");
    
    let current_dir = std::env::current_dir()?;
    let watcher = FileWatcher::new(current_dir)?;
    
    // Test computing diff (should be empty for no changes)
    let diff = watcher.compute_diff()?;
    println!("📊 Diff computed: {} file changes", diff.file_changes.len());
    
    println!("✅ FileWatcher test passed");
    
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_cli_agents_basic() {
        test_cli_agents_integration().await.expect("CLI agents integration test failed");
    }
    
    #[test]
    fn test_file_watcher_basic() {
        test_file_watcher().expect("FileWatcher test failed");
    }
}