"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Bot, Check, FileSearch, Globe, Image as ImageIcon, LayoutTemplate, Map, MapPin, Gauge, ScanSearch, Sparkles, Wrench, X, Braces, type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Card, ErrorState } from "@/components/ui/core";
import { useAuditStream, type AgentState } from "@/lib/useAuditStream";
import { cn, host } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  technical: Wrench, sitemap: Map, content: FileSearch, onpage: LayoutTemplate, schema: Braces, performance: Gauge,
  images: ImageIcon, geo: Sparkles, agentic: Bot, local: MapPin, sxo: ScanSearch,
};

function overallProgress(phase: string, done: number, total: number, finished: boolean) {
  if (finished) return 1;
  if (phase === "evidence") return 0.08;
  if (phase === "agents") return 0.1 + 0.72 * (total ? done / total : 0);
  return 0.9;
}

function Node({ agent, x, y, reduce }: { agent: AgentState; x: number; y: number; reduce: boolean | null }) {
  const Icon = ICONS[agent.key] ?? Globe;
  const state = agent.status;
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
      <div className="flex flex-col items-center gap-1.5">
        <div className="relative">
          {state === "running" && !reduce && <span className="absolute inset-0 rounded-full bg-brand/40 animate-pulse-ring" />}
          <motion.div
            layout
            animate={{ scale: state === "running" ? 1.08 : 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 18 }}
            className={cn(
              "relative grid h-12 w-12 place-items-center rounded-full border-2 bg-surface shadow-card sm:h-14 sm:w-14 dark:bg-surface-2",
              state === "idle" && "border-line/15 text-muted",
              state === "running" && "border-brand text-brand-text shadow-glow",
              state === "done" && "border-success text-success",
              state === "failed" && "border-danger text-danger",
            )}
          >
            <Icon className="h-5 w-5" />
            <AnimatePresence>
              {(state === "done" || state === "failed") && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 18 }}
                  className={cn("absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full text-white", state === "done" ? "bg-success" : "bg-danger")}
                >
                  {state === "done" ? <Check className="h-3 w-3" strokeWidth={3} /> : <X className="h-3 w-3" strokeWidth={3} />}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
        <div className="text-center text-[11px] font-semibold leading-tight sm:text-xs">
          {agent.label}
          {state === "done" && agent.score !== undefined && <span className="ml-1 text-muted">{agent.score}</span>}
        </div>
      </div>
    </div>
  );
}

export function LiveAudit({ auditId, url, onFinished }: { auditId: string; url: string; onFinished: () => void }) {
  const s = useAuditStream(auditId, onFinished);
  const reduce = useReducedMotion();
  const logRef = useRef<HTMLDivElement>(null);
  const labels = useMemo(() => Object.fromEntries(s.agents.map((a) => [a.key, a.label])) as Record<string, string>, [s.agents]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [s.logs.length, reduce]);

  const progress = overallProgress(s.phase, s.done, s.total, s.finished === "done");
  const elapsed = Math.round((now - s.startedAt) / 1000);
  const eta = progress > 0.12 && progress < 1 ? Math.max(3, Math.round((elapsed * (1 - progress)) / progress)) : null;

  const positions = useMemo(
    () => s.agents.map((_, i) => {
      const a = (i / Math.max(1, s.agents.length)) * Math.PI * 2 - Math.PI / 2;
      return { x: 50 + 38 * Math.cos(a), y: 50 + 38 * Math.sin(a) };
    }),
    [s.agents],
  );

  if (s.finished === "failed") return <ErrorState title="The audit failed" message={s.error ?? "Unknown error"} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Badge tone="brand"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" /> Checking now</Badge>
          <h1 className="mt-3 text-3xl font-bold">Checking {host(url)}</h1>
          <p className="mt-1 text-sm text-muted" aria-live="polite">{s.phaseLabel}{s.connected ? "" : " (reconnecting…)"}</p>
        </div>
        <div className="text-right text-sm text-muted tabular-nums">
          <div>Elapsed {elapsed}s</div>
          <div>{eta !== null ? `~${eta}s remaining` : progress >= 1 ? "Finishing up" : "Estimating…"}</div>
        </div>
      </div>

      <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Progress" className="h-2 overflow-hidden rounded-full bg-ink/8">
        <motion.div className="h-full rounded-full bg-brand" animate={{ width: `${progress * 100}%` }} transition={{ type: "spring", stiffness: 80, damping: 20 }} style={{ boxShadow: "0 0 16px rgb(var(--brand) / 0.7)" }} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Card className="relative overflow-hidden p-4 sm:p-6">
          <div className="relative mx-auto aspect-square w-full max-w-[520px]">
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" aria-hidden>
              {positions.map((p, i) => {
                const st = s.agents[i]?.status;
                return (
                  <motion.line key={i} x1="50" y1="50" x2={p.x} y2={p.y} strokeWidth="0.35" strokeLinecap="round"
                    stroke={st === "done" ? "rgb(var(--success))" : st === "running" ? "rgb(var(--brand))" : "rgb(var(--ink) / 0.14)"}
                    strokeDasharray={st === "running" ? "1.5 1.5" : undefined}
                    animate={st === "running" && !reduce ? { strokeDashoffset: [0, -6] } : undefined}
                    transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }} />
                );
              })}
              {positions.map((p, i) => s.agents[i]?.status === "running" && !reduce && (
                <circle key={`pk-${i}`} r="0.9" fill="rgb(var(--brand-hi))">
                  <animateMotion dur="1.4s" repeatCount="indefinite" path={`M${p.x} ${p.y} L50 50`} />
                </circle>
              ))}
            </svg>
            <div className="absolute left-1/2 top-1/2 grid h-24 w-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-brand/30 bg-surface text-center shadow-glow sm:h-28 sm:w-28">
              <div>
                <div className="font-display text-2xl font-bold tabular-nums">{Math.round(progress * 100)}%</div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Progress</div>
              </div>
            </div>
            {s.agents.length === 0 && <div className="absolute inset-0 grid place-items-center text-sm text-muted">Fetching and rendering the page…</div>}
            {s.agents.map((a, i) => (
              <Node key={a.key} agent={a} x={positions[i].x} y={positions[i].y} reduce={reduce} />
            ))}
          </div>
        </Card>

        <Card className="flex h-[min(520px,70vh)] flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-line/10 px-4 py-3">
            <h2 className="text-sm font-semibold">What we are finding</h2>
            <span className="text-xs text-muted tabular-nums">{s.done}/{s.total || "–"} checks done</span>
          </div>
          <div ref={logRef} className="scroll-thin flex-1 space-y-1 overflow-y-auto p-3 font-mono text-[12.5px] leading-relaxed" role="log" aria-live="off">
            {s.logs.length === 0 && Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-4" style={{ width: `${55 + ((i * 17) % 40)}%` }} />)}
            {s.logs.map((l) => (
              <motion.div key={l.id} initial={reduce ? false : { opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="flex gap-2">
                <span className={cn("shrink-0 font-semibold", l.level === "finding" ? "text-brand-text" : l.level === "ok" ? "text-success" : l.level === "warn" ? "text-warn" : l.level === "error" ? "text-danger" : "text-muted")}>
                  {(l.agent && labels[l.agent]) || "Scan"}
                </span>
                <span className="text-ink/85">{l.message}</span>
              </motion.div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
