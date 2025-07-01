let measurementCanvas: HTMLCanvasElement | null = null;
let measurementContext: CanvasRenderingContext2D | null = null;

const charWidthCache = new Map<string, number>();
const LINE_HEIGHT = 20; // pixels per line
const FONT_SIZE = 14;
const FONT_FAMILY = "Menlo, Monaco, 'Courier New', monospace";

export function getLineHeight(): number {
	return LINE_HEIGHT;
}

export function getFontSize(): number {
	return FONT_SIZE;
}

export function getEditorFont(): string {
	return `${FONT_SIZE}px ${FONT_FAMILY}`;
}

export function getFontFamily(): string {
	return FONT_FAMILY;
}

function getMeasurementContext(): CanvasRenderingContext2D {
	if (!measurementCanvas || !measurementContext) {
		measurementCanvas = document.createElement("canvas");
		measurementContext = measurementCanvas.getContext("2d");

		if (!measurementContext) {
			throw new Error("Failed to create measurement context");
		}

		measurementContext.font = getEditorFont();
	}

	return measurementContext;
}

export function measureText(text: string): number {
	if (text.length === 0) return 0;

	// for monospace fonts, we can optimize by caching single character widths
	const cacheKey = text.length === 1 ? text : `len:${text.length}`;

	if (charWidthCache.has(cacheKey)) {
		const cachedWidth = charWidthCache.get(cacheKey)!;
		if (text.length === 1) {
			return cachedWidth;
		}
		// for multi-char strings with cached single char width
		if (charWidthCache.has("0")) {
			return charWidthCache.get("0")! * text.length;
		}
	}

	const ctx = getMeasurementContext();
	const metrics = ctx.measureText(text);
	const width = metrics.width;

	// cache single character widths
	if (text.length === 1) {
		charWidthCache.set(text, width);
	}

	// for monospace fonts, cache the character width
	if (text === "0" || text === "x") {
		charWidthCache.set("0", width);
	}

	return width;
}

export function getCharWidth(): number {
	// measure a typical character for monospace width
	if (!charWidthCache.has("0")) {
		measureText("0");
	}
	return charWidthCache.get("0") || measureText("0");
}

export function columnToX(column: number, lineContent?: string): number {
	// if we have the line content, calculate actual position considering tabs
	if (lineContent) {
		let x = 0;
		const charWidth = getCharWidth();
		const tabSize = 4; // typical tab size

		for (let i = 0; i < column && i < lineContent.length; i++) {
			if (lineContent[i] === "\t") {
				// calculate tab stop position
				const currentTabStop = Math.floor(x / (charWidth * tabSize));
				x = (currentTabStop + 1) * charWidth * tabSize;
			} else {
				x += charWidth;
			}
		}
		return x;
	}

	// fallback: simple calculation
	return column * getCharWidth();
}

export function xToColumn(x: number, lineContent?: string): number {
	const charWidth = getCharWidth();

	// if we have the line content, calculate actual column considering tabs
	if (lineContent) {
		let currentX = 0;
		const tabSize = 4;

		for (let i = 0; i < lineContent.length; i++) {
			if (lineContent[i] === "\t") {
				// calculate tab stop position
				const currentTabStop = Math.floor(currentX / (charWidth * tabSize));
				const nextX = (currentTabStop + 1) * charWidth * tabSize;

				if (x < nextX) {
					return i;
				}
				currentX = nextX;
			} else {
				if (x < currentX + charWidth) {
					return i;
				}
				currentX += charWidth;
			}
		}

		return lineContent.length;
	}

	// fallback: simple calculation
	return Math.max(0, Math.floor(x / charWidth));
}

export function lineToY(line: number): number {
	return line * LINE_HEIGHT;
}

export function yToLine(y: number): number {
	return Math.max(0, Math.floor(y / LINE_HEIGHT));
}

export function clearMeasurementCache(): void {
	charWidthCache.clear();
	measurementCanvas = null;
	measurementContext = null;
}
