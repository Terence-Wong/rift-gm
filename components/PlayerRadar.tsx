"use client";

import { useEffect, useRef, useState } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
} from "recharts";
import type { Attributes } from "@/lib/types";

const LABELS: { key: keyof Attributes; label: string }[] = [
  { key: "laning", label: "LANING" },
  { key: "mechanics", label: "MECH" },
  { key: "macro", label: "MACRO" },
  { key: "teamfight", label: "TF" },
  { key: "aggression", label: "AGGR" },
];

/** Self-measured wrapper — explicit px sizing is more reliable than ResponsiveContainer. */
function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      setWidth(Math.floor(entries[0].contentRect.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

export function PlayerRadar({
  attributes,
  color = "var(--blue-cyan)",
}: {
  attributes: Attributes;
  color?: string;
}) {
  const [ref, width] = useWidth();
  const data = LABELS.map(({ key, label }) => ({ label, value: attributes[key] }));
  return (
    <div
      ref={ref}
      className="h-56 w-full"
      role="img"
      aria-label={`Attribute radar: ${data.map((d) => `${d.label} ${Math.round(d.value)}`).join(", ")}`}
    >
      {width > 0 ? (
        <RadarChart width={width} height={224} data={data} outerRadius="72%">
          <PolarGrid stroke="var(--hairline)" />
          <PolarAngleAxis
            dataKey="label"
            tick={{ fill: "var(--ink-muted)", fontSize: 10, fontFamily: "var(--font-chakra)" }}
          />
          <PolarRadiusAxis domain={[0, 20]} tick={false} axisLine={false} />
          <Radar dataKey="value" stroke={color} fill={color} fillOpacity={0.25} isAnimationActive={false} />
        </RadarChart>
      ) : null}
    </div>
  );
}
