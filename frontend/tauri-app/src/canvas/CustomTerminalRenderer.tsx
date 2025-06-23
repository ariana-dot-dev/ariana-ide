import React, {
	useState,
	useEffect,
	useRef,
	useCallback,
	useContext,
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
	const { theme, isLightTheme } = useStore();

	const [terminalId, setTerminalId] = useState<string | null>(null);
	const [screen, setScreen] = useState<LineItem[][]>([]);
	const [cursorPosition, setCursorPosition] = useState({ line: 0, col: 0 });
	const [isConnected, setIsConnected] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [terminalDimensions, setTerminalDimensions] = useState({
		rows: 24,
		cols: 80,
	});
	const terminalRef = useRef<HTMLDivElement>(null);
	const terminalInnerRef = useRef<HTMLDivElement>(null);
	const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const isResizingRef = useRef<boolean>(false);

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

	const handleTerminalEvent = useCallback((event: TerminalEvent) => {
		switch (event.type) {
			case "screenUpdate":
				if (
					event.screen &&
					event.cursor_line !== undefined &&
					event.cursor_col !== undefined
				) {
					setScreen(event.screen);
					setCursorPosition({ line: event.cursor_line, col: event.cursor_col });
				}
				break;
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

	// Scroll acceleration/deceleration state
	const scrollSpeedRef = useRef<number>(1); // current speed (1-10)
	const scrollDirectionRef = useRef<1 | -1>(1); // 1 = down, -1 = up
	const accelStartRef = useRef<number>(Date.now());
	const lastWheelTimeRef = useRef<number>(0);

	// Handle wheel events for scrolling
	const handleWheel = useCallback(
		async (event: React.WheelEvent) => {
			if (!terminalId || !isConnected) return;

			const now = Date.now();
			const direction: 1 | -1 = event.deltaY > 0 ? 1 : -1; // deltaY > 0 means wheel scrolled down

			// Reset acceleration if direction changed
			if (scrollDirectionRef.current !== direction) {
				scrollDirectionRef.current = direction;
				scrollSpeedRef.current = 1;
				accelStartRef.current = now;
			}

			// Linear acceleration 1 -> 10 over ACCEL_DURATION (2000ms)
			const ACCEL_DURATION = 2000;
			const accelProgress = Math.min(
				1,
				(now - accelStartRef.current) / ACCEL_DURATION,
			);
			scrollSpeedRef.current = 1 + (10 - 1) * accelProgress;

			// Deceleration when there is a pause between wheel events
			const timeSinceLast = now - lastWheelTimeRef.current;
			if (lastWheelTimeRef.current !== 0 && timeSinceLast > 250) {
				const decayProgress = Math.min(1, timeSinceLast / ACCEL_DURATION);
				scrollSpeedRef.current = Math.max(
					1,
					scrollSpeedRef.current - (10 - 1) * decayProgress,
				);
				// Adjust accelStart so next acceleration continues smoothly from the current speed
				accelStartRef.current =
					now - ((scrollSpeedRef.current - 1) / (10 - 1)) * ACCEL_DURATION;
			}

			lastWheelTimeRef.current = now;

			const amount = Math.ceil(scrollSpeedRef.current);

			try {
				if (direction === 1) {
					await customTerminalAPI.sendScrollUp(terminalId, amount);
				} else {
					await customTerminalAPI.sendScrollDown(terminalId, amount);
				}
			} catch (err) {
				console.error("Error handling scroll:", err);
			}

			event.preventDefault();
		},
		[terminalId, isConnected],
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
			const charHeight = 17; // Better line height

			const cols = Math.max(20, Math.floor(containerRect.width / charWidth));
			const lines = Math.max(5, Math.floor(containerRect.height / charHeight));
			// const lines = 100;

			// Only resize if dimensions actually changed
			if (
				terminalDimensions.cols === cols &&
				terminalDimensions.rows === lines
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
				setTerminalDimensions({ rows: lines, cols });
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
		terminalDimensions.cols,
		terminalDimensions.rows,
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

	const renderScreenLine = (
		line: LineItem[],
		lineIndex: number,
		totalCols: number,
	) => {
		const lineBeforeCursor: React.ReactNode[] = [];
		const lineAfterCursor: React.ReactNode[] = [];

		// Helper function to check if two items have the same styling
		const haveSameStyle = (item1: LineItem, item2: LineItem) => {
			return (
				colorToCSS(item1.foreground_color) ===
					colorToCSS(item2.foreground_color) &&
				colorToCSS(item1.background_color) ===
					colorToCSS(item2.background_color) &&
				item1.is_bold === item2.is_bold &&
				item1.is_italic === item2.is_italic &&
				item1.is_underline === item2.is_underline
			);
		};

		// Helper function to create optimized spans for a section
		const createOptimizedSpans = (
			items: LineItem[],
			startCol: number,
			targetArray: React.ReactNode[],
			isCursorSection: boolean,
		) => {
			let i = 0;
			let colOffset = startCol;

			while (i < items.length) {
				const currentItem = items[i];
				let combinedText = currentItem.lexeme === "" ? " " : currentItem.lexeme;
				let combinedWidth = currentItem.width || 1;
				let spanStartCol = colOffset;

				// Look ahead to combine consecutive items with same styling
				let j = i + 1;
				while (j < items.length && haveSameStyle(currentItem, items[j])) {
					combinedText += items[j].lexeme;
					combinedWidth += items[j].width || 1;
					j++;
				}

				const spanEndCol = spanStartCol + combinedWidth;

				const hasCursor =
					isCursorSection &&
					lineIndex === cursorPosition.line &&
					spanStartCol <= cursorPosition.col &&
					cursorPosition.col < spanEndCol;

				if (hasCursor && combinedWidth > 1) {
					console.log(`Has cursor in span ${spanStartCol}-${spanEndCol}`);
					// Split the span at cursor position
					const cursorRelativePos = cursorPosition.col - spanStartCol;
					const textBeforeCursor = combinedText.slice(0, cursorRelativePos);
					let textAtCursor = combinedText.slice(
						cursorRelativePos,
						cursorRelativePos + 1,
					);
					if (textAtCursor === "") {
						textAtCursor = " ";
					}
					const textAfterCursor = combinedText.slice(cursorRelativePos + 1);

					// Span before cursor (if any)
					if (textBeforeCursor.length > 0) {
						targetArray.push(
							<div
								key={`${spanStartCol}-before`}
								className="flex border-b-4"
								style={{
									color: colorToCSS(currentItem.foreground_color),
									// backgroundColor: colorToCSS(currentItem.background_color),
									fontWeight: currentItem.is_bold ? "bold" : "normal",
									fontStyle: currentItem.is_italic ? "italic" : "normal",
									textDecoration: currentItem.is_underline
										? "underline"
										: "none",
									whiteSpace: "pre",
									// width: `${textBeforeCursor.length * 7.45}px`,
									overflow: "hidden",
									boxShadow: `inset -1px 0 0 var(--fg-800-30)`,
								}}
							>
								{textBeforeCursor.split("").map((char, index) => (
									<div key={index} style={{ width: "7.45px" }}>
										{char}
									</div>
								))}
							</div>,
						);
					}

					// Span at cursor position
					targetArray.push(
						<div
							key={`${spanStartCol}-cursor`}
							className="flex animate-pulse"
							style={{
								color: colorToCSS(currentItem.foreground_color),
								backgroundColor: "var(--blackest)",
								fontWeight: currentItem.is_bold ? "bold" : "normal",
								fontStyle: currentItem.is_italic ? "italic" : "normal",
								textDecoration: currentItem.is_underline ? "underline" : "none",
								whiteSpace: "pre",
								overflow: "hidden",
								boxShadow: "inset -1px 0 0 var(--fg-800-30)",
							}}
						>
							{textAtCursor.split("").map((char, index) => (
								<div key={index} style={{ width: "7.45px" }}>
									{char}
								</div>
							))}
						</div>,
					);

					// Span after cursor (if any)
					if (textAfterCursor.length > 0) {
						targetArray.push(
							<div
								key={`${spanStartCol}-after`}
								className="flex"
								style={{
									color: colorToCSS(currentItem.foreground_color),
									// backgroundColor: colorToCSS(currentItem.background_color),
									fontWeight: currentItem.is_bold ? "bold" : "normal",
									fontStyle: currentItem.is_italic ? "italic" : "normal",
									textDecoration: currentItem.is_underline
										? "underline"
										: "none",
									whiteSpace: "pre",
									overflow: "hidden",
									boxShadow: `inset -1px 0 0 var(--fg-800-30)`,
								}}
							>
								{textAfterCursor.split("").map((char, index) => (
									<div key={index} style={{ width: "7.45px" }}>
										{char}
									</div>
								))}
							</div>,
						);
					}
				} else {
					targetArray.push(
						<div
							key={spanStartCol}
							className="flex min-w-1"
							style={{
								color: colorToCSS(currentItem.foreground_color),
								// backgroundColor: hasCursor ? 'var(--blackest)' : colorToCSS(currentItem.background_color),
								fontWeight: currentItem.is_bold ? "bold" : "normal",
								fontStyle: currentItem.is_italic ? "italic" : "normal",
								textDecoration: currentItem.is_underline ? "underline" : "none",
								whiteSpace: "pre",
								overflow: "hidden",
								boxShadow: `inset -1px 0 0 var(--fg-800-30)`,
							}}
						>
							{combinedText.split("").map((char, index) => (
								<div key={index} style={{ width: "7.45px" }}>
									{char}
								</div>
							))}
						</div>,
					);
				}

				i = j;
				colOffset += combinedWidth;
			}
		};

		// Split line items before and after cursor
		let currentCol = 0;
		const itemsBeforeCursor: LineItem[] = [];
		const itemsAfterCursor: LineItem[] = [];

		for (const item of line) {
			if (currentCol < cursorPosition.col) {
				itemsBeforeCursor.push(item);
			} else {
				itemsAfterCursor.push(item);
			}
			currentCol += item.width || 1;
		}

		// Create optimized spans for each section
		createOptimizedSpans(itemsBeforeCursor, 0, lineBeforeCursor, false);
		createOptimizedSpans(
			itemsAfterCursor,
			itemsBeforeCursor.reduce((acc, item) => acc + (item.width || 1), 0),
			lineAfterCursor,
			true,
		);

		// Add cursor at end of line if needed
		if (lineIndex === cursorPosition.line && currentCol <= cursorPosition.col) {
			const styleSource =
				line.length > 0
					? line[line.length - 1]
					: {
							foreground_color: null,
							is_bold: false,
							is_italic: false,
							is_underline: false,
						};
			lineAfterCursor.push(
				<div
					key={currentCol}
					style={{
						color: colorToCSS(styleSource.foreground_color),
						backgroundColor: "var(--blackest)",
						fontWeight: styleSource.is_bold ? "bold" : "normal",
						fontStyle: styleSource.is_italic ? "italic" : "normal",
						textDecoration: styleSource.is_underline ? "underline" : "none",
						whiteSpace: "pre",
						width: "7.45px",
						boxShadow: "inset -1px 0 0 var(--fg-800-30)",
					}}
				>
					{" "}
				</div>,
			);
		}

		const isAtCursorLine = lineIndex === cursorPosition.line;

		// Handle empty lines or lines with no content
		if (lineBeforeCursor.length === 0 && lineAfterCursor.length === 0) {
			return (
				<div
					key={lineIndex}
					className={cn(
						"font-mono text-xs leading-4 whitespace-nowrap min-h-4 flex",
					)}
					style={{
						width: `fit`,
						height: "16px",
						boxShadow: `inset 0 -0.5px 0 var(--fg-800-30)`,
					}}
				>
					{isAtCursorLine && (
						<div
							style={{
								backgroundColor: "var(--blackest)",
								width: "7.45px",
								height: "16px",
								boxShadow: "inset -1px 0 0 var(--fg-800-30)",
							}}
						>
							{" "}
						</div>
					)}
				</div>
			);
		}

		return (
			<div
				key={lineIndex}
				className={cn(
					"font-mono text-xs leading-4 whitespace-nowrap min-h-4 flex",
				)}
				style={{
					width: `fit`,
					height: "16px",
					boxShadow: `inset 0 -0.5px 0 var(--fg-800-30)`,
				}}
			>
				{lineBeforeCursor}
				{lineAfterCursor}
			</div>
		);
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

	return (
		<div
			ref={terminalRef}
			className={cn(
				"rounded-md backdrop-blur-md bg-[var(--bg-200)]/10 text-[var(--blackest)] font-mono text-xs p-4 focus:outline-none relative overflow-hidden h-full max-h-full flex flex-col",
			)}
			tabIndex={0}
			onKeyDown={handleKeyDown}
			onWheel={handleWheel}
			onClick={() => terminalRef.current?.focus()}
		>
			<div
				ref={terminalInnerRef}
				className={cn(
					"terminal-screen relative rounded overflow-hidden max-h-full h-full font-mono cursor-text select-text",
				)}
			>
				<div className={cn("absolute top-0 left-0 w-full h-fit")}>
					{Array.from({ length: terminalDimensions.rows }, (_, rowIndex) => {
						const line = screen[rowIndex] || [];
						return renderScreenLine(line, rowIndex, terminalDimensions.cols);
					})}
				</div>
			</div>
		</div>
	);
};

export default CustomTerminalRenderer;
