import { useContext, useEffect, useState } from "react";
import { StateContext } from "../App";
import { State } from "../state";

function useTheme(state?: State) {
    state = state || useContext(StateContext);
    console.log(state)
    const [currentTheme, setCurrentTheme] = useState(state.currentTheme.value);
    const [isLightTheme, setIsLightTheme] = useState(state.currentTheme.value.startsWith('light'));

    useEffect(() => {
        const id = state.currentTheme.subscribe((themeName) => {
            setCurrentTheme(themeName);
            setIsLightTheme(themeName.startsWith('light'));
        });
        return () => state.currentTheme.unsubscribe(id);
    }, [state]);

    return { currentTheme, isLightTheme };
}

export default useTheme;