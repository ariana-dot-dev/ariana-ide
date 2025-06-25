# Development Installation Guide

This guide covers setting up Ariana IDE for development on your local machine.

## Prerequisites

- **Node.js** >= 16.0.0
- **Rust** (latest stable)
- **Git**

## Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your email credentials
```

3. Install Rust dependencies and run:
```bash
cargo run
```

The backend will start on `http://localhost:8080`.

## Frontend Setup

### CLI Development

1. Install CLI dependencies:
```bash
cd frontend
npm install
```

2. Build the CLI:
```bash
npm run build
```

3. Test the CLI locally:
```bash
node dist/cli.js --help
```

### Tauri App Development

1. Install Tauri app dependencies:
```bash
cd frontend/tauri-app
npm install
```

2. Install Tauri CLI globally (if not already installed):
```bash
npm install -g @tauri-apps/cli
```

## Environment Configuration

Configure your email service in `backend/.env`:

```
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SENDER_EMAIL=your-email@gmail.com
```

## Verification

1. Check backend is running:
```bash
curl http://localhost:8080/ping
```

2. Check CLI is working:
```bash
cd frontend
node dist/cli.js status
```

You should see authentication prompts if everything is working correctly.

## Development Tools

The project includes several development scripts accessible via Just:

```bash
# View all available commands
just

# Build everything
just build-all

# Format code
just format-all

# Run Tauri in development mode
just tauri-dev
```