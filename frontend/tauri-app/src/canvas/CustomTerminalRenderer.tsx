import React, {
	useState,
	useEffect,
	useRef,
	useCallback,
} from "react";
import { useStore } from "../state";
import {
	customTerminalAPI,
	TerminalEvent,
	TerminalSpec,
	LineItem,
	defaultLineItem,
} from "../services/CustomTerminalAPI";
import { cn } from "../utils";
import { motion } from "framer-motion";

interface CustomTerminalRendererProps {
	elementId: string;
	spec: TerminalSpec;
	onTerminalReady?: (terminalId: string) => void;
	onTerminalError?: (error: string) => void;
}

// Simple connection manager to reuse connections
class TerminalConnectionManager {
	private static connections = new Map<string, string>(); // elementId -> terminalId

	static getConnection(elementId: string): string | undefined {
		return this.connections.get(elementId);
	}

	static setConnection(elementId: string, terminalId: string): void {
		this.connections.set(elementId, terminalId);
	}

	static removeConnection(elementId: string): void {
		this.connections.delete(elementId);
	}

	static hasConnection(elementId: string): boolean {
		return this.connections.has(elementId);
	}
}

export const CustomTerminalRenderer: React.FC<CustomTerminalRendererProps> = ({
	elementId,
	spec,
	onTerminalReady,
	onTerminalError,
}) => {
	const { isLightTheme } = useStore();

	const [terminalId, setTerminalId] = useState<string | null>(null);
	const [screen, setScreen] = useState<LineItem[][]>([]);
	const [cursorPosition, setCursorPosition] = useState({ line: 0, col: 0 });
	const [isConnected, setIsConnected] = useState(false);
	const [windowDimensions, setWindowDimensions] = useState({
		rows: 24,
		cols: 80,
	});
	const [charDimensions, setCharDimensions] = useState({ width: 7.35, height: 16 });

	const phantomCharRef = useRef<HTMLSpanElement>(null);
	const listenersRef = useRef<Map<number, (items: LineItem[]) => void>>(new Map());

	const terminalRef = useRef<HTMLDivElement>(null);
	const terminalInnerRef = useRef<HTMLDivElement>(null);
	const scrollableRef = useRef<HTMLDivElement>(null);
	const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const isResizingRef = useRef<boolean>(false);
	const hasScrolledRef = useRef<boolean>(false);

	useEffect(() => {
		if (!phantomCharRef.current) return;

		const observer = new ResizeObserver(entries => {
			for (let entry of entries) {
				const { width, height } = entry.contentRect;
				if (width > 0 && height > 0) {
					setCharDimensions({ width, height });
				}
			}
		});

		observer.observe(phantomCharRef.current);

		return () => {
			observer.disconnect();
		};
	}, []);

	// Initialize terminal connection
	useEffect(() => {
		let mounted = true;

		const connectTerminal = async () => {
			// Check if we already have a connection for this element
			const existingTerminalId =
				TerminalConnectionManager.getConnection(elementId);

			if (existingTerminalId && !terminalId) {
				console.log(
					`Reusing existing terminal connection ${existingTerminalId} for element ${elementId}`,
				);
				setTerminalId(existingTerminalId);
				setIsConnected(true);

				// Set up event listeners for existing connection
				await customTerminalAPI.onTerminalEvent(
					existingTerminalId,
					handleTerminalEvent,
				);
				await customTerminalAPI.onTerminalDisconnect(
					existingTerminalId,
					handleTerminalDisconnect,
				);

				onTerminalReady?.(existingTerminalId);
				return;
			}

			// Don't create new connection if we already have one
			if (terminalId && isConnected) {
				console.log("Terminal already connected, skipping reconnection");
				return;
			}

			console.log(
				`Creating new terminal connection for element ${elementId}:`,
				spec,
			);

			try {
				const id = await customTerminalAPI.connectTerminal(spec);
				if (!mounted) return;

				// Store the connection mapping
				TerminalConnectionManager.setConnection(elementId, id);

				setTerminalId(id);
				setIsConnected(true);

				// Set up event listeners
				await customTerminalAPI.onTerminalEvent(id, handleTerminalEvent);
				await customTerminalAPI.onTerminalDisconnect(
					id,
					handleTerminalDisconnect,
				);

				onTerminalReady?.(id);
			} catch (err) {
				if (!mounted) return;
				const errorMessage = err instanceof Error ? err.message : String(err);
				onTerminalError?.(errorMessage);
			}
		};

		connectTerminal();

		return () => {
			mounted = false;
			// Don't kill terminals on unmount - keep connections alive for reuse
		};
	}, [elementId]);

	const scrollDown = () => {
		setTimeout(() => {
			const scrollableDiv = scrollableRef.current;
			if (!scrollableDiv) return;

			const isNearBottom = () => {
				const scrollTop = scrollableDiv.scrollTop;
				const scrollHeight = scrollableDiv.scrollHeight;
				const clientHeight = scrollableDiv.clientHeight;
				return scrollHeight - scrollTop - clientHeight <= 10; // Within 10px of bottom
			};

			// Scroll to bottom if no scroll has happened or user is near bottom
			if (true) {
				scrollableDiv.scrollTop = scrollableDiv.scrollHeight;
			}
		}, 10)
	}

	const handleTerminalEvent = useCallback((events: TerminalEvent[]) => {
		const screenUpdates = events.filter((e) => {
			return e.type == "screenUpdate" || e.type == "newLines" || e.type == "patch"
		});
		const cursorUpdates = events.filter((e) => {
			return e.type == "cursorMove" || e.type == "screenUpdate"
		});

		console.log(events.map((e) => (`${e.type}, ${e.line}`)));

		if (screenUpdates.length > 0) {
			setScreen((oldScreen) => {
				let newScreen = screenUpdates.reduce((acc, event) => {
					if (event.type == "screenUpdate") {
						// console.log("screenUpdate", event.screen);
						return event.screen!;
					} else if (event.type == "newLines") {
						// console.log("newLines", event.lines);
						return [...acc, ...event.lines!];
					} else if (event.type == "patch") {
						// console.log("patch", event.items);
						while (event.line! >= acc.length) {
							acc.push(Array.from({ length: windowDimensions.cols }, () => defaultLineItem()));
						}
						acc[event.line!] = [...event.items!];
						return acc;
					}
					return acc;
				}, oldScreen);
				if (newScreen.length != oldScreen.length) {
					scrollDown();
				}
				return newScreen;
			})
		}

		if (cursorUpdates.length > 0) {
			setCursorPosition((oldPosition) => {
				return cursorUpdates.reduce((acc, event) => {
					if (event.type == "screenUpdate") {
						acc = { line: event.cursor_line!, col: event.cursor_col! };
					} else if (event.type == "cursorMove") {
						acc = { line: event.line!, col: event.col! }
					}
					return acc;
				}, oldPosition);
			})
		}
	}, []);

	const handleTerminalDisconnect = useCallback(() => {
		console.log(`Terminal disconnected for element ${elementId}`);
		TerminalConnectionManager.removeConnection(elementId);
		setIsConnected(false);
		setTerminalId(null);
	}, [elementId]);

	// Send raw input directly
	const sendRawInput = useCallback(
		async (input: string) => {
			if (!terminalId || !isConnected) return;

			try {
				console.log("Sending raw input:", JSON.stringify(input));
				await customTerminalAPI.sendRawInput(terminalId, input);
			} catch (err) {
				console.error("Error sending input:", err);
			}
		},
		[terminalId, isConnected],
	);

	// Handle keyboard input - send each character immediately
	const handleKeyDown = useCallback(
		async (event: React.KeyboardEvent) => {
			if (!terminalId || !isConnected) return;

			try {
				if (event.ctrlKey) {
					if (event.key === "c") {
						await customTerminalAPI.sendCtrlC(terminalId);
						event.preventDefault();
						return;
					}
					if (event.key === "d") {
						await customTerminalAPI.sendCtrlD(terminalId);
						event.preventDefault();
						return;
					}
				}

				if (event.key === "Enter") {
					await sendRawInput("\r");
					event.preventDefault();
					return;
				} else if (event.key === "Backspace") {
					await sendRawInput("\b");
					event.preventDefault();
					return;
				} else if (event.key === "Tab") {
					await sendRawInput("\t");
					event.preventDefault();
					return;
				} else if (event.key === "Escape") {
					await sendRawInput("\x1b");
					event.preventDefault();
					return;
				} else if (event.key === "ArrowUp") {
					await sendRawInput("\x1b[A");
					event.preventDefault();
					return;
				} else if (event.key === "ArrowDown") {
					await sendRawInput("\x1b[B");
					event.preventDefault();
					return;
				} else if (event.key === "ArrowLeft") {
					await sendRawInput("\x1b[D");
					event.preventDefault();
					return;
				} else if (event.key === "ArrowRight") {
					await sendRawInput("\x1b[C");
					event.preventDefault();
					return;
				} else if (event.key === "PageUp") {
					await sendRawInput("\x1b[5~");
					event.preventDefault();
					return;
				} else if (event.key === "PageDown") {
					await sendRawInput("\x1b[6~");
					event.preventDefault();
					return;
				} else if (event.key === "Home") {
					await sendRawInput("\x1b[H");
					event.preventDefault();
					return;
				} else if (event.key === "End") {
					await sendRawInput("\x1b[F");
					event.preventDefault();
					return;
				} else if (event.key === "Insert") {
					await sendRawInput("\x1b[2~");
					event.preventDefault();
					return;
				} else if (event.key === "Delete") {
					await sendRawInput("\x1b[3~");
					event.preventDefault();
					return;
				} else if (
					event.key.length === 1 &&
					!event.ctrlKey &&
					!event.altKey &&
					!event.metaKey
				) {
					// Send regular characters immediately
					await sendRawInput(event.key);
					event.preventDefault();
					return;
				}
			} catch (err) {
				console.error("Error handling key event:", err);
			}
		},
		[terminalId, isConnected, sendRawInput],
	);

	const debouncedResize = useCallback(() => {
		if (resizeTimeoutRef.current) {
			clearTimeout(resizeTimeoutRef.current);
		}

		resizeTimeoutRef.current = setTimeout(async () => {
			if (!terminalId || !terminalInnerRef.current || !isConnected) return;

			// Prevent concurrent resizes
			if (isResizingRef.current) {
				console.log("Resize skipped: already resizing");
				return;
			}

			const containerRect = terminalInnerRef.current.getBoundingClientRect();

			// Don't resize if container doesn't have proper dimensions yet
			if (containerRect.width < 100 || containerRect.height < 80) {
				console.log(
					"Terminal resize skipped: container too small",
					containerRect,
				);
				return;
			}

			const { width: charWidth, height: charHeight } = charDimensions;

			const cols = Math.max(20, Math.floor(containerRect.width / (charWidth * 1.07)));
			const lines = Math.max(5, Math.floor(containerRect.height / (charHeight * 1.07)));
			// const lines = 100;

			// Only resize if dimensions actually changed
			if (
				windowDimensions.cols === cols &&
				windowDimensions.rows === lines
			) {
				return;
			}

			console.log(
				`Terminal resize: ${cols}x${lines} (container: ${containerRect.width}x${containerRect.height})`,
			);

			isResizingRef.current = true;
			scrollDown();

			try {
				await customTerminalAPI.resizeTerminal(terminalId, lines, cols);
				// Update our tracked dimensions only after successful resize
				setWindowDimensions({ rows: lines, cols });
				console.log(`Terminal resize successful: ${cols}x${lines}`);
			} catch (err) {
				console.error("Error resizing terminal:", err);
				// Don't update dimensions on error
			} finally {
				isResizingRef.current = false;
			}
		}, 150); // 150ms debounce
	}, [
		terminalId,
		windowDimensions.cols,
		windowDimensions.rows,
		isConnected,
		charDimensions,
	]);

	const handleResize = debouncedResize;

	// Handle container and window resize
	useEffect(() => {
		let resizeObserver: ResizeObserver | null = null;

		// Watch for container size changes
		if (terminalInnerRef.current) {
			resizeObserver = new ResizeObserver(handleResize);
			resizeObserver.observe(terminalInnerRef.current);
		}

		// Also listen for window resize
		window.addEventListener("resize", handleResize);

		return () => {
			if (resizeObserver) {
				resizeObserver.disconnect();
			}
			if (resizeTimeoutRef.current) {
				clearTimeout(resizeTimeoutRef.current);
			}
			window.removeEventListener("resize", handleResize);
		};
	}, [handleResize, isConnected]);

	// Track scroll events to detect user interaction
	useEffect(() => {
		const scrollableDiv = scrollableRef.current;
		if (!scrollableDiv) return;

		const handleScroll = () => {
			hasScrolledRef.current = true; // Mark that the user has scrolled
		};

		scrollableDiv.addEventListener("scroll", handleScroll);
		return () => {
			scrollableDiv.removeEventListener("scroll", handleScroll);
		};
	}, [isConnected]);

	// Auto-focus the terminal and set initial size
	useEffect(() => {
		if (terminalRef.current && isConnected) {
			terminalRef.current.focus();
			// Set initial terminal size with multiple attempts
			const scheduleResize = () => {
				handleResize();
				// Additional resize after a bit more time in case layout is still settling
				setTimeout(handleResize, 200);
			};

			// Immediate resize attempt
			scheduleResize();
			// Fallback resize after layout should be settled
			setTimeout(scheduleResize, 500);
		}
	}, [isConnected, handleResize]);

	return (
		<div
			ref={terminalRef}
			className={cn(
				"rounded-md text-sm backdrop-blur-md bg-[var(--bg-200)]/10 text-[var(--blackest)] font-mono p-4 focus:outline-none relative overflow-hidden h-full max-h-full flex flex-col",
			)}
			tabIndex={0}
			onKeyDown={handleKeyDown}
			onClick={() => terminalRef.current?.focus()}
		>
			<div
				ref={terminalInnerRef}
				className={cn(
					"terminal-screen relative rounded overflow-hidden max-h-full h-full font-mono cursor-text select-text",
				)}
			>
				<div ref={scrollableRef} className={cn("absolute top-0 left-0 w-full h-full overflow-y-auto")}>
					{
						screen.map((line, index) => (
							<Row
								key={`row-${index}`}
								row={index}
								line={line}
								isLightTheme={isLightTheme}
								charDimensions={charDimensions}
							/>
						))
					}
					<motion.div
						className={cn("absolute whitespace-pre-wrap animate-pulse")}
						style={{
							left: `${cursorPosition.col * charDimensions.width}px`,
							top: `${cursorPosition.line * charDimensions.height}px`,
							width: `${charDimensions.width}px`,
							height: `${charDimensions.height}px`,
							filter: "contrast(2)"
						}}
						// transition={{
						// 	ease: "linear",
						// 	duration: 0.05,
						// }}
					>
						<div 
						    className="h-[90%] w-full bg-[var(--blackest-70)] rounded-xs"
						>
							{' '}
						</div>
						{/* <div className="absolute flex items-center justify-center top-0 left-0 h-full w-[200%] opacity-80">
						<div>{'🚀'}</div> */}
						{/* </div> */}
					</motion.div>
					<span ref={phantomCharRef} className="absolute -left-full -top-full">A</span>
				</div>
			</div>
		</div>
	);
};

