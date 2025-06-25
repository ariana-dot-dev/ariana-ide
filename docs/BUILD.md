# Building Ariana IDE

This guide covers how to build Ariana IDE for distribution, including the configurable build system that allows creating multiple branded versions.

## Prerequisites

- Node.js (>= 24.2.0)
- Rust (latest)

## Install Just

```bash
# Install Just

npm install -g just
```

## Look at the DEV_GUIDE.md for installing other dependencies

## Quick Build

```bash
# Build with custom configuration (one command)
just build example-configs/ariana-beta.json

# Platform-specific builds
just build-windows
just build-macos
just build-linux
```

## Configurable Build System

Ariana IDE supports building different branded versions with custom:
- Executable names
- Version numbers  
- Server URLs
- Runtime configurations

### Configuration File Format

Create a JSON configuration file with the following structure:

```json
{
  "buildParams": {
    "executableName": "ariana-beta"
  },
  "runtimeParams": {
    "serverUrl": "https://beta-api.ariana.dev"
  }
}
```

**Note**: The version is always taken from `frontend/package.json` as the ground truth.

### Example Configurations

The project includes example configurations in `example-configs/`:

#### Beta Version (`ariana-beta.json`)
```json
{
  "buildParams": {
    "executableName": "ariana-beta"
  },
  "runtimeParams": {
    "serverUrl": "https://beta-api.ariana.dev"
  }
}
```

#### Test Version (`ariana-test.json`)
```json
{
  "buildParams": {
    "executableName": "ariana-test"
  },
  "runtimeParams": {
    "serverUrl": "http://localhost:8080"
  }
}
```

## Build Process

### Build with Just
```bash
# One command to configure and build
just build path/to/your-config.json
```

This process:
1. Configures the build (temporarily modifies package.json)
2. Builds the CLI with TypeScript
3. Copies config to Tauri app resources
4. Builds the Tauri desktop application
5. Restores original package.json
6. Creates a distributable package in `dist/`

### Install Locally
```bash
cd dist && npm install -g .
```

After installation, you can use your custom executable:
```bash
ariana-beta --version
ariana-test status
```

## Platform-Specific Builds

```bash
# Windows (requires Windows or cross-compilation)
just build-windows

# macOS (requires macOS)  
just build-macos

# Linux (uses cross-compilation)
just build-linux
```

## Distribution Structure

After building, the `dist/` directory contains:

```
dist/
├── package.json          # npm package configuration
├── dist/
│   ├── cli.js            # Built CLI application
│   └── config.json       # Runtime configuration
└── bin/                  # Platform-specific binaries (if built)
    ├── ariana-ide-linux-x64
    ├── ariana-ide-macos-x64
    ├── ariana-ide-macos-arm64
    └── ariana-ide-windows-x64.exe
```

## Runtime Configuration

The built package includes a bundled `config.json` that contains:

- **Build Parameters**: Visible to users, shows how the package was built
- **Runtime Parameters**: Used by the CLI and Tauri app for server communication

### CLI Integration
The CLI automatically reads the bundled configuration for:
- Server URL (overrides default)
- Executable name (in help messages)

Version information comes from the package.json file (ground truth).

### Tauri Integration
The Tauri app can access the build configuration via the `useBuildConfig` hook:

```typescript
import { useBuildConfig } from './hooks/useBuildConfig';

function MyComponent() {
  const { buildConfig } = useBuildConfig();
  
  if (buildConfig) {
    console.log('Server URL:', buildConfig.runtimeParams.serverUrl);
    console.log('Executable:', buildConfig.buildParams.executableName);
  }
}
```

## Creating Your Own Build

1. **Create a configuration file**:
```json
{
  "buildParams": {
    "executableName": "my-custom-ide"
  },
  "runtimeParams": {
    "serverUrl": "https://my-api.example.com"
  }
}
```

2. **Build with Just**:
```bash
just build my-config.json
```

3. **Install and test**:
```bash
cd dist
npm install -g .
my-custom-ide --version
```

## Troubleshooting

### Build Failures
- Ensure all dependencies are installed: `npm ci` in both `frontend/` and `frontend/tauri-app/`
- Check Node.js version: >= 16.0.0 required
- Verify Rust installation for Tauri builds
- Ensure Node.js is available for theme generation

### Configuration Issues
- Validate JSON syntax in your config file
- Ensure `executableName` contains only valid characters for executable names
- Check that `serverUrl` is a valid URL

### Runtime Issues
- Verify the bundled `config.json` exists in `dist/dist/config.json`
- Check that the server URL in your config is accessible
- Test CLI functionality before packaging: `node dist/cli.js status`

## Advanced Usage

### Environment Variables
You can override runtime configuration with environment variables:

```bash
# Override server URL
RIANA_BACKEND_URL=http://localhost:3000 my-custom-ide status
```

### Custom Build Scripts
You can create your own build automation by chaining the configuration and build commands:

```bash
#!/bin/bash
for config in configs/*.json; do
  echo "Building $(basename $config .json)..."
  node configure-build.js "$config"
  node build-package.js
  mv dist "builds/$(basename $config .json)"
done
```