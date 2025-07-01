import initSwc from "@swc/wasm-web";
import { invoke } from "@tauri-apps/api/core";
import { type Event, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import React, { useEffect, useRef, useState } from "react";
import CanvasView from "./CanvasView";
import { FileTreeCanvas } from "./canvas/FileTreeCanvas";
import { Terminal } from "./canvas/Terminal";
import type { CanvasElement } from "./canvas/types";
import { ProjectSelector } from "./components/ProjectSelector";
import DiffManagement from "./components/DiffManagement";
import { useUserConfig } from "./hooks/useUserConfig";
import Onboarding from "./Onboarding";
import Repl from "./Repl";
import { Interpreter } from "./scripting/interpreter";
import { useStore } from "./state";
import { cn } from "./utils";
import Logo from "./components/Logo";
import { GitProjectProvider } from "./contexts/GitProjectContext";
import GitProjectView from "./GitProjectView";
import { osSessionGetWorkingDirectory } from "./bindings/os";
import { CustomTerminal } from "./canvas/CustomTerminal";

const appWindow = getCurrentWebviewWindow();

export const InterpreterContext = React.createContext<Interpreter | null>(null);

const THEMES = ["light", "light-sand", "semi-sky", "dark", "ghi"];

function App() {
	const store = useStore();
	const { userEmail, loading, error: _error, setUserEmail } = useUserConfig();
	const [isMaximized, setIsMaximized] = useState(false);
	const [interpreter, setInterpreter] = useState<Interpreter | null>(null);
	const [showTitlebar, setShowTitlebar] = useState(false);
	const [selectedGitProjectId, setSelectedGitProjectId] = useState<string | null>(null);
	const [showDiffManagement, setShowDiffManagement] = useState(false);
	const [diffManagementState, setDiffManagementState] = useState<any>(null);
	const { isLightTheme } = store;

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
		if (selectedGitProjectId !== null) {
			const selectedProject = store.getGitProject(selectedGitProjectId);
			if (selectedProject) {
				try {
					const currentDir = await invoke<string>("get_current_dir", {
						osSession: selectedProject.osSession,
					});
					const fileTreeElement = FileTreeCanvas.canvasElement(
						{
							size: "medium",
							aspectRatio: 0.6,
							area: "left",
						},
						currentDir,
						1,
					);
					
					selectedProject.addToCurrentCanvasElements(fileTreeElement);
				} catch (error) {
					console.error("Failed to get current directory:", error);
				}
			}
		}
	};

	const openNewTerminal = () => {
		if (selectedGitProjectId !== null) {
			const selectedProject = store.getGitProject(selectedGitProjectId);
			if (selectedProject) {
				const terminalElement = CustomTerminal.canvasElement(selectedProject.root, 1);
				selectedProject.addToCurrentCanvasElements(terminalElement)
			}
		}
	};

	const handleResetSessions = () => {
		store.clearAllGitProjects();
		setSelectedGitProjectId(null);
	};

	const toggleDiffManagement = () => {
		setShowDiffManagement(!showDiffManagement);
	};

	if (loading) {
		return (
			<div
				className={cn(
					"h-screen w-screen items-center justify-center bg-gradient-to-b from-[var(--base-300)] to-[var(--base-200)] flex flex-col rounded-lg overflow-hidden",
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
					"relative font-sans font-semibold h-screen max-h-screen w-screen overflow-hidden selection:bg-[var(--acc-300)] text-[var(--blackest)] bg-[var(--whitest)]",
					isMaximized ? "rounded-none" : "rounded-lg",
					`theme-${store.theme}`,
				)}
			>
				<div
					className="fixed w-full h-full opacity-40 z-0"
					style={{ background: 'url("assets/noise.png")' }}
				></div>
				<div className="w-full h-full max-h-full flex flex-col gap-1.5 p-2">
					{/* Diff Management Modal */}
					{showDiffManagement && (
						<div className="fixed inset-0 bg-transparent flex items-center justify-center z-50">
							<div className="bg-[var(--base-100)] rounded-lg w-full h-full flex flex-col">
								<DiffManagement 
									onClose={() => setShowDiffManagement(false)}
									initialState={diffManagementState}
									onStateChange={setDiffManagementState}
									mainTitlebarVisible={showTitlebar}
								/>
							</div>
						</div>
					)}

					{/* Custom Titlebar */}
					<div
						onMouseEnter={() => {
							titleBarHoveredRef.current = true;

							setTimeout(() => {
								console.log("titleBarHovered", titleBarHoveredRef.current);
								if (titleBarHoveredRef.current) {
									setShowTitlebar(true);
								}
							}, 400);
						}}
						onMouseLeave={() => {
							titleBarHoveredRef.current = false;

							setTimeout(() => {
								if (!titleBarHoveredRef.current) {
									setShowTitlebar(false);
								}
							}, 1000);
						}}
						className={cn(
							"flex items-center outline-0 justify-center rounded-md select-none relative z-50  transition-[height] border-[var(--acc-400-50)]",
							showTitlebar
								? "h-fit py-1"
								: "h-1 mx-2 hover:h-3 not-hover:bg-[var(--base-400-20)] hover:border-2",
						)}
					>
						{showTitlebar && (
							<>
								<span
									data-tauri-drag-region
									className={cn(
										"starting:opacity-0 text-[var(--base-500)] opacity-100 text-sm font-medium font-sans w-full text-center",
									)}
								>
									Ariana IDE
								</span>
								<div className="absolute flex right-0">
									<button
										type="button"
										onClick={openFileTree}
										className={cn(
											"starting:opacity-0 opacity-90 px-1.5 py-1 text-xs bg-[var(--base-400-20)] hover:bg-[var(--acc-400-50)] rounded-l-md transition-colors cursor-pointer",
										)}
									>
										📁
									</button>
									<button
										type="button"
										onClick={openNewTerminal}
										className={cn(
											"starting:opacity-0 opacity-90 px-1.5 py-1 text-xs bg-[var(--base-400-20)] hover:bg-[var(--acc-400-50)] transition-colors cursor-pointer",
											"starting:opacity-0 opacity-90 px-1.5 py-1 text-xs bg-[var(--base-400-20)] hover:bg-[var(--acc-400-50)] transition-colors cursor-pointer",
										)}
									>
										💻
									</button>
									<button
										type="button"
										onClick={handleResetSessions}
										className={cn(
											"starting:opacity-0 opacity-90 px-1.5 py-1 text-xs bg-[var(--base-400-20)] hover:bg-[var(--acc-400-50)] rounded-r-md transition-colors cursor-pointer",
										)}
										title="Reset all sessions"
									>
										🔄
									</button>
									<button
										type="button"
										onClick={toggleDiffManagement}
										className={cn(
											"starting:opacity-0 opacity-90 px-1.5 py-1 text-xs bg-[var(--base-400-20)] hover:bg-[var(--acc-400-50)] rounded-r-md transition-colors cursor-pointer",
										)}
									>
										🔀
									</button>
								</div>
								<div className={cn("absolute left-2 gap-2 flex items-center")}>
									<button
										type="button"
										onClick={handleClose}
										className={cn(
											"starting:opacity-0 opacity-90 w-3 h-3 rounded-full bg-[var(--base-400-20)] hover:bg-red-400 hover:outline-2 outline-offset-2 outline-red-500/50 hover:opacity-100 transition-colors cursor-pointer",
										)}
									></button>
									<button
										type="button"
										onClick={handleMinimize}
										className={cn(
											"starting:opacity-0 opacity-90 w-3 h-3 rounded-full bg-[var(--base-400-20)] hover:bg-yellow-400 hover:outline-2 outline-offset-2 outline-yellow-500/50 hover:opacity-100 transition-colors cursor-pointer",
										)}
									></button>
									<button
										type="button"
										onClick={handleMaximize}
										className={cn(
											"starting:opacity-0 opacity-90 w-3 h-3 rounded-full  bg-[var(--base-400-20)] hover:bg-green-400 hover:outline-2 outline-offset-2 outline-green-500/50 hover:opacity-100 transition-colors cursor-pointer",
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

					{/* Show ProjectSelector if no selected project, otherwise show CanvasView */}
					{selectedGitProjectId === null ? (
						<div className="z-10 justify-self-center h-full w-full max-h-full flex flex-col items-center justify-center">
							<div className="flex flex-col items-center h-fit gap-3 opacity-50 text-[var(--acc-700)]">
								<div className="w-32">
									<Logo className="" />
								</div>
								<h1 className="text-2xl font-semibold">
									Welcome to the Ariana IDE
								</h1>
							</div>
							<div className="h-fit max-h-[50%] w-full">
								<ProjectSelector onProjectCreated={(projectId: string) => {
								setSelectedGitProjectId(projectId);
							}} />
							</div>
						</div>
					) : (
						<GitProjectProvider gitProject={store.getGitProject(selectedGitProjectId) || null}>
							<GitProjectView/>
							<Repl />
						</GitProjectProvider>
					)}

					<div className="absolute hover:opacity-100 opacity-0 bottom-0 left-2 flex rounded-t-4 pb-2 justify-center gap-1 z-20">
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
