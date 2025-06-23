// Utility helpers related to color resolution
// -------------------------------------------------
// XTerm (and many other libraries) cannot understand CSS custom properties.
// `resolveColor` converts a CSS variable name (e.g. `--bg-500`) into a hex/rgb string
// by reading the value from `getComputedStyle(document.documentElement)`. As a
// fallback it uses the generated `COLOR_VARS` map which is produced at build time
// from our design tokens. If neither source yields a value, a very visible purple
// is returned so that missing variables are obvious while developing.

import { COLOR_VARS } from "../generated/colors";

const FALLBACK_COLOR = "#ff00ff"; // Ugly purple for easily spotting missing tokens

/**
 * Resolve the actual color string for a CSS variable name.
 *
 * @param name CSS custom property name, e.g. `--fg-500`
 * @param cssVars Optional `CSSStyleDeclaration` – pass a memoised instance if you
 *                need to resolve many colors in a tight loop for performance.
 */
export function resolveColor(
	name: string,
	cssVars: CSSStyleDeclaration = getComputedStyle(document.documentElement),
): string {
	const cssVal = cssVars.getPropertyValue(name).trim();
	return (
		cssVal || (COLOR_VARS as Record<string, string>)[name] || FALLBACK_COLOR
	);
}
