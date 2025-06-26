import type React from "react";
import { useCallback, useRef } from "react";
import { cn } from "../../utils";
import { Cursor } from "./Cursor";
import { useEditorStore } from "./EditorStore";
import { InputHandler } from "./InputHandler";
import { Line } from "./Line";
import {
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

	const { document, cursor, moveCursor } = useEditorStore();

	const handleClick = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			if (!contentRef.current) return;

			const rect = contentRef.current.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const y = e.clientY - rect.top;

			// account for line numbers width if shown
			const lineNumberWidth = showLineNumbers ? 64 : 0; // 3rem = 48px + pr-4 = 16px
			const adjustedX = x - lineNumberWidth;

			const line = yToLine(y);
			const column = xToColumn(Math.max(0, adjustedX));

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
