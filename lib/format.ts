/** Display formatting helpers. All numbers render in mono via .num class. */

export function fmtMoney(thousands: number): string {
  if (Math.abs(thousands) >= 1000) {
    const m = thousands / 1000;
    return `$${m.toFixed(m >= 10 ? 0 : 1)}M`;
  }
  return `$${Math.round(thousands)}K`;
}

export function fmtGoldDiff(gold: number): string {
  const k = Math.abs(gold) / 1000;
  const sign = gold > 0 ? "+" : gold < 0 ? "−" : "";
  return `${sign}${k.toFixed(1)}k`;
}

export function fmtKda(k: number, d: number, a: number): string {
  return `${k}/${d}/${a}`;
}

export function kdaRatio(k: number, d: number, a: number): string {
  return ((k + a) / Math.max(1, d)).toFixed(2);
}

export function fmtAttr(v: number): string {
  return String(Math.round(v));
}

export function fmtClock(minute: number): string {
  return `${String(Math.floor(minute)).padStart(2, "0")}:${String(
    Math.round((minute % 1) * 60),
  ).padStart(2, "0")}`;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
