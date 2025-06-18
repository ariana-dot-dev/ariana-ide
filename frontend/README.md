# ariana IDE CLI

A modern development environment CLI that manages authentication and launches the ariana IDE.

## Installation

```bash
npm install -g ariana
```

## Usage

```bash
# Launch ariana IDE (will prompt for login if needed)
ariana

# Explicit login
ariana login

# Check status
ariana status

# Configure backend URL
ariana config --backend-url https://api.example.com

# Logout
ariana logout
```

## Development

### Building Binaries

The CLI bundles platform-specific binaries of the Tauri IDE. Build them using:

**Windows (on Windows):**
```bash
npm run build:windows
```

**Linux (using cross-compilation with Docker):**
```bash
# Install cross first: cargo install cross
npm run build:linux
```

**macOS (on macOS):**
```bash
npm run build:macos
```

**All platforms:**
```bash
npm run build:all
```

### Cross-Compilation Setup

- **Linux**: Uses `cross` with Docker for cross-compilation from Windows/WSL2
- **macOS**: Requires building on actual macOS machine
- **Windows**: Native compilation

Binaries are placed in `bin/` directory with platform-specific names:
- `ariana-ide-windows-x64.exe`
- `ariana-ide-linux-x64`
- `ariana-ide-linux-arm64`
- `ariana-ide-macos-x64`
- `ariana-ide-macos-arm64`

### Development vs Production

The CLI automatically detects the environment:

- **Development**: When run from source repo, uses `npm run tauri:dev`
- **Production**: When installed via npm, uses bundled binary

Override backend URL with environment variable:
```bash
export RIANA_BACKEND_URL=http://localhost:8080
```
