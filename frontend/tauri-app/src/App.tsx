import React, { useState, useEffect } from 'react';
import { Event, listen } from '@tauri-apps/api/event';
import { useUserConfig } from './hooks/useUserConfig';
import { appWindow } from '@tauri-apps/api/window';
import initSwc from "@swc/wasm-web";
import { Interpreter } from './scripting/interpreter';
import { State } from './state';
import Onboarding from './Onboarding';
import Repl from './Repl';



const state = new State();
export const StateContext = React.createContext(state);
export const InterpreterContext = React.createContext<Interpreter | null>(null);

function App() {
    const { userEmail, loading, error, setUserEmail } = useUserConfig();
    const [isMaximized, setIsMaximized] = useState(false);
    const [interpreter, setInterpreter] = useState<Interpreter | null>(null);

    useEffect(() => {
        async function importAndRunSwcOnMount() {
            await initSwc('/wasm_bg.wasm');
            const interpreter = new Interpreter(state);
            await interpreter.init();
            setInterpreter(interpreter);
        }
        importAndRunSwcOnMount();

        const unlistenUserEmail = listen<string>('user-email-changed', (event: Event<string>) => {
            setUserEmail(event.payload);
        });

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
                    <Repl />
                </div>
            </div>
        </div>
        </InterpreterContext>
        </StateContext>
    );
}

export default App;
