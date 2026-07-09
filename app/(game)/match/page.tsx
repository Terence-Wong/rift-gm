"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DraftBoard } from "@/components/DraftBoard";
import { GoldDiffGraph } from "@/components/GoldDiffGraph";
import { MatchControls } from "@/components/MatchControls";
import { MatchMap } from "@/components/MatchMap";
import { ScoutingCard } from "@/components/ScoutingCard";
import { TeamCrest } from "@/components/TeamCrest";
import { Term } from "@/components/Term";
import { buildMatchIntel } from "@/lib/engine/intel";
import { ARCHETYPES, counterEdge } from "@/lib/engine/tactics";
import { spatialFromInputs, TICKS_PER_MINUTE, type SpatialInputs, type SpatialLog } from "@/lib/engine/spatial";
import { fmtGoldDiff } from "@/lib/format";
import { useGameStore, userFixtureThisWeek, userSeries } from "@/lib/store";
import { useReducedMotionPref } from "@/lib/useReducedMotionPref";
import type { MatchResult, Team, TeamTactics } from "@/lib/types";
import { ROLES } from "@/lib/types";

type Stage = "prep" | "live" | "post";

/** ×1 pacing: ~6 real seconds per game minute → a 35-min game plays in ~3½ min. */
const X1_SECONDS_PER_GAME_MINUTE = 6;
/** "Instant sim": the v1 pace — the whole game draws in ~8 seconds. */
const INSTANT_TOTAL_SECONDS = 8;

type Speed = 1 | 2 | 4 | "instant";

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
  const [instant, setInstant] = useState(false);
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

  const intel = useMemo(() => {
    if (!opponent || !seedKey) return undefined;
    return buildMatchIntel(
      opponent,
      s.teams[s.playerTeamId],
      s.players,
      s.scouting[opponent.id] ?? 0,
      seedKey,
    );
  }, [opponent, seedKey, s.scouting, s.teams, s.playerTeamId, s.players]);

  const lockIn = (playInstant: boolean) => {
    s.tutorialEvent("tactics-locked");
    s.playUserMatch(tactics, true);
    setInstant(playInstant);
    setStage("live");
  };

  // The tutorial's scouting step completes by actually opening the report.
  const tutorialEvent = s.tutorialEvent;
  const prepVisible = stage === "prep" && opponent !== null;
  useEffect(() => {
    if (prepVisible) tutorialEvent("scouting-viewed");
  }, [prepVisible, tutorialEvent]);

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
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => lockIn(true)}
              className="hex-clip display border border-hairline bg-fog-800 px-4 py-2.5 text-sm font-bold text-ink hover:bg-fog-700"
              title="Sim and review the result at the old fast pace"
            >
              Instant sim
            </button>
            <button
              onClick={() => lockIn(false)}
              data-tut="lock-in"
              className="hex-clip display bg-gold px-6 py-2.5 text-sm font-bold text-void hover:brightness-110"
            >
              Lock in &amp; play
            </button>
          </div>
        </header>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <DraftBoard
              tactics={tactics}
              onChange={setTactics}
              opponent={opponent}
              players={s.players}
              likelyOpponentComp={intel?.likelyComp}
              intel={intel}
            />
          </div>
          <div data-tut="scouting">
            <ScoutingCard team={opponent} players={s.players} scoutLevel={s.scouting[opponent.id] ?? 0} />
          </div>
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
        spatial={s.lastMatch.spatial ?? null}
        blueTeam={blueTeam}
        redTeam={redTeam}
        label={s.lastMatch.label}
        userTeamId={s.playerTeamId}
        instant={instant}
        reducedMotion={reducedMotion}
        onFinished={() => {
          s.tutorialEvent("match-finished");
          setStage("post");
        }}
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
      userTactics={s.lastMatch.userTactics}
      oppTactics={s.lastMatch.oppTactics}
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
  spatial,
  blueTeam,
  redTeam,
  label,
  userTeamId,
  instant,
  reducedMotion,
  onFinished,
}: {
  result: MatchResult;
  spatial: SpatialInputs | null;
  blueTeam: Team;
  redTeam: Team;
  label: string;
  userTeamId: string;
  instant: boolean;
  reducedMotion: boolean;
  onFinished: () => void;
}) {
  // Regenerate the position log deterministically from the saved inputs —
  // it is never persisted; the engine is pure, so same seed → same log.
  const log = useMemo(() => (spatial ? spatialFromInputs(spatial).log : null), [spatial]);

  if (reducedMotion) {
    return (
      <SnapshotViewer
        result={result}
        log={log}
        blueTeam={blueTeam}
        redTeam={redTeam}
        label={label}
        userTeamId={userTeamId}
        onFinished={onFinished}
      />
    );
  }
  return (
    <AnimatedMatch
      result={result}
      log={log}
      blueTeam={blueTeam}
      redTeam={redTeam}
      label={label}
      userTeamId={userTeamId}
      instant={instant}
      onFinished={onFinished}
    />
  );
}

