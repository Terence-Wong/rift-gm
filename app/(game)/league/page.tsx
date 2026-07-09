"use client";

import Link from "next/link";
import { useMemo } from "react";
import { StandingsTable } from "@/components/StandingsTable";
import { kdaRatio } from "@/lib/format";
import { standingsOf, useGameStore } from "@/lib/store";
import type { Player } from "@/lib/types";

interface LeaderSpec {
  label: string;
  value: (p: Player) => number;
  format: (p: Player) => string;
}

const LEADERS: LeaderSpec[] = [
  {
    label: "KDA",
    value: (p) =>
      (p.seasonStats.kills + p.seasonStats.assists) / Math.max(1, p.seasonStats.deaths),
    format: (p) => kdaRatio(p.seasonStats.kills, p.seasonStats.deaths, p.seasonStats.assists),
  },
  {
    label: "Damage / game",
    value: (p) => p.seasonStats.damage / Math.max(1, p.seasonStats.games),
    format: (p) => `${(p.seasonStats.damage / Math.max(1, p.seasonStats.games) / 1000).toFixed(1)}k`,
  },
  {
    label: "Kills",
    value: (p) => p.seasonStats.kills,
    format: (p) => String(p.seasonStats.kills),
  },
  {
    label: "Avg rating",
    value: (p) => p.seasonStats.ratingSum / Math.max(1, p.seasonStats.games),
    format: (p) => (p.seasonStats.ratingSum / Math.max(1, p.seasonStats.games)).toFixed(2),
  },
  {
    label: "MVPs",
    value: (p) => p.seasonStats.mvps,
    format: (p) => String(p.seasonStats.mvps),
  },
];

