/**
 * Team crests. Real teams get the stylized angular tag badge (no real
 * logos). Created teams get a procedural SVG crest — 3 layers (shape ×
 * glyph × pattern) seeded from the team name via lib/crest.ts.
 */

import { useId } from "react";
import { crestSpecFor } from "@/lib/crest";

export interface CrestTeam {
  shortName: string;
  color: string;
  name?: string;
  custom?: boolean;
  secondaryColor?: string;
}

export function TeamCrest({
  team,
  shortName,
  color,
  size = 36,
}: {
  /** Preferred: pass the team so custom crests render. */
  team?: CrestTeam;
  shortName?: string;
  color?: string;
  size?: number;
}) {
  const tag = team?.shortName ?? shortName ?? "?";
  const primary = team?.color ?? color ?? "#c8aa6e";
  if (team?.custom && team.name) {
    return (
      <ProceduralCrest
        name={team.name}
        primary={primary}
        secondary={team.secondaryColor ?? "#c8aa6e"}
        size={size}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="hex-clip display inline-flex shrink-0 items-center justify-center font-bold"
      style={{
        width: size,
        height: size,
        background: `color-mix(in srgb, ${primary} 16%, var(--rift-void))`,
        border: `1px solid color-mix(in srgb, ${primary} 55%, transparent)`,
        color: `color-mix(in srgb, ${primary} 55%, white)`,
        fontSize: size * 0.34,
        letterSpacing: "0.02em",
      }}
    >
      {tag.slice(0, 3)}
    </span>
  );
}

/* ── Procedural crest layers ──────────────────────────────────── */

const SHAPES: string[] = [
  // 0 shield
  "M24 3 L42 9 V25 C42 36 33 42 24 45 C15 42 6 36 6 25 V9 Z",
  // 1 hexagon
  "M24 3 L41 13 V35 L24 45 L7 35 V13 Z",
  // 2 diamond
  "M24 3 L44 24 L24 45 L4 24 Z",
  // 3 pennant
  "M8 4 H40 V30 L24 45 L8 30 Z",
  // 4 badge (rounded square rotated notch)
  "M10 6 H38 C41 6 42 7 42 10 V34 C42 40 34 44 24 45 C14 44 6 40 6 34 V10 C6 7 7 6 10 6 Z",
];

const GLYPHS: string[] = [
  // 0 star
  "M24 12 L27.5 20.5 L36.5 21 L29.5 27 L31.8 36 L24 31 L16.2 36 L18.5 27 L11.5 21 L20.5 20.5 Z",
  // 1 bolt
  "M27 9 L15 27 H22 L20 39 L33 21 H25.5 Z",
  // 2 blade
  "M24 8 L28 18 L28 33 L24 40 L20 33 L20 18 Z M17 30 H31 V33 H17 Z",
  // 3 wing
  "M12 30 C16 18 30 12 38 13 C33 17 32 21 28 24 C33 24 35 23 38 24 C31 30 20 34 12 30 Z",
  // 4 crown
  "M12 32 L12 20 L19 26 L24 15 L29 26 L36 20 L36 32 Z",
  // 5 fang
  "M16 12 C20 21 21 29 24 38 C27 29 28 21 32 12 C29 16 26 17 24 17 C22 17 19 16 16 12 Z",
  // 6 orb
  "M24 14 A10 10 0 1 0 24 34 A10 10 0 1 0 24 14 Z M24 19 A5 5 0 1 1 24 29 A5 5 0 1 1 24 19 Z",
  // 7 arrow
  "M24 9 L34 24 H28 V38 H20 V24 H14 Z",
];

function PatternLayer({
  pattern,
  color,
  clipId,
}: {
  pattern: number;
  color: string;
  clipId: string;
}) {
  const common = { clipPath: `url(#${clipId})`, fill: "none", stroke: color, opacity: 0.4 };
  switch (pattern) {
    case 1: // stripes
      return (
        <g {...common} strokeWidth={3}>
          {[0, 12, 24, 36, 48].map((o) => (
            <line key={o} x1={o - 12} y1={48} x2={o + 12} y2={0} />
          ))}
        </g>
      );
    case 2: // chevron
      return (
        <g {...common} strokeWidth={2.6}>
          {[14, 24, 34, 44].map((y) => (
            <path key={y} d={`M4 ${y} L24 ${y - 9} L44 ${y}`} />
          ))}
        </g>
      );
    case 3: // dots
      return (
        <g clipPath={`url(#${clipId})`} fill={color} opacity={0.35}>
          {[8, 20, 32, 44].flatMap((y, row) =>
            [8, 20, 32, 44].map((x) => (
              <circle key={`${x}-${y}`} cx={x + (row % 2 === 0 ? 0 : 6)} cy={y} r={1.7} />
            )),
          )}
        </g>
      );
    case 4: // vertical split
      return (
        <rect
          clipPath={`url(#${clipId})`}
          x={24}
          y={0}
          width={24}
          height={48}
          fill={color}
          opacity={0.3}
        />
      );
    default:
      return null;
  }
}

export function ProceduralCrest({
  name,
  primary,
  secondary,
  size = 36,
}: {
  name: string;
  primary: string;
  secondary: string;
  size?: number;
}) {
  const spec = crestSpecFor(name);
  const clipId = useId();
  const shape = SHAPES[spec.shape];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden
      className="inline-block shrink-0"
    >
      <defs>
        <clipPath id={clipId}>
          <path d={shape} />
        </clipPath>
      </defs>
      {/* Layer 1: shape */}
      <path
        d={shape}
        fill={`color-mix(in srgb, ${primary} 26%, var(--rift-void))`}
        stroke={primary}
        strokeWidth={2}
      />
      {/* Layer 2: pattern */}
      <PatternLayer pattern={spec.pattern} color={secondary} clipId={clipId} />
      {/* Layer 3: glyph */}
      <path
        d={GLYPHS[spec.glyph]}
        fill={secondary}
        stroke="rgba(10,14,20,0.55)"
        strokeWidth={0.8}
        clipPath={`url(#${clipId})`}
        fillRule="evenodd"
      />
    </svg>
  );
}
