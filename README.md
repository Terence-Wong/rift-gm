# RIFT GM

A single-player, browser-based **League of Legends esports management simulator** in the spirit of Championship Manager / Football Manager. You are the head coach / GM of a pro team: read fuzzy scouting reports, counter-draft, set tactics, watch the match play out on a **live 2D map** with the gold graph docked beneath it, develop players, survive the board, and roll season over season through playoffs, awards, rivalries, aging, retirements, and free agency.

**New in v2:** the spatial match engine & map view, create-a-team (expansion draft or academy start, procedural crests), a fictional-league data mode with shareable world seeds, a diegetic first-week tutorial with an app-wide glossary, weekly power rankings, player personalities, a season awards ceremony, and a playoff rivalry system. See `V2-CHANGELOG.md`.

> **This is an unofficial fan project. Not affiliated with or endorsed by Riot Games.** League of Legends is a trademark of Riot Games, Inc. Player data © their respective sources — see [Credits & attribution](#credits--attribution).

## Quickstart

```bash
npm install
npm run dev      # http://localhost:3000
```

That's it. The repo ships with bundled data in `/data`, so no network access or env vars are needed at runtime — the deployed app never calls external stat APIs.

Other scripts:

| Script | What it does |
|---|---|
| `npm run build` | Production build (zero-config Vercel deploy) |
| `npm run data` | Re-run the data pipeline (fetch + derive attributes) |
| `npm test` | Vitest suite: engine determinism, win-rate calibration, full-season smoke test |
| `npm run lint` | ESLint |

## How the game works

- **The engine** (`lib/engine/simulateMatch.ts`) is pure and seeded (mulberry32 — no `Math.random()`). Same inputs + same seed → identical match. Matches are a minute-by-minute gold-difference random walk driven by phase strengths (early/mid/late) computed from player attributes, with objective contests, kill events, a **throw mechanic** for low-macro/low-consistency teams sitting on leads, and a decaying nexus threshold. Calibrated so a **+2 OVR edge wins ~62–68%** (asserted in tests across thousands of seeded sims).
- **The spatial layer** (`lib/engine/spatial.ts`, v2): watched matches run a 2-second-tick 2D simulation on a normalized map (`lib/engine/mapLayout.ts` — lanes, jungle, river, pits, 22 turrets). The strategic layer emits per-minute intents; the spatial layer paths the ten champions to fulfil them, and **K/D/A emerges from who was actually present at each fight** (deaths get scaled respawn timers; CS accrues while laning). Same seed → identical position log *and* identical strategic result as a quick sim (attribution runs on separate RNG streams). Quick sims skip spatial generation entirely, so simming the league stays fast.
- **The match view**: a Canvas map (stylized original art from the design tokens — not Riot's minimap) with role-glyph dots, respawn rings, and kill flashes; the gold graph scrubs in sync below; a live KDA rail sits alongside. ×1 plays a full match in ~3–4 minutes; ×2/×4/skip and a pre-match "Instant sim" keep the old pace available. Reduced motion swaps the animation for key-moment snapshots with a next-event stepper.
- **Imperfect information**: opponents' attributes show as ranges that tighten with scouting; consistency, clutch, and potential stay hidden until deep scouting — and are never exact.
- **The season loop**: double round robin → top-4 best-of-5 playoffs (clutch weighs in) → **awards ceremony** (MVP, All-Pro five, Rookie of the Split — kept in a League-screen hall of fame) → offseason with aging, retirements, contract renewals, free-agency bidding (rivals bid too), and youth prospect intake → next season with full history. Weekly **power rankings** with analyst blurbs track the season; repeat playoff meetings build **rivalries** that make rematches swingier. Miss the board's mandate and you're fired — thresholds depend on the difficulty you chose at new game.
- **Player personalities** (v2): about half the pool carries a visible trait — *streaky*, *big-stage*, *slow-starter*, or *workhorse* — that runs through the existing form/consistency/clutch/fatigue math.
- **The feedback loops** (v3): every advance produces a **training report** with per-attribute gains; scouting levels unlock **actionable draft intel** (recommended ban, comp read + counter, weakness flags) and the post-match **prep report** tells you whether the homework paid; each season seeds an **Academy Showcase** (hyped in advance, revealed on the day) and **breakout/slump events** for your roster. Design rationale in `docs/RESEARCH-loop-addictiveness.md`.
- **The deadline market** (v4): the offseason runs four advanceable market weeks — AI deals are rumored a week before they close (hesitate and lose your target), rivals table match-or-buyout offers for your players, and week 4 is Deadline Week. Free agents show **scouted OVR ranges**, not numbers: assign your scout to a player and weekly report cards tighten the range with an upgrade verdict against your current starter. Starting the season early fast-forwards the market.

## Starting a game (v2 flow)

New game runs **Data mode → pick or create a team → difficulty → tutorial opt-in**:

- **Data mode** — *Real rosters* (attributes modeled from pro match data, provenance labels shown) or a *Fictional league*: the entire world — teams, players, names, attributes — is procedurally generated from a **world seed** you can share and replay (`lib/engine/generate.ts`). Generated handles are checked against the real-pro handle list so no real names appear; fictional saves hide all real-data attribution. Modes never mix within a save.
- **Create your own team** — name, 2–5 char tag, region, curated primary/secondary colors (contrast-validated against the background), and a **procedural crest** (shape × glyph × pattern) seeded from your team name — same name, same crest, always. Your franchise replaces the weakest team (a league "expansion" news item) and builds its roster via an **expansion draft** (5 starters + up to 3 subs under a salary cap) or an **academy start** (raw, high-potential teenagers). Board expectations scale to your roster's strength.
- **Difficulty** — Relaxed / Standard / Brutal: budget multiplier and how quickly the board fires you.
- **Tutorial** — "your first week as head coach": a sequenced, skippable flow narrated by your assistant coach through inbox memos, with each beat gated on a real action (set a starter → read the scouting report → lock a draft → watch the match with coach callouts → set a training focus). Re-launchable from Settings. Domain terms get **"?" glossary popovers** app-wide, forever.

## Data: how attributes are derived

`npm run data` runs `scripts/build-data.ts`:

1. Downloads **Oracle's Elixir** match-level data for the configured league/year (LCK 2025 by default).
2. Aggregates each player's per-game metrics (CSD@15, GD@15, XPD@15, DPM, damage share, KDA, KP%, vision/min, first-blood involvement, multikills…).
3. **Role-normalizes to percentiles** (players are only compared within their role) and maps onto a compressed 6–19.5 band of the 1–20 scale (an LCK bench player is still elite globally).
4. **Consistency** is derived from the inverse coefficient of variation of a per-game composite. **Clutch** is derived from the playoff-vs-regular performance delta when the sample allows (≥8 playoff games), otherwise modeled. **Potential** is modeled from age. Every attribute carries a `provenance: "derived" | "modeled"` flag surfaced in the UI (the `est` marker).
5. Fetches champion metadata from **Riot Data Dragon**.
6. If any fetch fails, it falls back to the bundled curated dataset (`data/fallback.json` — real rosters, approximate hand-set ratings) and the app shows an honest *"Using sample data"* notice.

**Changing league / year / teams:** edit the config constants at the top of `scripts/build-data.ts` (`OE_YEAR`, `OE_LEAGUE`, `OE_DRIVE_FILE_IDS`) and the team metadata/aliases in `scripts/curated.ts` (`TEAM_META` — aliases must match Oracle's Elixir team-name strings), then run `npm run data`.

Free agents labeled **"trainee (fictional)"** are generated prospects, not real people.

## Saves

- The active game **auto-saves** to `localStorage` continuously.
- **Named save slots** plus **export/import as JSON** live in Settings → Save manager (export downloads a file; import accepts one — handy for moving between browsers). Slots show their data mode (real rosters vs. fictional league).
- **v1 saves still load**: the schema is versioned (`saveVersion`) and old saves migrate automatically — defaulting to Real mode, standard difficulty, no created team, tutorial marked complete (tested against a committed v1 fixture).

## Deploying to Vercel

Zero config — no env vars, no database, no server state:

```bash
npx vercel        # preview
npx vercel --prod # production
```

Or click: [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyour-org%2Frift-gm)

(Replace the repository URL after you push this repo.)

## Project structure

```
/app                    # Next.js App Router screens
  /(game)/…             # dashboard, squad, players/[id], league, schedule,
                        # match, draft, training, transfers, settings
/components             # MatchMap (canvas), GoldDiffGraph, DraftBoard,
                        # TeamCrest (+procedural), TutorialCoach, Term,
                        # ScoutingCard, AttributeBar, PlayerRadar, tables…
/lib
  /engine               # pure, seeded: simulateMatch (strategic core),
                        # spatial + mapLayout (2D sim), generate (fictional
                        # worlds), rankings, personality, rng, tactics,
                        # schedule, development, scouting, ai
  store.ts              # Zustand + immer + persist game store (+ migration)
  tutorial.ts           # first-week tutorial state machine
  glossary.ts           # coach-voice term definitions
  crest.ts / palette.ts # procedural crest specs, curated contrast-safe colors
  attributes.ts         # percentile → 1–20 mapping, role-weighted OVR
/data                   # bundled players/teams/champions/meta + curated fallback
/scripts                # build-data.ts (pipeline), curated.ts, calibrate.ts
/tests                  # Vitest: engine, spatial, generator, tutorial,
                        # create-a-team, features, migration, season smoke
```

## Testing & tuning

```bash
npm test                        # 52 tests incl. the 62–68% win-rate band,
                                # spatial determinism, and the v1-save migration
npx tsx scripts/calibrate.ts    # sweep TUNING candidates, print win rates
```

Engine knobs live in `TUNING` (`lib/engine/simulateMatch.ts`); role weights for OVR in `lib/attributes.ts`; tactic/counter numbers in `lib/engine/tactics.ts`.

## Known limitations

- Draft is archetype-level (Poke/Pick/Teamfight/Split/Cheese with a counter matrix), not per-champion picks; champion data is bundled for future use.
- The spatial view is a broadcast abstraction, not a frame-accurate replay: unit positions are generated to be *consistent with* the strategic result (who fought where, who died), not a full combat simulation.
- One league; no international events. Best-of-5 only in playoffs.
- Transfer bidding resolves instantly (with rival snipes) rather than over multi-week negotiations.
- Saves are local to the browser (use export/import to move them). No cloud saves.
- Ratings are honest *derivations from public match data*, not truth: metric-based percentiles undervalue playstyles the metrics don't capture. Provenance labels exist so you can tell what's data and what's modeling.

## Credits & attribution

- **[Oracle's Elixir](https://oracleselixir.com)** — match-level esports data (free for non-commercial use with attribution). Thank you, Tim Sevenhuysen.
- **[Leaguepedia](https://lol.fandom.com)** — roster/team reference (CC BY-SA 3.0).
- **[Riot Data Dragon](https://developer.riotgames.com/docs/lol#data-dragon)** — champion metadata and assets.
- Built with Next.js, Tailwind CSS, Zustand, Recharts, and Framer Motion. Fonts: Chakra Petch, IBM Plex Sans, IBM Plex Mono.

RIFT GM was created under Riot Games' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.
