# Why FM/OOTP-style sims are addictive — research + what RIFT GM adopted

Research pass over historically successful management sims (Football Manager /
Championship Manager, Out of the Park Baseball, Motorsport Manager, NBA 2K
MyGM / Madden franchise, plus design analyses of FM's pull), commissioned to
answer: *why do scouting, player acquisition, and training feel forgotten in
RIFT GM when their equivalents carry those games?*

## The core diagnosis

In the reference games, these systems are never compelling on their own. They
are compelling because **each produces an artifact the next decision visibly
consumes**, and because each has a **scheduled reveal moment** on the calendar.
In RIFT GM v2, scouting/signing/training were inputs into an invisible
simulation — the player never saw the causal chain "I scouted → my draft got
better → I won."

**Rule of thumb adopted:** any hidden-state change the player caused must
produce a visible artifact within one advance.

## Per-system findings

### Scouting
- FM treats information as a progression currency: unknown players show masked
  attributes / ranges that narrow with scout knowledge; star ratings are
  *relative to your own squad* and appraised by fallible staff; hidden traits
  leak only as natural-language scout quotes ("relishes big matches").
  (passion4fm.com player-attributes & star-ratings guides; guidetofm.com
  scout reports; thehighertempopress.com on hidden attributes; fmscout.com
  "why is FM so addicting")
- Madden gives two independent noisy measurements (combine + pro day) that the
  player triangulates. (madden-school.com scouting guide)
- Motorsport Manager converts pre-event practice knowledge directly into
  race-day pace — prep visibly pays off at the event. (Steam: Motorsport Manager)

### Acquisition / drafting
- FM24 built a dedicated **Deadline Day** module: themed UI, a rumor ticker,
  agents touting players all day, rivals bidding on *your* players.
  (SI manual: transfers; fifauteam.com FM24 transfers guide)
- FM's **Youth Intake day** is the most anticipated date of its year: a preview
  report weeks earlier hints at quality ("…potential golden generation"), then
  a batch reveal of wide-range prospects. Hype → wait → reveal → sorting.
  (fullerfm.com, passion4fm.com youth-intake guides)
- OOTP 27's trade AI makes every team a coherent buyer/seller that shops
  specific players and concentrates activity near the deadline — a market that
  can snipe you is a drama, one where only you act is a spreadsheet.
  (operationsports.com on OOTP 27 trade AI)

### Training / development
- FM: age-banded growth (physicals 17–21, mentals via match experience) makes
  "what to train, when to sell" real decisions; mentoring transfers
  personality, which multiplies development. Wonderkid saves are the
  community's favorite story genre. (footballgpt.co training; sortitoutsi
  FM24 youth development; fmprojects.substack.com on FM storytelling)
- OOTP: a color-coded development tab, "compare vs an earlier date" reports,
  and **Talent Change Randomness** — potential itself moves, so prospects bust
  and journeymen break out. (operationsports.com OOTP dev guide; OOTP manual/wiki)
- NBA 2K: discrete named badges beat continuous numbers ("+2 mechanics" is
  forgettable; "unlocked Clutch Gene" is a screenshot); veterans mentor
  badge progress to rookies. (thegamer.com MyNBA guide)
- Motorsport Manager: development punctuated by dilemma events with permanent
  consequences. (levelwinner.com MM dilemmas)

## Cross-cutting principles

1. **Anticipation-then-reveal** — dopamine peaks during anticipation of an
   uncertain reward; schedule reveals and foreshadow them honestly
   (nirandfar.com on variable rewards; yukaichou.com on operant conditioning).
2. **Calendar landmarks create "one more week"** — there is always a named
   thing 2–5 advances away (gamedeveloper.com "The Compulsion Loop Explained").
3. **Never end a turn with an empty queue** — FM's inbox items almost all
   carry an action; Miles Jacobson's team treats "one more game" as a UX
   property and redesigned FM26 when between-match friction broke it
   (onemoregame.ph Jacobson interview).
4. **Visible progress deltas** — OOTP's color-coded dev tab, FM's narrowing
   ranges.
5. **Rival agency → emergent narrative** — markets that threaten you generate
   the stories players retell.

## What v3 shipped from this (and what's deferred)

Shipped:
1. **Weekly Training Report** (dashboard panel, ▲/▲▲ per-attribute deltas each
   advance) — principle 4.
2. **Scouting intel consumed inline in the draft screen** (recommended ban at
   level 2, comp read + counter at 3, weakness flag at 4) **plus a post-match
   "prep report"** attributing whether the ban/counter paid — the FM/MM
   "prep visibly pays off" pattern.
3. **Academy Showcase** — class quality seeded at season start (honest hype,
   no save-scumming), coach preview at week 5 (tier copy up to the "golden
   generation" line), batch reveal into free agency at week 8 — the FM youth
   intake structure.
4. **Seeded dev events** — breakout (potential jump) / slump beats for the
   user's roster, landing as coach news — OOTP's talent-change randomness.
5. **Offseason transfer rumors** naming real AI needs that then come true at
   roster lock — a light slice of rival agency.

Deferred (logged for a future iteration):
- Full **Signing Deadline Week** with in-season windows, rumor ticker, and
  rival bids on the user's roster (needs a multi-step offseason).
- **Scout report cards** with per-player knowledge %, before/after range
  narrowing, and "upgrade over your starter" verdicts (needs a knowledge
  stat and market ranges instead of exact FA OVR).
- **Named trait unlocks** (badge-style) beyond the v2 personality layer.
