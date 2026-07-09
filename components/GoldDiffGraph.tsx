"use client";

/**
 * The signature broadcast element: an animated gold-difference line that
 * fills cyan above zero (blue side) and ember below (red side), with event
 * pips on the timeline. Hand-rolled SVG — `progress` (0–1) controls how
 * much of the game has been drawn; the parent owns the animation clock.
 */

import { useId } from "react";
import type { MatchEvent } from "@/lib/types";

const W = 800;
const H = 240;
const PAD_X = 8;
const PAD_Y = 16;

const EVENT_GLYPH: Partial<Record<MatchEvent["type"], string>> = {
  FIRST_BLOOD: "FB",
  DRAGON: "D",
  HERALD: "H",
  BARON: "B",
  TOWER: "T",
  THROW: "!",
  ACE: "A",
  NEXUS: "N",
};

export function GoldDiffGraph({
  timeline,
  events,
  progress,
  blueName,
  redName,
}: {
  timeline: number[];
  events: MatchEvent[];
  /** 0–1: fraction of the game drawn so far. */
  progress: number;
  blueName: string;
  redName: string;
}) {
  const clipId = useId();
  const duration = timeline.length - 1;
  if (duration <= 0) return null;

  const maxAbs = Math.max(4000, ...timeline.map((v) => Math.abs(v)));
  const xOf = (minute: number) => PAD_X + (minute / duration) * (W - 2 * PAD_X);
  const yOf = (gold: number) =>
    H / 2 - (gold / maxAbs) * (H / 2 - PAD_Y);

  // Visible portion of the line, interpolating the last segment.
  const shownMinutes = progress * duration;
  const whole = Math.floor(shownMinutes);
  const pts: [number, number][] = [];
  for (let t = 0; t <= whole && t <= duration; t++) pts.push([xOf(t), yOf(timeline[t])]);
  if (whole < duration && progress < 1) {
    const frac = shownMinutes - whole;
    const interp = timeline[whole] + (timeline[whole + 1] - timeline[whole]) * frac;
    pts.push([xOf(shownMinutes), yOf(interp)]);
  }
  const lineD = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const lastX = pts[pts.length - 1][0];
  const areaD = `${lineD} L${lastX.toFixed(1)},${H / 2} L${PAD_X},${H / 2} Z`;

  const shownEvents = events.filter((e) => !e.minor && e.minute <= shownMinutes);
  const gridMinutes: number[] = [];
  for (let t = 5; t < duration; t += 5) gridMinutes.push(t);

  const currentGold =
    progress >= 1
      ? timeline[duration]
      : timeline[whole] + (timeline[Math.min(duration, whole + 1)] - timeline[whole]) * (shownMinutes - whole);

  return (
    <figure aria-label={`Gold difference graph, ${blueName} versus ${redName}`} className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full select-none"
        role="img"
        aria-hidden={false}
      >
        <defs>
          <clipPath id={`${clipId}-top`}>
            <rect x="0" y="0" width={W} height={H / 2} />
          </clipPath>
          <clipPath id={`${clipId}-bottom`}>
            <rect x="0" y={H / 2} width={W} height={H / 2} />
          </clipPath>
        </defs>

        {/* Grid */}
        {gridMinutes.map((t) => (
          <g key={t}>
            <line x1={xOf(t)} y1={PAD_Y} x2={xOf(t)} y2={H - PAD_Y} stroke="var(--hairline)" strokeWidth="1" opacity="0.5" />
            <text x={xOf(t)} y={H - 3} textAnchor="middle" fontSize="9" fill="var(--ink-muted)" fontFamily="var(--font-plex-mono)">
              {t}
            </text>
          </g>
        ))}

        {/* Side labels */}
        <text x={PAD_X + 2} y={PAD_Y - 4} fontSize="10" fill="var(--blue-cyan)" fontFamily="var(--font-chakra)">
          {blueName.toUpperCase()} +{(maxAbs / 1000).toFixed(0)}k
        </text>
        <text x={PAD_X + 2} y={H - PAD_Y + 12} fontSize="10" fill="var(--red-ember)" fontFamily="var(--font-chakra)">
          {redName.toUpperCase()} +{(maxAbs / 1000).toFixed(0)}k
        </text>

        {/* Filled areas: cyan above zero, ember below */}
        <path d={areaD} fill="var(--blue-cyan)" opacity="0.18" clipPath={`url(#${clipId}-top)`} />
        <path d={areaD} fill="var(--red-ember)" opacity="0.18" clipPath={`url(#${clipId}-bottom)`} />

        {/* Zero axis */}
        <line x1={PAD_X} y1={H / 2} x2={W - PAD_X} y2={H / 2} stroke="var(--hextech-gold)" strokeWidth="1" opacity="0.55" />

        {/* The line, split-colored via clips */}
        <path d={lineD} fill="none" stroke="var(--blue-cyan)" strokeWidth="2" clipPath={`url(#${clipId}-top)`} />
        <path d={lineD} fill="none" stroke="var(--red-ember)" strokeWidth="2" clipPath={`url(#${clipId}-bottom)`} />

        {/* Playhead */}
        {progress < 1 ? (
          <line x1={lastX} y1={PAD_Y} x2={lastX} y2={H - PAD_Y} stroke="var(--ink)" strokeWidth="1" opacity="0.4" />
        ) : null}

        {/* Event pips */}
        {shownEvents.map((e, i) => {
          const x = xOf(Math.min(e.minute, duration));
          const y = yOf(timeline[Math.min(e.minute, duration)]);
          const color = e.team === "blue" ? "var(--blue-cyan)" : "var(--red-ember)";
          const big = e.type === "BARON" || e.type === "THROW" || e.type === "NEXUS";
          return (
            <g key={`${e.minute}-${e.type}-${i}`}>
              <circle cx={x} cy={y} r={big ? 7 : 5} fill="var(--fog-900)" stroke={color} strokeWidth="1.5" />
              <text x={x} y={y + 2.8} textAnchor="middle" fontSize={big ? 7 : 6} fill={color} fontFamily="var(--font-chakra)" fontWeight="bold">
                {EVENT_GLYPH[e.type] ?? "•"}
              </text>
              <title>{`${e.minute}' — ${e.detail}`}</title>
            </g>
          );
        })}
      </svg>
      <figcaption className="sr-only">
        Current gold difference {Math.round(currentGold)} in favor of{" "}
        {currentGold >= 0 ? blueName : redName}.
      </figcaption>
    </figure>
  );
}
