import { Output, transformSync } from "@swc/wasm-web";
import { readTextFile } from '@tauri-apps/api/fs';
import { resolveResource } from '@tauri-apps/api/path';
import { Command } from "./baseScript";
import React from "react";

class Script {
    baseScript: string = "";
    notHiddenTopScript: string = "";
    appendix: string[] = [];

    constructor(baseScript: string, notHiddenTopScript: string, appendix: string[]) {
        this.baseScript = baseScript;
        this.notHiddenTopScript = notHiddenTopScript;
        this.appendix = appendix;
    }

    clone(): Script {
        return new Script(this.baseScript, this.notHiddenTopScript, [...this.appendix]);
    }
}

export class Interpreter {
    script: Script;
    lastResult: Command[] = [];
    
    constructor() {
        this.script = new Script("", "", []);
    }

    async init(): Promise<Command[]> {
        const resourcePath = await resolveResource('../src/scripting/baseScript.ts');
        this.script.baseScript = await readTextFile(resourcePath);
        this.script.notHiddenTopScript = this.script.baseScript.replace(/\/\/ <hide>[\s\S]*?\/\/ <\/hide>/g, '').trim();
        const script = this.script.baseScript + '\n' + this.script.appendix.join('\n');

        // try to compile the script
        let result: Command[] = [];
        let jsCode: Output;
        try {
            const codeToTransform = script.replace('export type', 'type');
            jsCode = transformSync(codeToTransform, { jsc: { parser: { syntax: 'typescript' } } });
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

        return result;
    }

    async tryRunInstruction(instruction: string): Promise<Command[]> {
        // create a new version of the script
        const newScript = this.script.clone();
        newScript.appendix.push(instruction);
        const script = newScript.baseScript + '\n' + newScript.appendix.join('\n');

        // try to compile the script
        let result: Command[] = [];
        let jsCode: Output;
        try {
            const codeToTransform = script.replace('export type', 'type');
            jsCode = transformSync(codeToTransform, { jsc: { parser: { syntax: 'typescript' } } });
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


        return newCommands;
    }
}

// export async function readBaseScript() {
//     try {
//         const resourcePath = await resolveResource('../src/scripting/baseScript.ts');
//         const fullContent = await readTextFile(resourcePath);

//         console.log("Full content of baseScript.ts:");
//         console.log(fullContent);

//         const notHiddenContent = fullContent.replace(/\/\/ <hide>[\s\S]*?\/\/ <\/hide>/g, '').trim();
//         const initialContent = notHiddenContent.replace(/\/\/ <initial>[\s\S]*?\/\/ <\/initial>/g, '').trim();
//         console.log("Public content of baseScript.ts:");
//         console.log(notHiddenContent + initialContent);

//         const codeToTransform = fullContent.replace('export type', 'type');
//         const jsCode = transformSync(codeToTransform, { jsc: { parser: { syntax: 'typescript' } } });
//         console.log("JS code:");
//         console.log(jsCode);

//         // eval the code and get the __result var by making it the last expression
//         const result = eval(`${jsCode.code}; __result`) as Command[];
//         console.log("Result:", result);
//     } catch (e) {
//         console.error("Error in readBaseScript:", e);
//     }
// }