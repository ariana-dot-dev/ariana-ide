# """
# Example usage of the CLI Coding Agents Python library.
# """

# from cli_coding_agents import ClaudeCode

# claude_code = ClaudeCode(project_path)

# task = await claude_code.prompt("""
#     List the files in this directory and create 
#     a simple README if one doesn't exist
# """)

# result = await task.wait_till_finish()

# print(f"Files changed: {result.diff.file_changes}")
# print(f"Tokens used: {result.diff.tokens}")
# print(f"Time elapsed: {result.diff.elapsed}s")

