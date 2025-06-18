import React, { useState, useEffect } from 'react';
import { Event, UnlistenFn, listen } from '@tauri-apps/api/event';
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
    const [script, setScript] = useState('');
    const [commandInput, setCommandInput] = useState('');
    const [isScriptContainerVisible, setIsScriptContainerVisible] = useState(false);

    useEffect(() => {
        loadUserConfig();

        async function importAndRunSwcOnMount() {
            await initSwc('/wasm_bg.wasm');
            const interpreter = new Interpreter(state);
            await interpreter.init();
            setInterpreter(interpreter);
        }
        importAndRunSwcOnMount();

        state.currentInterpreterScript.subscribe((value) => {
            setScript(value);
        });

        const unlistenUserEmail = listen<string>('user-email-changed', (event: Event<string>) => {
            setUserEmail(event.payload);
        });

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'p') {
                setIsScriptContainerVisible(prevState => !prevState);
            }
        };
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            unlistenUserEmail.then((unlisten) => unlisten());
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    useEffect(() => {
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
        <div className="relative font-mono h-screen w-screen bg-gradient-to-b from-sky-300 to-sky-200 flex flex-col rounded-lg overflow-hidden">
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
                    {isScriptContainerVisible && (
                        <div id="scriptContainer" className='absolute left-2 bottom-2 flex flex-col z-10 p-3 rounded-md backdrop-blur-sm font-mono bg-blue-800/10 w-[42ch] min-h-[40ch]'>
                            <div className='px-3 py-2 flex-1'>
                                <code style={{ whiteSpace: 'pre-wrap' }}>{script}</code>
                            </div>
                            <div className='w-full rounded-md overflow-hidden max-w-full h-fit bg-blue-800/10 flex justify-between'>
                                <input className="flex-1 px-2 py-2 decoration-0 outline-none" type="text" value={commandInput} onChange={(e) => setCommandInput(e.target.value)} onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        try {
                                            interpreter?.tryRunInstruction(commandInput);
                                            setCommandInput('');
                                        } catch (e) {
                                            alert(e);
                                        }
                                    }
                                }} />
                                <button className="px-4 py-1 hover:bg-blue-600 cursor-pointer" onClick={() => {
                                    try {
                                        interpreter?.tryRunInstruction(commandInput);
                                        setCommandInput('');
                                    } catch (e) {
                                        alert(e);
                                    }
                                }}>Run</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
        </InterpreterContext>
        </StateContext>
    );
}

export default App;
