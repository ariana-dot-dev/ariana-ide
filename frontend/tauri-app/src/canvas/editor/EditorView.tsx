import type React from "react";
import { useCallback, useEffect, useRef } from "react";
import { cn } from "../../utils";
import { Cursor } from "./Cursor";
import { useEditorStore } from "./EditorStore";
import { InputHandler } from "./InputHandler";
import { Line } from "./Line";
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
	const activeFile = useEditorStore((state) => state.files[activeFileId]);
	const document = activeFile?.document || null;
	const cursor = activeFile?.cursor || { line: 0, column: 0 };
	const moveCursor = useEditorStore((state) => state.moveCursor);

	// auto-scroll to keep cursor in view
	useEffect(() => {
		if (!containerRef.current || !cursor) return;

		const container = containerRef.current;
		const lineNumberWidth = showLineNumbers ? 64 : 0;

		// calculate cursor position
		const cursorX = columnToX(cursor.column) + lineNumberWidth;
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
	}, [cursor, showLineNumbers]);

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
			const column = xToColumn(Math.max(0, adjustedX));

			if (!document) return;

			// clamp to valid position
			const lineContent = document.getLine(line);
			const maxLine = Math.min(line, document.getLineCount() - 1);
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
					return (
						<Line
							key={i}
							lineNumber={i}
							content={lineContent}
							showLineNumbers={showLineNumbers}
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
		</div>
	);
};
