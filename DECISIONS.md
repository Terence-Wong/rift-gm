# DECISIONS.md — autonomous-run decision log

One-line rationale for every judgment call made while executing `docs/V2-BRIEF.md` (v2) and the post-deploy feedback iteration (v3).

## v3 — feedback iteration

- **×1 pace 8s → 6s per game minute** ("a touch too slow"): a 35-min game now watches in ~3½ minutes; ×2/×4/skip/instant unchanged.
- **MACRO drives the map, not just the math**: rotation frequency, objective-fight attendance, and setup tightness all scale with team macro — the stat is now legible from movement alone.
- **Objective attendees are chosen by proximity**, so dragon pulls the bot side and baron the top side (this is also what fixed "bot lane never moves": they now attend every bot-side objective, swap lanes on rotations, and recall).
- **Nexus defense uses the known result** (losing side falls back over the final two minutes): the strategic layer already decided the winner, so choreographing the defense from it is honest, and a base race now ends with bodies in the base.
- **Minions are decorative** — waves are a pure function of tick + gold lead, drawn by the renderer with no engine state; simulating them would change nothing the sim resolves.
- **CS recalibrated** with partial farm-on-the-move credit (0.45×) and a compensation constant tuned to parity with quick-sim CS (measured ratio 1.00).
- **Research-driven loop picks** (full report: `docs/RESEARCH-loop-addictiveness.md`): shipped training report, draft-screen scouting intel + post-match prep report, Academy Showcase with honest pre-seeded hype, breakout/slump dev events, and offseason transfer rumors. Deferred deadline-week market and knowledge-% scout cards as the next-largest items.
- **Intake class + dev events are seeded at season start**, not at reveal time — the preview honestly foreshadows a pre-committed outcome and reload-scumming the reveal is pointless.
- **saveVersion bumped to 3**; pre-v3 saves skip the in-flight season's showcase (it reseeds next season) and default the new fields.

## v4 — backlog iteration (deadline market + scout reports)

- **The offseason market is opt-in pacing**: `startNextSeason` still works at any time (fast-forward — remaining AI deals resolve via the existing roster fill), so old flows, tests, and impatient players are untouched; engaging with the 4 market weeks is where the drama lives.
- **AI signings are pre-committed at market open** (intent = team + player + week), rumored one week before executing — hesitation on a rumored target genuinely loses him, which is the loss-aversion engine from FM's deadline day.
- **Poach "buyout" pays into budget** (+50% of the offered salary) even though budget is an annual cap, not cash — a deliberate simplification to make selling a real option; matching costs the rival's number against your cap, and stalling costs morale.
- **Failed match attempts don't resolve the offer** (budget-blocked matches can be retried after clearing salary) — a blocked click shouldn't silently burn the decision.
- **Free agents now show scouted OVR ranges, never exact values** — computed by role-weighting the existing per-attribute fuzzy ranges, so the market finally honors the imperfect-information pillar; the expansion draft keeps exact values (a one-time curated event where the asking price already carries the signal).
- **Upgrade verdicts are computed from the range, not the truth** ("likely upgrade" only when the whole range clears your starter) — a thin file gives a hedged answer, which is the point.
- **One personal scout assignment at a time** (+2 knowledge/week, report each week, auto-clears at 5/5) — scarcity makes the assignment a decision instead of a checkbox; it works in-season and through market weeks.
- **saveVersion bumped to 4**; old saves mid-offseason mark the market as already closed (it reseeds next offseason).

## Feature 3 — Spatial match simulation

