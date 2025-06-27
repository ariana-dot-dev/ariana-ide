import type React from "react";
import { useEffect, useRef } from "react";
import { useEditorStore } from "./EditorStore";
import { columnToX, lineToY } from "./utils/measurements";

interface InputHandlerProps {
	containerRef: React.RefObject<HTMLDivElement | null>;
}

export const InputHandler: React.FC<InputHandlerProps> = ({ containerRef }) => {
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const {
		cursor,
		insertText,
		deleteBackward,
		deleteForward,
		moveCursorRelative,
	} = useEditorStore();

	// position hidden textarea at cursor position
	useEffect(() => {
		if (inputRef.current) {
			const x = columnToX(cursor.column);
			const y = lineToY(cursor.line);

			inputRef.current.style.left = `${x}px`;
			inputRef.current.style.top = `${y}px`;
		}
	}, [cursor]);

	// focus management
	useEffect(() => {
		const handleContainerClick = () => {
			inputRef.current?.focus();
		};

		const container = containerRef.current;
		if (container) {
			container.addEventListener("click", handleContainerClick);
			// initial focus
			setTimeout(() => inputRef.current?.focus(), 100);
		}

		return () => {
			container?.removeEventListener("click", handleContainerClick);
		};
	}, [containerRef]);

	const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
		const value = e.currentTarget.value;
		if (value) {
			insertText(value);
			e.currentTarget.value = "";
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		// prevent default for keys we handle
		switch (e.key) {
			case "ArrowLeft":
			case "ArrowRight":
			case "ArrowUp":
			case "ArrowDown":
			case "Home":
			case "End":
			case "Backspace":
			case "Delete":
				e.preventDefault();
				break;
		}

		// handle special keys
		switch (e.key) {
			case "Enter":
				e.preventDefault();
				insertText("\n");
				break;

			case "Tab":
				e.preventDefault();
				insertText("  "); // 2 spaces
				break;

			case "Backspace":
				deleteBackward();
				break;

			case "Delete":
				deleteForward();
				break;

			case "ArrowLeft":
				moveCursorRelative(0, -1);
				break;

			case "ArrowRight":
				moveCursorRelative(0, 1);
				break;

			case "ArrowUp":
				moveCursorRelative(-1, 0);
				break;

			case "ArrowDown":
				moveCursorRelative(1, 0);
				break;

			case "Home":
				useEditorStore.getState().moveCursor({
					line: cursor.line,
					column: 0,
				});
				break;

			case "End": {
				const doc = useEditorStore.getState().document;
				const line = doc.getLine(cursor.line);
				useEditorStore.getState().moveCursor({
					line: cursor.line,
					column: line ? line.length : 0,
				});
				break;
			}
		}
	};

	return (
		<textarea
			ref={inputRef}
			className="absolute opacity-0 pointer-events-none resize-none"
			style={{
				width: "1px",
				height: "1px",
				padding: 0,
				border: "none",
				outline: "none",
				caretColor: "transparent",
			}}
			autoComplete="off"
			autoCorrect="off"
			autoCapitalize="off"
			spellCheck={false}
			onInput={handleInput}
			onKeyDown={handleKeyDown}
			aria-label="Code editor input"
		/>
	);
};
