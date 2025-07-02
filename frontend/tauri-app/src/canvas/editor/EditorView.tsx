import type React from "react";
import { useCallback, useEffect, useRef } from "react";
import { cn } from "../../utils";
import { Cursor } from "./Cursor";
import { useEditorStore } from "./EditorStore";
import { HighlightedLine } from "./HighlightedLine";
import { InputHandler } from "./InputHandler";
import {
	columnToX,
	getCharWidth,
	getLineHeight,
	lineToY,
	xToColumn,
	yToLine,
} from "./utils/measurements";

interface EditorViewProps {
	className?: string;
	showLineNumbers?: boolean;
}

export const EditorView: React.FC<EditorViewProps> = ({
	className,
	showLineNumbers = true,
}) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);

	const activeFileId = useEditorStore((state) => state.activeFileId);
	const files = useEditorStore((state) => state.files);
	const activeFile = activeFileId ? files[activeFileId] : undefined;
	const document = activeFile?.document || null;
	const cursor = activeFile?.cursor || { line: 0, column: 0 };
	const highlightedLines = activeFile?.highlightedLines;
	const moveCursor = useEditorStore((state) => state.moveCursor);
	const setupFileWatching = useEditorStore((state) => state.setupFileWatching);
	const cleanupFileWatching = useEditorStore(
		(state) => state.cleanupFileWatching,
	);
	const initializeSyntaxHighlighting = useEditorStore(
		(state) => state.initializeSyntaxHighlighting,
	);
	const initializeLspForFile = useEditorStore(
		(state) => state.initializeLspForFile,
	);
	const lspStatuses = useEditorStore((state) => state.lspStatuses);
	const lspDiagnosticsMap = useEditorStore((state) => state.lspDiagnostics);
	console.log(`lspDiagnosticsMap: ${JSON.stringify(lspDiagnosticsMap)}`);
	const lspDiagnostics =
		activeFileId && lspDiagnosticsMap[activeFileId]
			? lspDiagnosticsMap[activeFileId]
			: [];

	// set up file watching and syntax highlighting on mount
	useEffect(() => {
		let mounted = true;

		const initialize = async () => {
			if (!mounted) return;

			console.log("[EditorView] useEffect for file watching triggered");
			try {
				await setupFileWatching();
				await initializeSyntaxHighlighting();
			} catch (error) {
				console.error(
					"[EditorView] Failed to initialize file watching/syntax:",
					error,
				);
			}

			// Initialize LSP for open files
			if (activeFileId) {
				try {
					console.log("[EditorView] Initializing LSP for active file...");
					await initializeLspForFile(activeFileId);
					console.log("[EditorView] LSP initialization complete");
				} catch (error) {
					console.error("[EditorView] Failed to initialize LSP:", error);
					// LSP failure should not break the editor - it's an optional feature
					if (error instanceof Error) {
						console.warn("[EditorView] LSP unavailable:", error.message);
					}
				}
			}
		};

		initialize();

		return () => {
			mounted = false;
			console.log("[EditorView] useEffect cleanup for file watching triggered");
			// Only cleanup if we're still in a valid state
			if (window.__TAURI_EVENT_PLUGIN_INTERNALS__) {
				cleanupFileWatching().catch(console.error);
			}
		};
	}, [activeFileId]); // Re-run when active file changes

	// auto-scroll to keep cursor in view
	useEffect(() => {
		if (!containerRef.current || !cursor || !document) return;

		const container = containerRef.current;
		const lineNumberWidth = showLineNumbers ? 64 : 0;

		// calculate cursor position
		const lineContent = document.getLine(cursor.line) || "";
		const cursorX = columnToX(cursor.column, lineContent) + lineNumberWidth;
		const cursorY = lineToY(cursor.line);
		const lineHeight = getLineHeight();
		const charWidth = getCharWidth();

		// get container scroll position and dimensions
		const scrollTop = container.scrollTop;
		const scrollLeft = container.scrollLeft;
		const containerHeight = container.clientHeight;
		const containerWidth = container.clientWidth;

		// calculate if cursor is out of view and scroll accordingly
		const padding = 20; // padding around cursor

		// vertical scrolling
		if (cursorY < scrollTop + padding) {
			container.scrollTop = Math.max(0, cursorY - padding);
		} else if (cursorY + lineHeight > scrollTop + containerHeight - padding) {
			container.scrollTop = cursorY + lineHeight - containerHeight + padding;
		}

		// horizontal scrolling
		if (cursorX < scrollLeft + padding) {
			container.scrollLeft = Math.max(0, cursorX - padding);
		} else if (cursorX + charWidth > scrollLeft + containerWidth - padding) {
			container.scrollLeft = cursorX + charWidth - containerWidth + padding;
		}
	}, [cursor, showLineNumbers, document]);

	const handleClick = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			if (!contentRef.current || !containerRef.current) return;

			const rect = contentRef.current.getBoundingClientRect();
			const containerRect = containerRef.current.getBoundingClientRect();

			// calculate position relative to the scrolled content
			const x = e.clientX - rect.left;
			const y = e.clientY - containerRect.top + containerRef.current.scrollTop;

			// account for line numbers width if shown
			const lineNumberWidth = showLineNumbers ? 64 : 0; // 3rem = 48px + pr-4 = 16px
			const adjustedX = x - lineNumberWidth;

			const line = yToLine(y);

			if (!document) return;

			// clamp to valid position
			const maxLine = Math.min(line, document.getLineCount() - 1);
			const lineContent = document.getLine(maxLine);
			const column = xToColumn(Math.max(0, adjustedX), lineContent);
			const maxColumn = lineContent ? lineContent.length : 0;

			moveCursor({
				line: maxLine,
				column: Math.min(column, maxColumn),
			});
		},
		[document, moveCursor, showLineNumbers],
	);

	if (!document) {
		return (
			<div className="w-full h-full bg-gray-900 flex items-center justify-center text-gray-500 text-sm">
				Open a file from the file tree to start editing
			</div>
		);
	}

	// calculate total height for scrolling
	const totalHeight = document.getLineCount() * getLineHeight();
	const lineNumberWidth = showLineNumbers ? 64 : 0;

	// calculate max width for horizontal scrolling
	let maxWidth = 0;
	for (let i = 0; i < document.getLineCount(); i++) {
		const line = document.getLine(i);
		if (line) {
			maxWidth = Math.max(maxWidth, line.length * getCharWidth());
		}
	}

	return (
		<div
			ref={containerRef}
			className={cn(
				"relative w-full h-full bg-gray-900 text-gray-100 overflow-auto",
				"font-mono cursor-text select-none",
				className,
			)}
			onClick={handleClick}
		>
			<div
				ref={contentRef}
				className="relative"
				style={{
					minHeight: `${totalHeight}px`,
					minWidth: `${lineNumberWidth + maxWidth + 50}px`, // extra padding
				}}
			>
				{/* lines */}
				{Array.from({ length: document.getLineCount() }, (_, i) => {
					const lineContent = document.getLine(i) || "";
					const lineHighlighting = highlightedLines?.get(i);
					const hasHighlighting =
						lineHighlighting && lineHighlighting.tokens.length > 0;

					// always use HighlightedLine component to avoid double rendering
					return (
						<HighlightedLine
							key={`line-${i}-${hasHighlighting ? "highlighted" : "plain"}`}
							lineNumber={i}
							content={lineContent}
							tokens={hasHighlighting ? lineHighlighting.tokens : []}
							showLineNumbers={showLineNumbers}
							hasError={lspDiagnostics.some((diag) => diag.line === i)}
						/>
					);
				})}

				{/* cursor - positioned relative to content area */}
				<div className="absolute" style={{ left: `${lineNumberWidth}px` }}>
					<Cursor position={cursor} isActive={true} />
				</div>

				{/* input handler */}
				<InputHandler containerRef={containerRef} />
			</div>

			{/* LSP notifications */}
			{(() => {
				if (!activeFile) return null;

				const fileExt = activeFile.name.split(".").pop()?.toLowerCase();
				const lspStatus = fileExt ? lspStatuses[fileExt] : undefined;
				const lspType =
					fileExt === "rs"
						? "Rust"
						: fileExt && ["ts", "tsx", "js", "jsx"].includes(fileExt)
							? "TypeScript"
							: null;

				if (!lspType) return null;

				// LSP initializing
				if (lspStatus?.initializing) {
					return (
						<div className="absolute bottom-4 right-4 max-w-sm bg-blue-900/90 text-white p-3 rounded-lg shadow-lg">
							<div className="font-semibold">{lspType} LSP Initializing...</div>
						</div>
					);
				}

				// LSP initialized
				if (lspStatus?.initialized) {
					if (lspDiagnostics.length === 0) {
						return (
							<div className="absolute bottom-4 right-4 max-w-sm bg-green-900/90 text-white p-3 rounded-lg shadow-lg">
								<div className="font-semibold">{lspType} LSP Active!</div>
								<div className="text-sm">
									No issues found in {activeFile.name.split("/").pop()}
								</div>
							</div>
						);
					} else {
						return (
							<div className="absolute bottom-4 right-4 max-w-sm bg-red-900/90 text-white p-3 rounded-lg shadow-lg">
								<div className="font-semibold mb-1">{lspType} LSP Active!</div>
								<div className="text-sm">
									{lspDiagnostics.length} diagnostic
									{lspDiagnostics.length !== 1 ? "s" : ""} found:
								</div>
								<div className="text-xs mt-1 max-h-32 overflow-y-auto">
									{lspDiagnostics.slice(0, 3).map((diag, i) => (
										<div key={i} className="mt-1">
											• Line {diag.line + 1}: {diag.message}
										</div>
									))}
									{lspDiagnostics.length > 3 && (
										<div className="mt-1 text-gray-300">
											...and {lspDiagnostics.length - 3} more
										</div>
									)}
								</div>
							</div>
						);
					}
				}

				return null;
			})()}
		</div>
	);
};
