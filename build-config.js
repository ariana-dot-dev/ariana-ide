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
    
    // Update package.json with build params
    const packageJsonPath = path.join(__dirname, 'frontend', 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
    
    // Update name and version from buildParams
    packageJson.name = initialConfig.buildParams.executableName;
    packageJson.version = initialConfig.buildParams.version;
    
    // Update bin entry to use the executable name
    packageJson.bin = {
      [initialConfig.buildParams.executableName]: "./dist/cli.js"
    };
    
    await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
    
    console.log(`✅ Build configuration updated:`);
    console.log(`   - Executable name: ${initialConfig.buildParams.executableName}`);
    console.log(`   - Version: ${initialConfig.buildParams.version}`);
    console.log(`   - Server URL: ${initialConfig.runtimeParams.serverUrl}`);
    console.log(`   - Config copied to: ${configPath}`);
    
  } catch (error) {
    console.error('❌ Error building with config:', error.message);
    process.exit(1);
  }
}

buildWithConfig();