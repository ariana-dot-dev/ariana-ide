"""
Example usage of the CLI Coding Agents Python library.
"""

import asyncio
import os
from cli_coding_agents import ClaudeCode

async def simple_example():
    """Simple example using the ClaudeCode wrapper."""
    print("=== Simple ClaudeCode Example ===")
    
    # Get current directory
    current_dir = os.getcwd()
    print(f"Working directory: {current_dir}")
    
    # Initialize Claude Code
    claude_code = ClaudeCode(current_dir)
    
    # Check if Claude Code is installed
    if not ClaudeCode.is_installed():
        print("Claude Code is not installed. Installation would be required.")
        print("Skipping actual execution...")
        return
    
    try:
        # Execute a coding task
        print("Sending prompt to Claude Code...")
        task = await claude_code.prompt("List the files in this directory and create a simple README if one doesn't exist")
        
        print("Waiting for task completion...")
        result = await task.wait_till_finish()
        
        print(f"Task completed successfully!")
        print(f"Elapsed time: {result.elapsed:.2f} seconds")
        
        if result.tokens:
            print(f"Tokens used: {result.tokens}")
        
        print(f"Files changed: {len(result.diff.file_changes)}")
        
        # Display file changes
        for i, change in enumerate(result.diff.file_changes):
            print(f"\n--- Change {i+1}: {change.name_and_extension} ---")
            print(f"Path: {change.absolute_path}")
            
            if len(change.original_content) > 0:
                print("Type: Modified")
            else:
                print("Type: Created")
            
            # Show a preview of the diff (first 500 chars)
            diff_preview = change.git_style_diff[:500]
            if len(change.git_style_diff) > 500:
                diff_preview += "\n... (truncated)"
            
            print(f"Diff preview:\n{diff_preview}")
        
    except Exception as e:
        print(f"Error during task execution: {e}")

async def main():
    """Main function to run examples."""
    print("CLI Coding Agents Python Example")
    print("=" * 40)
    
    await simple_example()
    
    print("\n" + "=" * 40)
    print("Example completed!")

if __name__ == "__main__":
    asyncio.run(main())