export default function LeaguePage() {
  const s = useGameStore();
  const standings = useMemo(
    () => standingsOf({ teams: s.teams, fixtures: s.fixtures }),
    [s.teams, s.fixtures],
  );

  const qualified = useMemo(
    () => Object.values(s.players).filter((p) => p.seasonStats.games >= 3),
    [s.players],
  );

  const teamOf = (p: Player) => Object.values(s.teams).find((t) => t.roster.includes(p.id));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="panel p-4" aria-labelledby="league-standings">
        <h2 id="league-standings" className="eyebrow mb-2">
          {`Season ${s.season} standings — top 4 make playoffs`}
        </h2>
        <StandingsTable standings={standings} teams={s.teams} highlightId={s.playerTeamId} />
      </section>

      <section className="panel p-4" aria-labelledby="stat-leaders">
        <h2 id="stat-leaders" className="eyebrow mb-2">Stat leaders (min 3 games)</h2>
        {qualified.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">
            No qualified players yet. Leaders appear after week 3.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {LEADERS.map((spec) => {
              const top = [...qualified].sort((a, b) => spec.value(b) - spec.value(a)).slice(0, 3);
              return (
                <div key={spec.label}>
                  <h3 className="eyebrow mb-1 text-gold">{spec.label}</h3>
                  <ol className="flex flex-col gap-0.5">
                    {top.map((p, i) => (
                      <li key={p.id} className="flex items-baseline gap-2 text-sm">
                        <span className="num w-4 text-ink-muted">{i + 1}</span>
                        <Link href={`/players/${p.id}`} className="hover:text-cyan">
                          {p.handle}
                        </Link>
                        <span className="eyebrow">{teamOf(p)?.shortName ?? "FA"}</span>
                        <span className="num ml-auto">{spec.format(p)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {s.powerRankings.length > 0 ? (
        <section className="panel p-4 lg:col-span-2" aria-labelledby="power-head">
          <h2 id="power-head" className="eyebrow mb-2">Power rankings — the analyst desk</h2>
          <ol className="grid grid-cols-1 gap-x-6 gap-y-1.5 md:grid-cols-2">
            {s.powerRankings.map((entry) => {
              const team = s.teams[entry.teamId];
              if (!team) return null;
              const moved = entry.prevRank === null ? 0 : entry.prevRank - entry.rank;
              return (
                <li key={entry.teamId} className="flex items-baseline gap-2 text-sm">
                  <span className="num w-6 shrink-0 text-right font-semibold text-gold">{entry.rank}</span>
                  <span
                    className="num w-7 shrink-0 text-xs"
                    aria-label={moved > 0 ? `up ${moved}` : moved < 0 ? `down ${-moved}` : "steady"}
                    style={{ color: moved > 0 ? "var(--blue-cyan)" : moved < 0 ? "var(--red-ember)" : "var(--ink-muted)" }}
                  >
                    {moved > 0 ? `▲${moved}` : moved < 0 ? `▼${-moved}` : "—"}
                  </span>
                  <span className={`display shrink-0 text-sm font-bold ${entry.teamId === s.playerTeamId ? "text-cyan" : ""}`}>
                    {team.shortName}
                  </span>
                  <span className="min-w-0 truncate text-xs text-ink-muted">{entry.blurb}</span>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      {s.playoffs.length > 0 ? (
        <section className="panel p-4 lg:col-span-2" aria-labelledby="bracket-head">
          <h2 id="bracket-head" className="eyebrow mb-3">Playoff bracket — best of 5</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {s.playoffs.map((series) => {
              const blue = s.teams[series.blueId];
              const red = s.teams[series.redId];
              return (
                <div key={series.id} className="panel-raised p-3">
                  <p className="eyebrow mb-2">{series.round === "FINAL" ? "Grand final" : "Semifinal"}</p>
                  <div className="flex items-center justify-between text-sm">
                    <span className={series.winnerId === series.blueId ? "font-bold text-gold" : ""}>{blue.name}</span>
                    <span className="num font-semibold text-cyan">{series.blueWins}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-sm">
                    <span className={series.winnerId === series.redId ? "font-bold text-gold" : ""}>{red.name}</span>
                    <span className="num font-semibold text-ember">{series.redWins}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {s.history.some((h) => h.awards) ? (
        <section className="panel p-4 lg:col-span-2" aria-labelledby="hof-head">
          <h2 id="hof-head" className="eyebrow mb-3">Hall of fame — season awards</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[...s.history]
              .filter((h) => h.awards)
              .reverse()
              .map((h) => (
                <div key={h.season} className="panel-raised p-3">
                  <p className="eyebrow mb-1.5">
                    Season {h.season} · <span className="text-gold">{h.champion}</span>
                  </p>
                  <p className="text-sm">
                    <span className="text-ink-muted">MVP </span>
                    <span className="font-semibold text-gold">{h.awards!.mvpHandle}</span>
                    {h.awards!.rookieHandle ? (
                      <>
                        <span className="text-ink-muted"> · Rookie </span>
                        <span className="font-semibold text-cyan">{h.awards!.rookieHandle}</span>
                      </>
                    ) : null}
                  </p>
                  <p className="mt-1.5 text-xs leading-5 text-ink-muted">
                    <span className="eyebrow">All-Pro </span>
                    {h.awards!.allPro.map((a) => `${a.role} ${a.handle}`).join(" · ")}
                  </p>
                </div>
              ))}
          </div>
        </section>
      ) : null}

      {s.history.length > 0 ? (
        <section className="panel p-4 lg:col-span-2" aria-labelledby="history-head">
          <h2 id="history-head" className="eyebrow mb-2">League history</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-hairline text-left">
                  <th className="eyebrow py-2 pr-3 font-medium">Season</th>
                  <th className="eyebrow py-2 pr-3 font-medium">Champion</th>
                  <th className="eyebrow py-2 pr-3 font-medium">Runner-up</th>
                  <th className="eyebrow py-2 pr-3 font-medium">MVP</th>
                  <th className="eyebrow py-2 font-medium">Your finish</th>
                </tr>
              </thead>
              <tbody>
                {s.history.map((h) => (
                  <tr key={h.season} className="border-b border-hairline/50">
                    <td className="num py-2 pr-3">S{h.season}</td>
                    <td className="py-2 pr-3 text-gold">{h.champion}</td>
                    <td className="py-2 pr-3">{h.runnerUp}</td>
                    <td className="py-2 pr-3">{h.mvpHandle}</td>
                    <td className="py-2">
                      {h.playerTeamFinish} (<span className="num">{h.playerTeamRecord}</span>)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
