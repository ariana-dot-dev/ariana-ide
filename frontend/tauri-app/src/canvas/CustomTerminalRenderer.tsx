import React, {
	useState,
	useEffect,
	useRef,
	useCallback,
	useContext,
	useMemo,
} from "react";
import { useStore } from "../state";
import {
	customTerminalAPI,
	TerminalEvent,
	TerminalSpec,
	LineItem,
	Colors,
} from "../services/CustomTerminalAPI";
import { cn } from "../utils";

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
	const screenDataRef = useRef<LineItem[][]>([]);
	const [screenLength, setScreenLength] = useState(6);
	const [cursorPosition, setCursorPosition] = useState({ line: 0, col: 0 });
	const [isConnected, setIsConnected] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [windowDimensions, setWindowDimensions] = useState({
		rows: 24,
		cols: 80,
	});
	const listenersRef = useRef<Map<number, (items: LineItem[]) => void>>(new Map());

	const terminalRef = useRef<HTMLDivElement>(null);
	const terminalInnerRef = useRef<HTMLDivElement>(null);
	const scrollableRef = useRef<HTMLDivElement>(null);
	const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const isResizingRef = useRef<boolean>(false);
	const hasScrolledRef = useRef<boolean>(false);

	const getCurrentLineData = useCallback((rowIndex: number): LineItem[] => {
		return screenDataRef.current[rowIndex] || [];
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
				setError(null);

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
				setError(null);

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
				setError(errorMessage);
				onTerminalError?.(errorMessage);
			}
		};

		connectTerminal();

		return () => {
			mounted = false;
			// Don't kill terminals on unmount - keep connections alive for reuse
		};
	}, [elementId]);

	// Cleanup on unmount (when component is actually destroyed)
	useEffect(() => {
		return () => {
			// This runs when the component is actually unmounted
			// We keep the terminal connection alive for potential reuse
			console.log(`CustomTerminalRenderer unmounting for element ${elementId}`);
		};
	}, []);

	const handleTerminalEvent = useCallback((events: TerminalEvent[]) => {
		for (const event of events) {
			switch (event.type) {
				case "screenUpdate":
					if (
						event.screen &&
						event.cursor_line !== undefined &&
						event.cursor_col !== undefined
					) {
						screenDataRef.current = event.screen;
						setScreenLength(event.screen.length);
						setCursorPosition({ line: event.cursor_line, col: event.cursor_col });
					}
					break;
				case "cursorMove":
					if (event.cursor_line !== undefined && event.cursor_col !== undefined) {
						setCursorPosition({ line: event.cursor_line, col: event.cursor_col });
					}
					break;
				case "patch":
					if (event.items !== undefined && event.line !== undefined) {
						// Update the ref data (no re-render)
						screenDataRef.current[event.line!] = event.items!;
						// Notify only the specific row
						listenersRef.current.get(event.line!)?.(event.items!);
					}
					break;
				case "newLines":
					if (event.lines !== undefined) {
						// Update ref data
						screenDataRef.current.push(...event.lines!);
					
						// Update screenLength (this will trigger re-render for new rows)
						setScreenLength((prevLength) => prevLength + event.lines!.length);
					}
					break;
			}
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

			// Use more precise character measurements for monospace fonts
			const charWidth = 8.5; // Slightly wider for better accuracy
			const charHeight = 18; // Better line height

			const cols = Math.max(20, Math.floor(containerRect.width / charWidth));
			const lines = Math.max(5, Math.floor(containerRect.height / charHeight));
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

	// Auto-scroll to bottom when screenLength increases
	useEffect(() => {
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
			if (true) {//(!hasScrolledRef.current || isNearBottom()) {
				scrollableDiv.scrollTop = scrollableDiv.scrollHeight;
			}
		}, 150);
	}, [screenLength]);

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

	const baseShade = isLightTheme ? 800 : 300;
	const brightShade = isLightTheme ? 700 : 400;

	// Hex values for the Tailwind shades we need
	const TW: Record<string, Record<number, string>> = {
		slate: {
			300: "#CBD5E1",
			400: "#94A3B8",
			700: "#334155",
			800: "#1E293B",
			900: "#0F172A",
		},
		red: { 300: "#FCA5A5", 400: "#F87171", 700: "#B91C1C", 800: "#991B1B" },
		green: { 300: "#86EFAC", 400: "#4ADE80", 700: "#15803D", 800: "#166534" },
		yellow: { 300: "#FDE047", 400: "#FACC15", 700: "#A16207", 800: "#854D0E" },
		blue: { 300: "#93C5FD", 400: "#60A5FA", 700: "#1D4ED8", 800: "#1E40AF" },
		fuchsia: { 300: "#F0ABFC", 400: "#E879F9", 700: "#A21CAF", 800: "#86198F" },
		cyan: { 300: "#67E8F9", 400: "#22D3EE", 700: "#0E7490", 800: "#155E75" },
	};

	const BASE_TO_TW: Record<string, string> = {
		Black: "slate",
		Red: "red",
		Green: "green",
		Yellow: "yellow",
		Blue: "blue",
		Magenta: "fuchsia",
		Cyan: "cyan",
		White: "slate",
	};

	const STANDARD_COLOR_NAMES = [
		"Black",
		"Red",
		"Green",
		"Yellow",
		"Blue",
		"Magenta",
		"Cyan",
		"White",
		"BrightBlack",
		"BrightRed",
		"BrightGreen",
		"BrightYellow",
		"BrightBlue",
		"BrightMagenta",
		"BrightCyan",
		"BrightWhite",
	];

	const getAnsiHex = (ansiName: string): string => {
		if (ansiName === "Default") {
			return isLightTheme ? TW.slate[700] : TW.slate[300];
		}
		if (ansiName === "BrightWhite") return "#ffffff";
		if (ansiName === "White") return isLightTheme ? "#e5e5e5" : "#f8f8f8";

		const isBright = ansiName.startsWith("Bright");
		const baseName = isBright ? ansiName.substring(6) : ansiName; // remove "Bright"
		const twBase = BASE_TO_TW[baseName as keyof typeof BASE_TO_TW];
		if (!twBase || !TW[twBase]) return "#ff00ff";

		const shade = isBright ? brightShade : baseShade;
		const hex = TW[twBase][shade as keyof (typeof TW)[typeof twBase]];
		return hex ?? "#ff00ff";
	};

	const colorToCSS = (color?: any): string => {
		if (!color) return "";

		if (typeof color === "string") {
			return getAnsiHex(color);
		}

		if (color.Extended !== undefined) {
			return ansi256ToHex(color.Extended);
		}

		if (color.Rgb !== undefined) {
			const [r, g, b] = color.Rgb;
			return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
		}

		return isLightTheme ? "#334155" : "#d4d4d4";
	};

	// Convert ANSI 256-color codes to hex using the same helper for the first 16 colors
	const ansi256ToHex = (code: number): string => {
		if (code < 16) {
			return getAnsiHex(STANDARD_COLOR_NAMES[code]);
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

	if (error) {
		return (
			<div
				className={cn(
					"p-4 bg-[var(--bg-900)]/20 border border-[var(--bg-500)] rounded-md",
				)}
			>
				<div className={cn("text-[var(--bg-400)] font-mono text-sm")}>
					Terminal Error: {error}
				</div>
			</div>
		);
	}

	const Row = React.memo(({ row, terminalId, getCurrentLineData }: { 
		row: number, 
		terminalId: string,
		getCurrentLineData: (rowIndex: number) => LineItem[]
	}) => {
		// Initialize state directly from the ref to prevent flickering.
		// This lazy initializer runs only on the first render.
		const [items, setItems] = useState<LineItem[]>(() => getCurrentLineData(row));
	
		useEffect(() => {
			// This listener handles live 'patch' updates to the row after it has mounted.
			listenersRef.current.set(row, (newItems: LineItem[]) => {
				setItems(newItems);
			});
			
			return () => {
				listenersRef.current.delete(row);
			}
		}, [row, terminalId]); // getCurrentLineData is stable and doesn't need to be a dependency
	
		return (
			<div className={cn("flex font-mono")}>
				<span className={cn("w-10")}>{row} </span>
				{items.map((item, index) => (
					<span 
						key={index} 
						className={cn("")} 
						style={{ 
							backgroundColor: colorToCSS(item.background_color),
							color: colorToCSS(item.foreground_color),
							fontWeight: item.is_bold ? "bold" : "normal",
							textDecoration: item.is_underline ? "underline" : "none",
							fontStyle: item.is_italic ? "italic" : "normal",
							whiteSpace: "pre-wrap",
						}}
					>
						{item.lexeme}
					</span>
				))}
			</div>
		);
	});

	const AllRows = useMemo(() => 
		Array.from({ length: screenLength }, (_, rowIndex) => (
			<Row 
				key={`row-${rowIndex}`} 
				row={rowIndex} 
				terminalId={terminalId || "unknown"}
				getCurrentLineData={getCurrentLineData}
			/>
		)), 
		[screenLength, terminalId, getCurrentLineData]
	);

	return (
		<div
			ref={terminalRef}
			className={cn(
				"rounded-md backdrop-blur-md bg-[var(--bg-200)]/10 text-[var(--blackest)] font-mono text-xs p-4 focus:outline-none relative overflow-hidden h-full max-h-full flex flex-col",
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
				<div ref={scrollableRef} className={cn("absolute top-0 left-0 w-full h-full overflow-y-auto scrollbar-thin")}>
					{/* {Array.from({ length: windowDimensions.rows }, (_, rowIndex) => {
						const line = screen[rowIndex] || [];
						return renderScreenLine(line, rowIndex, windowDimensions.cols);
					})} */}
					
					{AllRows}
				</div>
			</div>
		</div>
	);
};

export default CustomTerminalRenderer;
