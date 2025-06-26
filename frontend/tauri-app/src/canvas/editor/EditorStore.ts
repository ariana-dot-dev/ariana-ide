import { create } from "zustand";
import { Document, type Position, type Range } from "./Document";

interface Selection {
	anchor: Position;
	active: Position;
}

interface EditorState {
	document: Document;
	cursor: Position;
	selections: Selection[];

	// actions
	setText: (text: string) => void;
	insertText: (text: string) => void;
	deleteBackward: () => void;
	deleteForward: () => void;
	moveCursor: (position: Position) => void;
	moveCursorRelative: (lineDelta: number, columnDelta: number) => void;
	setSelection: (selection: Selection) => void;
	clearSelections: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
	document: new Document(
		"// Welcome to the code editor\nfunction hello() {\n  console.log('Hello, world!');\n}\n\nhello();",
	),
	cursor: { line: 0, column: 0 },
	selections: [],

	setText: (text: string) =>
		set({
			document: new Document(text),
			cursor: { line: 0, column: 0 },
			selections: [],
		}),

	insertText: (text: string) =>
		set((state) => {
			const { document, cursor, selections } = state;

			// if there's a selection, delete it first
			if (selections.length > 0) {
				const selection = selections[0];
				const range: Range = {
					start: selection.anchor,
					end: selection.active,
				};

				// normalize range (start should be before end)
				if (
					selection.active.line < selection.anchor.line ||
					(selection.active.line === selection.anchor.line &&
						selection.active.column < selection.anchor.column)
				) {
					range.start = selection.active;
					range.end = selection.anchor;
				}

				const newDoc = document.delete(range);
				const newCursor = range.start;
				const docAfterInsert = newDoc.insert(newCursor, text);

				// calculate new cursor position
				const lines = text.split("\n");
				const lastLineLength = lines[lines.length - 1].length;
				const cursorLine = newCursor.line + lines.length - 1;
				const cursorColumn =
					lines.length === 1
						? newCursor.column + lastLineLength
						: lastLineLength;

				return {
					document: docAfterInsert,
					cursor: { line: cursorLine, column: cursorColumn },
					selections: [],
				};
			}

			// no selection, just insert at cursor
			const newDoc = document.insert(cursor, text);

			// calculate new cursor position
			const lines = text.split("\n");
			const lastLineLength = lines[lines.length - 1].length;
			const newLine = cursor.line + lines.length - 1;
			const newColumn =
				lines.length === 1 ? cursor.column + lastLineLength : lastLineLength;

			return {
				document: newDoc,
				cursor: { line: newLine, column: newColumn },
			};
		}),

	deleteBackward: () =>
		set((state) => {
			const { document, cursor, selections } = state;

			// if there's a selection, delete it
			if (selections.length > 0) {
				const selection = selections[0];
				const range: Range = {
					start: selection.anchor,
					end: selection.active,
				};

				// normalize range
				if (
					selection.active.line < selection.anchor.line ||
					(selection.active.line === selection.anchor.line &&
						selection.active.column < selection.anchor.column)
				) {
					range.start = selection.active;
					range.end = selection.anchor;
				}

				return {
					document: document.delete(range),
					cursor: range.start,
					selections: [],
				};
			}

			// no selection, delete one character backward
			if (cursor.column === 0 && cursor.line === 0) {
				return state; // nothing to delete
			}

			let deleteFrom: Position;

			if (cursor.column === 0) {
				// at beginning of line, delete newline from previous line
				const prevLine = document.getLine(cursor.line - 1);
				deleteFrom = {
					line: cursor.line - 1,
					column: prevLine ? prevLine.length : 0,
				};
			} else {
				// delete one character back
				deleteFrom = { line: cursor.line, column: cursor.column - 1 };
			}

			const range: Range = { start: deleteFrom, end: cursor };

			return {
				document: document.delete(range),
				cursor: deleteFrom,
			};
		}),

	deleteForward: () =>
		set((state) => {
			const { document, cursor, selections } = state;

			// if there's a selection, delete it
			if (selections.length > 0) {
				const selection = selections[0];
				const range: Range = {
					start: selection.anchor,
					end: selection.active,
				};

				// normalize range
				if (
					selection.active.line < selection.anchor.line ||
					(selection.active.line === selection.anchor.line &&
						selection.active.column < selection.anchor.column)
				) {
					range.start = selection.active;
					range.end = selection.anchor;
				}

				return {
					document: document.delete(range),
					cursor: range.start,
					selections: [],
				};
			}

			// no selection, delete one character forward
			const line = document.getLine(cursor.line);
			if (!line) return state;

			let deleteTo: Position;

			if (cursor.column >= line.length) {
				// at end of line
				if (cursor.line >= document.getLineCount() - 1) {
					return state; // nothing to delete
				}
				// delete newline
				deleteTo = { line: cursor.line + 1, column: 0 };
			} else {
				// delete one character forward
				deleteTo = { line: cursor.line, column: cursor.column + 1 };
			}

			const range: Range = { start: cursor, end: deleteTo };

			return {
				document: document.delete(range),
				cursor: cursor, // cursor stays in same position
			};
		}),

	moveCursor: (position: Position) =>
		set({
			cursor: position,
			selections: [], // clear selections when moving cursor
		}),

	moveCursorRelative: (lineDelta: number, columnDelta: number) =>
		set((state) => {
			const { document, cursor } = state;
			const lineCount = document.getLineCount();

			let newLine = cursor.line + lineDelta;
			let newColumn = cursor.column + columnDelta;

			// clamp line
			newLine = Math.max(0, Math.min(newLine, lineCount - 1));

			// handle column adjustments
			const targetLine = document.getLine(newLine);
			if (targetLine !== undefined) {
				if (columnDelta !== 0) {
					// horizontal movement
					if (newColumn < 0) {
						// move to previous line
						if (newLine > 0) {
							newLine--;
							const prevLine = document.getLine(newLine);
							newColumn = prevLine ? prevLine.length : 0;
						} else {
							newColumn = 0;
						}
					} else if (newColumn > targetLine.length) {
						// move to next line
						if (newLine < lineCount - 1) {
							newLine++;
							newColumn = 0;
						} else {
							newColumn = targetLine.length;
						}
					}
				} else {
					// vertical movement - try to maintain column position
					newColumn = Math.min(cursor.column, targetLine.length);
				}
			}

			return {
				cursor: { line: newLine, column: newColumn },
				selections: [],
			};
		}),

	setSelection: (selection: Selection) =>
		set({
			selections: [selection],
		}),

	clearSelections: () =>
		set({
			selections: [],
		}),
}));
