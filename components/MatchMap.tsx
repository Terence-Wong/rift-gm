"use client";

/**
 * The v2 broadcast centerpiece: a Canvas 2D map view of the spatial match
 * log. Stylized original abstraction built from the design tokens — fog
 * terrain, hairline lanes, tinted river, gold turret pips. Not a copy of
 * any Riot art. 10 role-glyph dots at 30fps is Canvas territory, not SVG.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BARON_PIT,
  BASES,
  DRAGON_PIT,
  LANE_PATHS,
  RIVER_PATH,
  TURRETS,
  type Pt,
} from "@/lib/engine/mapLayout";
import type { SpatialLog } from "@/lib/engine/spatial";
import type { Role } from "@/lib/types";

const ROLE_GLYPH: Record<Role, string> = { TOP: "T", JGL: "J", MID: "M", ADC: "A", SUP: "S" };

/** Token palette, mirrored from globals.css (canvas can't read CSS vars per-frame cheaply). */
const C = {
  void: "#0a0e14",
  fog900: "#131a24",
  fog800: "#1a2430",
  fog700: "#223040",
  gold: "#c8aa6e",
  goldDim: "#7a6a48",
  cyan: "#2dd4bf",
  ember: "#ff4655",
  ink: "#e6e6e6",
  inkMuted: "#8a94a6",
  hairline: "#2a3444",
};

const KILL_FLASH_TICKS = 9; // ~18 in-game seconds of fade for event tags

function tracePath(ctx: CanvasRenderingContext2D, path: Pt[], k: number) {
  ctx.beginPath();
  ctx.moveTo(path[0].x * k, path[0].y * k);
  for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x * k, path[i].y * k);
}

