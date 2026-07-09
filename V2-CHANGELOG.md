# RIFT GM v2 — Changelog

Everything below shipped on `claude/v2-features`, per `docs/V2-BRIEF.md`.
**Nothing was cut.** All decisions made without user input are logged with
rationale in `DECISIONS.md`. (The work was built feature-by-feature in a
cloud session without a git remote and ported here as one verified change —
see the rebuild note in `DECISIONS.md`.)

## Feature 3 — Spatial match simulation (the centerpiece)

- **Engine split**: `simulateMatch` now separates the v1 strategic core (gold
  walk, objectives, team-level kills — all tuning intact) from kill
  *attribution*, which runs on a dedicated RNG stream. The strategic outcome
  of a seed is byte-identical between quick-sim and spatial sim, and a test
  asserts it. The 62–68% win band for +2 OVR still holds.
- **`lib/engine/mapLayout.ts`**: one source of truth for the normalized
  0–100 map — three lane polylines, river, Baron/Dragon pits, jungle camps,
  bases, and all 22 turrets — shared by engine and renderer.
- **`lib/engine/spatial.ts`**: pure, seeded 2-second-tick simulation driven
  by the strategic layer's per-minute events. Units path to lane fronts
  (which shift with gold), junglers roam camps, supports shadow their ADC,
  teams converge on pits before objective fights. **KDA emerges from spatial
  events**: killers/victims/assists are chosen among units actually present
  at each fight; deaths get time-scaled respawn timers; CS accrues while
  laning. Same seed → identical position log and result.
- **Renderer**: Canvas (`components/MatchMap.tsx`) with stylized original
  map art built from the design tokens, role-glyph dots in team colors,
  handle-on-hover, respawn countdown rings, broadcast kill/objective
  flashes. The position log is regenerated deterministically from tiny saved
  inputs — never persisted.
- **Match view**: map hero + gold graph docked below (scrubbing in sync) +
  live KDA rail; ×1 ≈ 4–5 minutes per match, ×2/×4, skip-to-result, and a
  pre-match **Instant sim** at the v1 pace. Reduced motion renders
  key-moment snapshots with a next-event stepper.
- **Performance**: quick sims (rest of the league) skip spatial generation
  entirely.
- Tests: determinism (result + full log), quick-sim strategic equivalence,
  KDA-sum consistency, respawn sanity, bounds, CS-by-role, win-rate band.

## Feature 1 — Create-a-Team

- New-game path to found a franchise: name, 2–5 char tag, region, curated
  primary/secondary colors (every palette entry validated ≥3:1 contrast
  against `--rift-void`), and a **procedural crest** — 3 SVG layers
  (5 shapes × 8 glyphs × 5 patterns) seeded from the team name, so the same
  name always yields the same crest. No uploaded images.
- **Expansion Draft** (default): draft 5 starters + up to 3 subs under a
  salary cap from a role-complete pool (existing free agents + the folded
  team's roster + generated prospects). The season is locked until the
  draft is confirmed. **Academy Start**: a generated roster of 17–19-year-old
  low-OVR/high-potential players.
- The created team replaces the preseason last-place team (posted as a
  league "expansion" news item) so the schedule generator is untouched; the
  folded team's players enter free agency. Created teams flow through
  transfers, playoffs, awards, and history like any other; everything lives
  in the save, not `/data`.
- Board expectations scale to roster strength (bottom-half rosters get a
  top-8 mandate), so an academy start isn't an instant firing.

## Feature 2 — Data mode: Real-derived vs. Fictional

- Per-save **data mode** chosen at creation and shown in save-slot metadata.
  Real mode is unchanged v1 behavior.
- **Fictional mode** (`lib/engine/generate.ts`): the entire league — teams,
  names, colors, players, ages, attributes — is generated from a **shareable
  world seed** (exposed in the wizard and the Data panel; non-numeric seeds
  are hashed). Role-appropriate attribute skews reuse the OVR role-weight
  matrix; ages follow a 17–29 curve with age/potential correlation; handles
  come from a hand-authored word bank and are checked case-insensitively
  against the real-pro handle list with rerolls (tested — no real names in
  any generated world, including offseason prospect intake).
- **Balance guard**: generated team-OVR mean/spread/range must stay in
  family with the real league's (asserted across multiple seeds).
- Fictional saves hide provenance labels and all "derived from real data"
  copy; the Data & Attribution panel states the league is procedurally
  generated. Modes never mix within a save.

## Feature 4 — Tutorial & onboarding

- **"Your first week as head coach"**: a diegetic, sequenced flow narrated
  by your assistant coach via inbox memos — squad → scouting report →
  draft prep (with an inline counter-wheel mini-diagram) → match day (coach
  callouts anchored to map/graph events) → debrief (training focus).
- Implemented as a pure, unit-tested state machine (`lib/tutorial.ts`) with
  steps **gated on real actions**, not "Next" buttons; out-of-order actions
  are ignored rather than breaking the flow. Opt-in at new game, skippable,
  re-launchable from Settings.
- Spotlight styling uses existing tokens (gold ring + dimmed backdrop,
  CSS-only), is keyboard-accessible, and honors reduced motion.
- **Glossary**: app-wide "?" popovers (`lib/glossary.ts` + `components/Term`)
  with one-line coach-voice definitions for CSD@15, comp archetypes, morale,
  form, clutch, and more — available forever, not just in the tutorial.

## Feature 5 — Immersion & loop improvements (4 shipped)

1. **Weekly power rankings** with seeded analyst blurbs (League screen;
   ≥2-spot moves for your team hit the inbox).
2. **Player personalities**: streaky / big-stage / slow-starter / workhorse,
   assigned deterministically from the player id (~half the pool), running
   through the existing form/consistency/clutch/fatigue math and shown on
   player pages. v1 saves get traits with zero migration.
3. **Season awards ceremony**: MVP, All-Pro five, Rookie of the Split —
   announced in the inbox and collected in a League-screen hall of fame.
4. **Rivalry system**: finished playoff series deepen a rivalry; rematches
   (regular season and playoffs) play swingier and playoff rematches post
   "Rivalry renewed" news.

Rationale and anti-goal choices in `DECISIONS.md` (match-of-the-week and
momentum/morale were considered and not picked).

## Consistency & migration (§6)

- Save schema is versioned (`saveVersion: 2`) with `migrateSave` applied on
  snapshot load, import, and store rehydration. v1 saves default to Real
  mode, standard difficulty, no created team, tutorial marked complete —
  tested against a committed v1 fixture (`tests/fixtures/v1-save.json`)
  that then simulates a full season.
- New-game flow order per the brief: data mode → (pick | create) team →
  difficulty → tutorial opt-in. Difficulty (Relaxed/Standard/Brutal) sets
  the budget multiplier and board firing thresholds.
- README and the Data & Attribution panel updated for all of the above.

## Verification

- `npm run lint`, `npm run test` (52 tests, 9 files), and `npm run build`
  all pass at HEAD.
- Headless-Chromium smoke run against the production build: **zero console
  errors** across (a) real-mode new game with the tutorial completed
  end-to-end via real actions — confirm starter → scouting report → lock
  draft → watch the spatial match (canvas) → skip → post-match → training
  focus → coach bar dismissed — plus a glossary popover check, and
  (b) fictional-mode create-a-team through the full expansion draft to the
  dashboard. (This run surfaced and fixed the 5-man-roster "set your
  starters" dead-end — see DECISIONS.md.)
