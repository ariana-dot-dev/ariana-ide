#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function configureBuild(configPath) {
  try {
    if (!configPath) {
      throw new Error('Please provide a config file path as an argument');
    }
    
    // Check if config file exists
    const fullConfigPath = path.resolve(configPath);
    await fs.access(fullConfigPath);
    
    // Copy the provided config to initial_config.json
    const targetConfigPath = path.join(__dirname, 'initial_config.json');
    await fs.copyFile(fullConfigPath, targetConfigPath);
    
    console.log(`✅ Configuration set from: ${fullConfigPath}`);
    console.log(`📋 Config copied to: ${targetConfigPath}`);
    
    // Read and display the config
    const configContent = JSON.parse(await fs.readFile(targetConfigPath, 'utf8'));
    console.log('\n📦 Build Configuration:');
    console.log(`   Executable Name: ${configContent.buildParams.executableName}`);
    console.log(`   Version: ${configContent.buildParams.version}`);
    console.log(`   Server URL: ${configContent.runtimeParams.serverUrl}`);
    console.log('\nYou can now run: node build-package.js');
    
  } catch (error) {
    console.error('❌ Error configuring build:', error.message);
    console.log('\nUsage: node configure-build.js <path-to-config.json>');
    console.log('\nExample config.json:');
    console.log(JSON.stringify({
      "buildParams": {
        "executableName": "ariana-beta",
        "version": "0.2.0-beta.1"
      },
      "runtimeParams": {
        "serverUrl": "https://beta-api.ariana.dev"
      }
    }, null, 2));
    process.exit(1);
  }
}

const configPath = process.argv[2];
configureBuild(configPath);