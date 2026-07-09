/**
 * Attribute display: mono value + segmented 20-step bar. Supports exact
 * values (own team), fuzzy ranges (scouted opponents), and locked/unknown
 * (hidden attributes before deep scouting).
 */

const SEGMENTS = 10; // each segment = 2 attribute points

function tone(v: number): string {
  if (v >= 16) return "var(--hextech-gold)";
  if (v >= 12) return "var(--blue-cyan)";
  if (v >= 8) return "var(--ink-muted)";
  return "var(--red-ember)";
}

export function AttributeBar({
  label,
  value,
  range,
  locked,
  modeled,
}: {
  label: string;
  /** Exact value 1–20 (omit when using range/locked). */
  value?: number;
  /** Fuzzy scouted range. */
  range?: { min: number; max: number };
  /** Hidden attribute not yet scouted. */
  locked?: boolean;
  /** Provenance flag — renders an "est." marker. */
  modeled?: boolean;
}) {
  const display = locked
    ? "??"
    : range
      ? `${Math.round(range.min)}–${Math.round(range.max)}`
      : String(Math.round(value ?? 0));
  const fillMid = locked ? 0 : range ? (range.min + range.max) / 2 : (value ?? 0);
  const filled = Math.round((fillMid / 20) * SEGMENTS);
  const color = tone(fillMid);

  return (
    <div className="flex items-center gap-2" role="img" aria-label={`${label}: ${display}`}>
      <span className="eyebrow w-16 shrink-0">{label}</span>
      <span className="num w-10 shrink-0 text-right text-sm" style={{ color: locked ? "var(--ink-muted)" : color }}>
        {display}
      </span>
      <span className="flex h-2 flex-1 gap-px" aria-hidden>
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span
            key={i}
            className="flex-1"
            style={{
              background: locked
                ? "var(--fog-800)"
                : i < filled
                  ? color
                  : "var(--fog-800)",
              opacity: !locked && range && i >= Math.floor((range.min / 20) * SEGMENTS) && i < Math.ceil((range.max / 20) * SEGMENTS) && i >= filled ? 0.35 : 1,
            }}
          />
        ))}
      </span>
      {modeled && !locked ? (
        <span className="eyebrow shrink-0 opacity-60" title="Modeled estimate, not derived from match data">
          est
        </span>
      ) : null}
    </div>
  );
}
