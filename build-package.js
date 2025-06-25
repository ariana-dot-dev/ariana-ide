#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function buildPackage() {
  try {
    console.log('🚀 Building configurable Ariana package...');
    
    // Read the initial config
    const initialConfigPath = path.join(__dirname, 'initial_config.json');
    const initialConfig = JSON.parse(await fs.readFile(initialConfigPath, 'utf8'));
    
    const { executableName, version } = initialConfig.buildParams;
    
    console.log(`📦 Building package: ${executableName}@${version}`);
    
    // Step 1: Run the build-config script
    console.log('📝 Configuring build...');
    execSync('node build-config.js', { stdio: 'inherit', cwd: __dirname });
    
    // Step 2: Build the CLI
    console.log('🔨 Building CLI...');
    execSync('npm run build', { stdio: 'inherit', cwd: path.join(__dirname, 'frontend') });
    
    // Step 3: Copy config.json to tauri-app resources for bundling
    console.log('📋 Copying config to Tauri app...');
    const tauriSrcPath = path.join(__dirname, 'frontend', 'tauri-app', 'src-tauri');
    const tauriResourcesPath = path.join(tauriSrcPath, 'resources');
    
    // Ensure resources directory exists
    await fs.mkdir(tauriResourcesPath, { recursive: true });
    
    // Copy config.json to tauri resources
    const configPath = path.join(__dirname, 'frontend', 'dist', 'config.json');
    const tauriConfigPath = path.join(tauriResourcesPath, 'config.json');
    await fs.copyFile(configPath, tauriConfigPath);
    
    
    // Step 4: Build Tauri app
    console.log('🏗️  Building Tauri app...');
    execSync('npm run build', { stdio: 'inherit', cwd: path.join(__dirname, 'frontend', 'tauri-app') });
    
    // Get version from backup (since we modified package.json during build)
    const backupPath = path.join(__dirname, 'frontend', '.package.json.backup');
    const originalPackageJson = JSON.parse(await fs.readFile(backupPath, 'utf8'));
    
    // Step 5: Create a new package.json for the distribution
    const distPackageJson = {
      name: executableName,
      version: originalPackageJson.version,
      description: "Ariana IDE - A modern development environment",
      main: "dist/cli.js",
      bin: {
        [executableName]: "./dist/cli.js"
      },
      engines: {
        node: ">=16.0.0"
      },
      type: "module",
      files: [
        "dist",
        "bin"
      ],
      dependencies: {
        "@million/lint": "^1.0.14",
        "@swc/wasm-web": "^1.12.1",
        "axios": "^1.6.0",
        "commander": "^11.0.0",
        "dotenv": "^16.0.0",
        "inquirer": "^9.0.0",
        "node-fetch": "^3.3.0",
        "os-homedir": "^2.0.0"
      },
      scripts: {
        "postinstall": `node dist/cli.js install`
      },
      keywords: [
        "ide",
        "development",
        "tauri"
      ],
      author: "",
      license: "AGPL-3.0-or-later"
    };
    
    // Step 6: Restore original package.json
    console.log('🔄 Restoring package.json...');
    execSync('node ../restore-package.js', { stdio: 'inherit', cwd: path.join(__dirname, 'frontend') });
    
    // Step 7: Create dist directory structure
    const distDir = path.join(__dirname, 'dist');
    await fs.mkdir(distDir, { recursive: true });
    
    // Copy frontend dist to package dist
    const frontendDistPath = path.join(__dirname, 'frontend', 'dist');
    const packageDistPath = path.join(distDir, 'dist');
    
    // Remove existing dist if it exists
    try {
      await fs.rm(packageDistPath, { recursive: true, force: true });
    } catch {}
    
    // Copy frontend dist
    await fs.cp(frontendDistPath, packageDistPath, { recursive: true });
    
    // Copy bin directory if it exists
    const frontendBinPath = path.join(__dirname, 'frontend', 'bin');
    const packageBinPath = path.join(distDir, 'bin');
    
    try {
      await fs.access(frontendBinPath);
      await fs.cp(frontendBinPath, packageBinPath, { recursive: true });
    } catch {
      console.log('⚠️  No bin directory found, skipping...');
    }
    
    // Write the new package.json
    const distPackageJsonPath = path.join(distDir, 'package.json');
    await fs.writeFile(distPackageJsonPath, JSON.stringify(distPackageJson, null, 2));
    
    console.log(`✅ Package built successfully!`);
    console.log(`📁 Distribution created in: ${distDir}`);
    console.log(`📦 Package name: ${executableName}`);
    console.log(`🏷️  Version: ${originalPackageJson.version}`);
    console.log(`🔗 Server URL: ${initialConfig.runtimeParams.serverUrl}`);
    console.log('');
    console.log('To install locally:');
    console.log(`   cd dist && npm install -g .`);
    console.log('');
    console.log('To test:');
    console.log(`   ${executableName} --version`);
    console.log(`   ${executableName} status`);
    
  } catch (error) {
    console.error('❌ Error building package:', error.message);
    process.exit(1);
  }
}

buildPackage();