export interface Position {
	line: number;
	column: number;
}

export interface Range {
	start: Position;
	end: Position;
}

export class Document {
	private lines: string[];
	private version: number;

	constructor(text: string = "") {
		this.lines = text ? text.split("\n") : [""];
		this.version = 0;
	}

	getLine(lineNumber: number): string | undefined {
		return this.lines[lineNumber];
	}

	getLineCount(): number {
		return this.lines.length;
	}

	getText(): string {
		return this.lines.join("\n");
	}

	getTextInRange(range: Range): string {
		const { start, end } = range;

		if (start.line === end.line) {
			const line = this.lines[start.line];
			return line ? line.substring(start.column, end.column) : "";
		}

		const result: string[] = [];

		// first line
		const firstLine = this.lines[start.line];
		if (firstLine) {
			result.push(firstLine.substring(start.column));
		}

		// middle lines
		for (let i = start.line + 1; i < end.line; i++) {
			const line = this.lines[i];
			if (line !== undefined) {
				result.push(line);
			}
		}

		// last line
		const lastLine = this.lines[end.line];
		if (lastLine) {
			result.push(lastLine.substring(0, end.column));
		}

		return result.join("\n");
	}

	insert(position: Position, text: string): Document {
		const newDoc = new Document();
		newDoc.lines = [...this.lines];
		newDoc.version = this.version + 1;

		const line = newDoc.lines[position.line] || "";
		const before = line.substring(0, position.column);
		const after = line.substring(position.column);

		const insertedLines = text.split("\n");

		if (insertedLines.length === 1) {
			// single line insert
			newDoc.lines[position.line] = before + text + after;
		} else {
			// multi-line insert
			const firstInsertedLine = before + insertedLines[0];
			const lastInsertedLine = insertedLines[insertedLines.length - 1] + after;
			const middleLines = insertedLines.slice(1, -1);

			newDoc.lines.splice(
				position.line,
				1,
				firstInsertedLine,
				...middleLines,
				lastInsertedLine,
			);
		}

		return newDoc;
	}

	delete(range: Range): Document {
		const newDoc = new Document();
		newDoc.lines = [...this.lines];
		newDoc.version = this.version + 1;

		const { start, end } = range;

		if (start.line === end.line) {
			// single line delete
			const line = newDoc.lines[start.line] || "";
			newDoc.lines[start.line] =
				line.substring(0, start.column) + line.substring(end.column);
		} else {
			// multi-line delete
			const firstLine = newDoc.lines[start.line] || "";
			const lastLine = newDoc.lines[end.line] || "";
			const newLine =
				firstLine.substring(0, start.column) + lastLine.substring(end.column);

			newDoc.lines.splice(start.line, end.line - start.line + 1, newLine);
		}

		// ensure at least one empty line
		if (newDoc.lines.length === 0) {
			newDoc.lines = [""];
		}

		return newDoc;
	}

	positionAt(offset: number): Position {
		let currentOffset = 0;

		for (let line = 0; line < this.lines.length; line++) {
			const lineLength = this.lines[line].length;

			if (currentOffset + lineLength >= offset) {
				return { line, column: offset - currentOffset };
			}

			currentOffset += lineLength + 1; // +1 for newline
		}

		// if offset is beyond document
		const lastLine = this.lines.length - 1;
		return {
			line: lastLine,
			column: this.lines[lastLine]?.length || 0,
		};
	}

	offsetAt(position: Position): number {
		let offset = 0;

		for (
			let line = 0;
			line < position.line && line < this.lines.length;
			line++
		) {
			offset += this.lines[line].length + 1; // +1 for newline
		}

		if (position.line < this.lines.length) {
			offset += Math.min(position.column, this.lines[position.line].length);
		}

		return offset;
	}

	getVersion(): number {
		return this.version;
	}
}
