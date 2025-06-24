# Build commands for ariana-ide

# Default recipe to list all available commands
default:
    @just --list

#### Main commands ####

# Build everything
build-all: build-backend build-frontend
    @echo "All builds completed!"

# Build the backend
build-backend:
    cd backend && cargo build

# Build the frontend (complete build process)
build-frontend: frontend-npm-ci tauri-npm-ci tauri-build tauri-cargo-build

# Format everything
format-all:
    cd backend && cargo fmt
    cd frontend/tauri-app/src-tauri && cargo fmt
    cd frontend && npm run format:write

# Run the tauri app in development mode (watch mode by default -- i think)
tauri-dev:
    cd frontend/tauri-app && npx tauri dev

#### Sub-commands ####

# Install frontend cli/bin dependencies
frontend-npm-ci:
    cd frontend && npm ci

# Install tauri-app js dependencies
tauri-npm-ci:
    cd frontend/tauri-app && npm ci

# Build tauri-app js stuff
tauri-build:
    cd frontend/tauri-app && npm run build

# Build tauri-app rust components
tauri-cargo-build:
    cd frontend/tauri-app/src-tauri && cargo build

