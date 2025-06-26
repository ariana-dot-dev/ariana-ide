import type { Position } from "../Document";

export function positionEquals(a: Position, b: Position): boolean {
	return a.line === b.line && a.column === b.column;
}

export function positionCompare(a: Position, b: Position): number {
	if (a.line < b.line) return -1;
	if (a.line > b.line) return 1;
	if (a.column < b.column) return -1;
	if (a.column > b.column) return 1;
	return 0;
}

export function positionMin(a: Position, b: Position): Position {
	return positionCompare(a, b) <= 0 ? a : b;
}

export function positionMax(a: Position, b: Position): Position {
	return positionCompare(a, b) >= 0 ? a : b;
}

export function clampPosition(
	position: Position,
	lineCount: number,
	getLineLength: (line: number) => number,
): Position {
	const line = Math.max(0, Math.min(position.line, lineCount - 1));
	const maxColumn = getLineLength(line);
	const column = Math.max(0, Math.min(position.column, maxColumn));

	return { line, column };
}
