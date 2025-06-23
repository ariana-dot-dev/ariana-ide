# Coding Rules

## Comments

- skip comments if names are clear and behavior is intuitive
- do not output md docs unless i ask explicitly for them
- comments should be in lowercase
- prefer self-documenting code over excessive comments
- when comments are necessary, keep them concise and focused on "why" not "what"

## Code Quality

- avoid linting errors in code output
- make sure the project compiles/builds before passing the turn to the user
- follow project-specific lint configurations
- fix warnings, not just errors

## Development Practices

- use available tools and mcp servers to improve accuracy
- if inside ts/js projects make sure to check which is the existing package manager, runtime, and scripts

## Rust

- use `anyhow` for error handling
- do not run `cargo build --release`. doing `cargo check` is fine
- use cargo add instead of directly editing the toml file when adding dependencies in rust
- when transforming data in rust prefer to use a functional, compact approach rather than normal loops (unless you are just printing to stdout/err)

## Tauri

## Frontend

- when running `cargo` commands directly, make sure to be under `frontend/tauri-app/src-tauri`
- to run tauri in `frontend`: `npm run dev-tauri`
- to build tauri's js in `frontend`: `npm run build-tauri`
