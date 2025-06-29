import {
	createContext,
	useContext,
	useState,
	useMemo,
	ReactNode,
	useEffect,
} from "react";
import { load, Store } from "@tauri-apps/plugin-store";
import { Command } from "../scripting/baseScript";
import { OsSession } from "../bindings/os";

// Define the shape of the state
interface AppState {
	theme: string;
	showOnboarding: boolean;
	currentInterpreterScript: string;
	osSessions: Record<string, OsSession>;
	currentOsSessionId?: string;
}

// Define the shape of the store, including state and actions
export interface IStore extends AppState {
	setTheme: (theme: string) => void;
	setShowOnboarding: (show: boolean) => void;
	setCurrentInterpreterScript: (script: string) => void;
	isLightTheme: boolean;
	addOsSession: (session: OsSession) => string;
	removeOsSession: (sessionId: string) => void;
	getOsSession: (sessionId: string) => OsSession | null;
	osSessions: Record<string, OsSession>;
	setCurrentOsSessionId?: (sessionId: string) => void;
	processCommand: (command: Command) => void;
	revertCommand: () => void;
}

// Create the context
const StoreContext = createContext<IStore | null>(null);

// Provider component
export function StoreProvider({ children }: { children: ReactNode }) {
	const [theme, setThemeState] = useState("light");
	const [showOnboarding, setShowOnboardingState] = useState(false);
	const [currentInterpreterScript, setCurrentInterpreterScriptState] =
		useState("");
	const [processedCommandsStack, setProcessedCommandsStack] = useState<
		Command[]
	>([]);
	const [osSessions, setOsSessions] = useState<Record<string, OsSession>>({});
	const [tauriStore, setTauriStore] = useState<Store | null>(null);

	// Load state from disk on initial render
	useEffect(() => {
		const loadState = async () => {
			try {
				const tauriStore = await load("store.json", { autoSave: false });
				setTauriStore(tauriStore);
				const savedState = await tauriStore.get<AppState>("appState");
				if (savedState) {
					setThemeState(savedState.theme);
					setShowOnboardingState(savedState.showOnboarding);
					setCurrentInterpreterScriptState(savedState.currentInterpreterScript);
					setOsSessions(savedState.osSessions || {});
				}
			} catch (error) {
				console.error("Failed to load state:", error);
			}
		};
		loadState();
	}, []);

	// Save state to disk whenever it changes
	useEffect(() => {
		const saveState = async () => {
			try {
				if (!tauriStore) return;
				const stateToSave: AppState = {
					theme,
					showOnboarding,
					currentInterpreterScript,
					osSessions,
				};
				await tauriStore.set("appState", stateToSave);
				await tauriStore.save();
			} catch (error) {
				console.error("Failed to save state:", error);
			}
		};
		saveState();
	}, [theme, showOnboarding, currentInterpreterScript]);

	const setTheme = (newTheme: string) => setThemeState(newTheme);
	const setShowOnboarding = (show: boolean) => setShowOnboardingState(show);
	const setCurrentInterpreterScript = (script: string) =>
		setCurrentInterpreterScriptState(script);

	const isLightTheme = useMemo(() => theme.startsWith("light"), [theme]);

	const processCommand = (command: Command) => {
		setProcessedCommandsStack((prev) => [...prev, command]);
		if (command.$type === "Onboarding:show") {
			setShowOnboarding(true);
		}
		if (command.$type === "Onboarding:hide") {
			setShowOnboarding(false);
		}
		if (command.$type === "Theme:set") {
			setTheme(command.themeName);
		}
	};

	const revertCommand = () => {
		if (processedCommandsStack.length === 0) return;

		const newStack = [...processedCommandsStack];
		const commandToRevert = newStack.pop()!;
		setProcessedCommandsStack(newStack);

		if (commandToRevert.$type === "Onboarding:show") {
			setShowOnboarding(false);
		}
		if (commandToRevert.$type === "Onboarding:hide") {
			setShowOnboarding(true);
		}
		if (commandToRevert.$type === "Theme:set") {
			let previousTheme = "light";
			for (let i = newStack.length - 1; i >= 0; i--) {
				const prevCommand = newStack[i];
				if (prevCommand.$type === "Theme:set") {
					previousTheme = prevCommand.themeName;
					break;
				}
			}
			setTheme(previousTheme);
		}
	};

	const store: IStore = {
		theme,
		setTheme,
		showOnboarding,
		setShowOnboarding,
		currentInterpreterScript,
		setCurrentInterpreterScript,
		isLightTheme,
		processCommand,
		revertCommand,
		osSessions,
		addOsSession: (session: OsSession) => {
			const sessionId = crypto.randomUUID();
			setOsSessions((prev) => ({
				...prev,
				[sessionId]: session,
			}));
			return sessionId;
		},
		removeOsSession: (sessionId: string) => {
			setOsSessions((prev) => {
				const newSessions = { ...prev };
				delete newSessions[sessionId];
				return newSessions;
			});
		},
		getOsSession: (sessionId: string) => {
			return osSessions[sessionId] || null;
		}
	};

	return (
		<StoreContext.Provider value={store}>{children}</StoreContext.Provider>
	);
}

// Custom hook to access the store
export function useStore() {
	const context = useContext(StoreContext);
	if (!context) {
		throw new Error("useStore must be used within a StoreProvider");
	}
	return context;
}
