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

export function columnToX(column: number): number {
	// for monospace fonts, this is simple
	return column * getCharWidth();
}

export function xToColumn(x: number): number {
	const charWidth = getCharWidth();
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
