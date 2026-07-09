/**
 * Curated team-color palette + WCAG contrast math. Used by the fictional
 * league generator and the create-a-team pickers. Every entry is validated
 * (in tests) to hit ≥3:1 contrast against --rift-void so crests and accents
 * stay legible on the broadcast background.
 */

export const RIFT_VOID = "#0a0e14";

export interface PaletteColor {
  name: string;
  hex: string;
}

export const TEAM_PALETTE: PaletteColor[] = [
  { name: "Hextech Gold", hex: "#c8aa6e" },
  { name: "Signal Amber", hex: "#e2b714" },
  { name: "Forge Orange", hex: "#f07c28" },
  { name: "Ember Rose", hex: "#ff6b81" },
  { name: "Crimson Banner", hex: "#e2483d" },
  { name: "Arcane Violet", hex: "#a98fff" },
  { name: "Storm Sky", hex: "#58c9f0" },
  { name: "Rift Teal", hex: "#2dd4bf" },
  { name: "Grove Green", hex: "#57d98a" },
  { name: "Citrine", hex: "#f2e14c" },
  { name: "Petal Pink", hex: "#f58fe0" },
  { name: "Glacier Steel", hex: "#c0c8d8" },
];

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two hex colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** True when a color is legible against the void background (≥3:1). */
export function contrastsWithVoid(hex: string): boolean {
  return contrastRatio(hex, RIFT_VOID) >= 3;
}
