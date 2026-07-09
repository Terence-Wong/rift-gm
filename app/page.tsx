"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { TeamCrest } from "@/components/TeamCrest";
import { DATA_META, listPlayers, listTeams } from "@/lib/data";
import { useGameStore } from "@/lib/store";
import { ROLES } from "@/lib/types";

export default function NewGamePage() {
  const router = useRouter();
  const hydrated = useGameStore((s) => s._hasHydrated);
  const initialized = useGameStore((s) => s.initialized);
  const activeTeam = useGameStore((s) => s.teams[s.playerTeamId]);
  const activeSeason = useGameStore((s) => s.season);
  const newGame = useGameStore((s) => s.newGame);

  const [selected, setSelected] = useState<string | null>(null);
  const [coachName, setCoachName] = useState("");

  const teams = useMemo(() => {
    const players = new Map(listPlayers().map((p) => [p.id, p]));
    return listTeams()
      .map((t) => {
        const ovr =
          ROLES.reduce((sum, r) => sum + (players.get(t.starters[r])?.ovr ?? 0), 0) / 5;
        return { ...t, avgOvr: ovr };
      })
      .sort((a, b) => b.avgOvr - a.avgOvr);
  }, []);

  const start = () => {
    if (!selected) return;
    newGame(selected, coachName.trim() || "Head Coach");
    router.push("/dashboard");
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-8 px-4 py-10 md:py-16">
      <header>
        <p className="eyebrow text-gold">Rift GM · {DATA_META.seasonLabel}</p>
        <h1 className="display mt-1 text-4xl font-bold text-ink md:text-5xl">
          Take the desk.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-muted">
          Run a pro League of Legends organization: read scouting reports, counter-draft,
          manage form and fatigue, survive the board. Player ratings are{" "}
          {DATA_META.usingSampleData ? "approximate sample data" : "derived from real match data"} —
          check Data &amp; Attribution in Settings.
        </p>
        {DATA_META.usingSampleData ? (
          <p className="mt-2 text-xs text-gold">
            Using sample data — live stats couldn&apos;t be loaded. Attributes are approximate.
          </p>
        ) : null}
      </header>

      {hydrated && initialized && activeTeam ? (
        <section className="panel flex flex-wrap items-center gap-4 p-4">
          <TeamCrest shortName={activeTeam.shortName} color={activeTeam.color} size={40} />
          <div className="min-w-0 flex-1">
            <p className="display text-sm font-bold">Career in progress</p>
            <p className="text-xs text-ink-muted">
              {activeTeam.name} · Season {activeSeason} ·{" "}
              <span className="num">
                {activeTeam.record.wins}–{activeTeam.record.losses}
              </span>
            </p>
          </div>
          <button
            onClick={() => router.push("/dashboard")}
            className="hex-clip display bg-gold px-5 py-2.5 text-sm font-bold text-void hover:brightness-110"
          >
            Continue
          </button>
        </section>
      ) : null}

      <section aria-labelledby="pick-team">
        <h2 id="pick-team" className="eyebrow mb-3">
          Choose your organization — starting a new game overwrites unsaved progress
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((t, i) => (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              aria-pressed={selected === t.id}
              className={`panel flex items-center gap-3 p-3 text-left transition-colors hover:bg-fog-800 ${
                selected === t.id ? "outline-2 outline-cyan" : ""
              }`}
            >
              <TeamCrest shortName={t.shortName} color={t.color} size={38} />
              <span className="min-w-0 flex-1">
                <span className="display block truncate text-sm font-bold">{t.name}</span>
                <span className="eyebrow">Preseason #{i + 1}</span>
              </span>
              <span className="num text-lg font-semibold text-cyan">{t.avgOvr.toFixed(1)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="eyebrow">Coach name</span>
          <input
            value={coachName}
            onChange={(e) => setCoachName(e.target.value)}
            placeholder="Head Coach"
            className="panel num w-56 px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
          />
        </label>
        <button
          onClick={start}
          disabled={!selected}
          className="hex-clip display bg-gold px-6 py-2.5 text-sm font-bold text-void enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {selected
            ? `Start with ${teams.find((t) => t.id === selected)?.shortName}`
            : "Pick a team to start"}
        </button>
      </section>

      <footer className="mt-auto border-t border-hairline pt-4 text-xs leading-5 text-ink-muted">
        This is an unofficial fan project. Not affiliated with or endorsed by Riot Games. Player
        data © their respective sources — Oracle&apos;s Elixir, Leaguepedia (CC BY-SA), Riot Data
        Dragon. See Settings → Data &amp; Attribution.
      </footer>
    </main>
  );
}
