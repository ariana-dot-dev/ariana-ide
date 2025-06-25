<p align="center">
  <h1 align="center">Ariana IDE</h1>
  <img src="assets/screenshot.jpg" width="1024" alt="Ariana IDE screenshot" />
  <br />
  <p align="center"><i>The IDE of the future.</i></p>
  <div align="center">
    <a href="https://discord.gg/Y3TFTmE89g"><img src="https://img.shields.io/discord/1312017605955162133?style=for-the-badge&color=7289da&label=Discord&logo=discord&logoColor=ffffff&size=10" alt="Join our Discord" /></a>
    <a href="https://twitter.com/anic_dev"><img src="https://img.shields.io/badge/Follow-@anic_dev-black?style=for-the-badge&logo=x&logoColor=white&size=10" alt="Follow us on X" /></a>
  </div>
</p>

## Documentation

For detailed information, see the documentation in the `docs/` folder:

- [📋 **ROADMAP.md**](docs/ROADMAP.md) - Project roadmap and architecture
- [⚙️ **INSTALL_DEV.md**](docs/INSTALL_DEV.md) - Development environment setup
- [🚀 **RUN_DEV.md**](docs/RUN_DEV.md) - Running in development mode
- [📦 **BUILD.md**](docs/BUILD.md) - Building and packaging guide

## Installation

Ariana IDE is not ready for usage yet. Come back in a few days/weeks!

## Quick Start

### Development
```bash
# Start backend
cd backend && cargo run

# Start frontend (separate terminal)
cd frontend && npm run dev

# Start Tauri app (separate terminal)  
cd frontend/tauri-app && npm run tauri dev
```

### Building
```bash
# Configure for custom build
node configure-build.js example-configs/ariana-beta.json

# Build package
node build-package.js

# Install locally
cd dist && npm install -g .
```

## License

GNU Affero General Public License v3.0
