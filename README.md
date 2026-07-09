# RIFT GM

A single-player, browser-based **League of Legends esports management simulator** in the spirit of Championship Manager / Football Manager. You are the head coach / GM of a pro team: read fuzzy scouting reports, counter-draft, set tactics, watch the animated gold-difference graph swing, develop players, survive the board, and roll season over season through playoffs, aging, retirements, and free agency.

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
- **Imperfect information**: opponents' attributes show as ranges that tighten with scouting; consistency, clutch, and potential stay hidden until deep scouting — and are never exact.
- **The season loop**: double round robin → top-4 best-of-5 playoffs (clutch weighs in) → offseason with aging, retirements, contract renewals, free-agency bidding (rivals bid too), and youth prospect intake → next season with full history. Miss the board's mandate twice and you're fired — with job offers on the table.

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
- **Named save slots** plus **export/import as JSON** live in Settings → Save manager (export downloads a file; import accepts one — handy for moving between browsers).

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
                        # match, training, transfers, settings (inside app shell)
/components             # GoldDiffGraph (hand-rolled SVG hero), DraftBoard,
                        # ScoutingCard, AttributeBar, PlayerRadar, tables…
/lib
  /engine               # pure, seeded: simulateMatch, rng, tactics, schedule,
                        # development, scouting, ai
  store.ts              # Zustand + immer + persist game store
  attributes.ts         # percentile → 1–20 mapping, role-weighted OVR
/data                   # bundled players/teams/champions/meta + curated fallback
/scripts                # build-data.ts (pipeline), curated.ts, calibrate.ts
/tests                  # Vitest: engine, derivation, full-season smoke
```

## Testing & tuning

```bash
npm test                        # 15 tests incl. the 62–68% win-rate band
npx tsx scripts/calibrate.ts    # sweep TUNING candidates, print win rates
```

Engine knobs live in `TUNING` (`lib/engine/simulateMatch.ts`); role weights for OVR in `lib/attributes.ts`; tactic/counter numbers in `lib/engine/tactics.ts`.

## Known limitations

- Draft is archetype-level (Poke/Pick/Teamfight/Split/Cheese with a counter matrix), not per-champion picks; champion data is bundled for future use.
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
