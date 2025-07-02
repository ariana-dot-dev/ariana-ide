import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { create } from "zustand";
import { Document, type Position, type Range } from "./Document";
import {
	type HighlightedLine,
	SyntaxHighlighter,
} from "./syntax/SyntaxHighlighter";

interface Selection {
	anchor: Position;
	active: Position;
}

interface FileData {
	id: string;
	name: string;
	content: string;
	document: Document;
	cursor: Position;
	selections: Selection[];
	isDirty: boolean;
	highlightedLines?: Map<number, HighlightedLine>;
}

interface LspDiagnostic {
	message: string;
	severity: string;
	line: number;
	column: number;
	end_line: number;
	end_column: number;
}

interface LspStatus {
	initialized: boolean;
	initializing: boolean;
}

interface EditorState {
	files: Record<string, FileData>;
	activeFileId: string;
	fileWatchers: Record<string, UnlistenFn>;
	syntaxHighlighter: SyntaxHighlighter | null;
	lspStatuses: Record<string, LspStatus>; // key is file extension
	lspDiagnostics: Record<string, LspDiagnostic[]>;
	lspDocumentVersions: Record<string, number>;

	// actions
	setText: (text: string) => void;
	insertText: (text: string) => void;
	deleteBackward: () => void;
	deleteForward: () => void;
	moveCursor: (position: Position) => void;
	moveCursorRelative: (lineDelta: number, columnDelta: number) => void;
	setSelection: (selection: Selection) => void;
	clearSelections: () => void;

	// file actions
	setActiveFile: (fileId: string) => void;
	updateFileContent: (fileId: string, content: string) => void;
	openFile: (path: string, content: string) => void;
	closeFile: (fileId: string) => void;
	saveFile: (fileId: string) => Promise<void>;

	// file watcher actions
	setupFileWatching: () => Promise<void>;
	cleanupFileWatching: () => Promise<void>;

	// syntax highlighting actions
	initializeSyntaxHighlighting: () => Promise<void>;
	updateSyntaxHighlighting: (fileId: string) => void;

	// LSP actions
	initializeLspForFile: (fileId: string) => Promise<void>;
	updateLspDocument: (fileId: string) => Promise<void>;
	fetchLspDiagnostics: (fileId: string) => Promise<void>;
}

// start with no files open
const initialFiles: Record<string, FileData> = {};

