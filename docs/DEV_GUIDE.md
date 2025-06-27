# Running Ariana IDE in Development Mode

Use these simple one-command operations for development:

## Prerequisites

- Node.js (>= 24.2.0)
- Rust (latest)

### WSL & Linux

```
sudo apt install pkg-config \
  libdbus-1-dev \
  libgtk-3-dev \
  libsoup2.4-dev \
  libjavascriptcoregtk-4.1-dev \
  libwebkit2gtk-4.1-dev
```

## Install Just

```bash
# Install Just

npm install -g just
```

## Development Commands

```bash
# 🚀 Run backend server (installs deps + runs)
# Before first time: edit backend/.env
just dev-backend

# 🎨 Run frontend Tauri app only (no CLI login needed)
just dev-frontend

# 🔐 Run frontend via CLI login (requires backend running)
just dev-cli
```

## Build Commands

```bash
# 📦 Build with custom config
just build example-configs/ariana-beta.json

# 🏗️ Platform builds
just build-windows
just build-macos  
just build-linux
```

## Other Commands

```bash
# 🧹 Format all code
just format
```

That's it! All dependencies are automatically installed and configured by the `just` commands.