export default CustomTerminalRenderer;

const Row = React.memo(({ line, row, isLightTheme, charDimensions }: {
	line: LineItem[],
	row: number,
	isLightTheme: boolean,
	charDimensions: {
		width: number,
		height: number,
	}
}) => {
	const lexemeMap: Record<string, string> = {
		'': ' ',
	}

	console.log(row, " rerendered");

	return (
		<div className={cn("relative flex font-mono")}>
			{/* <span className={cn("w-10 opacity-50")}>{row} </span> */}
			{line.map((item, index) => (
				<span
					key={index}
					className={cn("")}
					style={{
						backgroundColor: colorToCSS(item.background_color, isLightTheme),
						color: colorToCSS(item.foreground_color, isLightTheme),
						fontWeight: item.is_bold ? "bold" : "normal",
						textDecoration: item.is_underline ? "underline" : "none",
						fontStyle: item.is_italic ? "italic" : "normal",
						whiteSpace: "pre-wrap",
						width: "",
					}}
				>
					{lexemeMap[item.lexeme] ? lexemeMap[item.lexeme] : item.lexeme}
				</span>
			))}
		</div>
	);
}, (prevProps, nextProps) => {
	// deep compare
	if (prevProps.row !== nextProps.row) return false;
	if (prevProps.isLightTheme !== nextProps.isLightTheme) return false;
	if (prevProps.charDimensions !== nextProps.charDimensions) return false;

	for (let i = 0; i < prevProps.line.length; i++) {
		if (prevProps.line[i].lexeme !== nextProps.line[i].lexeme 
			|| prevProps.line[i].width !== nextProps.line[i].width 
			|| prevProps.line[i].is_bold !== nextProps.line[i].is_bold 
			|| prevProps.line[i].is_italic !== nextProps.line[i].is_italic 
			|| prevProps.line[i].is_underline !== nextProps.line[i].is_underline 
			|| prevProps.line[i].foreground_color !== nextProps.line[i].foreground_color 
			|| prevProps.line[i].background_color !== nextProps.line[i].background_color) {
			return false;
		}
	}
	return true;
});

