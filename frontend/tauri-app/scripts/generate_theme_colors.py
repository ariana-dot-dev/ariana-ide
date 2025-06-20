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
# Configuration – base colours expressed in 6-digit sRGB hex
# ---------------------------------------------------------------------------
BASE_COLOURS: Dict[str, str] = {
    "--fg-500": "#1C398E",
    "--bg-500": "#D5D9FF",  # ~ oklch(82.8% 0.111 230.318)
    "--whitest": "#ecfeff",
    "--blackest": "#1e1a4d",
    "--positive-500": "#30D48A",  # green
    "--negative-500": "#D84B32",  # red
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

def build_palette() -> Dict[str, str]:
    palette: Dict[str, str] = BASE_COLOURS.copy()

    # lighter (50–450) and darker (550–950) ramps
    for prefix, base_ref, target_ref, stops in DERIVED_SCALES:
        base = BASE_COLOURS[base_ref]
        target = BASE_COLOURS[target_ref]
        for suffix, delta in stops:
            weight = 1 - delta  # weight = 1 is base, 0 is target
            palette[f"{prefix}-{suffix}"] = mix(base, target, 1 - weight)
    # -------------------------------------------------------------------
    # Generate opacity variants (05–100 in 5 % steps)
    # -------------------------------------------------------------------
    op_steps = list(range(5, 105, 5))  # 5…100
    full_palette = palette.copy()
    for name, hex_value in palette.items():
        r, g, b = hex_to_rgb(hex_value)
        for pct in op_steps:
            alpha = pct / 100.0
            full_palette[f"{name}-{pct:02d}"] = f"rgb({r} {g} {b} / {alpha:.2f})"
    return full_palette


# ---------------------------------------------------------------------------
# Emit files
# ---------------------------------------------------------------------------

def emit_css(palette: Dict[str, str]) -> str:
    lines = [":root {"]
    for name, value in sorted(palette.items()):
        lines.append(f"  {name}: {value};")
    lines.append("}")
    return "\n".join(lines) + "\n"


def emit_ts(palette: Dict[str, str]) -> str:
    lines = ["// Generated – do not edit", "export const COLOR_VARS: Record<string, string> = {"]
    for name, value in sorted(palette.items()):
        lines.append(f"  '{name}': '{value}',")
    lines.append("};\n")
    return "\n".join(lines)


def main() -> None:
    palette = build_palette()
    OUT_CSS.parent.mkdir(parents=True, exist_ok=True)
    OUT_TS.parent.mkdir(parents=True, exist_ok=True)

    OUT_CSS.write_text(emit_css(palette))
    OUT_TS.write_text(emit_ts(palette))
    print(f"wrote {OUT_CSS} and {OUT_TS} – {len(palette)} vars")


if __name__ == "__main__":
    main()