function killsUpTo(result: MatchResult, minute: number): { blue: number; red: number } {
  const kills = { blue: 0, red: 0 };
  for (const e of result.events) {
    if (e.minute <= minute && (e.type === "KILL" || e.type === "FIRST_BLOOD")) kills[e.team]++;
  }
  return kills;
}

function AnimatedMatch({
  result,
  log,
  blueTeam,
  redTeam,
  label,
  userTeamId,
  instant,
  onFinished,
}: {
  result: MatchResult;
  log: SpatialLog | null;
  blueTeam: Team;
  redTeam: Team;
  label: string;
  userTeamId: string;
  instant: boolean;
  onFinished: () => void;
}) {
  const duration = result.durationMin;
  const [minute, setMinute] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<Speed>(instant ? "instant" : 1);
  const frame = useRef<number | null>(null);
  const last = useRef<number | null>(null);

  const finished = minute >= duration;

  useEffect(() => {
    if (!playing || finished) return;
    const tick = (now: number) => {
      if (last.current === null) last.current = now;
      const dt = (now - last.current) / 1000;
      last.current = now;
      const gameMinPerSec =
        speed === "instant" ? duration / INSTANT_TOTAL_SECONDS : speed / X1_SECONDS_PER_GAME_MINUTE;
      setMinute((m) => Math.min(duration, m + dt * gameMinPerSec));
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
  const kills = killsUpTo(result, minute);
  const feed = result.events.filter((e) => !e.minor && e.minute <= minute).slice(-14).reverse();
  const tick = minute * TICKS_PER_MINUTE;
  const userIsBlue =
    blueTeam.id === userTeamId ? true : redTeam.id === userTeamId ? false : null;
  const tutorialLive = useGameStore((st) => st.tutorial.active && st.tutorial.step === "MATCH");

  return (
    <div className="flex flex-col gap-3">
      <Scoreboard
        blueTeam={blueTeam}
        redTeam={redTeam}
        userTeamId={userTeamId}
        kills={kills}
        gold={gold}
        clock={`${String(whole).padStart(2, "0")}:${String(Math.floor((minute % 1) * 60)).padStart(2, "0")}`}
        label={label}
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
        {/* Map is the hero; gold graph docked below, scrubbing in sync. */}
        <div className="flex min-w-0 flex-col gap-3">
          {tutorialLive ? <CoachCallout result={result} minute={minute} /> : null}
          {log ? (
            <div className="panel mx-auto w-full max-w-[min(100%,60vh)] p-2" data-tut="map">
              <MatchMap log={log} tick={tick} userIsBlue={userIsBlue} goldTimeline={result.goldTimeline} />
            </div>
          ) : (
            <p className="panel p-4 text-center text-xs text-ink-muted">
              No spatial replay for this game — showing the broadcast graph only.
            </p>
          )}
          <div className="panel p-2" data-tut="gold-graph">
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
              onCycleSpeed={() =>
                setSpeed((v) => (v === "instant" ? 1 : v === 4 ? 1 : ((v * 2) as Speed)))
              }
              onSkip={skip}
            />
            {finished ? (
              <button
                onClick={onFinished}
                className="hex-clip display ml-auto bg-gold px-6 py-2.5 text-sm font-bold text-void hover:brightness-110"
              >
                Post-match →
              </button>
            ) : null}
          </div>
        </div>

        {/* KDA rail. */}
        <div className="flex min-w-0 flex-col gap-3">
          {log ? (
            <KdaRail log={log} tick={tick} blueTeam={blueTeam} redTeam={redTeam} />
          ) : null}
          <section className="panel max-h-56 overflow-y-auto p-2.5" aria-label="Match events" aria-live="polite">
            {feed.length === 0 ? (
              <p className="py-3 text-center text-xs text-ink-muted">Laning phase — the map is quiet.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                <AnimatePresence initial={false}>
                  {feed.map((e) => (
                    <motion.li
                      key={`${e.minute}-${e.type}-${e.detail}`}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.18 }}
                      className="flex items-baseline gap-2 text-xs"
                    >
                      <span className="num w-6 shrink-0 text-[10px] text-ink-muted">{e.minute}&apos;</span>
                      <span
                        className="eyebrow w-12 shrink-0 text-[10px]"
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
      </div>
    </div>
  );
}

/** Tutorial coach lines anchored to what's happening on the map/graph. */
function CoachCallout({ result, minute }: { result: MatchResult; minute: number }) {
  const latest = [...result.events]
    .filter((e) => !e.minor && e.minute <= minute)
    .pop();
  let line =
    "Quiet map means farming lanes. Watch the jungler dots — where they drift is where the first fight happens.";
  if (latest) {
    switch (latest.type) {
      case "FIRST_BLOOD":
        line = "First blood. One kill won't decide it — watch whether they convert the tempo into a tower or a drake.";
        break;
      case "DRAGON":
        line = "That cluster at dragon was a setup — dots converging on a pit before the fight. Watch the gold line if one of those goes wrong.";
        break;
      case "HERALD":
        line = "Herald banked. It gets cashed mid for tower gold — tempo you can see on the graph in about a minute.";
        break;
      case "BARON":
        line = "Baron call. Highest-stakes pit on the map — a steal here swings games. Eyes on the gold line.";
        break;
      case "TOWER":
        line = "Tower down — the map just opened. More room to rotate, more picks available.";
        break;
      case "THROW":
        line = "THAT is a throw. A lead means nothing until the nexus falls — low-consistency teams do this under pressure.";
        break;
      case "ACE":
        line = "An ace — five respawn timers. Nothing on the map can stop whatever comes next.";
        break;
      case "NEXUS":
        line = "And that's the game. Head to the post-match — the ratings tell you who actually showed up.";
        break;
      default:
        line = "Kills flash on the map where they happen. The gold line below is the same story in one number.";
    }
  }
  return (
    <div
      className="panel-raised flex items-baseline gap-2 border-l-2 px-3 py-2 text-sm"
      style={{ borderLeftColor: "var(--hextech-gold)" }}
      aria-live="polite"
    >
      <span className="eyebrow shrink-0 text-gold">Coach</span>
      <span>{line}</span>
    </div>
  );
}

function Scoreboard({
  blueTeam,
  redTeam,
  userTeamId,
  kills,
  gold,
  clock,
  label,
}: {
  blueTeam: Team;
  redTeam: Team;
  userTeamId: string;
  kills: { blue: number; red: number };
  gold: number;
  clock: string;
  label: string;
}) {
  return (
    <div>
      <p className="eyebrow mb-1.5">{label}</p>
      <div className="panel flex items-center justify-center gap-4 px-4 py-2.5 md:gap-8">
        <div className="flex items-center gap-3">
          <TeamCrest team={blueTeam} size={34} />
          <div>
            <p className="display text-base font-bold text-cyan">
              {blueTeam.shortName}
              {blueTeam.id === userTeamId ? <span className="eyebrow ml-1 align-middle text-gold"> you</span> : null}
            </p>
            <p className="eyebrow">Blue side</p>
          </div>
          <span className="num text-2xl font-bold text-cyan">{kills.blue}</span>
        </div>
        <div className="text-center">
          <p className="num text-sm text-ink-muted">{clock}</p>
          <p
            className="num text-lg font-bold"
            style={{ color: gold >= 0 ? "var(--blue-cyan)" : "var(--red-ember)" }}
            aria-live="polite"
          >
            {fmtGoldDiff(gold)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="num text-2xl font-bold text-ember">{kills.red}</span>
          <div className="text-right">
            <p className="display text-base font-bold text-ember">
              {redTeam.id === userTeamId ? <span className="eyebrow mr-1 align-middle text-gold">you </span> : null}
              {redTeam.shortName}
            </p>
            <p className="eyebrow">Red side</p>
          </div>
          <TeamCrest team={redTeam} size={34} />
        </div>
      </div>
    </div>
  );
}

/** Live per-player K/D/A, derived from spatial kill events up to the playhead. */
function KdaRail({
  log,
  tick,
  blueTeam,
  redTeam,
}: {
  log: SpatialLog;
  tick: number;
  blueTeam: Team;
  redTeam: Team;
}) {
  const lines = useMemo(() => {
    const acc = log.unitIds.map(() => ({ k: 0, d: 0, a: 0 }));
    for (const kill of log.kills) {
      if (kill.tick > tick) continue;
      acc[kill.killer].k++;
      acc[kill.victim].d++;
      for (const a of kill.assists) acc[a].a++;
    }
    return acc;
  }, [log, tick]);
  const frame = log.frames[Math.max(0, Math.min(log.frames.length - 1, Math.floor(tick)))];

  const rows = (offset: number, team: Team, color: string) => (
    <div>
      <p className="eyebrow mb-1" style={{ color }}>
        {team.shortName}
      </p>
      <table className="w-full border-collapse text-xs">
        <tbody>
          {[0, 1, 2, 3, 4].map((i) => {
            const idx = offset + i;
            const dead = frame?.state[idx] === "dead";
            return (
              <tr key={idx} className="border-b border-hairline/30">
                <td className="num w-8 py-1 text-[10px] text-ink-muted">{log.roles[idx]}</td>
                <td className={`py-1 pr-1 ${dead ? "text-ink-muted line-through" : ""}`}>
                  {log.handles[idx]}
                </td>
                <td className="num py-1 text-right">
                  {lines[idx].k}/{lines[idx].d}/{lines[idx].a}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <section className="panel flex flex-col gap-3 p-2.5" aria-label="Live scoreboard">
      {rows(0, blueTeam, "var(--blue-cyan)")}
      {rows(5, redTeam, "var(--red-ember)")}
    </section>
  );
}

/* ── Reduced motion: key-moment snapshots with a stepper ───────── */

function SnapshotViewer({
  result,
  log,
  blueTeam,
  redTeam,
  label,
  userTeamId,
  onFinished,
}: {
  result: MatchResult;
  log: SpatialLog | null;
  blueTeam: Team;
  redTeam: Team;
  label: string;
  userTeamId: string;
  onFinished: () => void;
}) {
  const moments = useMemo(() => result.events.filter((e) => !e.minor), [result]);
  const [index, setIndex] = useState(0);
  const e = moments[Math.min(index, moments.length - 1)];
  const minute = e?.minute ?? result.durationMin;
  const tick = Math.max(0, minute * TICKS_PER_MINUTE - 8);
  const kills = killsUpTo(result, minute);
  const atEnd = index >= moments.length - 1;
  const userIsBlue =
    blueTeam.id === userTeamId ? true : redTeam.id === userTeamId ? false : null;

  return (
    <div className="flex flex-col gap-3">
      <Scoreboard
        blueTeam={blueTeam}
        redTeam={redTeam}
        userTeamId={userTeamId}
        kills={kills}
        gold={result.goldTimeline[Math.min(minute, result.durationMin)]}
        clock={`${String(minute).padStart(2, "0")}:00`}
        label={`${label} · reduced motion`}
      />
      {log ? (
        <div className="panel mx-auto w-full max-w-[min(100%,60vh)] p-2">
          <MatchMap log={log} tick={tick} userIsBlue={userIsBlue} goldTimeline={result.goldTimeline} />
        </div>
      ) : null}
      <div className="panel p-2">
        <GoldDiffGraph
          timeline={result.goldTimeline}
          events={result.events}
          progress={minute / result.durationMin}
          blueName={blueTeam.shortName}
          redName={redTeam.shortName}
        />
      </div>
      <div className="panel flex items-center gap-3 p-3" aria-live="polite">
        <span className="num w-10 shrink-0 text-sm text-ink-muted">{e?.minute}&apos;</span>
        <span className="text-sm">{e?.detail}</span>
        <span className="eyebrow ml-auto shrink-0">
          {index + 1}/{moments.length}
        </span>
      </div>
      <div className="flex items-center gap-2" role="group" aria-label="Key moment stepper">
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="hex-clip display border border-hairline bg-fog-800 px-4 py-2 text-sm font-bold enabled:hover:bg-fog-700 disabled:opacity-40"
        >
          ← Previous
        </button>
        <button
          onClick={() => setIndex((i) => Math.min(moments.length - 1, i + 1))}
          disabled={atEnd}
          className="hex-clip display border border-hairline bg-fog-800 px-4 py-2 text-sm font-bold enabled:hover:bg-fog-700 disabled:opacity-40"
        >
          Next event →
        </button>
        {atEnd ? (
          <button
            onClick={onFinished}
            className="hex-clip display ml-auto bg-gold px-6 py-2.5 text-sm font-bold text-void hover:brightness-110"
          >
            Post-match →
          </button>
        ) : null}
      </div>
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
  userTactics,
  oppTactics,
  onContinue,
}: {
  result: MatchResult;
  blueTeam: Team;
  redTeam: Team;
  label: string;
  userTeamId: string;
  userTactics?: TeamTactics;
  oppTactics?: TeamTactics;
  onContinue: () => void;
}) {
  const players = useGameStore((s) => s.players);
  const winnerTeam = result.winner === "blue" ? blueTeam : redTeam;
  const userWon = winnerTeam.id === userTeamId;
  const mvp = players[result.mvpPlayerId];
  const finalGold = result.goldTimeline[result.goldTimeline.length - 1];
  const throwEvent = result.events.find((e) => e.type === "THROW");

  // Prep report: attribute the pre-match decisions so scouting and drafting
  // visibly paid off (or didn't).
  const prepLines: { text: string; good: boolean | null }[] = [];
  if (userTactics && oppTactics) {
    const edge = counterEdge(userTactics.archetype, oppTactics.archetype);
    const oppLabel = ARCHETYPES[oppTactics.archetype].label;
    const mineLabel = ARCHETYPES[userTactics.archetype].label;
    prepLines.push(
      edge > 0
        ? { text: `They ran ${oppLabel} — your ${mineLabel} countered it, an edge in every phase.`, good: true }
        : edge < 0
          ? { text: `They ran ${oppLabel} and it countered your ${mineLabel}. That draft cost you all game.`, good: false }
          : { text: `They ran ${oppLabel} into your ${mineLabel} — an even comp matchup.`, good: null },
    );
    if (userTactics.targetBan) {
      const banned = players[userTactics.targetBan];
      const line = banned ? result.playerLines[banned.id] : null;
      if (banned && line) {
        prepLines.push({
          text: `Your target ban forced ${banned.handle} off his pool — he played ~10% under his level and went ${line.k}/${line.d}/${line.a}.`,
          good: line.rating < 6,
        });
      }
    }
    if (oppTactics.targetBan) {
      const banned = players[oppTactics.targetBan];
      if (banned) {
        prepLines.push({ text: `They target-banned ${banned.handle} in return.`, good: null });
      }
    }
  }

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

      {prepLines.length > 0 ? (
        <section
          className="panel-raised border-l-2 p-3"
          style={{ borderLeftColor: "var(--hextech-gold)" }}
          aria-labelledby="prep-report-head"
        >
          <h2 id="prep-report-head" className="eyebrow mb-1 text-gold">Prep report — did the homework pay?</h2>
          <ul className="flex flex-col gap-0.5 text-sm leading-6">
            {prepLines.map((l) => (
              <li key={l.text} style={{ color: l.good === true ? "var(--blue-cyan)" : l.good === false ? "var(--red-ember)" : undefined }}>
                {l.text}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
              <TeamCrest team={team} size={20} />
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
                  <th className="eyebrow py-1.5 text-right font-medium">
                    <Term k="rating">Rating</Term>
                  </th>
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
