# ariana IDE v0.1

A modern development environment with CLI authentication and Tauri-based desktop app.

## Features

- 🔐 Email-based authentication with verification codes
- 💻 Cross-platform CLI tool installable via npm
- 🖥️ Native desktop application powered by Tauri + React
- 🌙 Dark theme interface
- 📧 Email integration for secure login

## Installation

```bash
# Install globally via npm
npm install -g ariana

# Login and launch IDE
ariana
```

## Architecture

- **Backend**: Rust + Actix Web + SQLite
- **CLI**: Node.js with email-based authentication flow
- **Desktop App**: Tauri + React + Vite

## Project Structure

```
ariana/
├── backend/          # Rust backend server
│   ├── src/
│   │   ├── main.rs
│   │   ├── auth.rs
│   │   ├── database.rs
│   │   └── email.rs
│   └── Cargo.toml
├── frontend/         # Node.js CLI + Tauri app
│   ├── src/
│   │   └── cli.js    # Main CLI application
│   ├── tauri-app/    # Tauri desktop application
│   └── package.json
└── README.md
```

## Development

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your email credentials
```

3. Run the backend:
```bash
cargo run
```

### Frontend Setup

1. Install CLI dependencies:
```bash
cd frontend
npm install
```

2. Install Tauri app dependencies:
```bash
cd tauri-app
npm install
```

3. Test the CLI locally:
```bash
cd ..
node src/cli.js
```

## Usage

### CLI Commands

- `ariana` - Main command (login if not authenticated, launch IDE if authenticated)
- `ariana login` - Force login flow
- `ariana logout` - Clear stored credentials
- `ariana status` - Check authentication status

### Authentication Flow

1. User runs `ariana`
2. If not logged in, prompts for email
3. Backend creates/finds account and sends verification code via email
4. User enters 6-digit code
5. CLI stores JWT token for 3 months
6. Launches Tauri desktop application

### Configuration

Credentials are stored in `~/.ariana/config.json` with the following structure:

```json
{
  "token": "jwt_token_here",
  "email": "user@example.com",
  "accountId": "uuid",
  "expiresAt": "2024-09-17T10:30:00.000Z"
}
```

## Email Configuration

Configure your email service in `backend/.env`:

```
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SENDER_EMAIL=your-email@gmail.com
```

## License

GNU Affero General Public License v3.0
