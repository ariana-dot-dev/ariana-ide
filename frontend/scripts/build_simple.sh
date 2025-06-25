#!/bin/bash
# Simple cross-platform build script for Ariana IDE

echo "Building Ariana IDE..."

cd "$(dirname "$0")/.."

# Build the CLI first
echo "Building CLI..."
npm run build:configured

echo "Building Tauri app..."
cd tauri-app

# Build Tauri app for current platform
npm run build

echo "✅ Build complete!"
echo ""
echo "To install locally:"
echo "  cd ../dist && npm install -g ."
echo ""
echo "To test:"
echo "  node dist/cli.js --version"