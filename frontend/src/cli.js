#!/usr/bin/env node

import { program } from 'commander';
import inquirer from 'inquirer';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from local .env if it exists
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
}

const CONFIG_DIR = path.join(os.homedir(), '.ariana');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// Check if running in development mode
function isDevelopmentMode() {
    // Check if package.json exists in parent directory (source repo)
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    if (fs.existsSync(packageJsonPath)) {
        try {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            return packageJson.name === 'ariana';
        } catch {
            return false;
        }
    }
    return false;
}

// Get backend URL from: 1. ENV var, 2. Global config, 3. Smart default
function getBackendUrl() {
    // Check environment variable first
    if (process.env.RIANA_BACKEND_URL) {
        return process.env.RIANA_BACKEND_URL;
    }
    
    // Check global config
    const config = loadConfig();
    if (config.backendUrl) {
        return config.backendUrl;
    }
    
    // Smart default based on development/production mode
    return isDevelopmentMode() ? 'http://localhost:8080' : 'https://api.ariana.dev';
}

const BACKEND_URL = getBackendUrl();

// Ensure config directory exists
function ensureConfigDir() {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
}

// Load config from file
function loadConfig() {
    ensureConfigDir();
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            return config;
        }
    } catch (error) {
        console.error('Error loading config:', error.message);
    }
    return {};
}

// Save config to file
function saveConfig(config) {
    ensureConfigDir();
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    } catch (error) {
        console.error('Error saving config:', error.message);
    }
}

// Check if user is logged in and token is valid
function isLoggedIn() {
    const config = loadConfig();
    if (!config.token || !config.email || !config.expiresAt) {
        return false;
    }
    
    // Check if token is expired
    const now = new Date();
    const expiry = new Date(config.expiresAt);
    
    if (now >= expiry) {
        // Token expired, clear config
        saveConfig({});
        return false;
    }
    
    return true;
}

