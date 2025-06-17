@echo off
echo Setting up Riana IDE...

echo.
echo [1/5] Installing SQLx CLI...
cargo install sqlx-cli --features sqlite
if %errorlevel% neq 0 (
    echo Warning: Failed to install SQLx CLI
    echo You may need to install it manually: cargo install sqlx-cli --features sqlite
)

echo.
echo [2/5] Setting up database and running migrations...
cd backend
sqlx database create
sqlx migrate run
cargo check
if %errorlevel% neq 0 (
    echo Error: Failed to install backend dependencies or run migrations
    exit /b 1
)

echo.
echo [3/5] Installing CLI dependencies...
cd ..\frontend
call npm install
if %errorlevel% neq 0 (
    echo Error: Failed to install CLI dependencies
    exit /b 1
)

echo.
echo [4/5] Installing Tauri app dependencies...
cd tauri-app
call npm install
if %errorlevel% neq 0 (
    echo Error: Failed to install Tauri app dependencies
    exit /b 1
)

echo.
echo [5/5] Installing Tauri CLI globally...
call npm install -g @tauri-apps/cli
if %errorlevel% neq 0 (
    echo Warning: Failed to install Tauri CLI globally
    echo You may need to install it manually: npm install -g @tauri-apps/cli
)

cd ..\..

echo.
echo ✅ Setup complete!
echo.
echo To start the backend server:
echo   cd backend && cargo run
echo.
echo To configure email settings:
echo   Edit backend/.env with your SMTP credentials
echo.
echo To test the CLI locally:
echo   cd frontend && node src/cli.js
echo.
echo To install CLI globally:
echo   cd frontend && npm install -g .
echo.
echo IMPORTANT: Configure your email settings in backend/.env before starting the server!
