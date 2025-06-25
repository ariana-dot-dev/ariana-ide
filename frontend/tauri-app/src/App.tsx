import initSwc from "@swc/wasm-web";
import { invoke } from "@tauri-apps/api/core";
import { type Event, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import React, { useEffect, useState } from "react";
import CanvasView from "./CanvasView";
import { FileTreeCanvas } from "./canvas/FileTreeCanvas";
import { Terminal } from "./canvas/Terminal";
import type { CanvasElement } from "./canvas/types";
import { useUserConfig } from "./hooks/useUserConfig";
import Onboarding from "./Onboarding";
import Repl from "./Repl";
import { Interpreter } from "./scripting/interpreter";
import { useStore } from "./state";
import { cn } from "./utils";

const appWindow = getCurrentWebviewWindow();

export const InterpreterContext = React.createContext<Interpreter | null>(null);

const THEMES = ["dark-red", "semi-sky", "semi-sun", "light-sand"];

function App() {
	const store = useStore();
	const { userEmail, loading, error: _error, setUserEmail } = useUserConfig();
	const [isMaximized, setIsMaximized] = useState(false);
	const [interpreter, setInterpreter] = useState<Interpreter | null>(null);
	const [showTitlebar, setShowTitlebar] = useState(false);
	const { isLightTheme } = store;
	const addElementRef = React.useRef<((element: CanvasElement) => void) | null>(
		null,
	);

	useEffect(() => {
		const unlistenUserEmail = listen<string>(
			"user-email-changed",
			(event: Event<string>) => {
				setUserEmail(event.payload);
			},
		);

		// Initialize heavy components asynchronously without blocking UI
		async function importAndRunSwcOnMount() {
			try {
				console.log("Starting SWC initialization...");
				await initSwc("/wasm_bg.wasm");
				console.log("SWC initialized, starting interpreter...");

				const newInterpreter = new Interpreter(store);
				await newInterpreter.init();
				console.log("Interpreter initialized");

				setInterpreter(newInterpreter);
			} catch (error) {
				console.error("Failed to initialize:", error);
				// Set a placeholder interpreter to unblock the UI
				setInterpreter(new Interpreter(store));
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

	const openFileTree = async () => {
		try {
			const currentDir = await invoke<string>("get_current_dir");
			const fileTreeElement = FileTreeCanvas.canvasElement(
				{
					size: "medium",
					aspectRatio: 0.6,
					area: "left",
				},
				currentDir,
				1,
			);

			addElementRef.current?.(fileTreeElement);
		} catch (error) {
			console.error("Failed to get current directory:", error);
		}
	};

	const openNewTerminal = () => {
		const terminalElement = Terminal.createLocalShell();
		addElementRef.current?.(terminalElement);
	};

	if (loading) {
		return (
			<div
				className={cn(
					"h-screen w-screen items-center justify-center bg-gradient-to-b from-[var(--bg-300)] to-[var(--bg-200)] flex flex-col rounded-lg overflow-hidden",
				)}
			>
				Loading user config...
			</div>
		);
	}

	return (
		<InterpreterContext value={interpreter}>
			<div
				className={cn(
					"relative font-mono h-screen w-screen flex flex-col overflow-hidden selection:bg-[var(--fg-600)]",
					isLightTheme
						? "bg-gradient-to-t from-[var(--bg-300)] to-[var(--bg-200)]"
						: "bg-gradient-to-b from-[var(--bg-300)] to-[var(--bg-200)]",
					isMaximized ? "rounded-none" : "rounded-lg",
					`theme-${store.theme}`,
				)}
			>
				<div
					className={cn(
						"h-full w-full text-[var(--blackest)] bg-gradient-to-b from-[var(--fg-600)] to-[var(--bg-400)] flex flex-col rounded-lg",
					)}
				>
					{/* Custom Titlebar */}
					<div
						onMouseEnter={() => setShowTitlebar(true)}
						onMouseLeave={() => setShowTitlebar(false)}
						className={cn(
							"h-10 flex items-center justify-center px-4 select-none relative z-50",
						)}
					>
						{showTitlebar && (
							<>
								<span
									data-tauri-drag-region
									className={cn(
										"starting:opacity-0 opacity-100 text-sm font-medium font-sans w-full text-center",
									)}
								>
									Ariana IDE
								</span>
								<div className={cn("absolute right-4 gap-2 flex items-center")}>
									<button
										type="button"
										onClick={openFileTree}
										className={cn(
											"starting:opacity-0 opacity-90 px-2 py-1 text-xs bg-[var(--bg-600)] hover:bg-[var(--bg-700)] rounded transition-colors cursor-pointer mr-2",
										)}
									>
										📁
									</button>
									<button
										type="button"
										onClick={openNewTerminal}
										className={cn(
											"starting:opacity-0 opacity-90 px-2 py-1 text-xs bg-[var(--bg-600)] hover:bg-[var(--bg-700)] rounded transition-colors cursor-pointer mr-2",
										)}
									>
										💻
									</button>
									<button
										type="button"
										onClick={handleMinimize}
										className={cn(
											"starting:opacity-0 opacity-90 w-3 h-3 rounded-full bg-gradient-to-bl from-[var(--fg-600)] to-yellow-400 hover:opacity-100 transition-colors cursor-pointer",
										)}
									></button>
									<button
										type="button"
										onClick={handleMaximize}
										className={cn(
											"starting:opacity-0 opacity-90 w-3 h-3 rounded-full bg-gradient-to-bl from-[var(--fg-600)] to-green-400 hover:opacity-100 transition-colors cursor-pointer",
										)}
									></button>
									<button
										type="button"
										onClick={handleClose}
										className={cn(
											"starting:opacity-0 opacity-90 w-3 h-3 rounded-full bg-gradient-to-bl from-[var(--fg-600)] to-red-400 hover:opacity-100 transition-colors cursor-pointer",
										)}
									></button>
								</div>
							</>
						)}
					</div>

					{/* Show interpreter loading status */}
					{!interpreter && (
						<div
							className={cn(
								"absolute top-16 right-4 bg-[var(--bg-800)]/90 text-[var(--fg-300)] px-3 py-2 rounded-md text-sm",
							)}
						>
							Initializing interpreter...
						</div>
					)}

					<CanvasView onAddElementRef={addElementRef} />

					<div
						className={cn("flex-1 font-mono flex items-center justify-center")}
					>
						<Onboarding userEmail={userEmail} />
						<Repl />
					</div>

					<div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex rounded-t-4 pb-2 justify-center gap-2 z-20">
						{THEMES.map((theme) => (
							<button
								type="button"
								key={theme}
								className={cn(
									`theme-${theme}`,
									"rounded-full w-4 h-4 cursor-pointer  bg-gradient-to-br from-[var(--bg-500)] to-[var(--fg-500)] hover:outline-2 outline-[var(--fg-600)] transition-all",
									theme === store.theme ? "opacity-100" : "opacity-50",
								)}
								onClick={() => store.setTheme(theme)}
							/>
						))}
					</div>
				</div>
			</div>
		</InterpreterContext>
	);
}

export default App;
