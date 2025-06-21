import React, { useState, useEffect } from 'react';
import { Event, listen } from '@tauri-apps/api/event';
import { useUserConfig } from './hooks/useUserConfig';
import { appWindow } from '@tauri-apps/api/window';
import initSwc from "@swc/wasm-web";
import { Interpreter } from './scripting/interpreter';
import { State } from './state';
import Onboarding from './Onboarding';
import Repl from './Repl';
import CanvasView from './CanvasView';
import { cn } from './utils';



const state = new State();
export const StateContext = React.createContext(state);
export const InterpreterContext = React.createContext<Interpreter | null>(null);

function App() {
    const { userEmail, loading, error, setUserEmail } = useUserConfig();
    const [isMaximized, setIsMaximized] = useState(false);
    const [interpreter, setInterpreter] = useState<Interpreter | null>(null);
    const [showTitlebar, setShowTitlebar] = useState(false);

    useEffect(() => {
        // Initialize user email listener immediately for better UX
        const unlistenUserEmail = listen<string>('user-email-changed', (event: Event<string>) => {
            setUserEmail(event.payload);
        });

        // Initialize heavy components asynchronously without blocking UI
        async function importAndRunSwcOnMount() {
            try {
                console.log('Starting SWC initialization...');
                await initSwc('/wasm_bg.wasm');
                console.log('SWC initialized, starting interpreter...');
                
                const interpreter = new Interpreter(state);
                await interpreter.init();
                console.log('Interpreter initialized');
                
                setInterpreter(interpreter);
            } catch (error) {
                console.error('Failed to initialize:', error);
                // Set a placeholder interpreter to unblock the UI
                setInterpreter(new Interpreter(state));
            }
        }
        
        // Start initialization after a brief delay to allow UI to render
        setTimeout(importAndRunSwcOnMount, 100);

        return () => {
            unlistenUserEmail.then((unlisten) => unlisten());
        };
    }, []);

    useEffect(() => {
        // Check if window is maximized
        appWindow.isMaximized().then(setIsMaximized);
    }, []);



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

    if (loading || error) {
        return (<div className={cn("h-screen w-screen items-center justify-center bg-gradient-to-b from-[var(--bg-300)] to-[var(--bg-200)] flex flex-col rounded-lg overflow-hidden")}>
            {loading ? 'Loading user config...' : `Error: ${error}`}
        </div>)
    }

    return (
        <StateContext value={state}>
            <InterpreterContext value={interpreter}>
                <div className={cn("relative font-mono h-screen w-screen bg-gradient-to-b from-[var(--bg-300)] to-[var(--bg-200)] flex flex-col rounded-lg overflow-hidden")}>
                    <div className={cn("h-full w-full text-[var(--bg-200)] bg-gradient-to-b from-[var(--fg-600)] to-[var(--bg-400)] flex flex-col rounded-lg")}>
                        {/* Custom Titlebar */}
                        <div 
                            onMouseEnter={() => setShowTitlebar(true)} 
                            onClick={() => setShowTitlebar(true)} 
                            onMouseLeave={() => setShowTitlebar(false)} 
                            className={cn("h-10 flex items-center justify-center px-4 select-none relative z-50")}
                        >
                            {showTitlebar && (<>
                                <span data-tauri-drag-region className={cn("starting:opacity-0 opacity-100 text-sm font-medium font-sans w-full text-center")}>Ariana IDE</span>
                                <div className={cn("absolute right-4 gap-2 flex items-center")}>
                                    <button
                                        onClick={handleMinimize}
                                        className={cn("starting:opacity-0 opacity-90 w-3 h-3 rounded-full bg-gradient-to-bl from-[var(--fg-600)] to-yellow-400 hover:opacity-100 transition-colors cursor-pointer")}
                                    ></button>
                                    <button
                                        onClick={handleMaximize}
                                        className={cn("starting:opacity-0 opacity-90 w-3 h-3 rounded-full bg-gradient-to-bl from-[var(--fg-600)] to-green-400 hover:opacity-100 transition-colors cursor-pointer")}
                                    ></button>
                                    <button
                                        onClick={handleClose}
                                        className={cn("starting:opacity-0 opacity-90 w-3 h-3 rounded-full bg-gradient-to-bl from-[var(--fg-600)] to-red-400 hover:opacity-100 transition-colors cursor-pointer")}
                                    ></button>
                                </div>
                            </>)}
                        </div>

                        {/* Show interpreter loading status */}
                        {!interpreter && (
                            <div className={cn("absolute top-16 right-4 bg-[var(--bg-800)]/90 text-[var(--fg-300)] px-3 py-2 rounded-md text-sm")}>
                                Initializing interpreter...
                            </div>
                        )}

                        <CanvasView />

                        <div className={cn("flex-1 font-mono flex items-center justify-center")}>
                            <Onboarding userEmail={userEmail} />
                            {/* <Repl /> */}
                        </div>
                    </div>
                </div>
            </InterpreterContext>
        </StateContext>
    );
}

export default App;
