# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Backend (Rust)
- `cd backend && cargo run` - Start the backend server on port 8080
- `cd backend && cargo build` - Build the backend
- `cd backend && cargo fmt` - Format Rust code

### Frontend CLI
- `cd frontend && npm ci` - Install CLI dependencies
- `cd frontend && npm run build` - Build TypeScript CLI
- `cd frontend && npm run dev` - Build and run CLI locally
- `cd frontend && npm run format:write` - Format code with Biome

### Tauri Desktop App
- `cd frontend/tauri-app && npm ci` - Install Tauri app dependencies
- `cd frontend/tauri-app && npm run dev` - Start Tauri app in development mode
- `cd frontend/tauri-app && npm run build` - Build Tauri app frontend
- `cd frontend/tauri-app/src-tauri && cargo build` - Build Tauri Rust components

### Just Commands (Recommended)
- `just build-all` - Build both backend and frontend completely
- `just tauri-dev` - Run Tauri app in development mode
- `just format-all` - Format all code (Rust + TypeScript)
- `just --list` - Show all available commands

## Project Architecture

**Ariana IDE** is a modern IDE with three main components:

### Backend (`backend/`)
- **Stack**: Rust + Actix Web + SQLite + LLM integrations
- **Purpose**: Authentication server and LLM API proxy
- **Key modules**:
  - `auth.rs` - Email-based authentication with login codes
  - `database.rs` - SQLite database management with migrations
  - `email.rs` - SMTP email service for login codes
  - `llm/` - Multi-provider LLM API (Anthropic, OpenAI, Google, Groq, OpenRouter)
- **Endpoints**:
  - `/ping` - Health check
  - `/auth/request-login-code`, `/auth/validate-login-code` - Authentication
  - `/api/providers`, `/api/inference`, `/api/inference/stream` - LLM API

### Frontend CLI (`frontend/`)
- **Stack**: Node.js + TypeScript + Commander.js
- **Purpose**: Command-line interface for user authentication and launching the desktop app
- **Main file**: `src/cli.ts`
- **Commands**: `ariana`, `ariana login`, `ariana logout`, `ariana status`

### Desktop App (`frontend/tauri-app/`)
- **Stack**: Tauri + React + TypeScript + Vite + TailwindCSS
- **Purpose**: Main IDE interface with canvas-based layout system
- **Key components**:
  - `App.tsx` - Main app with theme system and user config
  - `canvas/` - Advanced canvas layout system with drag-and-drop
  - `scripting/` - TypeScript scripting engine using SWC
  - `services/` - Terminal and custom terminal services
  - `state/` - Global state management
- **Features**:
  - Canvas-based UI with draggable elements (rectangles, terminals)
  - Grid optimization system with web workers
  - Custom terminal implementation
  - TypeScript scripting engine
  - Multi-theme system (dark-red, semi-sky, semi-sun, light-sand)
  - LLM integration via backend API

## Key Architecture Patterns

### Canvas System
The desktop app uses a sophisticated canvas layout system:
- Elements (rectangles, terminals) are positioned using a grid optimizer
- Web workers handle heavy grid calculations
- Drag-and-drop allows element repositioning
- Elements have targets, weights, and layouts for optimal positioning

### Authentication Flow
1. CLI requests login code via backend `/auth/request-login-code`
2. User receives email with code
3. CLI validates code via `/auth/validate-login-code`  
4. JWT token stored for future requests
5. Desktop app launches with authenticated session

### LLM Integration
- Backend acts as proxy to multiple LLM providers
- Supports both streaming and non-streaming inference
- Provider/model selection available via `/api/providers`
- Authentication required for LLM endpoints

## Environment Setup

### Backend Environment
Create `backend/.env` with:
```
DATABASE_URL=sqlite:database.db
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SENDER_EMAIL=your-email@gmail.com
```

### Python Dependencies
Theme generation requires Python with `uv`: `uv run ./scripts/generate_theme_colors.py`

## Testing

No specific test commands are configured. Check for test files in the codebase before running tests.