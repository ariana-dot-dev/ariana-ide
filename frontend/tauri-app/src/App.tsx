import React, { useState, useEffect } from 'react';
import { readTextFile } from '@tauri-apps/api/fs';
import { homeDir } from '@tauri-apps/api/path';
import { appWindow } from '@tauri-apps/api/window';
import initSwc from "@swc/wasm-web";
import { Interpreter } from './scripting/interpreter';
import { State } from './state';
import Onboarding from './Onboarding';

interface UserConfig {
    email: string;
    token: string;
    expiresAt: string;
}

const state = new State();
export const StateContext = React.createContext(state);
export const InterpreterContext = React.createContext<Interpreter | null>(null);

function App() {
    const [userEmail, setUserEmail] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [isMaximized, setIsMaximized] = useState(false);
    const [interpreter, setInterpreter] = useState<Interpreter | null>(null);

    useEffect(() => {
        loadUserConfig();

        async function importAndRunSwcOnMount() {
            await initSwc('/wasm_bg.wasm');
            const interpreter = new Interpreter();
            const commands = await interpreter.init();
            commands.forEach(command => state.processCommand(command));
            setInterpreter(interpreter);
        }
        importAndRunSwcOnMount();

        // Check if window is maximized
        appWindow.isMaximized().then(setIsMaximized);
    }, []);

    const loadUserConfig = async () => {
        try {
            const homePath = await homeDir();
            const configPath = `${homePath}.ariana${homePath.includes('\\') ? '\\' : '/'}config.json`;

            const configContent = await readTextFile(configPath);
            const config: UserConfig = JSON.parse(configContent);

            if (config.email && config.token) {
                const now = new Date();
                const expiry = new Date(config.expiresAt);

                if (now >= expiry) {
                    setError('Authentication token has expired. Please run ariana login again.');
                } else {
                    setUserEmail(config.email);
                }
            } else {
                setError('Invalid configuration. Missing email or token.');
            }
        } catch (err) {
            console.error('Failed to load user config:', err);
            setError('Failed to load user configuration. Please ensure you are logged in via the CLI.');
        } finally {
            setLoading(false);
        }
    };

    const handleMinimize = () => appWindow.minimize();
    const handleMaximize = () => {
        if (isMaximized) {
            appWindow.unmaximize();
        } else {
            appWindow.maximize();
        }
        setIsMaximized(!isMaximized);
    };
    const handleClose = () => appWindow.close();

    if (loading || error || interpreter === null) {
        return (<div className="h-screen w-screen items-center justify-center bg-gradient-to-b from-sky-300 to-sky-200 flex flex-col rounded-lg overflow-hidden">
            Loading...
        </div>)
    }

    return (
        <StateContext value={state}>
        <InterpreterContext value={interpreter}>
        <div className="font-mono h-screen w-screen bg-gradient-to-b from-sky-300 to-sky-200 flex flex-col rounded-lg overflow-hidden">
            <div className="h-full w-full text-sky-200 bg-gradient-to-b from-sky-600 to-sky-400 flex flex-col rounded-lg">
                {/* Custom Titlebar */}
                <div data-tauri-drag-region className="h-10 flex items-center justify-center px-4 select-none relative">
                    <span className="text-sm font-medium font-sans">Ariana IDE</span>
                    <div className="absolute right-4 gap-2 flex items-center">
                        <button
                            onClick={handleMinimize}
                            className="w-3 h-3 rounded-full opacity-90 bg-gradient-to-bl from-blue-600 to-yellow-400 hover:opacity-100 transition-colors cursor-pointer"
                        ></button>
                        <button
                            onClick={handleMaximize}
                            className="w-3 h-3 rounded-full opacity-90 bg-gradient-to-bl from-blue-600 to-green-400 hover:opacity-100 transition-colors cursor-pointer"
                        ></button>
                        <button
                            onClick={handleClose}
                            className="w-3 h-3 rounded-full opacity-90 bg-gradient-to-bl from-blue-600 to-red-400 hover:opacity-100 transition-colors cursor-pointer"
                        ></button>
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 font-mono flex items-center justify-center ">
                    <Onboarding userEmail={userEmail} />
                </div>
            </div>
        </div>
        </InterpreterContext>
        </StateContext>
    );
}

export default App;
