"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { use } from "react";
import { AttributeBar } from "@/components/AttributeBar";
import { hiddenVisibleAt, scoutedRange } from "@/lib/engine/scouting";
import { fmtMoney, kdaRatio } from "@/lib/format";
import { useGameStore } from "@/lib/store";
import type { AttributeKey } from "@/lib/types";
import { HIDDEN_ATTRIBUTES, VISIBLE_ATTRIBUTES } from "@/lib/types";

const PlayerRadar = dynamic(
  () => import("@/components/PlayerRadar").then((m) => m.PlayerRadar),
  { ssr: false, loading: () => <div className="h-56 animate-pulse bg-fog-800" /> },
);

const ATTR_LABEL: Record<AttributeKey, string> = {
  laning: "Laning",
  mechanics: "Mechanics",
  macro: "Macro",
  teamfight: "Teamfight",
  aggression: "Aggression",
  consistency: "Consist.",
  clutch: "Clutch",
  potential: "Potential",
};

const METRIC_LABEL: Record<string, string> = {
  games: "Games (real, 2025)",
  csd15: "CSD@15",
  gd15: "GD@15",
  xpd15: "XPD@15",
  dpm: "DPM",
  dmgShare: "DMG share %",
  kda: "KDA",
  kp: "KP %",
  vspm: "Vision/min",
};

