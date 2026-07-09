/** Stylized angular crest: team short name on its brand color. No real logos. */

export function TeamCrest({
  shortName,
  color,
  size = 36,
}: {
  shortName: string;
  color: string;
  size?: number;
}) {
  return (
    <span
      aria-hidden
      className="hex-clip display inline-flex shrink-0 items-center justify-center font-bold"
      style={{
        width: size,
        height: size,
        background: `color-mix(in srgb, ${color} 16%, var(--rift-void))`,
        border: `1px solid color-mix(in srgb, ${color} 55%, transparent)`,
        color: `color-mix(in srgb, ${color} 55%, white)`,
        fontSize: size * 0.34,
        letterSpacing: "0.02em",
      }}
    >
      {shortName.slice(0, 3)}
    </span>
  );
}