const colorMap = (color: string, isLightTheme: boolean) => {
	const colors: Record<string, string> = {
		"Black": isLightTheme ? "#2e222f" : "#2e222f",
		"Red": isLightTheme ? "#ae2334" : "#e83b3b",
		"Green": isLightTheme ? "#239063" : "#1ebc73",
		"Yellow": isLightTheme ? "#f79617" : "#f9c22b",
		"Blue": isLightTheme ? "#4d65b4" : "#4d9be6",
		"Magenta": isLightTheme ? "#6b3e75" : "#905ea9",
		"Cyan": isLightTheme ? "#0b8a8f" : "#0eaf9b",
		"White": isLightTheme ? "#c7dcd0" : "#ffffff",
		"BrightBlack": isLightTheme ? "mix(#2e222f, #c7dcd0, 0.2)" : "mix(#2e222f, #c7dcd0, 0.2)",
		"BrightRed": isLightTheme ? "mix(#ae2334, #c7dcd0, 0.2)" : "mix(#e83b3b, #c7dcd0, 0.2)",
		"BrightGreen": isLightTheme ? "mix(#239063, #c7dcd0, 0.2)" : "mix(#1ebc73, #c7dcd0, 0.2)",
		"BrightYellow": isLightTheme ? "mix(#f79617, #c7dcd0, 0.2)" : "mix(#f9c22b, #c7dcd0, 0.2)",
		"BrightBlue": isLightTheme ? "mix(#4d65b4, #c7dcd0, 0.2)" : "mix(#4d9be6, #c7dcd0, 0.2)",
		"BrightMagenta": isLightTheme ? "mix(#6b3e75, #c7dcd0, 0.2)" : "mix(#905ea9, #c7dcd0, 0.2)",
		"BrightCyan": isLightTheme ? "mix(#0b8a8f, #c7dcd0, 0.2)" : "mix(#0eaf9b, #c7dcd0, 0.2)",
		"BrightWhite": isLightTheme ? "mix(#c7dcd0, #c7dcd0, 0.2)" : "#ffffff",
	};

	return colors[color];
}

