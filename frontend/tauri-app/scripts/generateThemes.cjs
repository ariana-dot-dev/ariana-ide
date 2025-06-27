#!/usr/bin/env node
/**
 * Generate `colors.css` and `colors.ts` with fully-materialised hexadecimal colour
 * variables. This replaces the experimental CSS `mix()` calls that don't work in
 * browsers yet.
 * 
 * Usage
 * -----
 * node scripts/generate-theme-colors.js
 * 
 * Outputs
 * -------
 * 1. src/generated/colors.css – CSS custom properties.
 * 2. src/generated/colors.ts  – identical values as a TS export.
 * 
 * Both files are overwritten on each run.
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Configuration – themes with base colours expressed in 6-digit sRGB hex
// ---------------------------------------------------------------------------
const THEMES = {
    "dark-red": {
        "--acc-500": "#b33831",  // blue equivalent
        "--base-500": "#6e2727",  // ~ oklch(82.8% 0.111 230.318)
        "--whitest": "#45293f",
        "--blackest": "#ffffff",
        "--positive-500": "#1ebc73",  // green
        "--negative-500": "#a24b6f",  // red
        "--border-radius": "8px",
        "--border-thickness": "2px",
    },
    "semi-sky": {
        "--acc-500": "#0099db",  // blue equivalent
        "--base-500": "#0099db",  // ~ oklch(82.8% 0.111 230.318)
        "--whitest": "#ffffff",
        "--blackest": "#181425",
        "--positive-500": "#1ebc73",  // green
        "--negative-500": "#a24b6f",  // red
        "--border-radius": "8px",
        "--border-thickness": "2px",
    },
    "semi-sun": {
        "--acc-500": "#feae34",  // blue equivalent
        "--base-500": "#f77622",  // ~ oklch(82.8% 0.111 230.318)
        "--blackest": "#ead4aa",
        "--whitest": "#3e2731",
        "--positive-500": "#38b764",  // green
        "--negative-500": "#b13e53",  // red
        "--border-radius": "8px",
        "--border-thickness": "2px",
    },
    "light": {
        "--acc-500": "#ff4f69",
        "--base-500": "#8b8396",
        "--whitest": "#fff7f8",
        "--blackest": "#2b0f54",
        "--positive-500": "#1ebc73",  // green
        "--negative-500": "#a24b6f",  // red
        "--border-radius": "8px",
        "--border-thickness": "2px",
    },
    "light-sand": {
        "--acc-500": "#b8926f",
        "--base-500": "#968a81",
        "--whitest": "#ffffff",
        "--blackest": "#000000",
        "--positive-500": "#1ebc73",  // green
        "--negative-500": "#a24b6f",  // red
        "--border-radius": "8px",
        "--border-thickness": "2px",
    },
};

// Derived ramps to create: [prefix, base, target, stops]
// Stops specify [suffix, weight] where weight is 0→target, 1→base.
const DERIVED_SCALES = [
    [
        "--acc",
        "--acc-500",
        "--whitest",
        [[100, 0.9], [200, 0.7], [300, 0.5], [400, 0.3]],
    ],
    [
        "--base",
        "--base-500",
        "--whitest",
        [[100, 0.9], [200, 0.7], [300, 0.5], [400, 0.3]],
    ],
    [
        "--acc",
        "--acc-500",
        "--blackest",
        [[600, 0.1], [700, 0.2], [800, 0.3], [900, 0.4]],
    ],
    [
        "--base",
        "--base-500",
        "--blackest",
        [[600, 0.1], [700, 0.2], [800, 0.3], [900, 0.4]],
    ],
];

const OUT_CSS = path.join("src", "generated", "colors.css");
const OUT_TS = path.join("src", "generated", "colors.ts");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hexToRgb(hexStr) {
    const hex = hexStr.replace('#', '');
    return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16)
    ];
}

function rgbToHex(rgb) {
    return "#" + rgb.map(c => c.toString(16).padStart(2, '0').toUpperCase()).join('');
}

function mix(c1, c2, p) {
    /**
     * Return sRGB hex mix of c1→c2 by fractional p (e.g. 0.05).
     */
    const [r1, g1, b1] = hexToRgb(c1);
    const [r2, g2, b2] = hexToRgb(c2);
    const mixed = [
        Math.round(r1 + (r2 - r1) * p),
        Math.round(g1 + (g2 - g1) * p),
        Math.round(b1 + (b2 - b1) * p),
    ];
    return rgbToHex(mixed);
}

