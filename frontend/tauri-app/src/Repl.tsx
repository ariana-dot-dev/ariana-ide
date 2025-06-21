import { useContext, useEffect, useState } from "react";
import { InterpreterContext, StateContext } from "./App";

const Repl = () => {
    const state = useContext(StateContext);
    const interpreter = useContext(InterpreterContext);
    const [isScriptContainerVisible, setIsScriptContainerVisible] = useState(false);
    const [script, setScript] = useState(state.currentInterpreterScript.value);
    const [commandInput, setCommandInput] = useState('');
    
    useEffect(() => {
        state.currentInterpreterScript.subscribe((value) => {
            setScript(value);
        });

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'p') {
                setIsScriptContainerVisible(prevState => !prevState);
            }
        };
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [])

    if (!isScriptContainerVisible) {
        return null;
    }
    return (
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
    )
};

export default Repl;