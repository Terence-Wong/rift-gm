"use client";

import Link from "next/link";
import { useMemo } from "react";
import { InboxList } from "@/components/InboxList";
import { StandingsTable } from "@/components/StandingsTable";
import { TeamCrest } from "@/components/TeamCrest";
import { ordinal } from "@/lib/format";
import {
  standingsOf,
  useGameStore,
  userFixtureThisWeek,
  userSeries,
} from "@/lib/store";

export default function DashboardPage() {
  const s = useGameStore();
  const team = s.teams[s.playerTeamId];
  const standings = useMemo(
    () => standingsOf({ teams: s.teams, fixtures: s.fixtures }),
    [s.teams, s.fixtures],
  );
  const myRank = standings.findIndex((r) => r.teamId === s.playerTeamId) + 1;

  const fixture = userFixtureThisWeek(s);
  const series = userSeries(s);
  const oppId =
    s.phase === "REGULAR" && fixture
      ? fixture.blueId === s.playerTeamId
        ? fixture.redId
        : fixture.blueId
      : series
        ? series.blueId === s.playerTeamId
          ? series.redId
          : series.blueId
        : null;
  const opponent = oppId ? s.teams[oppId] : null;

  if (s.board.fired) {
    return <FiredPanel />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Next match */}
      <section className="panel p-4 lg:col-span-2" aria-labelledby="next-match">
        <h2 id="next-match" className="eyebrow mb-3">
          {s.phase === "REGULAR"
            ? "Next match"
            : s.phase === "PLAYOFFS"
              ? "Playoff series"
              : "Offseason"}
        </h2>
        {s.phase === "OFFSEASON" ? (
          <div className="flex flex-wrap items-center gap-4">
            <p className="flex-1 text-sm text-ink-muted">
              The split is done. The market runs week by week — rumors land, deals close, rivals
              come knocking. Work it, then lock the roster for Season {s.season + 1}.
            </p>
            <button
              onClick={() => s.finishWeek()}
              className="hex-clip display border border-hairline bg-fog-800 px-4 py-2 text-sm font-bold text-ink hover:bg-fog-700"
            >
              Advance market week
            </button>
            <Link href="/transfers" className="hex-clip display bg-gold px-5 py-2.5 text-sm font-bold text-void hover:brightness-110">
              Open transfers
            </Link>
          </div>
        ) : opponent ? (
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3">
              <TeamCrest team={team} size={44} />
              <span className="display text-lg font-bold text-cyan">{team.shortName}</span>
            </div>
            <span className="eyebrow">vs</span>
            <div className="flex items-center gap-3">
              <span className="display text-lg font-bold text-ember">{opponent.shortName}</span>
              <TeamCrest team={opponent} size={44} />
            </div>
            <div className="ml-auto flex flex-col gap-1 text-right">
              {series ? (
                <span className="num text-sm">
                  Series <span className="text-cyan">{series.blueId === s.playerTeamId ? series.blueWins : series.redWins}</span>
                  –<span className="text-ember">{series.blueId === s.playerTeamId ? series.redWins : series.blueWins}</span>
                  <span className="eyebrow ml-2">{series.round === "FINAL" ? "Grand final" : "Semifinal"} · Bo5</span>
                </span>
              ) : (
                <span className="eyebrow">
                  Week {s.week} · scout level {s.scouting[opponent.id] ?? 0}/5
                </span>
              )}
              <div className="flex gap-2">
                <Link href="/match" className="hex-clip display bg-gold px-4 py-2 text-sm font-bold text-void hover:brightness-110">
                  Prepare
                </Link>
                <button
                  onClick={() => s.quickSimWeek()}
                  className="hex-clip display border border-hairline bg-fog-800 px-4 py-2 text-sm font-bold text-ink hover:bg-fog-700"
                >
                  Quick sim
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <p className="flex-1 text-sm text-ink-muted">
              {s.phase === "PLAYOFFS"
                ? "You're out of the bracket. Watch the remaining series play out."
                : "No match this week."}
            </p>
            <button
              onClick={() => s.finishWeek()}
              className="hex-clip display border border-hairline bg-fog-800 px-4 py-2 text-sm font-bold text-ink hover:bg-fog-700"
            >
              Advance week
            </button>
          </div>
        )}
      </section>

      {/* Board */}
      <section className="panel p-4" aria-labelledby="board-head">
        <h2 id="board-head" className="eyebrow mb-3">Board room</h2>
        <p className="text-sm">
          Mandate: <span className="num text-gold">top {s.board.expectedFinish}</span>
          {myRank > 0 && s.phase !== "OFFSEASON" ? (
            <span className="text-ink-muted"> · currently {ordinal(myRank)}</span>
          ) : null}
        </p>
        <div className="mt-3">
          <div className="mb-1 flex justify-between">
            <span className="eyebrow">Confidence</span>
            <span className="num text-xs">{s.board.confidence}/100</span>
          </div>
          <div className="h-2 bg-fog-800" role="progressbar" aria-valuenow={s.board.confidence} aria-valuemin={0} aria-valuemax={100} aria-label="Board confidence">
            <div
              className="h-full"
              style={{
                width: `${s.board.confidence}%`,
                background:
                  s.board.confidence > 55
                    ? "var(--blue-cyan)"
                    : s.board.confidence > 30
                      ? "var(--hextech-gold)"
                      : "var(--red-ember)",
              }}
            />
          </div>
          {s.board.strikes > 0 ? (
            <p className="mt-2 text-xs text-ember">
              {s.board.strikes} strike{s.board.strikes > 1 ? "s" : ""} — miss the mandate again and
              you&apos;re done.
            </p>
          ) : null}
        </div>
      </section>

      {/* Standings snapshot */}
      <section className="panel p-4 lg:col-span-1" aria-labelledby="standings-head">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 id="standings-head" className="eyebrow">Standings</h2>
          <Link href="/league" className="eyebrow text-cyan hover:underline">
            Full table →
          </Link>
        </div>
        <StandingsTable standings={standings} teams={s.teams} highlightId={s.playerTeamId} compact />
      </section>

      {/* Training report — visible deltas every advance */}
      <section className="panel p-4" aria-labelledby="training-recap-head">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 id="training-recap-head" className="eyebrow">Training report</h2>
          <Link href="/training" className="eyebrow text-cyan hover:underline">
            Set focus →
          </Link>
        </div>
        {!s.trainingRecap || s.trainingRecap.entries.length === 0 ? (
          <p className="text-sm text-ink-muted">
            {s.trainingRecap
              ? "No measurable gains this week — veterans at their ceiling move slowly."
              : "Gains land when the week advances. Assign focuses in Training."}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {s.trainingRecap.entries.slice(0, 8).map((e) => (
              <li key={`${e.playerId}-${e.attr}`} className="flex items-baseline gap-2 text-sm">
                <span
                  className="num w-7 shrink-0"
                  style={{ color: "var(--blue-cyan)" }}
                  aria-label={`up ${e.delta.toFixed(2)}`}
                >
                  {e.delta >= 0.12 ? "▲▲" : "▲"}
                </span>
                <Link href={`/players/${e.playerId}`} className="font-semibold hover:text-cyan">
                  {e.handle}
                </Link>
                <span className="text-xs uppercase text-ink-muted">{e.attr}</span>
                <span className="num ml-auto text-xs text-cyan">+{e.delta.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Inbox */}
      <section className="panel p-4" aria-labelledby="inbox-head">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 id="inbox-head" className="eyebrow">Inbox</h2>
          <button onClick={() => s.markInboxRead()} className="eyebrow text-cyan hover:underline">
            Mark all read
          </button>
        </div>
        <InboxList messages={s.inbox} limit={6} />
      </section>
    </div>
  );
}

function FiredPanel() {
  const s = useGameStore();
  const offers = s.jobOffers.map((id) => s.teams[id]).filter(Boolean);
  return (
    <div className="mx-auto max-w-xl">
      <section className="panel border-ember/40 p-6 text-center">
        <p className="eyebrow text-ember">Tenure ended</p>
        <h1 className="display mt-2 text-2xl font-bold">The board has ended your tenure.</h1>
        <p className="mt-3 text-sm text-ink-muted">
          {offers.length > 0
            ? `${offers.length} offer${offers.length > 1 ? "s are" : " is"} on the table. Take one and rebuild, or start over.`
            : "No offers this time. Start a new career."}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          {offers.map((t) => (
            <button
              key={t.id}
              onClick={() => s.acceptJobOffer(t.id)}
              className="panel-raised flex items-center gap-3 p-3 text-left hover:bg-fog-700"
            >
              <TeamCrest team={t} size={34} />
              <span className="flex-1">
                <span className="display block text-sm font-bold">{t.name}</span>
                <span className="eyebrow">Head coach — immediate start</span>
              </span>
            </button>
          ))}
          <Link href="/" onClick={() => s.resetGame()} className="eyebrow mt-2 text-ink-muted hover:text-ink">
            Walk away and start a new career →
          </Link>
        </div>
      </section>
    </div>
  );
}