// ---------------------------------------------------------------------------
// Compute palette
// ---------------------------------------------------------------------------

function buildPalette(themeColors) {
    const palette = { ...themeColors };

    // lighter (50–450) and darker (550–950) ramps
    for (const [prefix, baseRef, targetRef, stops] of DERIVED_SCALES) {
        const base = themeColors[baseRef];
        const target = themeColors[targetRef];
        for (const [suffix, delta] of stops) {
            const weight = 1 - delta;  // weight = 1 is base, 0 is target
            palette[`${prefix}-${suffix}`] = mix(base, target, 1 - weight);
        }
    }
    
    // -------------------------------------------------------------------
    // Generate opacity variants (05–100 in 5% steps) only for color vars
    // -------------------------------------------------------------------
    const opSteps = Array.from({ length: 20 }, (_, i) => (i + 1) * 5); // 5…100
    const fullPalette = { ...palette };
    
    for (const [name, hexValue] of Object.entries(palette)) {
        // Skip non-color variables like border-radius and border-thickness
        if (!hexValue.startsWith("#") && !hexValue.startsWith("rgb")) {
            continue;
        }
        const [r, g, b] = hexToRgb(hexValue);
        for (const pct of opSteps) {
            const alpha = (pct / 100.0).toFixed(2);
            fullPalette[`${name}-${pct.toString().padStart(2, '0')}`] = `rgb(${r} ${g} ${b} / ${alpha})`;
        }
    }
    
    return fullPalette;
}

// ---------------------------------------------------------------------------
// Emit files
// ---------------------------------------------------------------------------

function emitCss(themesPalettes) {
    const lines = [];
    
    // Add theme classes
    for (const [themeName, palette] of Object.entries(themesPalettes)) {
        lines.push(`.theme-${themeName} {`);
        const sortedEntries = Object.entries(palette).sort(([a], [b]) => a.localeCompare(b));
        for (const [name, value] of sortedEntries) {
            lines.push(`  ${name}: ${value};`);
        }
        lines.push('}');
        lines.push('');
    }
    
    return lines.join('\n');
}

function emitTs(palette) {
    const lines = [
        '// Generated – do not edit',
        'export const COLOR_VARS: Record<string, string> = {'
    ];
    
    const sortedEntries = Object.entries(palette).sort(([a], [b]) => a.localeCompare(b));
    for (const [name, value] of sortedEntries) {
        lines.push(`  '${name}': '${value}',`);
    }
    
    lines.push('};');
    lines.push('');
    
    return lines.join('\n');
}

function main() {
    const themesPalettes = {};
    let totalVars = 0;
    
    for (const [themeName, themeColors] of Object.entries(THEMES)) {
        const palette = buildPalette(themeColors);
        themesPalettes[themeName] = palette;
        totalVars += Object.keys(palette).length;
    }
    
    // Ensure output directories exist
    fs.mkdirSync(path.dirname(OUT_CSS), { recursive: true });
    fs.mkdirSync(path.dirname(OUT_TS), { recursive: true });

    fs.writeFileSync(OUT_CSS, emitCss(themesPalettes));
    // For TS, use the default theme palette
    fs.writeFileSync(OUT_TS, emitTs(themesPalettes["dark-red"]));
    
    console.log(`wrote ${OUT_CSS} and ${OUT_TS} – ${Object.keys(THEMES).length} themes, ${totalVars} total vars`);
}

if (require.main === module) {
    main();
}