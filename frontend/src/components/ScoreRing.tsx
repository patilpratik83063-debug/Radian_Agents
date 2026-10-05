"use client";

import { useEffect, useId, useState } from "react";
import { AnimatedNumber } from "@/components/motion/light";
import { cn, scoreTone } from "@/lib/utils";

const TONES = {
  success: ["var(--success)", "var(--brand-hi)"],
  warn: ["var(--warn)", "var(--danger)"],
  danger: ["var(--danger)", "var(--warn)"],
  muted: ["var(--muted)", "var(--muted)"],
  brand: ["var(--brand)", "var(--accent)"],
} as const;

/** Animated SVG score ring: the gradient arc draws in (CSS transition) and the number counts up. */
export function ScoreRing({
  score, label, sub, emptyLabel = "n/a", size = 168, stroke = 12, className, brand = false,
}: { score: number | null; label: string; sub?: string; emptyLabel?: string; size?: number; stroke?: number; className?: string; brand?: boolean }) {
  const gid = useId();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const [from, to] = TONES[brand ? "brand" : scoreTone(score)];
  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div className="relative" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${score ?? "not available"} out of 100`}>
        <div className="absolute -inset-2 rounded-full opacity-70" style={{ background: `radial-gradient(closest-side, rgb(${from} / 0.35), transparent)` }} aria-hidden />
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="relative -rotate-90 overflow-visible">
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={`rgb(${from})`} />
              <stop offset="100%" stopColor={`rgb(${to})`} />
            </linearGradient>
          </defs>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--ink) / 0.07)" strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={r - stroke - 3} fill="none" stroke="rgb(var(--ink) / 0.05)" strokeWidth={1} strokeDasharray="2 6" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={`url(#${gid})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            style={{ strokeDashoffset: drawn ? c * (1 - pct) : c, transition: "stroke-dashoffset 1.5s cubic-bezier(0.22, 1, 0.36, 1) 0.15s" }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          {score === null ? (
            <span className="px-4 text-center text-sm font-semibold text-muted">{emptyLabel}</span>
          ) : (
            <div className="text-center">
              <AnimatedNumber value={score} className="font-display text-[44px] font-extrabold leading-none" />
              <div className="mt-1 text-xs font-medium text-muted">/ 100</div>
            </div>
          )}
        </div>
      </div>
      <div className="text-center">
        <div className="text-base font-bold">{label}</div>
        {sub && <div className="mx-auto mt-1 max-w-[220px] text-xs leading-snug text-muted">{sub}</div>}
      </div>
    </div>
  );
}
