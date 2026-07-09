/**
 * Calibration harness for the match engine. Sweeps TUNING candidates and
 * reports the +2 OVR win rate (target 62–68%), +5 OVR win rate, average
 * game duration, and throw frequency. Run: npx tsx scripts/calibrate.ts
 */

import { simulateMatch, TUNING } from "../lib/engine/simulateMatch";
import { syntheticTeam } from "../tests/helpers";

function measure(n: number) {
  const strong2 = syntheticTeam("s2", 14);
  const weak2 = syntheticTeam("w2", 12);
  const strong5 = syntheticTeam("s5", 17);
  const weak5 = syntheticTeam("w5", 12);
  const shaky = syntheticTeam("shaky", 15, { consistency: 4, macro: 9 });
  const steady = syntheticTeam("steady", 11, { consistency: 16 });

  let w2 = 0;
  let w5 = 0;
  let dur = 0;
  let throws = 0;
  for (let seed = 0; seed < n; seed++) {
    const r2 =
      seed % 2 === 0 ? simulateMatch(strong2, weak2, seed) : simulateMatch(weak2, strong2, seed);
    if (r2.winner === (seed % 2 === 0 ? "blue" : "red")) w2++;
    dur += r2.durationMin;
    const r5 = simulateMatch(strong5, weak5, seed);
    if (r5.winner === "blue") w5++;
    const rt = simulateMatch(shaky, steady, seed);
    if (rt.events.some((e) => e.type === "THROW")) throws++;
  }
  return {
    winRate2: w2 / n,
    winRate5: w5 / n,
    avgDuration: dur / n,
    throwRate: throws / n,
  };
}

const N = 2000;
const sweep: Array<Partial<typeof TUNING>> = [];
for (const driftK of [6, 9, 12, 15]) {
  for (const killStrengthBias of [0.05, 0.09]) {
    for (const objStrengthBias of [0.1, 0.18]) {
      for (const noiseSd of [280, 340]) {
        sweep.push({ driftK, killStrengthBias, objStrengthBias, noiseSd });
      }
    }
  }
}

const defaults = { ...TUNING };
console.log("driftK  killBias  objBias  noise | +2OVR   +5OVR   dur    throws");
for (const candidate of sweep) {
  Object.assign(TUNING, defaults, candidate);
  const m = measure(N);
  const flag = m.winRate2 >= 0.62 && m.winRate2 <= 0.68 ? "  <== in band" : "";
  console.log(
    `${candidate.driftK}\t${candidate.killStrengthBias}\t${candidate.objStrengthBias}\t${candidate.noiseSd} | ` +
      `${m.winRate2.toFixed(3)}  ${m.winRate5.toFixed(3)}  ${m.avgDuration.toFixed(1)}m  ${m.throwRate.toFixed(3)}${flag}`,
  );
}
Object.assign(TUNING, defaults);