// todo: dig further into how zustand mutates state because we cant just naively
// spread things `...` because our performance will suffer
export const useEditorStore = create<EditorState>((set, get) => ({
	files: initialFiles,
	activeFileId: "",
	fileWatchers: {},
	syntaxHighlighter: null,
	lspStatuses: {},
	lspDiagnostics: {},
	lspDocumentVersions: {},

	setText: (text: string) =>
		set((state) => {
			const activeFile = state.files[state.activeFileId];
			if (!activeFile) return state;

			const newState = {
				files: {
					...state.files,
					[state.activeFileId]: {
						...activeFile,
						content: text,
						document: new Document(text),
						cursor: { line: 0, column: 0 },
						selections: [],
						isDirty: true,
					},
				},
			};
			// update syntax highlighting
			setTimeout(() => get().updateSyntaxHighlighting(state.activeFileId), 0);
			// update LSP document
			setTimeout(() => get().updateLspDocument(state.activeFileId), 100);
			return newState;
		}),

	insertText: (text: string) =>
		set((state) => {
			const activeFile = state.files[state.activeFileId];
			if (!activeFile) return state;

			const { document, cursor, selections } = activeFile;

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
					files: {
						...state.files,
						[state.activeFileId]: {
							...activeFile,
							content: docAfterInsert.toString(),
							document: docAfterInsert,
							cursor: { line: cursorLine, column: cursorColumn },
							selections: [],
							isDirty: true,
						},
					},
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

			const newState = {
				files: {
					...state.files,
					[state.activeFileId]: {
						...activeFile,
						content: newDoc.toString(),
						document: newDoc,
						cursor: { line: newLine, column: newColumn },
						isDirty: true,
					},
				},
			};
			// update syntax highlighting
			setTimeout(() => get().updateSyntaxHighlighting(state.activeFileId), 0);
			// update LSP document
			setTimeout(() => get().updateLspDocument(state.activeFileId), 100);
			return newState;
		}),

	deleteBackward: () =>
		set((state) => {
			const activeFile = state.files[state.activeFileId];
			if (!activeFile) return state;

			const { document, cursor, selections } = activeFile;

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

				const newDoc = document.delete(range);
				return {
					files: {
						...state.files,
						[state.activeFileId]: {
							...activeFile,
							content: newDoc.toString(),
							document: newDoc,
							cursor: range.start,
							selections: [],
							isDirty: true,
						},
					},
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

			const newDoc = document.delete(range);
			return {
				files: {
					...state.files,
					[state.activeFileId]: {
						...activeFile,
						content: newDoc.toString(),
						document: newDoc,
						cursor: deleteFrom,
						isDirty: true,
					},
				},
			};
		}),

	deleteForward: () =>
		set((state) => {
			const activeFile = state.files[state.activeFileId];
			if (!activeFile) return state;

			const { document, cursor, selections } = activeFile;

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

				const newDoc = document.delete(range);
				return {
					files: {
						...state.files,
						[state.activeFileId]: {
							...activeFile,
							content: newDoc.toString(),
							document: newDoc,
							cursor: range.start,
							selections: [],
							isDirty: true,
						},
					},
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

			const newDoc = document.delete(range);
			return {
				files: {
					...state.files,
					[state.activeFileId]: {
						...activeFile,
						content: newDoc.toString(),
						document: newDoc,
						cursor: cursor, // cursor stays in same position
						isDirty: true,
					},
				},
			};
		}),

	moveCursor: (position: Position) =>
		set((state) => {
			const activeFile = state.files[state.activeFileId];
			if (!activeFile) return state;

			return {
				files: {
					...state.files,
					[state.activeFileId]: {
						...activeFile,
						cursor: position,
						selections: [], // clear selections when moving cursor
					},
				},
			};
		}),

	moveCursorRelative: (lineDelta: number, columnDelta: number) =>
		set((state) => {
			const activeFile = state.files[state.activeFileId];
			if (!activeFile) return state;

			const { document, cursor } = activeFile;
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
				files: {
					...state.files,
					[state.activeFileId]: {
						...activeFile,
						cursor: { line: newLine, column: newColumn },
						selections: [],
					},
				},
			};
		}),

	setSelection: (selection: Selection) =>
		set((state) => {
			const activeFile = state.files[state.activeFileId];
			if (!activeFile) return state;

			return {
				files: {
					...state.files,
					[state.activeFileId]: {
						...activeFile,
						selections: [selection],
					},
				},
			};
		}),

	clearSelections: () =>
		set((state) => {
			const activeFile = state.files[state.activeFileId];
			if (!activeFile) return state;

			return {
				files: {
					...state.files,
					[state.activeFileId]: {
						...activeFile,
						selections: [],
					},
				},
			};
		}),

	// file actions
	setActiveFile: (fileId: string) =>
		set((state) => {
			if (!state.files[fileId]) return state;
			return { activeFileId: fileId };
		}),

	updateFileContent: (fileId: string, content: string) =>
		set((state) => {
			const file = state.files[fileId];
			if (!file) return state;

			return {
				files: {
					...state.files,
					[fileId]: {
						...file,
						content,
						document: new Document(content),
					},
				},
			};
		}),

	openFile: (path: string, content: string) =>
		set((state) => {
			// check if file is already open
			const existingFileId = Object.keys(state.files).find(
				(id) => state.files[id].name === path,
			);
			if (existingFileId) {
				return { activeFileId: existingFileId };
			}

			// create new file
			const fileId = `file_${Date.now()}`;
			const _fileName = path.split("/").pop() || path;
			const newFile: FileData = {
				id: fileId,
				name: path,
				content,
				document: new Document(content),
				cursor: { line: 0, column: 0 },
				selections: [],
				isDirty: false,
			};

			// start watching the new file
			invoke("watch_file", { path }).catch((error) =>
				console.error(`Failed to watch file: ${path}`, error),
			);

			const newState = {
				files: {
					...state.files,
					[fileId]: newFile,
				},
				activeFileId: fileId,
			};

			// update syntax highlighting for new file
			setTimeout(() => {
				console.log(
					"[EditorStore] Triggering syntax highlighting for newly opened file",
				);
				get().updateSyntaxHighlighting(fileId);
			}, 100);

			// Initialize LSP and update document for new file
			setTimeout(async () => {
				console.log(
					"[EditorStore] Checking if LSP is ready for newly opened file:",
					fileId,
				);

				// Try to initialize LSP for this file type if not already done
				try {
					await get().initializeLspForFile(fileId);
				} catch (error) {
					console.error(
						"[EditorStore] Failed to initialize LSP for new file:",
						error,
					);
				}

				console.log(
					"[EditorStore] Calling updateLspDocument for newly opened file:",
					fileId,
				);
				get().updateLspDocument(fileId);
			}, 200);

			return newState;
		}),

	closeFile: (fileId: string) =>
		set((state) => {
			const fileToClose = state.files[fileId];
			if (!fileToClose) return state;

			// stop watching the file
			invoke("unwatch_file", { path: fileToClose.name }).catch((error) =>
				console.error(`Failed to unwatch file: ${fileToClose.name}`, error),
			);

			const { [fileId]: _removed, ...remainingFiles } = state.files;
			const fileIds = Object.keys(remainingFiles);

			// if we're closing the active file, switch to another file or empty
			let newActiveFileId = state.activeFileId;
			if (state.activeFileId === fileId) {
				newActiveFileId = fileIds.length > 0 ? fileIds[0] : "";
			}

			return {
				files: remainingFiles,
				activeFileId: newActiveFileId,
			};
		}),

	saveFile: async (fileId: string) => {
		const state = useEditorStore.getState();
		const file = state.files[fileId];
		if (!file || !file.isDirty) return;

		try {
			// save file using tauri command
			await invoke("write_file", {
				path: file.name,
				content: file.content,
			});

			// update state to mark file as saved
			set((state) => ({
				files: {
					...state.files,
					[fileId]: {
						...state.files[fileId],
						isDirty: false,
					},
				},
			}));
		} catch (error) {
			console.error(`Failed to save file: ${file.name}`, error);
		}
	},

	setupFileWatching: async () => {
		// set up file change listener
		const unlistenFileChanged = await listen<string>(
			"file-changed",
			async (event) => {
				const changedPath = event.payload;

				// get current state inside the listener
				const currentState = get();

				// find the file by path
				const fileEntry = Object.entries(currentState.files).find(
					([_, file]) => file.name === changedPath,
				);
				if (!fileEntry) {
					return;
				}

				const [fileId, file] = fileEntry;

				// don't reload if file is dirty (has unsaved changes)
				if (file.isDirty) {
					return;
				}

				try {
					// read the updated content
					const newContent = await invoke<string>("read_file", {
						path: changedPath,
					});

					// update the file content
					set((state) => {
						const file = state.files[fileId];
						if (!file) return state;

						// preserve cursor position
						const cursor = file.cursor;
						const document = new Document(newContent);

						// adjust cursor if it's out of bounds
						const lineCount = document.getLineCount();
						const adjustedLine = Math.min(cursor.line, lineCount - 1);
						const lineContent = document.getLine(adjustedLine) || "";
						const adjustedColumn = Math.min(cursor.column, lineContent.length);

						const newState = {
							files: {
								...state.files,
								[fileId]: {
									...file,
									content: newContent,
									document,
									cursor: { line: adjustedLine, column: adjustedColumn },
									selections: [],
								},
							},
						};

						// update syntax highlighting after file change
						setTimeout(() => get().updateSyntaxHighlighting(fileId), 0);

						return newState;
					});
				} catch (error) {
					console.error(`Failed to reload file: ${changedPath}`, error);
				}
			},
		);

		// set up file removed listener
		const unlistenFileRemoved = await listen<string>(
			"file-removed",
			(event) => {
				const removedPath = event.payload;
				// optionally close the file or show a notification
			},
		);

		// store the unlisteners
		set((state) => ({
			fileWatchers: {
				...state.fileWatchers,
				"file-changed": unlistenFileChanged,
				"file-removed": unlistenFileRemoved,
			},
		}));

		// get current state to watch open files
		const currentState = get();

		// start watching all open files
		for (const file of Object.values(currentState.files)) {
			try {
				await invoke("watch_file", { path: file.name });
			} catch (error) {
				console.error(`Failed to watch file: ${file.name}`, error);
			}
		}
	},

	cleanupFileWatching: async () => {
		const state = get();

		// unwatch all files
		for (const file of Object.values(state.files)) {
			try {
				await invoke("unwatch_file", { path: file.name });
			} catch (error) {
				console.error(`Failed to unwatch file: ${file.name}`, error);
			}
		}

		// remove all event listeners
		for (const unlisten of Object.values(state.fileWatchers)) {
			try {
				unlisten();
			} catch (error) {
				console.error("Failed to unlisten file watcher:", error);
			}
		}

		set({ fileWatchers: {} });
	},

	initializeSyntaxHighlighting: async () => {
		const state = get();
		if (!state.syntaxHighlighter) {
			try {
				console.log("[EditorStore] Initializing syntax highlighter...");
				const highlighter = new SyntaxHighlighter();
				await highlighter.initialize();
				set({ syntaxHighlighter: highlighter });
				console.log(
					"[EditorStore] Syntax highlighter initialized successfully",
				);

				// highlight all open files
				for (const fileId of Object.keys(state.files)) {
					get().updateSyntaxHighlighting(fileId);
				}
			} catch (error) {
				console.error(
					"[EditorStore] Failed to initialize syntax highlighter:",
					error,
				);
			}
		}
	},

	updateSyntaxHighlighting: (fileId: string) => {
		const state = get();
		const file = state.files[fileId];
		const highlighter = state.syntaxHighlighter;

		console.log(
			"[EditorStore] updateSyntaxHighlighting called for:",
			fileId,
			file?.name,
		);

		if (!file || !highlighter) {
			console.log("[EditorStore] Missing file or highlighter", {
				file: !!file,
				highlighter: !!highlighter,
			});
			return;
		}

		// only highlight typescript/javascript files for now
		const isTypeScript =
			file.name.endsWith(".ts") ||
			file.name.endsWith(".tsx") ||
			file.name.endsWith(".js") ||
			file.name.endsWith(".jsx");

		if (!isTypeScript) {
			console.log("[EditorStore] Not a TypeScript file:", file.name);
			return;
		}

		console.log("[EditorStore] Highlighting TypeScript file:", file.name);
		const highlightedLines = highlighter.getHighlightedLines(
			file.content,
			file.name,
		);
		console.log("[EditorStore] Highlighted lines:", highlightedLines.size);

		set((state) => ({
			files: {
				...state.files,
				[fileId]: {
					...state.files[fileId],
					highlightedLines,
				},
			},
		}));
	},

	// LSP actions
	initializeLspForFile: async (fileId: string) => {
		const state = get();
		const file = state.files[fileId];
		if (!file) return;

		const fileExt = file.name.split(".").pop()?.toLowerCase();
		if (!fileExt) return;

		// Check if LSP is already initialized for this file type
		const lspStatus = state.lspStatuses[fileExt];
		if (lspStatus?.initialized || lspStatus?.initializing) {
			console.log(
				`[EditorStore] LSP already initialized or initializing for .${fileExt} files`,
			);
			return;
		}

		// Update status to initializing
		set((state) => ({
			lspStatuses: {
				...state.lspStatuses,
				[fileExt]: { initialized: false, initializing: true },
			},
		}));

		try {
			console.log(`[EditorStore] Initializing LSP for .${fileExt} files...`);
			console.log("[EditorStore] Calling start_lsp_for_file command...");
			const startTime = Date.now();

			// Add a timeout wrapper with longer timeout
			const timeoutPromise = new Promise((_, reject) => {
				setTimeout(
					() =>
						reject(new Error("LSP initialization timed out after 30 seconds")),
					30000,
				);
			});

			// Start LSP for this file type
			await Promise.race([
				invoke("start_lsp_for_file", { filePath: file.name }),
				timeoutPromise,
			]);

			const elapsed = Date.now() - startTime;
			console.log(
				`[EditorStore] start_lsp_for_file command completed in ${elapsed}ms`,
			);

			// Update status to initialized
			set((state) => ({
				lspStatuses: {
					...state.lspStatuses,
					[fileExt]: { initialized: true, initializing: false },
				},
			}));
			console.log(
				`[EditorStore] LSP initialized successfully for .${fileExt} files`,
			);

			// Open all currently open files of this type in LSP
			const currentState = get();
			const fileEntries = Object.entries(currentState.files).filter(([_, f]) =>
				f.name.endsWith(`.${fileExt}`),
			);
			console.log(
				`[EditorStore] Opening ${fileEntries.length} .${fileExt} files in LSP`,
			);
			for (const [fileId, file] of fileEntries) {
				console.log(`[EditorStore] Opening file in LSP: ${file.name}`);
				await get().updateLspDocument(fileId);
			}
		} catch (error) {
			// Update status back to not initialized
			set((state) => ({
				lspStatuses: {
					...state.lspStatuses,
					[fileExt]: { initialized: false, initializing: false },
				},
			}));
			console.error(
				`[EditorStore] Failed to initialize LSP for .${fileExt} files:`,
				error,
			);
			// Log more details about the error
			if (error instanceof Error) {
				console.error(
					"[EditorStore] Error details:",
					error.message,
					error.stack,
				);
			}
			throw error; // Re-throw to see in the component
		}
	},

	updateLspDocument: async (fileId: string) => {
		const state = get();
		const file = state.files[fileId];
		console.log(
			"[EditorStore] updateLspDocument called for:",
			fileId,
			file?.name,
		);

		if (!file) {
			console.log("[EditorStore] Skipping LSP update - file not found");
			return;
		}

		const fileExt = file.name.split(".").pop()?.toLowerCase();
		if (!fileExt) return;

		const lspStatus = state.lspStatuses[fileExt];
		console.log(`[EditorStore] LSP status for .${fileExt}:`, lspStatus);

		if (!lspStatus?.initialized) {
			console.log(
				`[EditorStore] Skipping LSP update - LSP not ready for .${fileExt} files`,
			);
			return;
		}

		// only handle typescript/javascript files
		const isTypeScript =
			file.name.endsWith(".ts") ||
			file.name.endsWith(".tsx") ||
			file.name.endsWith(".js") ||
			file.name.endsWith(".jsx");

		console.log("[EditorStore] Is TypeScript file:", isTypeScript);
		if (!isTypeScript) return;

		try {
			const uri = `file://${file.name}`;
			const languageId =
				file.name.endsWith(".ts") || file.name.endsWith(".tsx")
					? "typescript"
					: "javascript";

			// get or initialize document version
			const currentVersion = state.lspDocumentVersions[uri] || 0;
			const newVersion = currentVersion + 1;

			if (currentVersion === 0) {
				// first time opening document
				await invoke("lsp_open_document", {
					uri,
					text: file.content,
					languageId,
				});
			} else {
				// update existing document
				await invoke("lsp_update_document", {
					uri,
					text: file.content,
					version: newVersion,
				});
			}

			// update version tracking
			set((state) => ({
				lspDocumentVersions: {
					...state.lspDocumentVersions,
					[uri]: newVersion,
				},
			}));

			// fetch diagnostics after a short delay
			setTimeout(() => {
				console.log("[EditorStore] Fetching diagnostics (1s delay)...");
				get().fetchLspDiagnostics(fileId);
			}, 1000);
			// Also fetch again after a longer delay in case LSP needs more time
			setTimeout(() => {
				console.log("[EditorStore] Fetching diagnostics (3s delay)...");
				get().fetchLspDiagnostics(fileId);
			}, 3000);
		} catch (error) {
			console.error("[EditorStore] Failed to update LSP document:", error);
		}
	},

	fetchLspDiagnostics: async (fileId: string) => {
		const state = get();
		const file = state.files[fileId];
		if (!file) return;

		const fileExt = file.name.split(".").pop()?.toLowerCase();
		if (!fileExt) return;

		const lspStatus = state.lspStatuses[fileExt];
		if (!lspStatus?.initialized) return;

		try {
			const uri = `file://${file.name}`;
			console.log(`[EditorStore] Fetching diagnostics for: ${uri}`);
			const diagnostics = await invoke<LspDiagnostic[]>("lsp_get_diagnostics", {
				uri,
			});

			set((state) => ({
				lspDiagnostics: {
					...state.lspDiagnostics,
					[fileId]: diagnostics,
				},
			}));

			console.log(
				`[EditorStore] Fetched ${diagnostics.length} diagnostics for ${file.name}`,
				diagnostics,
			);
		} catch (error) {
			console.error("[EditorStore] Failed to fetch diagnostics:", error);
		}
	},
}));
