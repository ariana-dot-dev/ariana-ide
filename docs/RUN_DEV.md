# Running Ariana IDE in Development Mode

This guide covers how to run and test Ariana IDE during development.

## Quick Start

### 1. Start the Backend
```bash
cd backend
cargo run
```
The backend will be available at `http://localhost:8080`.

### 2. Start the Frontend (CLI)
```bash
cd frontend
npm run dev
```
This builds and runs the CLI for testing.

### 3. Start the Tauri App
```bash
cd frontend/tauri-app
npm run tauri dev
```
This opens the desktop application in development mode with hot reloading.

## Using Just Commands

The project includes a `Justfile` for common development tasks:

```bash
# View all available commands
just

# Build everything (backend + frontend)
just build-all

# Build only backend
just build-backend

# Build only frontend (includes CLI and Tauri)
just build-frontend

# Format all code
just format-all

# Run Tauri in development mode
just tauri-dev
```

## Development Workflow

### Backend Development
1. Make changes to Rust code in `backend/src/`
2. The server will automatically reload with `cargo run`
3. Test API endpoints:
```bash
# Test basic connectivity
curl http://localhost:8080/ping

# List LLM providers
curl http://localhost:8080/api/providers
```

### CLI Development
1. Make changes to TypeScript code in `frontend/src/`
2. Build with `npm run build`
3. Test with `node dist/cli.js [command]`

### Tauri App Development
1. Make changes to React code in `frontend/tauri-app/src/`
2. The app will hot-reload automatically when running `npm run tauri dev`
3. Changes to Rust code in `frontend/tauri-app/src-tauri/` require restart

## Testing

### CLI Commands
```bash
cd frontend

# Test version display
node dist/cli.js --version

# Test status (should prompt for login)
node dist/cli.js status

# Test help
node dist/cli.js --help
```

### API Testing
Use the provided test script:
```bash
cd backend
chmod +x examples/test_api.sh
./examples/test_api.sh
```

## Common Issues

### Backend Won't Start
- Check if port 8080 is already in use
- Verify your `.env` file is configured correctly
- Run `cargo check` to verify Rust dependencies

### CLI Build Errors
- Ensure Node.js >= 16.0.0 is installed
- Run `npm ci` to clean install dependencies
- Check TypeScript compilation with `npx tsc`

### Tauri App Won't Start
- Ensure Rust is installed and up to date
- Run `npx tauri info` to check system compatibility
- Try cleaning and rebuilding: `npm run build` then `npm run tauri dev`

## Hot Reloading

- **Backend**: No hot reloading, restart `cargo run` after changes
- **CLI**: Manual rebuild required with `npm run build`
- **Tauri Frontend**: Hot reloading enabled in dev mode
- **Tauri Backend**: Restart required for Rust changes

## Debugging

### Backend Logs
Backend logs appear in the terminal running `cargo run`. Increase verbosity with:
```bash
RUST_LOG=debug cargo run
```

### Frontend Logs
- CLI: Standard console output
- Tauri: Open DevTools in the app (right-click → Inspect Element)

### Network Issues
Check if the backend is accessible:
```bash
curl -v http://localhost:8080/ping
```

Verify the CLI can connect:
```bash
cd frontend
RIANA_BACKEND_URL=http://localhost:8080 node dist/cli.js status
```