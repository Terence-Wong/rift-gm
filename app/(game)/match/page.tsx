"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DraftBoard } from "@/components/DraftBoard";
import { GoldDiffGraph } from "@/components/GoldDiffGraph";
import { MatchControls } from "@/components/MatchControls";
import { ScoutingCard } from "@/components/ScoutingCard";
import { TeamCrest } from "@/components/TeamCrest";
import { aiTactics } from "@/lib/engine/ai";
import { fmtGoldDiff } from "@/lib/format";
import { useGameStore, userFixtureThisWeek, userSeries } from "@/lib/store";
import { useReducedMotionPref } from "@/lib/useReducedMotionPref";
import type { MatchResult, Team, TeamTactics } from "@/lib/types";
import { ROLES } from "@/lib/types";

type Stage = "prep" | "live" | "post";

const BASE_SECONDS = 8; // full game draws over ~8s at ×1

export default function MatchPage() {
  const s = useGameStore();
  const router = useRouter();
  const [reducedMotion] = useReducedMotionPref();

  const fixture = userFixtureThisWeek(s);
  const series = userSeries(s);
  const pendingGame =
    s.phase === "REGULAR" ? fixture !== null : s.phase === "PLAYOFFS" ? series !== null && !s.userPlayedThisWeek : false;

  const [stage, setStage] = useState<Stage>(() =>
    s.lastMatch && !s.lastMatch.weekFinished && s.userPlayedThisWeek ? "post" : "prep",
  );
  const [tactics, setTactics] = useState<TeamTactics>(s.pendingTactics);

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

  const seedKey =
    s.phase === "REGULAR" && fixture
      ? `${s.season}-${fixture.id}`
      : series
        ? `${s.season}-${series.id}-g${series.games.length + 1}`
        : "";

  const likelyComp = useMemo(() => {
    if (!opponent || !seedKey) return undefined;
    if ((s.scouting[opponent.id] ?? 0) < 3) return undefined;
    const myTeam = s.teams[s.playerTeamId];
    return aiTactics(opponent, myTeam, s.players, seedKey).archetype;
  }, [opponent, seedKey, s.scouting, s.teams, s.playerTeamId, s.players]);

  const lockIn = () => {
    s.playUserMatch(tactics);
    setStage("live");
  };

  // ── No game to show ─────────────────────────────────────────
  if (stage === "prep" && !pendingGame) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-ink-muted">
          {s.phase === "OFFSEASON"
            ? "It's the offseason — no matches to play. Build the roster in Transfers."
            : s.lastMatch && !s.lastMatch.weekFinished
              ? "This week's game is played. Review it, then advance."
              : "No match to prepare. Advance the week from the dashboard."}
        </p>
        <div className="mt-4 flex justify-center gap-3">
          {s.lastMatch && !s.lastMatch.weekFinished ? (
            <button onClick={() => setStage("post")} className="hex-clip display bg-gold px-5 py-2 text-sm font-bold text-void">
              Review result
            </button>
          ) : null}
          <Link href="/dashboard" className="eyebrow self-center text-cyan hover:underline">
            ← Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (stage === "prep" && opponent) {
    return (
      <div className="flex flex-col gap-4">
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="display text-xl font-bold">
            {series ? `${series.round === "FINAL" ? "Grand final" : "Semifinal"} · Game ${series.games.length + 1}` : `Week ${s.week}`}{" "}
            vs {opponent.name}
          </h1>
          {series ? (
            <span className="num text-sm text-ink-muted">
              Series {series.blueId === s.playerTeamId ? series.blueWins : series.redWins}–
              {series.blueId === s.playerTeamId ? series.redWins : series.blueWins} · elimination
              stakes — clutch matters
            </span>
          ) : null}
          <button onClick={lockIn} className="hex-clip display ml-auto bg-gold px-6 py-2.5 text-sm font-bold text-void hover:brightness-110">
            Lock in &amp; play
          </button>
        </header>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <DraftBoard
              tactics={tactics}
              onChange={setTactics}
              opponent={opponent}
              players={s.players}
              likelyOpponentComp={likelyComp}
            />
          </div>
          <ScoutingCard team={opponent} players={s.players} scoutLevel={s.scouting[opponent.id] ?? 0} />
        </div>
      </div>
    );
  }

  if (!s.lastMatch) {
    return <p className="py-16 text-center text-sm text-ink-muted">No match data. Head back to the dashboard.</p>;
  }

  const { result } = s.lastMatch;
  const blueTeam = s.teams[result.blueTeamId];
  const redTeam = s.teams[result.redTeamId];

  if (stage === "live") {
    return (
      <LiveMatch
        result={result}
        blueTeam={blueTeam}
        redTeam={redTeam}
        label={s.lastMatch.label}
        userTeamId={s.playerTeamId}
        instant={reducedMotion}
        onFinished={() => setStage("post")}
      />
    );
  }

  return (
    <PostMatch
      result={result}
      blueTeam={blueTeam}
      redTeam={redTeam}
      label={s.lastMatch.label}
      userTeamId={s.playerTeamId}
      onContinue={() => {
        if (!s.lastMatch?.weekFinished) s.finishWeek();
        router.push("/dashboard");
      }}
    />
  );
}