function drawTerrain(ctx: CanvasRenderingContext2D, size: number) {
  const k = size / 100;
  ctx.clearRect(0, 0, size, size);

  // Terrain base with a faint diagonal split between the two jungles.
  ctx.fillStyle = C.fog900;
  ctx.fillRect(0, 0, size, size);
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, "rgba(255,70,85,0.045)");
  grad.addColorStop(0.5, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(45,212,191,0.045)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // River: a soft tinted band along the anti-diagonal.
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  tracePath(ctx, RIVER_PATH, k);
  ctx.strokeStyle = "rgba(45,212,191,0.10)";
  ctx.lineWidth = 7 * k;
  ctx.stroke();
  tracePath(ctx, RIVER_PATH, k);
  ctx.strokeStyle = "rgba(45,212,191,0.14)";
  ctx.lineWidth = 3 * k;
  ctx.stroke();
  ctx.restore();

  // Lanes: hairlines.
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const path of Object.values(LANE_PATHS)) {
    tracePath(ctx, path, k);
    ctx.strokeStyle = C.hairline;
    ctx.lineWidth = 2.6 * k;
    ctx.stroke();
    tracePath(ctx, path, k);
    ctx.strokeStyle = "rgba(230,230,230,0.05)";
    ctx.lineWidth = 1 * k;
    ctx.stroke();
  }
  ctx.restore();

  // Objective pits.
  for (const [pit, label] of [
    [BARON_PIT, "B"],
    [DRAGON_PIT, "D"],
  ] as const) {
    ctx.beginPath();
    ctx.arc(pit.x * k, pit.y * k, 3.6 * k, 0, Math.PI * 2);
    ctx.fillStyle = C.fog700;
    ctx.fill();
    ctx.strokeStyle = C.goldDim;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = C.gold;
    ctx.font = `bold ${3 * k}px var(--font-chakra), sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, pit.x * k, pit.y * k + 0.2 * k);
  }

  // Bases.
  for (const side of ["blue", "red"] as const) {
    const b = BASES[side];
    ctx.save();
    ctx.translate(b.x * k, b.y * k);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = side === "blue" ? "rgba(45,212,191,0.18)" : "rgba(255,70,85,0.18)";
    ctx.strokeStyle = side === "blue" ? C.cyan : C.ember;
    ctx.lineWidth = 1.2;
    const s = 4.4 * k;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.strokeRect(-s / 2, -s / 2, s, s);
    ctx.restore();
  }
}

function drawTurrets(
  ctx: CanvasRenderingContext2D,
  size: number,
  fallenTowers: { x: number; y: number }[],
) {
  const k = size / 100;
  for (const t of TURRETS) {
    const fallen = fallenTowers.some(
      (f) => Math.hypot(f.x - t.pos.x, f.y - t.pos.y) < 5,
    );
    ctx.save();
    ctx.translate(t.pos.x * k, t.pos.y * k);
    ctx.rotate(Math.PI / 4);
    const s = 1.7 * k;
    ctx.fillStyle = fallen ? "rgba(138,148,166,0.25)" : C.gold;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.restore();
  }
}

export function MatchMap({
  log,
  tick,
  userIsBlue,
  className,
}: {
  log: SpatialLog;
  /** Float tick into the log (0 … durationTicks). */
  tick: number;
  userIsBlue: boolean | null;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const terrainRef = useRef<HTMLCanvasElement | null>(null);
  const [cssSize, setCssSize] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);

  // Track element size.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setCssSize(Math.max(0, Math.floor(w)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const frameIndex = Math.max(0, Math.min(log.frames.length - 1, Math.floor(tick)));
  const frame = log.frames[frameIndex];

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const el = canvasRef.current;
      if (!el || !frame) return;
      const rect = el.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * 100;
      const my = ((e.clientY - rect.top) / rect.height) * 100;
      let best: number | null = null;
      let bestD = 6;
      for (let i = 0; i < 10; i++) {
        const d = Math.hypot(frame.x[i] - mx, frame.y[i] - my);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      setHovered(best);
    },
    [frame],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || cssSize === 0 || !frame) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = cssSize * dpr;
    if (canvas.width !== size) {
      canvas.width = size;
      canvas.height = size;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Cached terrain layer.
    if (!terrainRef.current || terrainRef.current.width !== size) {
      const off = document.createElement("canvas");
      off.width = size;
      off.height = size;
      const octx = off.getContext("2d");
      if (octx) drawTerrain(octx, size);
      terrainRef.current = off;
    }
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(terrainRef.current, 0, 0);

    const k = size / 100;
    const fallen = log.tags
      .filter((t) => t.kind === "tower" && t.tick <= tick)
      .map((t) => ({ x: t.x, y: t.y }));
    drawTurrets(ctx, size, fallen);

    // Event flashes (kills + objectives) — brief broadcast tags at location.
    for (const tag of log.tags) {
      const age = tick - tag.tick;
      if (age < 0 || age > KILL_FLASH_TICKS) continue;
      const alpha = 1 - age / KILL_FLASH_TICKS;
      const color = tag.side === "blue" ? C.cyan : C.ember;
      const big = tag.kind !== "kill";
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(tag.x * k, tag.y * k, (big ? 5 : 3.4) * k * (1 + age * 0.06), 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.font = `bold ${2.6 * k}px var(--font-chakra), sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = color;
      ctx.fillText(tag.text, tag.x * k, (tag.y - (big ? 6 : 4.4)) * k);
      ctx.restore();
    }

    // Champions: role-glyph dots.
    for (let i = 0; i < 10; i++) {
      const isBlue = i < 5;
      const x = frame.x[i] * k;
      const y = frame.y[i] * k;
      const dead = frame.state[i] === "dead";
      const color = isBlue ? C.cyan : C.ember;
      const r = 2.5 * k;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = dead ? "rgba(138,148,166,0.35)" : color;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = dead ? C.inkMuted : C.void;
      ctx.stroke();

      // Respawn countdown ring.
      if (dead) {
        const death = [...log.kills]
          .reverse()
          .find((kl) => kl.victim === i && kl.tick <= tick && kl.respawnTick > tick);
        if (death) {
          const frac = (death.respawnTick - tick) / (death.respawnTick - death.tick);
          ctx.beginPath();
          ctx.arc(x, y, r + 1.2 * k, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - frac));
          ctx.strokeStyle = C.gold;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }

      ctx.fillStyle = dead ? C.inkMuted : C.void;
      ctx.font = `bold ${2.4 * k}px var(--font-chakra), sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(ROLE_GLYPH[log.roles[i]], x, y + 0.15 * k);

      // Handle label on hover (mono, broadcast-style).
      if (hovered === i) {
        ctx.font = `${2.6 * k}px var(--font-plex-mono), monospace`;
        const label = log.handles[i];
        const w = ctx.measureText(label).width + 3 * k;
        ctx.fillStyle = "rgba(10,14,20,0.85)";
        ctx.fillRect(x - w / 2, y - 7.2 * k, w, 3.8 * k);
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.7;
        ctx.strokeRect(x - w / 2, y - 7.2 * k, w, 3.8 * k);
        ctx.fillStyle = C.ink;
        ctx.textBaseline = "middle";
        ctx.fillText(label, x, y - 5.3 * k);
      }
    }
  }, [cssSize, frame, frameIndex, hovered, log, tick]);

  const blueLabel = userIsBlue === true ? "your team" : "";
  const redLabel = userIsBlue === false ? "your team" : "";
  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={`Live map. Blue side ${blueLabel} and red side ${redLabel} champions shown as moving dots.`}
      className={`block w-full ${className ?? ""}`}
      style={{ aspectRatio: "1 / 1", touchAction: "none" }}
      onPointerMove={onPointerMove}
      onPointerLeave={() => setHovered(null)}
    />
  );
}
