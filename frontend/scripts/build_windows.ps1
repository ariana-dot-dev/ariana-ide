# Build ariana IDE for Windows
Write-Host "Building ariana IDE for Windows..."

Set-Location tauri-app

# Build for Windows x64
Write-Host "Building for Windows x64..."
npm run tauri build -- --target x86_64-pc-windows-msvc

# Copy binary to bin directory
$sourcePath = "src-tauri\target\x86_64-pc-windows-msvc\release\ariana IDE.exe"
$destPath = "..\bin\ariana-ide-windows-x64.exe"

if (Test-Path $sourcePath) {
    Copy-Item $sourcePath $destPath
    Write-Host "✅ Windows x64 binary copied to bin/"
} else {
    Write-Error "❌ Windows x64 binary not found at $sourcePath"
}

Set-Location ..
Write-Host "Windows build complete!"
