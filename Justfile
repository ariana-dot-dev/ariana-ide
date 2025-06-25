# Ariana IDE - Development Commands

# List all available commands
default:
    @just --list

# 🚀 Install and run backend server in development mode
dev-backend:
    @echo "🔧 Installing and running backend..."
    cp backend/.env.example backend/.env
    cargo install sqlx-cli
    cd backend && sqlx db create
    cd backend && sqlx migrate run
    cd backend && cargo run

# 🎨 Install and run frontend (Tauri app only, no CLI login required)
dev-frontend:
    @echo "🔧 Installing frontend dependencies..."
    cd frontend/tauri-app && npm install
    @echo "🚀 Starting Tauri development server..."
    cd frontend && npm run dev-tauri

# 🔐 Install and run frontend via CLI (requires backend running)
dev-cli:
    @echo "🔧 Installing CLI dependencies..."
    cd frontend && npm install
    @echo "🔧 Installing Tauri dependencies..."
    cd frontend/tauri-app && npm install
    @echo "🔨 Building CLI..."
    cd frontend && npm run build
    @echo "🔐 Starting CLI (will prompt for login)..."
    cd frontend && node dist/cli.js

# 📦 Build with custom configuration
build CONFIG_PATH:
    @echo "📦 Building with config: {{CONFIG_PATH}}"
    node configure-build.js "{{CONFIG_PATH}}"
    node build-package.js

# 🏗️ Build for Windows
build-windows:
    @echo "🏗️ Building for Windows..."
    cd frontend/tauri-app && npm run tauri build -- --target x86_64-pc-windows-msvc

# 🏗️ Build for macOS  
build-macos:
    @echo "🏗️ Building for macOS..."
    cd frontend && sh scripts/build_macos.sh

# 🏗️ Build for Linux
build-linux:
    @echo "🏗️ Building for Linux..."
    cd frontend && bash scripts/build_linux.sh

# 🧹 Format all code
format:
    @echo "🧹 Formatting code..."
    cd backend && cargo fmt
    cd frontend/tauri-app/src-tauri && cargo fmt
    cd frontend && npm run format:write