// Request login code
async function requestLoginCode(email) {
    try {
        const response = await axios.post(`${BACKEND_URL}/auth/request-login-code`, {
            email: email
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        if (error.response) {
            throw new Error(error.response.data);
        }
        throw error;
    }
}

// Validate login code
async function validateLoginCode(email, code) {
    try {
        const response = await axios.post(`${BACKEND_URL}/auth/validate-login-code`, {
            email: email,
            code: code
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        if (error.response) {
            throw new Error(error.response.data);
        }
        throw error;
    }
}

// Login flow
async function login() {
    console.log('Welcome to ariana IDE!');
    
    try {
        // Get email
        const { email } = await inquirer.prompt([
            {
                type: 'input',
                name: 'email',
                message: 'Enter your email:',
                validate: (input) => {
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    return emailRegex.test(input) || 'Please enter a valid email address';
                }
            }
        ]);

        // Request login code
        console.log('Sending login code...');
        await requestLoginCode(email);
        console.log('Login code sent! Please check your email.');

        // Get code from user
        const { code } = await inquirer.prompt([
            {
                type: 'input',
                name: 'code',
                message: 'Enter the 6-digit code from your email:',
                validate: (input) => {
                    return /^\d{6}$/.test(input) || 'Please enter a 6-digit code';
                }
            }
        ]);

        // Validate code
        console.log('Validating code...');
        const authResponse = await validateLoginCode(email, code);
        
        // Save credentials
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 3); // 3 months from now
        
        const config = {
            token: authResponse.token,
            email: authResponse.account.email,
            accountId: authResponse.account.account_id,
            expiresAt: expiresAt.toISOString()
        };
        
        saveConfig(config);
        console.log('✅ Login successful! You are now logged in for 3 months.');
        
        // Launch IDE
        launchIDE();
        
    } catch (error) {
        console.error('❌ Login failed:', error.message);
        process.exit(1);
    }
}

// Get the bundled binary name based on platform and architecture
function getBinaryName() {
    const platform = process.platform;
    const arch = process.arch;
    
    if (platform === 'linux') {
        if (arch === 'arm64') {
            return 'ariana-ide-linux-arm64';
        } else if (arch === 'x64') {
            return 'ariana-ide-linux-x64';
        }
    } else if (platform === 'darwin') {
        if (arch === 'arm64') {
            return 'ariana-ide-macos-arm64';
        } else if (arch === 'x64') {
            return 'ariana-ide-macos-x64';
        }
    } else if (platform === 'win32' && arch === 'x64') {
        return 'ariana-ide-windows-x64.exe';
    }
    
    return null;
}

// Get the bundled binary path
function getBundledBinaryPath() {
    const binaryName = getBinaryName();
    if (!binaryName) return null;
    
    const binDir = path.join(__dirname, '..', 'bin');
    return path.join(binDir, binaryName);
}

// Launch Tauri IDE
function launchIDE() {
    console.log('🚀 Launching ariana IDE...');
    
    if (isDevelopmentMode()) {
        // Development mode - launch with npm run tauri:dev
        const tauriAppPath = path.join(__dirname, '..', 'tauri-app');
        
        if (!fs.existsSync(tauriAppPath)) {
            console.error('❌ Tauri app not found at:', tauriAppPath);
            console.log('Please make sure the Tauri app is properly set up.');
            return;
        }
        
        console.log('Starting Tauri app in development mode...');
        const child = spawn('npm', ['run', 'tauri:dev'], {
            cwd: tauriAppPath,
            stdio: 'inherit',
            shell: true
        });
        
        child.on('error', (error) => {
            console.error('❌ Failed to launch IDE:', error.message);
            console.log('Make sure you have Rust and Tauri CLI installed.');
            console.log('Run: npm install -g @tauri-apps/cli');
        });
    } else {
        // Production mode - launch bundled binary
        const binaryPath = getBundledBinaryPath();
        
        if (!binaryPath) {
            console.error('❌ Unsupported platform or architecture!');
            console.log(`Platform: ${process.platform}, Architecture: ${process.arch}`);
            console.log('\nSupported platforms:');
            console.log('- Linux (x64, arm64)');
            console.log('- macOS (x64, arm64)');
            console.log('- Windows (x64)');
            return;
        }
        
        if (!fs.existsSync(binaryPath)) {
            console.error('❌ ariana IDE binary not found!');
            console.log('Binary path:', binaryPath);
            console.log('\nThis might be a package installation issue.');
            console.log('Try reinstalling: npm install -g ariana');
            return;
        }
        
        console.log('Starting ariana IDE...');
        const child = spawn(binaryPath, [], {
            stdio: 'inherit',
            shell: process.platform !== 'win32',
            detached: true
        });
        
        child.on('error', (error) => {
            console.error('❌ Failed to launch IDE:', error.message);
            console.log('Binary path:', binaryPath);
        });
        
        child.unref(); // Allow the CLI to exit while the IDE runs
    }
}

// Main command handler
async function main() {
    if (isLoggedIn()) {
        console.log('✅ You are already logged in!');
        launchIDE();
    } else {
        await login();
    }
}

// CLI commands
program
    .name('ariana')
    .description('ariana IDE - A modern development environment')
    .version('0.1.0');

program
    .command('login')
    .description('Login to ariana IDE')
    .action(login);

program
    .command('install')
    .description('Set up ariana IDE binary permissions')
    .action(() => {
        const binaryPath = getBundledBinaryPath();
        
        if (!binaryPath) {
            console.error('❌ Unsupported platform or architecture!');
            process.exit(1);
        }
        
        if (!fs.existsSync(binaryPath)) {
            console.error('❌ Binary not found:', binaryPath);
            process.exit(1);
        }
        
        // Set executable permissions on Unix-like systems
        if (process.platform === 'linux' || process.platform === 'darwin') {
            try {
                fs.chmodSync(binaryPath, 0o755);
                console.log(`✅ Set executable permissions on ${binaryPath}`);
            } catch (err) {
                console.warn(`⚠️ Could not set permissions: ${err.message}`);
            }
        }
        
        console.log('✅ ariana IDE binary setup complete');
    });

program
    .command('logout')
    .description('Logout from ariana IDE')
    .action(() => {
        saveConfig({});
        console.log('✅ Successfully logged out!');
    });

program
    .command('status')
    .description('Check login status')
    .action(() => {
        if (isLoggedIn()) {
            const config = loadConfig();
            console.log('✅ Logged in as:', config.email);
            console.log('Token expires:', new Date(config.expiresAt).toLocaleDateString());
        } else {
            console.log('❌ Not logged in');
        }
        console.log('Backend URL:', BACKEND_URL);
    });

program
    .command('config')
    .description('Configure ariana settings')
    .option('--backend-url <url>', 'Set backend URL')
    .action((options) => {
        if (options.backendUrl) {
            const config = loadConfig();
            config.backendUrl = options.backendUrl;
            saveConfig(config);
            console.log('✅ Backend URL set to:', options.backendUrl);
        } else {
            const config = loadConfig();
            console.log('Current configuration:');
            const defaultUrl = isDevelopmentMode() ? 'http://localhost:8080 (dev)' : 'https://api.ariana.dev (prod)';
            console.log('Backend URL:', config.backendUrl || `${defaultUrl} (default)`);
            console.log('\nYou can also set RIANA_BACKEND_URL environment variable');
        }
    });

// Default action - main flow
if (process.argv.length === 2) {
    main().catch(console.error);
} else {
    program.parse();
}