const getAnsiHex = (ansiName: string, isLightTheme: boolean): string => {
	if (ansiName === "Default") {
		return isLightTheme ? colorMap("Black", isLightTheme) : colorMap("White", isLightTheme);
	}
	return colorMap(ansiName, isLightTheme);
};

const colorToCSS = (color: any, isLightTheme: boolean): string => {
	if (!color) return "";

	if (typeof color === "string") {
		return getAnsiHex(color, isLightTheme);
	}

	if (color.Extended !== undefined) {
		return ansi256ToHex(color.Extended, isLightTheme);
	}

	if (color.Rgb !== undefined) {
		const [r, g, b] = color.Rgb;
		return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
	}

	return isLightTheme ? "#334155" : "#d4d4d4";
};

// Convert ANSI 256-color codes to hex using the same helper for the first 16 colors
const ansi256ToHex = (code: number, isLightTheme: boolean): string => {
	if (code < 16) {
		return "#ffffff";
	}
	if (code < 232) {
		const n = code - 16;
		const r = Math.floor(n / 36);
		const g = Math.floor((n % 36) / 6);
		const b = n % 6;

		const vals = [0, 95, 135, 175, 215, 255];
		const red = vals[r];
		const green = vals[g];
		const blue = vals[b];
		return `#${red.toString(16).padStart(2, "0")}${green.toString(16).padStart(2, "0")}${blue.toString(16).padStart(2, "0")}`;
	}

	const level = code - 232;
	const gray = 8 + level * 10;
	const gHex = Math.min(238, gray).toString(16).padStart(2, "0");
	return `#${gHex}${gHex}${gHex}`;
};
