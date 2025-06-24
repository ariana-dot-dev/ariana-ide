#!/usr/bin/env python3
"""
Generate `colors.css` and `colors.ts` with fully-materialised hexadecimal colour
variables.  This replaces the experimental CSS `mix()` calls that don’t work in
browsers yet.

Usage
-----
python scripts/generate_theme_colors.py

Outputs
-------
1.  src/generated/colors.css – CSS custom properties.
2.  src/generated/colors.ts  – identical values as a TS export.

Both files are overwritten on each run.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Dict, Tuple

# ---------------------------------------------------------------------------
# Configuration – themes with base colours expressed in 6-digit sRGB hex
# ---------------------------------------------------------------------------
THEMES: Dict[str, Dict[str, str]] = {
    "dark-red": {
        "--fg-500": "#b33831",  # blue equivalent
        "--bg-500": "#6e2727",  # ~ oklch(82.8% 0.111 230.318)
        "--whitest": "#45293f",
        "--blackest": "#ffffff",
        "--positive-500": "#1ebc73",  # green
        "--negative-500": "#a24b6f",  # red
        "--border-radius": "8px",
        "--border-thickness": "2px",
    },
    "semi-sky": {
        "--fg-500": "#8fd3ff",  # blue equivalent
        "--bg-500": "#4d9be6",  # ~ oklch(82.8% 0.111 230.318)
        "--whitest": "#2e222f",
        "--blackest": "#ffffff",
        "--positive-500": "#1ebc73",  # green
        "--negative-500": "#e83b3b",  # red
        "--border-radius": "8px",
        "--border-thickness": "2px",
    },
    "light-sand": {
        "--bg-500": "#ab947a",
        "--fg-500": "#c7dcd0",
        "--blackest": "#3e3546",
        "--whitest": "#ffffff",
        "--positive-500": "#1ebc73",  # green
        "--negative-500": "#e83b3b",  # red
        "--border-radius": "8px",
        "--border-thickness": "2px",
    }
}

# Derived ramps to create: (prefix, base, target, stops)
# Stops specify (suffix, weight) where weight is 0→target, 1→base.
DERIVED_SCALES: Tuple[Tuple[str, str, str, Tuple[Tuple[int,float],...]], ...] = (
    (
        "--fg",
        "--fg-500",
        "--whitest",
        ((100, 0.9), (200, 0.7), (300, 0.5), (400, 0.3)),
    ),
    (
        "--bg",
        "--bg-500",
        "--whitest",
        ((100, 0.9), (200, 0.7), (300, 0.5), (400, 0.3)),
    ),
    (
        "--fg",
        "--fg-500",
        "--blackest",
        ((600, 0.1), (700, 0.2), (800, 0.3), (900, 0.4)),
    ),
    (
        "--bg",
        "--bg-500",
        "--blackest",
        ((600, 0.1), (700, 0.2), (800, 0.3), (900, 0.4)),
    ),
)

OUT_CSS = Path("src/generated/colors.css")
OUT_TS = Path("src/generated/colors.ts")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def hex_to_rgb(hex_str: str) -> Tuple[int, int, int]:
    hex_str = hex_str.lstrip("#")
    return tuple(int(hex_str[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore


def rgb_to_hex(rgb: Tuple[int, int, int]) -> str:
    return "#" + "".join(f"{c:02X}" for c in rgb)


def mix(c1: str, c2: str, p: float) -> str:
    """Return sRGB hex mix of *c1*→*c2* by fractional *p* (e.g. 0.05)."""
    r1, g1, b1 = hex_to_rgb(c1)
    r2, g2, b2 = hex_to_rgb(c2)
    mixed = (
        round(r1 + (r2 - r1) * p),
        round(g1 + (g2 - g1) * p),
        round(b1 + (b2 - b1) * p),
    )
    return rgb_to_hex(mixed)


# ---------------------------------------------------------------------------
# Compute palette
# ---------------------------------------------------------------------------

def build_palette(theme_colors: Dict[str, str]) -> Dict[str, str]:
    palette: Dict[str, str] = theme_colors.copy()

    # lighter (50–450) and darker (550–950) ramps
    for prefix, base_ref, target_ref, stops in DERIVED_SCALES:
        base = theme_colors[base_ref]
        target = theme_colors[target_ref]
        for suffix, delta in stops:
            weight = 1 - delta  # weight = 1 is base, 0 is target
            palette[f"{prefix}-{suffix}"] = mix(base, target, 1 - weight)
    
    # -------------------------------------------------------------------
    # Generate opacity variants (05–100 in 5 % steps) only for color vars
    # -------------------------------------------------------------------
    op_steps = list(range(5, 105, 5))  # 5…100
    full_palette = palette.copy()
    for name, hex_value in palette.items():
        # Skip non-color variables like border-radius and border-thickness
        if not hex_value.startswith("#") and not hex_value.startswith("rgb"):
            continue
        r, g, b = hex_to_rgb(hex_value)
        for pct in op_steps:
            alpha = pct / 100.0
            full_palette[f"{name}-{pct:02d}"] = f"rgb({r} {g} {b} / {alpha:.2f})"
    return full_palette


# ---------------------------------------------------------------------------
# Emit files
# ---------------------------------------------------------------------------

def emit_css(themes_palettes: Dict[str, Dict[str, str]]) -> str:
    lines = []
    
    # # Add :root with default theme (dark-red)
    # lines.append(":root {")
    # default_palette = themes_palettes["dark-red"]
    # for name, value in sorted(default_palette.items()):
    #     lines.append(f"  {name}: {value};")
    # lines.append("}")
    # lines.append("")
    
    # Add theme classes
    for theme_name, palette in themes_palettes.items():
        lines.append(f".theme-{theme_name} {{")
        for name, value in sorted(palette.items()):
            lines.append(f"  {name}: {value};")
        lines.append("}")
        lines.append("")
    
    return "\n".join(lines)


def emit_ts(palette: Dict[str, str]) -> str:
    lines = ["// Generated – do not edit", "export const COLOR_VARS: Record<string, string> = {"]
    for name, value in sorted(palette.items()):
        lines.append(f"  '{name}': '{value}',")
    lines.append("};\n")
    return "\n".join(lines)


def main() -> None:
    themes_palettes = {}
    total_vars = 0
    
    for theme_name, theme_colors in THEMES.items():
        palette = build_palette(theme_colors)
        themes_palettes[theme_name] = palette
        total_vars += len(palette)
    
    OUT_CSS.parent.mkdir(parents=True, exist_ok=True)
    OUT_TS.parent.mkdir(parents=True, exist_ok=True)

    OUT_CSS.write_text(emit_css(themes_palettes))
    # For TS, use the default theme palette
    OUT_TS.write_text(emit_ts(themes_palettes["dark-red"]))
    print(f"wrote {OUT_CSS} and {OUT_TS} – {len(THEMES)} themes, {total_vars} total vars")


if __name__ == "__main__":
    main()
