"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentPlan, AgentStatus, LogLevel } from "./types";

export interface LogLine { id: number; level: LogLevel; message: string; agent: string | null; at: number }
export interface AgentState extends AgentPlan { status: AgentStatus; score?: number; findings?: number; error?: string }

export interface StreamState {
  connected: boolean;
  phase: string;
  phaseLabel: string;
  agents: AgentState[];
  logs: LogLine[];
  done: number;
  total: number;
  scores: { seo: number | null; ai: number | null } | null;
  finished: "done" | "failed" | null;
  error: string | null;
  startedAt: number;
}

const initial = (): StreamState => ({
  connected: false, phase: "evidence", phaseLabel: "Starting", agents: [], logs: [], done: 0, total: 0,
  scores: null, finished: null, error: null, startedAt: Date.now(),
});

/** Subscribes to GET /api/audits/{id}/events (SSE). Reconnects resume via Last-Event-ID automatically. */
export function useAuditStream(auditId: string, onFinished: () => void): StreamState {
  const [state, setState] = useState<StreamState>(initial);
  const lineId = useRef(0);
  const finishedCb = useRef(onFinished);
  finishedCb.current = onFinished;

  useEffect(() => {
    setState(initial());
    const es = new EventSource(`${process.env.NEXT_PUBLIC_API_BASE ?? ""}/api/audits/${auditId}/events`);
    const on = <T,>(name: string, fn: (d: T) => void) =>
      es.addEventListener(name, (e) => fn(JSON.parse((e as MessageEvent).data) as T));

    es.onopen = () => setState((s) => ({ ...s, connected: true }));
    es.onerror = () => setState((s) => ({ ...s, connected: false }));

    on<{ phase: string; label: string }>("phase", (d) => setState((s) => ({ ...s, phase: d.phase, phaseLabel: d.label })));
    on<{ agents: AgentPlan[] }>("plan", (d) =>
      setState((s) => ({ ...s, total: d.agents.length, agents: d.agents.map((a) => ({ ...a, status: "idle" as AgentStatus })) })),
    );
    on<{ key: string; status: AgentStatus; score?: number; findings?: number; error?: string }>("agent", (d) =>
      setState((s) => ({ ...s, agents: s.agents.map((a) => (a.key === d.key ? { ...a, status: d.status, score: d.score, findings: d.findings, error: d.error } : a)) })),
    );
    on<{ done: number; total: number }>("progress", (d) => setState((s) => ({ ...s, done: d.done, total: d.total })));
    on<{ level: LogLevel; message: string; agent: string | null }>("log", (d) =>
      setState((s) => ({ ...s, logs: [...s.logs.slice(-299), { id: lineId.current++, level: d.level, message: d.message, agent: d.agent, at: Date.now() }] })),
    );
    on<{ seo_score: number | null; ai_score: number | null }>("scores", (d) => setState((s) => ({ ...s, scores: { seo: d.seo_score, ai: d.ai_score } })));
    on<{ seo_score: number | null }>("audit_done", () => {
      setState((s) => ({ ...s, finished: "done" }));
      es.close();
      finishedCb.current();
    });
    on<{ error: string }>("audit_failed", (d) => {
      setState((s) => ({ ...s, finished: "failed", error: d.error }));
      es.close();
      finishedCb.current();
    });
    return () => es.close();
  }, [auditId]);

  return state;
}
