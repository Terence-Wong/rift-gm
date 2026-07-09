# RIFT GM — v2 Iteration Brief (autonomous run)

You are working on the existing **RIFT GM** repository — the League of Legends management sim built from the v1 brief (Next.js App Router + TypeScript strict, Tailwind + token layer, Zustand+immer+persist, pure seeded engine in `/lib/engine`, Vitest, deployed to Vercel). This is a **v2 feature iteration**. Read the repo first, then implement everything below.

## Operating mode: work without interruption

You are running unattended in a cloud session. **Do not stop to ask questions.** For any ambiguity:
1. Check this brief and the v1 brief in the repo (`rift-gm-build-brief.md` if present) for the answer.
2. If still ambiguous, make the choice that best serves the design pillars (probabilistic sim, imperfect information, honest data, long-horizon loop, broadcast presentation), implement it, and **log the decision** in `DECISIONS.md` with a one-line rationale.
3. Never block on a missing asset, API, or license question — use the specified fallback and note it.

Working discipline for the whole run:
- Work on a branch (e.g., `claude/v2-features`). **Commit after each numbered feature below** with a descriptive message; push regularly so progress is visible from the session view.
- After each feature: run `npm run lint`, `npm run test`, and `npm run build`. **Never move on with a broken build.** If a change breaks existing tests, fix forward.
- Add/extend Vitest coverage for all new engine code (spatial sim determinism, generator bounds, tutorial state machine).
- Finish with a full verification pass (§7) and a `V2-CHANGELOG.md` summarizing what shipped, what was cut (if anything), and all logged decisions.
- Do not refactor unrelated systems, do not swap libraries, do not redesign the visual system. Extend what exists.

---

## Feature 1 — Create-a-Team (fictional franchise mode)

Add a **"Create your own team"** path to New Game, alongside picking an existing team.

- **Team identity:** name, 2–5 char tag, region, primary/secondary color (curated palette pickers that harmonize with the design tokens — validate contrast against `--rift-void`), and a **procedural crest**: generated SVG built from 3 layers (shape × glyph × pattern), seeded from the team name so the same name always yields the same crest. No uploaded images (avoids licensing/moderation problems).
- **Roster construction — pick exactly one mode at creation:**
  - **Expansion Draft:** the player drafts 5 starters + up to 3 subs from a pool of real (or generated, per Feature 2) free agents under a salary cap. This is the default and the most fun — it's a decision-quality exercise.
  - **Academy Start:** auto-generate a roster of young, low-OVR/high-POTENTIAL players; harder start, development-focused.
- The created team **replaces the last-place team** in the league table by default (log it as a league "expansion" news item) so the schedule generator is untouched.
- Created teams flow through everything (transfers, playoffs, history) identically to real teams. Persist in the save, not in `/data`.
- Board expectations scale to roster strength, not league average, so an Academy Start isn't an instant firing.

## Feature 2 — Data mode toggle: **Real-derived vs. Fictional (RNG)**

Add a **new-game setting** (per-save, chosen at creation, shown in the save slot metadata): 

- **Real mode** (current behavior): attributes derived from real competitive data, provenance labels shown, attribution panel as-is.
- **Fictional mode:** the entire league is **procedurally generated** — teams, players, names, ages, attributes — using the seeded PRNG.
  - Build a **player generator** in `/lib/engine/generate.ts`: role-appropriate attribute distributions (e.g., supports skew MACRO, ADCs skew MECHANICS — reuse the role weight matrix), age curve 17–29 with attribute/potential correlation, plausible gamer handles from a syllable/word-bank generator (ship a hand-authored word bank; **no real pro names** in fictional mode — check generated handles against the real-player handle list and reroll collisions).
  - League-level balance guard: generated league OVR spread should roughly match the real league's spread (test this).
  - In Fictional mode, hide provenance labels and the "derived from real data" copy entirely; the Data & Attribution panel states the league is procedurally generated. **Never mix modes in one save.**
- UI copy for the toggle: `Real rosters — attributes modeled from pro match data` / `Fictional league — a fully generated world, new every seed`. Expose the seed so players can share/replay a generated world.

