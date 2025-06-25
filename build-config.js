#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function buildWithConfig() {
  try {
    // Read the initial config
    const initialConfigPath = path.join(__dirname, 'initial_config.json');
    const initialConfig = JSON.parse(await fs.readFile(initialConfigPath, 'utf8'));
    
    // Ensure frontend/dist directory exists
    const distDir = path.join(__dirname, 'frontend', 'dist');
    await fs.mkdir(distDir, { recursive: true });
    
    // Copy initial_config.json to config.json in frontend/dist
    const configPath = path.join(distDir, 'config.json');
    await fs.writeFile(configPath, JSON.stringify(initialConfig, null, 2));
    
    // Read package.json to get the version (ground truth)
    const packageJsonPath = path.join(__dirname, 'frontend', 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
    
    // Store original package.json for restoration
    const originalPackageJson = { ...packageJson };
    
    // Update only name and bin for build process
    packageJson.name = initialConfig.buildParams.executableName;
    packageJson.bin = {
      [initialConfig.buildParams.executableName]: "./dist/cli.js"
    };
    
    await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
    
    console.log(`✅ Build configuration updated:`);
    console.log(`   - Executable name: ${initialConfig.buildParams.executableName}`);
    console.log(`   - Version: ${packageJson.version} (from package.json)`);
    console.log(`   - Server URL: ${initialConfig.runtimeParams.serverUrl}`);
    console.log(`   - Config copied to: ${configPath}`);
    
    // Store original package.json for restoration after build
    const backupPath = path.join(__dirname, 'frontend', '.package.json.backup');
    await fs.writeFile(backupPath, JSON.stringify(originalPackageJson, null, 2));
    
  } catch (error) {
    console.error('❌ Error building with config:', error.message);
    process.exit(1);
  }
}

buildWithConfig();