export default function PlayerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const player = useGameStore((s) => s.players[id]);
  const teams = useGameStore((s) => s.teams);
  const playerTeamId = useGameStore((s) => s.playerTeamId);
  const scouting = useGameStore((s) => s.scouting);

  if (!player) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-ink-muted">No player with that id. They may have retired to a coaching job.</p>
        <Link href="/squad" className="eyebrow mt-2 inline-block text-cyan hover:underline">← Back to squad</Link>
      </div>
    );
  }

  const team = Object.values(teams).find((t) => t.roster.includes(player.id));
  const isMine = team?.id === playerTeamId;
  const scoutLevel = isMine ? 5 : (team ? (scouting[team.id] ?? 0) : 3);
  const exact = isMine;
  const st = player.seasonStats;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="display text-2xl font-bold">{player.handle}</h1>
        <span className="eyebrow">
          {player.role} · age <span className="num">{player.age}</span> · {player.nationality ?? "—"} ·{" "}
          {player.retired ? "Retired" : team ? team.name : "Free agent"}
        </span>
        <span className="num ml-auto text-2xl font-bold text-cyan">
          {exact ? player.ovr.toFixed(1) : `${Math.max(1, Math.floor(player.ovr - 1))}–${Math.min(20, Math.ceil(player.ovr + 1))}`}
        </span>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="panel p-4" aria-labelledby="attrs-head">
          <h2 id="attrs-head" className="eyebrow mb-3">Attributes {exact ? "" : `· scouted ${scoutLevel}/5`}</h2>
          <div className="flex flex-col gap-2">
            {VISIBLE_ATTRIBUTES.map((key) =>
              exact ? (
                <AttributeBar
                  key={key}
                  label={ATTR_LABEL[key]}
                  value={player.attributes[key]}
                  modeled={player.provenance[key] === "modeled"}
                />
              ) : (
                <AttributeBar
                  key={key}
                  label={ATTR_LABEL[key]}
                  range={scoutedRange(player, key, scoutLevel)}
                  modeled={player.provenance[key] === "modeled"}
                />
              ),
            )}
            <div className="my-1 border-t border-hairline" />
            {HIDDEN_ATTRIBUTES.map((key) => {
              const unlocked = exact || hiddenVisibleAt(scoutLevel);
              return (
                <AttributeBar
                  key={key}
                  label={ATTR_LABEL[key]}
                  range={unlocked ? scoutedRange(player, key, exact ? 4 : scoutLevel) : undefined}
                  locked={!unlocked}
                  modeled={player.provenance[key] === "modeled"}
                />
              );
            })}
          </div>
          <p className="mt-3 text-xs leading-5 text-ink-muted">
            Hidden attributes are never exact — even for your own players, staff give estimate
            ranges. <span className="text-gold">est</span> marks modeled values;{" "}
            unmarked values are derived from real match data.
          </p>
        </section>

        <section className="panel p-4" aria-labelledby="radar-head">
          <h2 id="radar-head" className="eyebrow mb-1">Profile</h2>
          <PlayerRadar attributes={player.attributes} color={isMine ? "var(--blue-cyan)" : "var(--red-ember)"} />
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <span className="text-ink-muted">Contract</span>
            <span className="num text-right">{fmtMoney(player.contract.salary)}/yr × {player.contract.years}y</span>
            <span className="text-ink-muted">Form</span>
            <span className="num text-right" style={{ color: player.form > 0.5 ? "var(--blue-cyan)" : player.form < -0.5 ? "var(--red-ember)" : undefined }}>
              {player.form > 0 ? "+" : ""}{player.form.toFixed(1)}
            </span>
            <span className="text-ink-muted">Fatigue</span>
            <span className="num text-right">{Math.round(player.fatigue)}/100</span>
            <span className="text-ink-muted">Morale</span>
            <span className="num text-right">{Math.round(player.morale)}/100</span>
          </div>
        </section>

        <section className="panel p-4" aria-labelledby="season-head">
          <h2 id="season-head" className="eyebrow mb-3">This season</h2>
          {st.games === 0 ? (
            <p className="text-sm text-ink-muted">No games yet this season.</p>
          ) : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-ink-muted">Record</dt>
              <dd className="num text-right">{st.wins}–{st.games - st.wins}</dd>
              <dt className="text-ink-muted">KDA</dt>
              <dd className="num text-right">
                {st.kills}/{st.deaths}/{st.assists} ({kdaRatio(st.kills, st.deaths, st.assists)})
              </dd>
              <dt className="text-ink-muted">CS/game</dt>
              <dd className="num text-right">{Math.round(st.cs / st.games)}</dd>
              <dt className="text-ink-muted">DMG/game</dt>
              <dd className="num text-right">{(st.damage / st.games / 1000).toFixed(1)}k</dd>
              <dt className="text-ink-muted">Avg rating</dt>
              <dd className="num text-right text-cyan">{(st.ratingSum / st.games).toFixed(2)}</dd>
              <dt className="text-ink-muted">MVPs</dt>
              <dd className="num text-right text-gold">{st.mvps}</dd>
            </dl>
          )}

          {player.rawMetrics ? (
            <>
              <h3 className="eyebrow mb-2 mt-4">Real 2025 metrics (source data)</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {Object.entries(player.rawMetrics).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-ink-muted">{METRIC_LABEL[k] ?? k}</dt>
                    <dd className="num text-right">{v}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}
        </section>
      </div>

      <section className="panel p-4" aria-labelledby="career-head">
        <h2 id="career-head" className="eyebrow mb-3">Career</h2>
        {player.careerHistory.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Career history builds season by season. Finish a season to see development here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-hairline text-left">
                  <th className="eyebrow py-2 pr-3 font-medium">Season</th>
                  <th className="eyebrow py-2 pr-3 font-medium">Team</th>
                  <th className="eyebrow py-2 pr-3 text-right font-medium">Games</th>
                  <th className="eyebrow py-2 pr-3 text-right font-medium">Win%</th>
                  <th className="eyebrow py-2 pr-3 text-right font-medium">KDA</th>
                  <th className="eyebrow py-2 pr-3 text-right font-medium">Rating</th>
                  <th className="eyebrow py-2 pr-3 text-right font-medium">OVR</th>
                  <th className="eyebrow py-2 text-right font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {player.careerHistory.map((rec) => (
                  <tr key={rec.season} className="border-b border-hairline/50">
                    <td className="num py-2 pr-3">S{rec.season}</td>
                    <td className="py-2 pr-3">{rec.teamName}</td>
                    <td className="num py-2 pr-3 text-right">{rec.games}</td>
                    <td className="num py-2 pr-3 text-right">{Math.round((rec.wins / Math.max(1, rec.games)) * 100)}%</td>
                    <td className="num py-2 pr-3 text-right">{rec.kda.toFixed(2)}</td>
                    <td className="num py-2 pr-3 text-right">{rec.avgRating.toFixed(2)}</td>
                    <td className="num py-2 pr-3 text-right text-cyan">{rec.ovrAtEnd.toFixed(1)}</td>
                    <td className="py-2 text-right text-gold">{rec.finish}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