## Feature 3 — Spatial match simulation (map + champion movement + KDA)

Upgrade the match engine and match view from a pure gold-timeline abstraction to a **2D spatial simulation** — the Football Manager "2D pitch" moment. This is the centerpiece of v2; budget the most effort here.

### Engine (`/lib/engine/spatial.ts`, pure, seeded)
- **Coordinate space:** normalized 0–100 × 0–100 map, mirrored diagonal layout: three lanes (top/mid/bot as polyline waypoint paths), jungle quadrants, river, Dragon pit (~bot river), Baron pit (~top river), turret positions per lane (3 outer/inner/inhib per side + 2 nexus), and bases at (8,92)-ish and (92,8)-ish. Define all of it as data (`mapLayout.ts`) so the renderer and engine share one source of truth.
- **Tick model:** 1 tick = 2 in-game seconds. Keep the existing minute-level phase/gold model as the **strategic layer**; the spatial layer is driven by it, not the reverse — this preserves all v1 tuning and tests. Each minute, the strategic layer emits *intents* (push lane, contest dragon, gank mid, base, group baron); the spatial layer paths units to fulfill them.
- **Units:** 10 champions as points with role, side, position, target waypoint, and state (`laning | rotating | fighting | dead | basing`). Movement = waypoint-following at role-appropriate speeds with slight seeded jitter (junglers roam camps between ganks; supports shadow their ADC; laners oscillate around the lane front, which shifts with gold/pressure).
- **Combat resolution stays probabilistic** — proximity triggers skirmish *checks* resolved by the existing attribute+form math; the spatial layer determines *who is present* (a 2v1 gank check includes the ganker). Deaths produce a death state + respawn timer scaled by game time. Kills/assists/deaths update the existing per-player K/D/A lines — KDA must now **emerge from spatial events**, not be sampled independently. CS accrues while in `laning` state.
- **Objectives are located:** dragon/baron/herald fights occur *at the pit*; the engine paths teams there when contesting, so a spectator can read intent from movement ("four bot-side dots converging on dragon" before the fight fires).
- **Determinism:** same seed → identical position log + identical result. Extend Vitest: determinism, KDA-sums consistency (team kills == opposing deaths), respawn-timer sanity, and the v1 win-rate band still holds (re-tune constants if the spatial layer shifted it; the 62–68% band for +2 OVR is the contract).
- **Performance:** the position log for a 35-min game at 2s ticks × 10 units is ~10.5k position samples — precompute the whole match up front (as v1 did), stream it to the renderer. Quick-sim skips spatial generation entirely (strategic layer only) so simming the rest of the league stays fast.

### Renderer (match view)
- **Canvas** (not SVG — 10 moving units at 30fps is Canvas territory), stylized original map art built from the token palette: `--fog-900` terrain, hairline lane lines, subtle river tint, gold turret pips. **Do not copy Riot's minimap art** — draw an original abstraction.
- Champions render as **role-glyph dots** in team color (cyan/ember side accents per v1 tokens) with the player handle in mono on hover/tap. Death → dot grays + respawn countdown ring. Kills flash a brief broadcast-style event tag at the location.
- **Pacing — deliberate slowdown:** default playback ×1 ≈ real-time-compressed such that a full match takes **~4–5 minutes** to watch (vs. ~8 seconds in v1). Keep ×2/×4 and **Skip to result**; add **"Instant sim"** in pre-match for players who want the v1 speed. The gold-diff graph remains, docked below the map, scrubbing in sync — the two views together are the broadcast.
- Layout: map is the hero (~60% height), gold graph below, scoreboard/KDA rail on the side (stacks vertically on mobile). Reduced motion: render key-moment snapshots with a "next event" stepper instead of continuous animation.

## Feature 4 — Tutorial & onboarding (immersion)

Frame the tutorial diegetically: **"Your first week as head coach."** No generic tooltip tour.

