#!/usr/bin/env node
'use server';
'use strict';

import { program } from 'commander';
import inquirer from 'inquirer';
import axios, { AxiosError } from 'axios';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Define types for better safety
interface Config {
    token?: string;
    email?: string;
    accountId?: string;
    expiresAt?: string;
    backendUrl?: string;
}

interface AuthResponse {
    token: string;
    account: {
        email: string;
        account_id: string;
    };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from local .env if it exists
const envPath = path.join(__dirname, '..', '.env');
try {
    await fs.access(envPath);
    dotenv.config({ path: envPath });
} catch {
    // .env file doesn't exist, which is fine
}

const CONFIG_DIR = path.join(os.homedir(), '.ariana');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// Check if running in development mode
async function isDevelopmentMode(): Promise<boolean> {
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    try {
        const packageJsonContent = await fs.readFile(packageJsonPath, 'utf8');
        const packageJson = JSON.parse(packageJsonContent);
        return packageJson.name === 'ariana-ide';
    } catch {
        return false;
    }
}

// Get backend URL from: 1. ENV var, 2. Global config, 3. Smart default
async function getBackendUrl(): Promise<string> {
    if (process.env.RIANA_BACKEND_URL) {
        return process.env.RIANA_BACKEND_URL;
    }
    
    const config = await loadConfig();
    if (config.backendUrl) {
        return config.backendUrl;
    }
    
    return (await isDevelopmentMode()) ? 'http://localhost:8080' : 'https://api.ariana.dev';
}

// Ensure config directory exists
async function ensureConfigDir(): Promise<void> {
    try {
        await fs.mkdir(CONFIG_DIR, { recursive: true });
    } catch (error) {
        console.error('Error creating config directory:', error);
    }
}

// Load config from file
async function loadConfig(): Promise<Config> {
    await ensureConfigDir();
    try {
        const configContent = await fs.readFile(CONFIG_FILE, 'utf8');
        return JSON.parse(configContent);
    } catch (error) {
        // File might not exist, which is okay
        return {};
    }
}

// Save config to file
async function saveConfig(config: Config): Promise<void> {
    await ensureConfigDir();
    try {
        await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
    } catch (error) {
        console.error('Error saving config:', error);
    }
}

// Check if user is logged in and token is valid
async function isLoggedIn(): Promise<boolean> {
    const config = await loadConfig();
    if (!config.token || !config.email || !config.expiresAt) {
        return false;
    }
    
    const now = new Date();
    const expiry = new Date(config.expiresAt);
    
    if (now >= expiry) {
        await saveConfig({}); // Token expired, clear config
        return false;
    }
    
    return true;
}

// Request login code
async function requestLoginCode(email: string): Promise<any> {
    const BACKEND_URL = await getBackendUrl();
    try {
        const response = await axios.post(`${BACKEND_URL}/auth/request-login-code`, { email });
        return response.data;
    } catch (error) {
        const axiosError = error as AxiosError;
        if (axiosError.response) {
            throw new Error(axiosError.response.data as string);
        }
        throw error;
    }
}

// Validate login code
async function validateLoginCode(email: string, code: string): Promise<AuthResponse> {
    const BACKEND_URL = await getBackendUrl();
    try {
        const response = await axios.post<AuthResponse>(`${BACKEND_URL}/auth/validate-login-code`, { email, code });
        return response.data;
    } catch (error) {
        const axiosError = error as AxiosError;
        if (axiosError.response) {
            throw new Error(axiosError.response.data as string);
        }
        throw error;
    }
}

// Login flow
async function login(): Promise<void> {
    console.log('Welcome to ariana IDE!');
    
    try {
        const { email } = await inquirer.prompt<{ email: string }>([
            {
                type: 'input',
                name: 'email',
                message: 'Enter your email:',
                validate: (input: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input) || 'Please enter a valid email address',
            }
        ]);

        console.log('Sending login code...');
        await requestLoginCode(email);
        console.log('Login code sent! Please check your email.');

        const { code } = await inquirer.prompt<{ code: string }>([
            {
                type: 'input',
                name: 'code',
                message: 'Enter the 6-digit code from your email:',
                validate: (input: string) => /^\d{6}$/.test(input) || 'Please enter a 6-digit code',
            }
        ]);

        console.log('Validating code...');
        const authResponse = await validateLoginCode(email, code);
        
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 3);
        
        const config: Config = {
            token: authResponse.token,
            email: authResponse.account.email,
            accountId: authResponse.account.account_id,
            expiresAt: expiresAt.toISOString()
        };
        
        await saveConfig(config);
        console.log('✅ Login successful! You are now logged in for 3 months.');
        await launchIDE();

    } catch (error) {
        console.error('❌ Login failed:', (error as Error).message);
    }
}

// Logout flow
async function logout(): Promise<void> {
    await saveConfig({});
    console.log('You have been logged out.');
}

// Status check
async function status(): Promise<void> {
    if (await isLoggedIn()) {
        const config = await loadConfig();
        console.log(`✅ Logged in as ${config.email}`);
        console.log(`Token expires at: ${new Date(config.expiresAt!).toLocaleString()}`);
    } else {
        console.log('You are not logged in. Run `ariana login` to authenticate.');
    }
}

// Launch IDE
async function launchIDE(): Promise<void> {
    console.log('Launching ariana IDE...');
    
    const isDev = await isDevelopmentMode();
    if (isDev) {
        console.log('Development mode: Running Tauri dev server...');
        const tauriProcess = spawn('npm', ['run', 'dev-tauri'], {
            cwd: path.join(__dirname, '..'),
            stdio: 'inherit',
            shell: true
        });
        tauriProcess.on('error', (err) => {
            console.error('Failed to start Tauri dev server:', err);
        });
    } else {
        // Production mode: Find and launch the pre-built binary
        const platform = os.platform();
        const arch = os.arch();
        let binaryName = '';

        if (platform === 'win32') {
            binaryName = 'ariana-ide-windows-x64.exe';
        } else if (platform === 'darwin') {
            binaryName = `ariana-ide-macos-${arch}`;
        } else if (platform === 'linux') {
            binaryName = `ariana-ide-linux-${arch}`;
        }

        if (!binaryName) {
            console.error(`Unsupported platform: ${platform}-${arch}`);
            return;
        }
        
        const binaryPath = path.join(__dirname, '..', 'bin', binaryName);

        try {
            await fs.access(binaryPath);
            const ideProcess = spawn(binaryPath, [], {
                detached: true,
                stdio: 'ignore'
            });
            ideProcess.unref();
        } catch {
            console.error(`IDE binary not found at ${binaryPath}`);
            console.error('Please run `ariana install` or reinstall the package.');
        }
    }
}

// Placeholder for install command
async function install(): Promise<void> {
    console.log('Running post-install script...');
    // In the future, this could download the correct binary from GitHub releases
    console.log('Ariana setup complete.');
}

// Main CLI logic
program
    .version('0.1.0')
    .description('ariana IDE - A modern development environment');

program
    .command('login')
    .description('Log in to your ariana account')
    .action(login);

program
    .command('logout')
    .description('Log out from your ariana account')
    .action(logout);

program
    .command('status')
    .description('Check your authentication status')
    .action(status);
    
program
    .command('install')
    .description('Post-install script for setting up ariana')
    .action(install);

// Default action: if logged in, launch IDE. If not, start login flow.
program
    .action(async () => {
        if (await isLoggedIn()) {
            await launchIDE();
        } else {
            await login();
        }
    });

program.parse(process.argv);
