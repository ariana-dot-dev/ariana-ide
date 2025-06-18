#!/bin/bash
# Build ariana IDE for macOS (run this on macOS)

echo "Building ariana IDE for macOS..."

cd tauri-app

# Add Apple targets if not already added
rustup target add x86_64-apple-darwin
rustup target add aarch64-apple-darwin

# Build for macOS x64
echo "Building for macOS x64..."
npm run tauri build -- --target x86_64-apple-darwin
cp src-tauri/target/x86_64-apple-darwin/release/ariana-ide ../bin/ariana-ide-macos-x64
chmod +x ../bin/ariana-ide-macos-x64

# Build for macOS ARM64 (Apple Silicon)
echo "Building for macOS ARM64..."
npm run tauri build -- --target aarch64-apple-darwin
cp src-tauri/target/aarch64-apple-darwin/release/ariana-ide ../bin/ariana-ide-macos-arm64
chmod +x ../bin/ariana-ide-macos-arm64

cd ..
echo "✅ macOS builds complete!"
