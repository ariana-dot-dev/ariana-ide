#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function restorePackageJson() {
  try {
    const backupPath = path.join(__dirname, 'frontend', '.package.json.backup');
    const packageJsonPath = path.join(__dirname, 'frontend', 'package.json');
    
    // Check if backup exists
    try {
      await fs.access(backupPath);
    } catch {
      console.log('📦 No package.json backup found, skipping restoration');
      return;
    }
    
    // Restore original package.json
    const originalPackageJson = await fs.readFile(backupPath, 'utf8');
    await fs.writeFile(packageJsonPath, originalPackageJson);
    
    // Remove backup file
    await fs.unlink(backupPath);
    
    console.log('✅ Package.json restored to original state');
    
  } catch (error) {
    console.error('❌ Error restoring package.json:', error.message);
    process.exit(1);
  }
}

restorePackageJson();