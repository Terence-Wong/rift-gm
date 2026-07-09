"use client";

export function MatchControls({
  playing,
  speed,
  finished,
  onTogglePlay,
  onCycleSpeed,
  onSkip,
}: {
  playing: boolean;
  speed: number | "instant";
  finished: boolean;
  onTogglePlay: () => void;
  onCycleSpeed: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Match playback controls">
      <button
        onClick={onTogglePlay}
        disabled={finished}
        aria-label={playing ? "Pause" : "Play"}
        className="hex-clip display border border-hairline bg-fog-800 px-4 py-2 text-sm font-bold text-ink enabled:hover:bg-fog-700 disabled:opacity-40"
      >
        {playing ? "❚❚ Pause" : "▶ Play"}
      </button>
      <button
        onClick={onCycleSpeed}
        disabled={finished}
        aria-label={
          speed === "instant"
            ? "Playback speed, currently instant"
            : `Playback speed, currently ${speed} times`
        }
        className="hex-clip num border border-hairline bg-fog-800 px-4 py-2 text-sm text-ink enabled:hover:bg-fog-700 disabled:opacity-40"
      >
        {speed === "instant" ? "»»" : `×${speed}`}
      </button>
      <button
        onClick={onSkip}
        disabled={finished}
        aria-label="Skip to result"
        className="hex-clip display border border-hairline bg-fog-800 px-4 py-2 text-sm font-bold text-gold enabled:hover:bg-fog-700 disabled:opacity-40"
      >
        Skip ⏭
      </button>
    </div>
  );
}
