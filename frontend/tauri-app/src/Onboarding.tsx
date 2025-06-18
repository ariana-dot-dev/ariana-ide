import { CancelSquareIcon } from "@hugeicons-pro/core-bulk-rounded";
import { HugeiconsIcon } from "@hugeicons/react";
import { useContext, useEffect, useState } from "react";
import { StateContext } from "./App";
import { InterpreterContext } from "./App";

const Onboarding = ({ userEmail }: { userEmail: string }) => {
    const state = useContext(StateContext);
    const interpreter = useContext(InterpreterContext);
    const [showOnboarding, setShowOnboarding] = useState(state.showOnboarding.value);

    useEffect(() => {
        state.showOnboarding.subscribe((value) => {
            setShowOnboarding(value);
        });
    }, [])

    if (!showOnboarding) {
        return null;
    }

    return (
        <div id="onboarding" className="group relative text-center p-8 hover:border-2 border-sky-200/20 border-dashed">
            <button 
                className="group/closebutton absolute right-0 top-0 group-hover:flex hidden p-1 items-center justify-center cursor-pointer border-b-2 border-l-2 border-sky-200/20 border-dashed rounded-bl-md"
                onClick={async () => {
                    const commands = await interpreter?.tryRunInstruction("Onboarding.hide()");
                    if (commands) {
                        commands.forEach(command => state.processCommand(command));
                    }
                }}
            >
                <div className='group-hover/closebutton:opacity-100 opacity-50'>
                    <HugeiconsIcon icon={CancelSquareIcon} />
                </div>
            </button>
            <div className='flex flex-col items-center gap-0.5'>
                <img src="./assets/app-icon-grad.png" className=' w-56' />
                <h1 className="text-5xl font-mono font-bold mb-8">Ariana IDE</h1>
            </div>
            <p className="text-sky-200 text-lg px-2">Welcome, {userEmail}</p>
        </div>
    )
}

export default Onboarding;