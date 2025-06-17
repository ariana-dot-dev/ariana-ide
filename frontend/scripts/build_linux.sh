#!/bin/bash
# Simple Linux build script for WSL

echo "Building Riana IDE for Linux..."

# Check if Rust is installed
if ! command -v cargo &> /dev/null; then
    echo "❌ Rust not found. Install it first:"
    echo "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    echo "source ~/.cargo/env"
    exit 1
fi

# Copy Cross.toml to tauri directory
cp Cross.toml tauri-app/src-tauri/

# Go to the Tauri src directory
cd tauri-app/src-tauri

# Install targets
rustup target add x86_64-unknown-linux-gnu
rustup target add aarch64-unknown-linux-gnu

# Install cross if needed
if ! command -v cross &> /dev/null; then
    echo "Installing cross..."
    cargo install cross --git https://github.com/cross-rs/cross
fi

# Build Linux x64 first (simpler)
echo "Building Linux x64..."
if cross build --release --target x86_64-unknown-linux-gnu; then
    cp target/x86_64-unknown-linux-gnu/release/riana-ide ../../bin/riana-ide-linux-x64
    chmod +x ../../bin/riana-ide-linux-x64
    echo "✅ Linux x64 done"
else
    echo "❌ Linux x64 failed"
fi

# Build Linux ARM64 (more complex due to dependencies)
echo "Building Linux ARM64..."
echo "This may take a while as it needs to set up the cross-compilation environment..."
if cross build --release --target aarch64-unknown-linux-gnu; then
    cp target/aarch64-unknown-linux-gnu/release/riana-ide ../../bin/riana-ide-linux-arm64
    chmod +x ../../bin/riana-ide-linux-arm64
    echo "✅ Linux ARM64 done"
else
    echo "❌ Linux ARM64 failed - this is common due to webkit dependencies"
    echo "You may need to build ARM64 on actual ARM64 hardware or skip it"
fi

echo "Build complete! Check bin/ directory"
