"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ProceduralCrest, TeamCrest } from "@/components/TeamCrest";
import { DATA_META, listPlayers, listTeams } from "@/lib/data";
import { generateLeague, teamAvgOvr } from "@/lib/engine/generate";
import { hashSeed } from "@/lib/engine/rng";
import { TEAM_PALETTE } from "@/lib/palette";
import {
  DIFFICULTY_INFO,
  useGameStore,
  type CreateTeamConfig,
  type DataMode,
  type Difficulty,
  type RosterMode,
} from "@/lib/store";
import { ROLES, type Team } from "@/lib/types";

type TeamChoice = { kind: "pick"; teamId: string } | { kind: "create" };

const STEPS = ["World", "Team", "Difficulty", "Coach"] as const;

const REGION_CHOICES = ["LCK", "INTL", "RIFT"];

export default function NewGamePage() {
  const router = useRouter();
  const hydrated = useGameStore((s) => s._hasHydrated);
  const initialized = useGameStore((s) => s.initialized);
  const activeTeam = useGameStore((s) => s.teams[s.playerTeamId]);
  const activeSeason = useGameStore((s) => s.season);
  const newGame = useGameStore((s) => s.newGame);

  const [step, setStep] = useState(0);
  const [dataMode, setDataMode] = useState<DataMode>("real");
  const [seedText, setSeedText] = useState(() => String(Math.floor(Math.random() * 1e9)));
  const [choice, setChoice] = useState<TeamChoice | null>(null);
  const [create, setCreate] = useState<CreateTeamConfig>({
    name: "",
    tag: "",
    region: "RIFT",
    primaryColor: TEAM_PALETTE[6].hex,
    secondaryColor: TEAM_PALETTE[0].hex,
    rosterMode: "draft",
  });
  const [difficulty, setDifficulty] = useState<Difficulty>("standard");
  const [coachName, setCoachName] = useState("");
  const [tutorial, setTutorial] = useState(true);

  const worldSeed = useMemo(() => {
    const n = Number(seedText.trim());
    return Number.isFinite(n) && seedText.trim() !== "" ? Math.abs(Math.floor(n)) : hashSeed(seedText);
  }, [seedText]);

  /** Teams offered on the pick grid, per data mode. */
  const pickableTeams = useMemo(() => {
    if (dataMode === "real") {
      const players = new Map(listPlayers().map((p) => [p.id, p]));
      return listTeams()
        .map((t) => ({
          ...t,
          avgOvr: ROLES.reduce((sum, r) => sum + (players.get(t.starters[r])?.ovr ?? 0), 0) / 5,
        }))
        .sort((a, b) => b.avgOvr - a.avgOvr);
    }
    const league = generateLeague(worldSeed, listPlayers().map((p) => p.handle));
    return Object.values(league.teams)
      .map((t) => ({ ...t, avgOvr: teamAvgOvr(t, league.players) }))
      .sort((a, b) => b.avgOvr - a.avgOvr);
  }, [dataMode, worldSeed]);

  const createValid =
    create.name.trim().length >= 3 &&
    create.name.trim().length <= 24 &&
    /^[a-zA-Z0-9]{2,5}$/.test(create.tag) &&
    create.primaryColor !== create.secondaryColor;
  const teamValid = choice?.kind === "pick" || (choice?.kind === "create" && createValid);

  const start = () => {
    if (!choice || !teamValid) return;
    newGame({
      saveName: coachName.trim() || "Head Coach",
      dataMode,
      worldSeed: dataMode === "fictional" ? worldSeed : undefined,
      teamId: choice.kind === "pick" ? choice.teamId : undefined,
      createTeam:
        choice.kind === "create"
          ? { ...create, name: create.name.trim(), tag: create.tag.toUpperCase() }
          : undefined,
      difficulty,
      tutorial,
    });
    router.push(
      choice.kind === "create" && create.rosterMode === "draft" ? "/draft" : "/dashboard",
    );
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-6 px-4 py-10 md:py-14">
      <header>
        <p className="eyebrow text-gold">Rift GM · {DATA_META.seasonLabel}</p>
        <h1 className="display mt-1 text-4xl font-bold text-ink md:text-5xl">Take the desk.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-muted">
          Run a pro League of Legends organization: read scouting reports, counter-draft, watch
          the map, manage form and fatigue, survive the board.
        </p>
      </header>

      {hydrated && initialized && activeTeam ? (
        <section className="panel flex flex-wrap items-center gap-4 p-4">
          <TeamCrest team={activeTeam} size={40} />
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

      {/* Step chips */}
      <nav aria-label="New game steps" className="flex flex-wrap gap-1.5">
        {STEPS.map((label, i) => (
          <button
            key={label}
            onClick={() => i < step && setStep(i)}
            aria-current={i === step ? "step" : undefined}
            className={`display border px-3 py-1.5 text-xs font-bold ${
              i === step
                ? "border-cyan text-cyan"
                : i < step
                  ? "border-hairline text-ink hover:bg-fog-800"
                  : "border-hairline/50 text-ink-muted"
            }`}
          >
            {i + 1} · {label}
          </button>
        ))}
      </nav>

      {step === 0 ? (
        <section aria-labelledby="mode-head" className="flex flex-col gap-3">
          <h2 id="mode-head" className="eyebrow">Choose your world — starting a new game overwrites unsaved progress</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <button
              onClick={() => setDataMode("real")}
              aria-pressed={dataMode === "real"}
              className={`panel flex flex-col gap-1 p-4 text-left hover:bg-fog-800 ${dataMode === "real" ? "outline-2 outline-cyan" : ""}`}
            >
              <span className="display text-base font-bold">Real rosters</span>
              <span className="text-sm text-ink-muted">Attributes modeled from pro match data.</span>
              {DATA_META.usingSampleData ? (
                <span className="text-xs text-gold">Using sample data — attributes are approximate.</span>
              ) : null}
            </button>
            <button
              onClick={() => setDataMode("fictional")}
              aria-pressed={dataMode === "fictional"}
              className={`panel flex flex-col gap-1 p-4 text-left hover:bg-fog-800 ${dataMode === "fictional" ? "outline-2 outline-cyan" : ""}`}
            >
              <span className="display text-base font-bold">Fictional league</span>
              <span className="text-sm text-ink-muted">A fully generated world, new every seed.</span>
            </button>
          </div>
          {dataMode === "fictional" ? (
            <div className="panel flex flex-wrap items-end gap-3 p-4">
              <label className="flex flex-col gap-1">
                <span className="eyebrow">World seed — share it to share this world</span>
                <input
                  value={seedText}
                  onChange={(e) => {
                    setSeedText(e.target.value);
                    setChoice(null);
                  }}
                  className="panel-raised num w-56 px-3 py-2 text-sm text-ink"
                />
              </label>
              <button
                onClick={() => {
                  setSeedText(String(Math.floor(Math.random() * 1e9)));
                  setChoice(null);
                }}
                className="hex-clip display border border-hairline bg-fog-800 px-4 py-2 text-sm font-bold hover:bg-fog-700"
              >
                Reroll world
              </button>
              <p className="w-full text-xs text-ink-muted">
                The same seed always generates the same teams and players. Non-numeric seeds work
                too — they&apos;re hashed.
              </p>
            </div>
          ) : null}
          <div>
            <button onClick={() => setStep(1)} className="hex-clip display bg-gold px-6 py-2.5 text-sm font-bold text-void hover:brightness-110">
              Next: pick your team →
            </button>
          </div>
        </section>
      ) : null}

      {step === 1 ? (
        <TeamStep
          pickableTeams={pickableTeams}
          choice={choice}
          setChoice={setChoice}
          create={create}
          setCreate={setCreate}
          createValid={createValid}
          onNext={() => teamValid && setStep(2)}
          teamValid={!!teamValid}
        />
      ) : null}

      {step === 2 ? (
        <section aria-labelledby="diff-head" className="flex flex-col gap-3">
          <h2 id="diff-head" className="eyebrow">Difficulty</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {(Object.keys(DIFFICULTY_INFO) as Difficulty[]).map((key) => (
              <button
                key={key}
                onClick={() => setDifficulty(key)}
                aria-pressed={difficulty === key}
                className={`panel flex flex-col gap-1 p-4 text-left hover:bg-fog-800 ${difficulty === key ? "outline-2 outline-cyan" : ""}`}
              >
                <span className="display text-base font-bold">{DIFFICULTY_INFO[key].label}</span>
                <span className="text-sm text-ink-muted">{DIFFICULTY_INFO[key].blurb}</span>
              </button>
            ))}
          </div>
          <div>
            <button onClick={() => setStep(3)} className="hex-clip display bg-gold px-6 py-2.5 text-sm font-bold text-void hover:brightness-110">
              Next: the coach →
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section aria-labelledby="coach-head" className="flex flex-col gap-3">
          <h2 id="coach-head" className="eyebrow">Your name on the door</h2>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="eyebrow">Coach name</span>
              <input
                value={coachName}
                onChange={(e) => setCoachName(e.target.value)}
                placeholder="Head Coach"
                className="panel num w-56 px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
              />
            </label>
            <label className="panel flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm">
              <input
                type="checkbox"
                checked={tutorial}
                onChange={(e) => setTutorial(e.target.checked)}
                className="h-4 w-4 accent-[var(--blue-cyan)]"
              />
              Run &quot;your first week as head coach&quot; — a guided opening week from your
              assistant coach. Recommended for new GMs.
            </label>
          </div>
          <p className="text-sm text-ink-muted">
            {dataMode === "fictional" ? `Fictional world · seed ${worldSeed}` : "Real rosters"} ·{" "}
            {choice?.kind === "create"
              ? `founding ${create.name || "a new franchise"} (${create.rosterMode === "draft" ? "expansion draft" : "academy start"})`
              : `coaching ${pickableTeams.find((t) => t.id === (choice as { teamId?: string })?.teamId)?.name ?? "—"}`}{" "}
            · {DIFFICULTY_INFO[difficulty].label}
          </p>
          <div>
            <button
              onClick={start}
              disabled={!teamValid}
              className="hex-clip display bg-gold px-6 py-2.5 text-sm font-bold text-void enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {choice?.kind === "create" && create.rosterMode === "draft"
                ? "Found the franchise — to the draft"
                : "Take the desk"}
            </button>
          </div>
        </section>
      ) : null}

      <footer className="mt-auto border-t border-hairline pt-4 text-xs leading-5 text-ink-muted">
        This is an unofficial fan project. Not affiliated with or endorsed by Riot Games. Player
        data © their respective sources — Oracle&apos;s Elixir, Leaguepedia (CC BY-SA), Riot Data
        Dragon. See Settings → Data &amp; Attribution. Fictional-league worlds are procedurally
        generated and reference no real people.
      </footer>
    </main>
  );
}

/* ── Step 2: pick or create ────────────────────────────────────── */

function TeamStep({
  pickableTeams,
  choice,
  setChoice,
  create,
  setCreate,
  createValid,
  teamValid,
  onNext,
}: {
  pickableTeams: (Team & { avgOvr: number })[];
  choice: TeamChoice | null;
  setChoice: (c: TeamChoice) => void;
  create: CreateTeamConfig;
  setCreate: (c: CreateTeamConfig) => void;
  createValid: boolean;
  teamValid: boolean;
  onNext: () => void;
}) {
  const [tab, setTab] = useState<"pick" | "create">(choice?.kind === "create" ? "create" : "pick");
  const set = (patch: Partial<CreateTeamConfig>) => {
    setCreate({ ...create, ...patch });
    setChoice({ kind: "create" });
  };

  return (
    <section aria-labelledby="team-head" className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        <h2 id="team-head" className="eyebrow mr-2">Your organization</h2>
        <button
          onClick={() => setTab("pick")}
          aria-pressed={tab === "pick"}
          className={`display border px-3 py-1.5 text-xs font-bold ${tab === "pick" ? "border-cyan text-cyan" : "border-hairline text-ink-muted hover:text-ink"}`}
        >
          Pick a team
        </button>
        <button
          onClick={() => {
            setTab("create");
            setChoice({ kind: "create" });
          }}
          aria-pressed={tab === "create"}
          className={`display border px-3 py-1.5 text-xs font-bold ${tab === "create" ? "border-cyan text-cyan" : "border-hairline text-ink-muted hover:text-ink"}`}
        >
          Create your own
        </button>
      </div>

      {tab === "pick" ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {pickableTeams.map((t, i) => {
            const selected = choice?.kind === "pick" && choice.teamId === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setChoice({ kind: "pick", teamId: t.id })}
                aria-pressed={selected}
                className={`panel flex items-center gap-3 p-3 text-left transition-colors hover:bg-fog-800 ${selected ? "outline-2 outline-cyan" : ""}`}
              >
                <TeamCrest team={t} size={38} />
                <span className="min-w-0 flex-1">
                  <span className="display block truncate text-sm font-bold">{t.name}</span>
                  <span className="eyebrow">Preseason #{i + 1}</span>
                </span>
                <span className="num text-lg font-semibold text-cyan">{t.avgOvr.toFixed(1)}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
          <div className="panel flex flex-col gap-4 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="eyebrow">Team name (3–24 chars — also seeds your crest)</span>
                <input
                  value={create.name}
                  onChange={(e) => set({ name: e.target.value })}
                  placeholder="Ashen Wolves"
                  maxLength={24}
                  className="panel-raised px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="eyebrow">Tag (2–5)</span>
                <input
                  value={create.tag}
                  onChange={(e) => set({ tag: e.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 5) })}
                  placeholder="ASH"
                  className="panel-raised num px-3 py-2 text-sm uppercase text-ink placeholder:text-ink-muted"
                />
              </label>
            </div>

            <label className="flex w-max flex-col gap-1">
              <span className="eyebrow">Region</span>
              <select
                value={create.region}
                onChange={(e) => set({ region: e.target.value })}
                className="panel-raised px-3 py-2 text-sm text-ink"
              >
                {REGION_CHOICES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </label>

            {(["primaryColor", "secondaryColor"] as const).map((key) => (
              <fieldset key={key} className="border-0 p-0">
                <legend className="eyebrow mb-1.5">
                  {key === "primaryColor" ? "Primary color" : "Secondary color"} — curated for
                  contrast on the broadcast background
                </legend>
                <div className="flex flex-wrap gap-1.5">
                  {TEAM_PALETTE.map((c) => (
                    <button
                      key={c.hex}
                      onClick={() => set({ [key]: c.hex } as Partial<CreateTeamConfig>)}
                      aria-pressed={create[key] === c.hex}
                      aria-label={c.name}
                      title={c.name}
                      className="h-8 w-8 border"
                      style={{
                        background: c.hex,
                        borderColor: create[key] === c.hex ? "var(--ink)" : "transparent",
                        outline: create[key] === c.hex ? "2px solid var(--blue-cyan)" : undefined,
                      }}
                    />
                  ))}
                </div>
              </fieldset>
            ))}
            {create.primaryColor === create.secondaryColor ? (
              <p className="text-xs text-ember">Pick two different colors.</p>
            ) : null}

            <fieldset className="border-0 p-0">
              <legend className="eyebrow mb-1.5">Roster construction — pick one</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(
                  [
                    {
                      key: "draft",
                      label: "Expansion draft",
                      blurb: "Draft 5 starters + up to 3 subs from the free-agent pool under a salary cap. The decision-quality start.",
                    },
                    {
                      key: "academy",
                      label: "Academy start",
                      blurb: "A generated roster of raw, high-potential teenagers. Harder start, development-focused.",
                    },
                  ] as { key: RosterMode; label: string; blurb: string }[]
                ).map((mode) => (
                  <button
                    key={mode.key}
                    onClick={() => set({ rosterMode: mode.key })}
                    aria-pressed={create.rosterMode === mode.key}
                    className={`panel-raised flex flex-col gap-1 p-3 text-left hover:bg-fog-700 ${create.rosterMode === mode.key ? "outline-2 outline-cyan" : ""}`}
                  >
                    <span className="display text-sm font-bold">{mode.label}</span>
                    <span className="text-xs leading-4 text-ink-muted">{mode.blurb}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          {/* Crest preview */}
          <div className="panel flex flex-col items-center gap-3 p-4">
            <p className="eyebrow">Crest — generated from your name</p>
            <ProceduralCrest
              name={create.name.trim() || "Ashen Wolves"}
              primary={create.primaryColor}
              secondary={create.secondaryColor}
              size={132}
            />
            <p className="display text-sm font-bold">{create.name.trim() || "Ashen Wolves"}</p>
            <p className="num text-xs text-ink-muted">{create.tag.toUpperCase() || "ASH"} · {create.region}</p>
            <p className="text-center text-xs leading-4 text-ink-muted">
              Same name, same crest — always. Rename to reroll the shape, glyph, and pattern.
            </p>
          </div>
        </div>
      )}

      <div>
        <button
          onClick={onNext}
          disabled={!teamValid || (tab === "create" && !createValid)}
          className="hex-clip display bg-gold px-6 py-2.5 text-sm font-bold text-void enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next: difficulty →
        </button>
      </div>
    </section>
  );
}