- **Strategic/attribution RNG split.** Kill *attribution* (who killed/died/assisted) moved to a dedicated RNG stream, so the strategic outcome (winner, gold timeline, duration) of a seed is byte-identical between quick-sim and spatial-sim — preserves all v1 tuning and makes the equivalence testable directly.
- **Spatial log is regenerated, never persisted.** ~10.5k position samples would bloat localStorage; the engine is pure/seeded, so the store keeps only the tiny `SpatialInputs` (team contexts + seed) and the viewer regenerates the log deterministically on demand.
- **Quick-simmed user matches use sampled attribution.** The brief says quick-sim skips spatial generation; the stored result is the one displayed, so there is never a KDA mismatch between what was simmed and what is shown.
- **Herald fights stage at the Baron pit.** The Rift Herald lives in the same top-river pit before 20 minutes; one pit location keeps the map data honest.
- **Kill trades allowed within a tick.** Two kills resolved in the same tick can kill each other (a "trade"); the respawn-sanity test explicitly allows this rather than forbidding a real esports pattern.
- **CS compensation constant (×1.26).** Spatial CS accrues only during `laning` state (~78% of a laner's game), so the per-minute rate is compensated to keep spatial CS lines statistically in family with quick-sim CS lines.
- **"Instant sim" plays the spatial replay at the v1 pace (~8s)** rather than skipping the viewer, honoring "for players who want the v1 speed" while keeping one code path.

## Feature 2 — Fictional data mode

- **World seed is separate from the match seed.** `worldSeed` deterministically generates the league (shareable/replayable per the brief); `baseSeed` still varies per save so two careers in the same world diverge.
- **Attribute skew reuses the OVR role-weight matrix** (`(weight − 0.2) × 7.5`) instead of a second hand-tuned table — one source of truth for "what matters per role", as the brief suggests.
- **Prospect intake uses the new handle generator in BOTH modes**, reserved against real-pro and in-save handles; the v1 hardcoded prospect name pool was retired (better variety, same fictional-trainee labeling).
- **Generated nationalities are invented codes** (AVL, KHA, NYX…) so the fictional world makes no real-world nationality claims.
- **Non-numeric world seeds are accepted and hashed** so players can share word seeds ("worlds2026") as well as numbers.

## Feature 1 — Create-a-team

- **The folded (replaced) team's players enter free agency**, which also feeds the expansion-draft pool — the pool is real free agents (or generated ones in fictional mode) topped up with generated prospects until every role has ≥5 candidates.
- **Created teams get id `usr`** and a `custom` flag; the crest is derived from the name at render time (never stored), so "same name → same crest" holds by construction.
- **Crest space is 5 shapes × 8 glyphs × 5 patterns (200 combos)** — hand-authored SVG paths, no uploaded images.
- **Difficulty added as part of the §6 new-game flow** (Relaxed/Standard/Brutal): budget multiplier + board strike/confidence thresholds. v1 behavior == Standard.
- **Board expectations now grade below 6th** (rank ≥7 → top-8 mandate) for ALL teams, implementing "expectations scale to roster strength" — mild change for weak real teams, essential for academy starts.
- **Expansion draft locks the season** (sim/advance guarded + shell redirect) rather than allowing a partially-staffed team to play.
- **Draft contracts sign at market rate for 2 years** — keeps the draft a pure decision-quality exercise about talent vs. cap, not contract negotiation.

## Feature 4 — Tutorial & glossary

- **DRAFT step gates on lock-in, not on setting a ban** — the memo tells the player to target-ban, but forcing it would punish a legitimate "no ban" read; the gate is the real action of committing a draft.
- **Spotlight is CSS-only** (`data-tut-step` on the shell + `data-tut` targets + a pointer-events-none dim overlay; ringed targets get z-index above it) — no DOM measurement, keyboard flow untouched, reduced-motion kills the pulse via the existing global rule.
- **Out-of-order events are ignored, never queued** — visiting the match screen during the SQUAD step doesn't secretly complete SCOUT; each step demands its action while it is the active step.
- **The tutorial relaunch reuses the same save state** (Settings → Relaunch) rather than needing a new game; steps re-gate on the same real actions.
- **Glossary popovers are custom lightweight buttons** (aria-expanded, Escape/blur dismiss) rather than a dependency; definitions live in `lib/glossary.ts` in coach voice.
- **"Confirm starter" affordance during the SQUAD step** — real-data teams roster exactly five players (all already starting), so the tutorial's "set your starters" action would have had nothing to click; while that step is active, incumbent starters render a confirm button that fires the same `setStarter` action. Found via headless-browser verification.

## Feature 5 — chosen improvements (4)

1. **Weekly power rankings with analyst blurbs** (`lib/engine/rankings.ts`) — score blends record, streak, roster OVR, and live form; seeded template blurbs vary by movement; the League screen shows the board and ≥2-spot moves for the user's team make the inbox. *Rationale: the world talks back weekly — long-horizon loop.*
2. **Player personalities** (`lib/engine/personality.ts`) — streaky / big-stage / slow-starter / workhorse, assigned as a pure hash of the player id (~50% of the pool), so **v1 saves get traits with zero migration**. Effects flow through the existing eff-multiplier math (consistency, clutch, form, fatigue) — probabilistic sim pillar intact. Shown on the player page. *Rationale: players become characters with legible tendencies, not stat rows.*
3. **Season awards ceremony** — MVP, All-Pro five (min 6 games), Rookie of the Split (first season, ≤20, min 6 games), attached to `SeasonHistoryEntry.awards`, announced in the inbox, displayed in a Hall-of-Fame section on the League screen. *Rationale: seasons leave monuments; careers accumulate meaning.*
4. **Rivalry system** — every finished playoff series increments a pair counter; later meetings (regular season AND playoffs) get a variance boost (up to +20% noise) and playoff rematches post "Rivalry renewed" news. `varianceBoost` rides through `MatchOptions` and is captured in `SpatialInputs` so replays stay byte-identical. *Rationale: repeat meetings raise stakes — history generates narrative.*

- **Not picked:** match-of-the-week spectate (heavy UI for marginal loop value vs. the four above) and momentum/morale mechanics (win/loss morale already exists in v1; doubling it risked snowball spirals).

## Rebuild note

- The v2 work was originally built and verified in a cloud session that had no
  git remote; this branch is a faithful port of that session's final tree
  (same code, same tests, re-verified locally), committed as one change
  because the intermediate per-feature states weren't recoverable as commits.