- On first new game (per save; skippable and re-launchable from Settings), a sequenced flow narrated **in the analyst/coach voice via inbox messages from your Assistant Coach**, each unlocking the next beat:
  1. Welcome brief → open **Squad**, set your starters (highlight the drag/assign affordance).
  2. Scouting memo → open next opponent's **Scouting report**, explain fuzzy ranges ("we don't know their numbers exactly — that's the job").
  3. Draft prep → **Pre-Match**: pick a comp archetype against their likely comp; explain the counter wheel with an inline mini-diagram; set a target ban.
  4. Match day → play the first match at guided pace; callouts anchored to the map and gold graph as events fire ("that cluster at dragon is a setup — watch the gold line if it goes wrong").
  5. Debrief → **Post-Match** reading: MVP, ratings, what training focus follows from what you saw.
- Implement as a small **tutorial state machine** (`/lib/tutorial.ts`, unit-tested) with steps gated on real actions (event-driven, not "Next"-button-driven). Spotlight styling uses existing tokens (gold ring, dimmed backdrop). Fully keyboard-accessible; reduced-motion compliant.
- Add contextual **"?" glossary popovers** app-wide for domain terms (CSD@15, comp archetypes, morale, form) — one-line coach-voice definitions, available forever, not just in the tutorial.

## Feature 5 — Your call: immersion & loop improvements (bounded creative budget)

Design and implement **3–5 additional improvements** that make the loop more fun and the world more alive. You choose. Constraints:
- Must serve the design pillars; must not add external services, auth, or new heavyweight dependencies; each must be save-compatible and covered by at least a smoke test; log each in `DECISIONS.md` with rationale.
- Strong candidates to consider (pick from these or bring better ones): **rivalry system** (repeat playoff meetings raise stakes/variance and generate news), **narrative inbox engine** (templated-but-varied storylines: slump watch, breakout rookie, contract-year performances), **weekly power rankings with analyst blurbs**, **match-of-the-week spectate mode** (watch a simulated game between two AI teams), **player personalities** (a light trait layer — e.g., `streaky`, `big-stage`, `slow-starter` — that visibly interacts with form/clutch), **season awards ceremony** (MVP, All-Pro team, Rookie of the Split, displayed in a hall-of-fame screen), **momentum/win-streak morale mechanics** with UI feedback.
- Anti-goals: no gacha/loot mechanics, no real-money anything, no social/sharing features, nothing that undermines the honest-data stance.

## 6 — Consistency & migration

- **Save migration:** existing v1 saves must load. Version the save schema (`saveVersion`), write a migration that defaults old saves to Real mode with no created team and tutorial marked complete. Test it with a fixture v1 save.
- New-game flow order: Data mode → (pick team | create team) → difficulty → tutorial opt-in.
- Update README (new features, data-mode explanation, create-a-team, tutorial) and the Data & Attribution panel for Fictional mode.

## 7 — Definition of done (verify all before finishing)

- [ ] `npm run lint`, `npm run test`, `npm run build` all pass; no console errors in dev.
- [ ] Create-a-team: both roster modes work end-to-end into a full season; crest generation is deterministic per name.
- [ ] Fictional mode: full generated league plays a complete season → playoffs → offseason; no real names leak; balance test passes.
- [ ] Spatial sim: deterministic per seed; KDA consistency tests pass; +2 OVR win-rate band still holds; full match watchable at ×1/×2/×4/skip; quick-sim performance unaffected; reduced-motion path works.
- [ ] Tutorial completes via real actions, is skippable, re-launchable, and keyboard-accessible; glossary popovers work app-wide.
- [ ] 3–5 Feature-5 improvements shipped, tested, and logged in `DECISIONS.md`.
- [ ] v1 save fixture migrates and loads.
- [ ] `V2-CHANGELOG.md` + updated README committed; branch pushed with clean history; open a PR titled "RIFT GM v2: spatial sim, create-a-team, fictional mode, tutorial" with a summary body.

Priorities if anything must give: Feature 3 (spatial sim) > Feature 4 (tutorial) > Feature 1 > Feature 2 > Feature 5. Cut from the bottom, never the top, and say so in the changelog.
