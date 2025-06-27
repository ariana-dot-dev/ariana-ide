import { type Output, transformSync } from "@swc/wasm-web";
import { resolveResource } from "@tauri-apps/api/path";
import { readTextFile } from "@tauri-apps/plugin-fs";
import type { IStore } from "../state";
import type { Command } from "./baseScript";

class Script {
	baseScript: string = "";
	appendix: string[] = [];

	constructor(baseScript: string, appendix: string[]) {
		this.baseScript = baseScript;
		this.appendix = appendix;
	}

	clone(): Script {
		return new Script(this.baseScript, [...this.appendix]);
	}
}

export class Interpreter {
	script: Script;
	lastResult: Command[] = [];
	store: IStore;
	notHiddenTopScript: string = "";
	initialContent: string = "";

	constructor(store: IStore) {
		this.script = new Script("", []);
		this.store = store;
	}

	async init() {
		const resourcePath = await resolveResource(
			"../src/scripting/baseScript.ts",
		);
		this.script.baseScript = await readTextFile(resourcePath);

		// --- Populate this.notHiddenTopScript and this.initialContent ---
		const baseScriptContent = this.script.baseScript;

		const initialTagStart = "// <initial>";
		const initialTagEnd = "// </initial>";
		const initialBlockStartIndex = baseScriptContent.indexOf(initialTagStart);

		if (initialBlockStartIndex !== -1) {
			const initialBlockEndIndex = baseScriptContent.indexOf(
				initialTagEnd,
				initialBlockStartIndex + initialTagStart.length,
			);
			if (initialBlockEndIndex !== -1) {
				this.initialContent = baseScriptContent
					.substring(
						initialBlockStartIndex + initialTagStart.length,
						initialBlockEndIndex,
					)
					.trim();
			}
		}

		const scriptPortionForNotHidden =
			initialBlockStartIndex !== -1
				? baseScriptContent.substring(0, initialBlockStartIndex)
				: baseScriptContent;

		this.notHiddenTopScript = scriptPortionForNotHidden
			.replace(/\/\/ <hide>[\s\S]*?\/\/ <\/hide>/g, "")
			.trim();
		// --- End population ---
		const script =
			this.script.baseScript + "\n" + this.script.appendix.join("\n");

		// try to compile the script
		let result: Command[] = [];
		let jsCode: Output;
		try {
			const codeToTransform = script.replace("export type", "type");
			jsCode = transformSync(codeToTransform, {
				jsc: { parser: { syntax: "typescript" } },
			});
		} catch (e) {
			console.error("Error in init:", e);
			throw e;
		}
		console.log("JS code:");
		console.log(jsCode);

		// eval the code and get the __result var by making it the last expression
		result = eval(`${jsCode.code}; __result`) as Command[];
		console.log("Initial Result:", result);

		this.lastResult = result;

		const rawScriptForFormatting =
			this.notHiddenTopScript +
			"\n" +
			this.initialContent +
			"\n" +
			this.script.appendix.join("\n");
		const nicelyFormattedCurrentScript = this._formatScriptForDisplay(
			rawScriptForFormatting,
		);
		this.store.setCurrentInterpreterScript(nicelyFormattedCurrentScript);
		result.forEach((command) => this.store.processCommand(command));
	}

	async tryRunInstruction(instruction: string) {
		// create a new version of the script
		const newScript = this.script.clone();
		newScript.appendix.push(instruction);
		const script = newScript.baseScript + "\n" + newScript.appendix.join("\n");

		// try to compile the script
		let result: Command[] = [];
		let jsCode: Output;
		try {
			const codeToTransform = script.replace("export type", "type");
			jsCode = transformSync(codeToTransform, {
				jsc: { parser: { syntax: "typescript" } },
			});
		} catch (e) {
			console.error("Error in tryAppendInstruction:", e);
			throw e;
		}

		console.log("JS code:");
		console.log(jsCode);

		// eval the code and get the __result var by making it the last expression
		result = eval(`${jsCode.code}; __result`) as Command[];

		// if it worked, save the new script
		this.script = newScript;

		// find the Commands that are new
		const sizeLastResult = this.lastResult.length;
		const newCommands = result.slice(sizeLastResult);
		console.log("New commands:", newCommands);

		this.lastResult = result;

		newCommands.forEach((command) => this.store.processCommand(command));

		const rawScriptForFormatting =
			this.notHiddenTopScript +
			"\n" +
			this.initialContent +
			"\n" +
			this.script.appendix.join("\n");
		const nicelyFormattedCurrentScript = this._formatScriptForDisplay(
			rawScriptForFormatting,
		);
		this.store.setCurrentInterpreterScript(nicelyFormattedCurrentScript);
	}

	private _formatScriptForDisplay(scriptContent: string): string {
		const initialLines = scriptContent.split("\n");
		const nonBlankLines = initialLines.filter((line) => line.trim() !== "");

		if (nonBlankLines.length === 0) return ""; // Handle empty or all-whitespace input

		const finalLines: string[] = [];
		for (let i = 0; i < nonBlankLines.length; i++) {
			const line = nonBlankLines[i];
			finalLines.push(line);
			// Add an empty line if the current line is '}' and it's not the last non-blank line
			if (line.trim() === "}" && i < nonBlankLines.length - 1) {
				finalLines.push("");
			}
		}
		return finalLines.join("\n");
	}
}