/* ── Live view ─────────────────────────────────────────────────── */

function LiveMatch({
  result,
  blueTeam,
  redTeam,
  label,
  userTeamId,
  instant,
  onFinished,
}: {
  result: MatchResult;
  blueTeam: Team;
  redTeam: Team;
  label: string;
  userTeamId: string;
  instant: boolean;
  onFinished: () => void;
}) {
  const duration = result.durationMin;
  const [minute, setMinute] = useState(instant ? duration : 0);
  const [playing, setPlaying] = useState(!instant);
  const [speed, setSpeed] = useState(1);
  const frame = useRef<number | null>(null);
  const last = useRef<number | null>(null);

  const finished = minute >= duration;

  useEffect(() => {
    if (!playing || finished) return;
    const tick = (now: number) => {
      if (last.current === null) last.current = now;
      const dt = (now - last.current) / 1000;
      last.current = now;
      setMinute((m) => Math.min(duration, m + dt * (duration / BASE_SECONDS) * speed));
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      last.current = null;
    };
  }, [playing, speed, duration, finished]);

  const skip = useCallback(() => {
    setMinute(duration);
    setPlaying(false);
  }, [duration]);

  const whole = Math.min(duration, Math.floor(minute));
  const gold = result.goldTimeline[whole];
  const kills = { blue: 0, red: 0 };
  for (const e of result.events) {
    if (e.minute <= minute && (e.type === "KILL" || e.type === "FIRST_BLOOD")) kills[e.team]++;
  }
  const feed = result.events.filter((e) => !e.minor && e.minute <= minute).slice(-24).reverse();

  return (
    <div className="flex flex-col gap-4">
      <p className="eyebrow">{label}</p>

      {/* Scoreboard */}
      <div className="panel flex items-center justify-center gap-4 p-4 md:gap-8">
        <div className="flex items-center gap-3">
          <TeamCrest shortName={blueTeam.shortName} color={blueTeam.color} size={40} />
          <div>
            <p className="display text-lg font-bold text-cyan">
              {blueTeam.shortName}
              {blueTeam.id === userTeamId ? <span className="eyebrow ml-1 align-middle text-gold"> you</span> : null}
            </p>
            <p className="eyebrow">Blue side</p>
          </div>
          <span className="num text-3xl font-bold text-cyan">{kills.blue}</span>
        </div>
        <div className="text-center">
          <p className="num text-sm text-ink-muted">{String(whole).padStart(2, "0")}:00</p>
          <p
            className="num text-xl font-bold"
            style={{ color: gold >= 0 ? "var(--blue-cyan)" : "var(--red-ember)" }}
            aria-live="polite"
          >
            {fmtGoldDiff(gold)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="num text-3xl font-bold text-ember">{kills.red}</span>
          <div className="text-right">
            <p className="display text-lg font-bold text-ember">
              {redTeam.id === userTeamId ? <span className="eyebrow mr-1 align-middle text-gold">you </span> : null}
              {redTeam.shortName}
            </p>
            <p className="eyebrow">Red side</p>
          </div>
          <TeamCrest shortName={redTeam.shortName} color={redTeam.color} size={40} />
        </div>
      </div>

      {/* The hero graph */}
      <div className="panel p-3">
        <GoldDiffGraph
          timeline={result.goldTimeline}
          events={result.events}
          progress={minute / duration}
          blueName={blueTeam.shortName}
          redName={redTeam.shortName}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <MatchControls
          playing={playing}
          speed={speed}
          finished={finished}
          onTogglePlay={() => setPlaying((p) => !p)}
          onCycleSpeed={() => setSpeed((v) => (v === 4 ? 1 : v * 2))}
          onSkip={skip}
        />
        {finished ? (
          <button onClick={onFinished} className="hex-clip display ml-auto bg-gold px-6 py-2.5 text-sm font-bold text-void hover:brightness-110">
            Post-match →
          </button>
        ) : null}
      </div>

      {/* Event feed */}
      <section className="panel max-h-72 overflow-y-auto p-3" aria-label="Match events" aria-live="polite">
        {feed.length === 0 ? (
          <p className="py-4 text-center text-xs text-ink-muted">Laning phase — the map is quiet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            <AnimatePresence initial={false}>
              {feed.map((e) => (
                <motion.li
                  key={`${e.minute}-${e.type}-${e.detail}`}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.18 }}
                  className="flex items-baseline gap-2 text-sm"
                >
                  <span className="num w-8 shrink-0 text-xs text-ink-muted">{e.minute}&apos;</span>
                  <span
                    className="eyebrow w-14 shrink-0"
                    style={{ color: e.team === "blue" ? "var(--blue-cyan)" : "var(--red-ember)" }}
                  >
                    {e.type.replace("_", " ")}
                  </span>
                  <span className={e.type === "THROW" || e.type === "NEXUS" ? "font-semibold" : ""}>{e.detail}</span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>
    </div>
  );
}

/* ── Post-match ────────────────────────────────────────────────── */

function PostMatch({
  result,
  blueTeam,
  redTeam,
  label,
  userTeamId,
  onContinue,
}: {
  result: MatchResult;
  blueTeam: Team;
  redTeam: Team;
  label: string;
  userTeamId: string;
  onContinue: () => void;
}) {
  const players = useGameStore((s) => s.players);
  const winnerTeam = result.winner === "blue" ? blueTeam : redTeam;
  const userWon = winnerTeam.id === userTeamId;
  const mvp = players[result.mvpPlayerId];
  const finalGold = result.goldTimeline[result.goldTimeline.length - 1];
  const throwEvent = result.events.find((e) => e.type === "THROW");

  const lineRows = (team: Team) =>
    ROLES.map((role) => {
      const pid = Object.keys(result.playerLines).find(
        (id) => players[id]?.role === role && team.roster.includes(id),
      );
      const p = pid ? players[pid] : null;
      const line = pid ? result.playerLines[pid] : null;
      return { role, p, line };
    });

  return (
    <div className="flex flex-col gap-4">
      <p className="eyebrow">{label} · Final</p>

      <section
        className="panel p-5 text-center"
        style={{ borderColor: userWon ? "var(--blue-cyan-dim)" : "var(--red-ember-dim)" }}
      >
        <p className="eyebrow" style={{ color: userWon ? "var(--blue-cyan)" : "var(--red-ember)" }}>
          {userWon ? "Victory" : "Defeat"}
        </p>
        <h1 className="display mt-1 text-2xl font-bold">
          {winnerTeam.name} win in <span className="num">{result.durationMin}</span> minutes
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Final gold: <span className="num">{fmtGoldDiff(finalGold)}</span>
          {throwEvent ? ` · a ${throwEvent.minute}-minute throw turned the game` : ""}
          {mvp ? (
            <>
              {" · MVP "}
              <span className="font-semibold text-gold">{mvp.handle}</span>{" "}
              <span className="num">
                ({result.playerLines[mvp.id].k}/{result.playerLines[mvp.id].d}/{result.playerLines[mvp.id].a})
              </span>
            </>
          ) : null}
        </p>
      </section>

      <div className="panel p-3">
        <GoldDiffGraph
          timeline={result.goldTimeline}
          events={result.events}
          progress={1}
          blueName={blueTeam.shortName}
          redName={redTeam.shortName}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[blueTeam, redTeam].map((team) => (
          <section key={team.id} className="panel p-3" aria-label={`${team.name} scoreboard`}>
            <h2 className="eyebrow mb-2 flex items-center gap-2">
              <TeamCrest shortName={team.shortName} color={team.color} size={20} />
              {team.name}
              {(result.winner === "blue" ? blueTeam.id : redTeam.id) === team.id ? (
                <span className="text-gold">— winners</span>
              ) : null}
            </h2>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-hairline text-left">
                  <th className="eyebrow py-1.5 pr-2 font-medium">Player</th>
                  <th className="eyebrow py-1.5 pr-2 text-right font-medium">KDA</th>
                  <th className="eyebrow py-1.5 pr-2 text-right font-medium">CS</th>
                  <th className="eyebrow py-1.5 pr-2 text-right font-medium">DMG</th>
                  <th className="eyebrow py-1.5 text-right font-medium">Rating</th>
                </tr>
              </thead>
              <tbody>
                {lineRows(team).map(({ role, p, line }) => (
                  <tr key={role} className="border-b border-hairline/40">
                    <td className="py-1.5 pr-2">
                      <span className="num mr-1.5 text-xs text-ink-muted">{role}</span>
                      {p ? (
                        <Link href={`/players/${p.id}`} className="hover:text-cyan">
                          {p.handle}
                          {p.id === result.mvpPlayerId ? <span className="ml-1 text-gold">★</span> : null}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="num py-1.5 pr-2 text-right">{line ? `${line.k}/${line.d}/${line.a}` : "—"}</td>
                    <td className="num py-1.5 pr-2 text-right">{line?.cs ?? "—"}</td>
                    <td className="num py-1.5 pr-2 text-right">{line ? `${(line.dmg / 1000).toFixed(1)}k` : "—"}</td>
                    <td className="num py-1.5 text-right" style={{ color: line && line.rating >= 7 ? "var(--hextech-gold)" : undefined }}>
                      {line?.rating.toFixed(2) ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>

      <p className="text-xs text-ink-muted">
        Form, morale, and fatigue updated from these performances. Training gains land when the
        week advances.
      </p>

      <div>
        <button onClick={onContinue} className="hex-clip display bg-gold px-6 py-2.5 text-sm font-bold text-void hover:brightness-110">
          Continue — finish the week
        </button>
      </div>
    </div>
  );
}
