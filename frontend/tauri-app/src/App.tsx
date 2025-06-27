import initSwc from "@swc/wasm-web";
import { invoke } from "@tauri-apps/api/core";
import { type Event, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import React, { useEffect, useRef, useState } from "react";
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
import LandingPage from "./components/LandingPage";
import { Project } from "./types/project";
import { projectService } from "./services/ProjectService";

const appWindow = getCurrentWebviewWindow();

export const InterpreterContext = React.createContext<Interpreter | null>(null);

const THEMES = ["light", "semi-sky"];

function App() {
	const store = useStore();
	const { userEmail, loading, error: _error, setUserEmail } = useUserConfig();
	const [isMaximized, setIsMaximized] = useState(false);
	const [interpreter, setInterpreter] = useState<Interpreter | null>(null);
	const [showTitlebar, setShowTitlebar] = useState(false);
	const { isLightTheme, showLandingPage, setShowLandingPage, setCurrentProject } = store;
	
	// Debug logging
	console.log("App render - showLandingPage:", showLandingPage, "currentProject:", store.currentProject);
	const addElementRef = React.useRef<((element: CanvasElement) => void) | null>(
		null,
	);

	const titleBarHoveredRef = useRef(false);

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
				console.log("Skipping SWC initialization for now...");
				// Skip SWC initialization temporarily to test landing page
				// await initSwc("/wasm_bg.wasm");
				// console.log("SWC initialized, starting interpreter...");

				const newInterpreter = new Interpreter(store);
				// Skip interpreter init that requires SWC
				// await newInterpreter.init();
				console.log("Interpreter placeholder set");

				setInterpreter(newInterpreter);
			} catch (error) {
				console.error("Failed to initialize:", error);
				// Set a placeholder interpreter to unblock the UI
				setInterpreter(new Interpreter(store));
			}
		}

		// Start initialization immediately
		importAndRunSwcOnMount();

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

	const testDirectoryPicker = async () => {
		try {
			console.log("Testing directory picker...");
			const result = await invoke<string | null>("open_directory_picker");
			console.log("Directory picker result:", result);
			alert(`Selected directory: ${result || "None"}`);
		} catch (error) {
			console.error("Directory picker error:", error);
			alert(`Error: ${error}`);
		}
	};

	const toggleLandingPage = () => {
		console.log("Toggling landing page. Current:", showLandingPage);
		setShowLandingPage(!showLandingPage);
		setCurrentProject(null); // Reset current project when toggling to landing page
	};

	const openNewTerminal = () => {
		const terminalElement = Terminal.createLocalShell();
		addElementRef.current?.(terminalElement);
	};

	const handleProjectSelect = async (project: Project, subfolderId?: string) => {
		try {
			// Update project's last opened time
			projectService.updateProject(project.id, { lastOpened: new Date() });
			
			// Set current project in store
			setCurrentProject(project.id);
			
			// Hide landing page
			setShowLandingPage(false);
			
			// Determine which path to open
			let pathToOpen = project.rootPath;
			if (subfolderId) {
				const subfolder = project.subfolderPaths.find(sf => sf.id === subfolderId);
				if (subfolder && subfolder.relativePath !== "/") {
					pathToOpen = `${project.rootPath}/${subfolder.relativePath}`.replace(/\/+/g, "/");
				}
			}
			
			// Open file tree for the selected path
			const fileTreeElement = FileTreeCanvas.canvasElement(
				{
					size: "medium",
					aspectRatio: 0.6,
					area: "left",
				},
				pathToOpen,
				1,
			);
			
			addElementRef.current?.(fileTreeElement);
		} catch (error) {
			console.error("Failed to open project:", error);
		}
	};

	if (loading) {
		return (
			<div
				className={cn(
					"h-screen w-screen items-center justify-center bg-gradient-to-b from-[var(--base-300)] to-[var(--base-200)] flex flex-col rounded-lg overflow-hidden",
				)}
			>
				Loading user config...
				<button 
					onClick={() => {
						setShowLandingPage(true);
						setCurrentProject(null);
					}}
					className="mt-4 px-4 py-2 bg-blue-500 text-white rounded"
				>
					Skip to Landing Page
				</button>
			</div>
		);
	}

	return (
		<InterpreterContext value={interpreter}>
			<div
				className={cn(
					"relative font-sans font-semibold h-screen w-screen overflow-hidden selection:bg-[var(--acc-300)] text-[var(--blackest)]",
					isLightTheme
						? "bg-gradient-to-t from-[var(--acc-100)] to-[var(--base-100)]"
						: "bg-gradient-to-t from-[var(--acc-100)] to-[var(--base-100)]",
					isMaximized ? "rounded-none" : "rounded-lg",
					`theme-${store.theme}`,
				)}
			>
				<div className="fixed w-full h-full opacity-40" style={{ background: 'url("assets/noise.png")' }}>
				</div>
				<div className="w-full h-full flex flex-col gap-1.5 p-2">
					{/* Custom Titlebar */}
					<div
						onMouseEnter={() => {
							titleBarHoveredRef.current = true

							setTimeout(() => {
								console.log("titleBarHovered", titleBarHoveredRef.current)
								if (titleBarHoveredRef.current) {
									setShowTitlebar(true)
								}
							}, 400)
						}}
						onMouseLeave={() => {
							titleBarHoveredRef.current = false

							setTimeout(() => {
								if (!titleBarHoveredRef.current) {
									setShowTitlebar(false)
								}
							}, 1000)
						}}
						className={cn(
							"flex items-center outline-0 justify-center rounded-md select-none relative z-50  transition-[height] border-[var(--acc-400-50)]",
							showTitlebar ? "h-fit py-1" : "h-1 mx-2 hover:h-3 not-hover:bg-[var(--base-400-40)] hover:border-2"
						)}
					>
						{showTitlebar && (
							<>
								<span
									data-tauri-drag-region
									className={cn(
										"starting:opacity-0 text-[var(--acc-500)] opacity-100 text-sm font-medium font-sans w-full text-center",
									)}
								>
									Ariana IDE
								</span>
								<div className="absolute flex right-0">
									{!showLandingPage && (
										<>
											<button
												type="button"
												onClick={openFileTree}
												className={cn(
													"starting:opacity-0 opacity-90 px-1.5 py-1 text-xs bg-[var(--base-400-50)] hover:bg-[var(--base-400)] rounded-l-md transition-colors cursor-pointer",
												)}
											>
												📁
											</button>
											<button
												type="button"
												onClick={openNewTerminal}
												className={cn(
													"starting:opacity-0 opacity-90 px-1.5 py-1 text-xs bg-[var(--base-400-50)] hover:bg-[var(--base-400)] transition-colors cursor-pointer",
												)}
											>
												💻
											</button>
										</>
									)}
									<button
										type="button"
										onClick={toggleLandingPage}
										className={cn(
											"starting:opacity-0 opacity-90 px-1.5 py-1 text-xs bg-[var(--base-400-50)] hover:bg-[var(--base-400)] transition-colors cursor-pointer flex items-center justify-center",
											!showLandingPage ? "rounded-r-md" : "rounded-md"
										)}
									>
										<img 
											src="app-icon.png" 
											alt="Ariana" 
											className="w-4 h-4"
										/>
									</button>
								</div>
								<div className={cn("absolute left-2 gap-2 flex items-center")}>
									<button
										type="button"
										onClick={handleClose}
										className={cn(
											"starting:opacity-0 opacity-90 w-3 h-3 rounded-full bg-[var(--base-400-50)] hover:bg-red-400 hover:outline-2 outline-offset-2 outline-red-500/50 hover:opacity-100 transition-colors cursor-pointer",
										)}
									></button>
									<button
										type="button"
										onClick={handleMinimize}
										className={cn(
											"starting:opacity-0 opacity-90 w-3 h-3 rounded-full bg-[var(--base-400-50)] hover:bg-yellow-400 hover:outline-2 outline-offset-2 outline-yellow-500/50 hover:opacity-100 transition-colors cursor-pointer",
										)}
									></button>
									<button
										type="button"
										onClick={handleMaximize}
										className={cn(
											"starting:opacity-0 opacity-90 w-3 h-3 rounded-full  bg-[var(--base-400-50)] hover:bg-green-400 hover:outline-2 outline-offset-2 outline-green-500/50 hover:opacity-100 transition-colors cursor-pointer",
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
								"absolute top-16 right-4 bg-[var(--base-800)]/90 text-[var(--acc-300)] px-3 py-2 rounded-md text-sm",
							)}
						>
							Initializing interpreter...
						</div>
					)}

					{showLandingPage ? (
						<LandingPage onProjectSelect={handleProjectSelect} />
					) : (
						<>
							<CanvasView onAddElementRef={addElementRef} />
							<Repl />
						</>
					)}

					<div className="absolute bottom-0 left-2 flex rounded-t-4 pb-2 justify-center gap-1 z-20">
						{THEMES.map((theme) => (
							<button
								type="button"
								key={theme}
								className={cn(
									`theme-${theme}`,
									"rounded-full w-4 h-4 cursor-pointer  bg-gradient-to-br from-[var(--base-500)] to-[var(--acc-500)] hover:outline-2 outline-[var(--acc-600)] transition-all",
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
