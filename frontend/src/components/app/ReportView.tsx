"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarClock, ChevronDown, Download, Link2, ListChecks, Printer, ShieldOff, Sparkles, Trash2, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ScoreRing } from "@/components/ScoreRing";
import { Stagger, StaggerItem } from "@/components/motion/primitives";
import { Badge, Button, Card, CopyButton, EmptyState, Segmented, Select } from "@/components/ui/core";
import {
  BENEFIT_LABEL, BENEFIT_RANK, PLAN_STEPS, PRIORITY_LABEL, PRIORITY_RANK, PRIORITY_TONE, WORK_LABEL, WORK_RANK, minutes, verdict,
} from "@/lib/plain";
import type { CategoryReport, Recommendation, Report, Severity } from "@/lib/types";
import { cn, host, scoreTone } from "@/lib/utils";

type Sort = "priority" | "benefit" | "easy";

function Ephemeral({ expiresAt, onDiscard }: { expiresAt: number | null; onDiscard: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = expiresAt ? Math.max(0, Math.round((expiresAt - now) / 1000)) : null;
  return (
    <div className="no-print surface flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm">
      <span className="flex items-center gap-2.5">
        <ShieldOff className="h-4 w-4 shrink-0 text-brand-text" />
        <span>
          <b>This report is not saved anywhere.</b>
          {left !== null && <> It will disappear in <b className="tabular-nums">{minutes(left)}</b>.</>} Download it now if you want to keep it.
        </span>
      </span>
      <Button variant="secondary" size="sm" onClick={onDiscard}><Trash2 className="h-4 w-4" /> Delete now</Button>
    </div>
  );
}

export function ReportView({ report, auditId, expiresAt, onDiscard }: { report: Report; auditId: string; expiresAt: number | null; onDiscard: () => void }) {
  const [filter, setFilter] = useState<Severity | "all">("all");
  const [area, setArea] = useState("all");
  const [sort, setSort] = useState<Sort>("priority");

  const labelOf = useMemo(() => Object.fromEntries(report.categories.map((c) => [c.key, c.label])) as Record<string, string>, [report.categories]);
  const byId = useMemo(() => new Map(report.recommendations.map((r) => [r.id, r])), [report.recommendations]);

  const recs = useMemo(() => {
    const list = report.recommendations.filter((r) => (filter === "all" || r.priority === filter) && (area === "all" || r.category === area));
    return [...list].sort((a, b) => {
      if (sort === "benefit") return BENEFIT_RANK[a.impact] - BENEFIT_RANK[b.impact] || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (sort === "easy") return WORK_RANK[a.effort] - WORK_RANK[b.effort] || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    });
  }, [report.recommendations, filter, area, sort]);

  const startHere = useMemo(() => {
    const ids = report.top_findings.length ? report.top_findings : report.recommendations.slice(0, 3).map((r) => r.id);
    return ids.map((id) => byId.get(id)).filter((r): r is Recommendation => !!r).slice(0, 3);
  }, [report, byId]);
  const easyWins = report.quick_wins.map((id) => byId.get(id)).filter((r): r is Recommendation => !!r).slice(0, 4);

  const chart = report.categories.filter((c) => c.score !== null).map((c) => ({ name: c.label, score: c.score as number, group: c.group }));
  const counts = report.recommendations.reduce<Record<string, number>>((m, r) => ({ ...m, [r.priority]: (m[r.priority] ?? 0) + 1 }), {});
  const seo = verdict(report.seo_score);
  const ai = verdict(report.ai_score);

  return (
    <div className="space-y-8">
      <Ephemeral expiresAt={expiresAt} onDiscard={onDiscard} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted">Website check for</p>
          <h1 className="mt-1 text-3xl font-bold sm:text-4xl">{host(report.url)}</h1>
          <a href={report.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted hover:text-brand-text">
            <Link2 className="h-3.5 w-3.5" /> {report.url}
          </a>
          <p className="mt-1 text-xs text-muted">Checked on {new Date(report.generated_at).toLocaleString()}</p>
        </div>
        <div className="no-print flex gap-2">
          <a href={`/api/audits/${auditId}/export.md`} download>
            <Button variant="secondary" size="sm" type="button"><Download className="h-4 w-4" /> Download</Button>
          </a>
          <Button variant="secondary" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> Save as PDF</Button>
        </div>
      </div>

      <Stagger className="grid gap-4 lg:grid-cols-[auto_auto_1fr]">
        <StaggerItem>
          <Card className="grid place-items-center p-7">
            <ScoreRing score={report.seo_score} label="Google & search engines" sub="How easy it is for people to find you in search" emptyLabel="Not checked in this scan" />
            <Badge tone={seo.tone} className="mt-3">{seo.word}</Badge>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card className="grid place-items-center p-7">
            <ScoreRing score={report.ai_score} label="AI tools like ChatGPT" sub="How easy it is for AI to find you and quote you" emptyLabel="Not checked in this scan" brand />
            <Badge tone={ai.tone} className="mt-3">{ai.word}</Badge>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card className="h-full p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted"><Sparkles className="h-4 w-4" /> The short version</h2>
            <p className="mt-3 text-lg leading-relaxed">{report.executive_summary}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {(["Critical", "High", "Medium", "Low"] as const).filter((p) => counts[p]).map((p) => (
                <Badge key={p} tone={PRIORITY_TONE[p]}>{counts[p]} {PRIORITY_LABEL[p].toLowerCase()}</Badge>
              ))}
            </div>
          </Card>
        </StaggerItem>
      </Stagger>

      {report.warnings.length > 0 && (
        <Card className="border-warn/30 bg-warn/8 p-4 text-sm">
          <div className="font-semibold text-warn">Things we could not check</div>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-ink/80">{report.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </Card>
      )}

      {startHere.length > 0 && (
        <section aria-labelledby="start-h" className="space-y-3">
          <h2 id="start-h" className="flex items-center gap-2 text-2xl font-bold"><ListChecks className="h-6 w-6 text-brand-text" /> Start here</h2>
          <p className="text-muted">If you only do a few things, do these.</p>
          <div className="grid gap-3 md:grid-cols-3">
            {startHere.map((r) => (
              <Card key={r.id} className="p-5">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-brand text-sm font-bold text-white">{r.id.replace(/^R/, "")}</div>
                <h3 className="mt-3 text-lg font-semibold leading-snug">{r.title}</h3>
                <div className="mt-3 flex flex-wrap gap-2"><Badge tone="brand">{BENEFIT_LABEL[r.impact]}</Badge><Badge>{WORK_LABEL[r.effort]}</Badge></div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="plan-h" className="space-y-4">
        <div className="no-print flex flex-wrap items-end justify-between gap-3">
          <h2 id="plan-h" className="text-2xl font-bold">What to fix <span className="text-base font-medium text-muted">({recs.length})</span></h2>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented label="Show" value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "Critical", label: "Fix first" }, { value: "High", label: "Important" }, { value: "Medium", label: "Good to do" }, { value: "Low", label: "Optional" }]} />
            <Select aria-label="Area" value={area} onChange={(e) => setArea(e.target.value)} className="h-10 w-auto">
              <option value="all">All areas</option>
              {report.categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </Select>
            <Select aria-label="Order" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-10 w-auto">
              <option value="priority">Most important first</option>
              <option value="benefit">Biggest win first</option>
              <option value="easy">Quickest first</option>
            </Select>
          </div>
        </div>
        {recs.length === 0 ? (
          <EmptyState icon={<ListChecks className="h-6 w-6" />} title="Nothing matches" body="Try a different filter." action={<Button variant="secondary" onClick={() => { setFilter("all"); setArea("all"); }}>Show everything</Button>} />
        ) : (
          <div className="space-y-3">{recs.map((r) => <RecCard key={r.id} rec={r} byId={byId} areaLabel={labelOf[r.category]} />)}</div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]" aria-label="Scores and plan">
        <Card className="self-start p-6">
          <h2 className="text-lg font-semibold">Score by area</h2>
          <p className="text-sm text-muted">Out of 100. Higher is better.</p>
          <div className="mt-4" style={{ height: Math.max(180, chart.length * 44) }} role="img" aria-label={`Scores: ${chart.map((c) => `${c.name} ${c.score}`).join(", ")}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} layout="vertical" margin={{ left: 8, right: 24 }}>
                <XAxis type="number" domain={[0, 100]} tick={{ fill: "rgb(var(--muted))", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fill: "rgb(var(--ink))", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "rgb(var(--ink) / 0.05)" }} contentStyle={{ background: "rgb(var(--surface))", border: "1px solid rgb(var(--line) / 0.12)", borderRadius: 12, color: "rgb(var(--ink))" }} />
                <Bar dataKey="score" radius={[0, 8, 8, 0]} barSize={16}>
                  {chart.map((c) => <Cell key={c.name} fill={`rgb(var(--${scoreTone(c.score) === "muted" ? "muted" : scoreTone(c.score)}))`} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="space-y-4">
          {easyWins.length > 0 && (
            <Card className="p-6">
              <h2 className="flex items-center gap-2 font-semibold"><Zap className="h-4 w-4 text-warn" /> Easy wins</h2>
              <p className="text-sm text-muted">Quick to do, and they help.</p>
              <ul className="mt-3 space-y-2 text-sm">{easyWins.map((r) => <li key={r.id} className="flex gap-2"><Badge tone="brand">{r.id.replace(/^R/, "")}</Badge><span>{r.title}</span></li>)}</ul>
            </Card>
          )}
          {report.phases.some((p) => p.items.length) && (
            <Card className="p-6">
              <h2 className="flex items-center gap-2 font-semibold"><CalendarClock className="h-4 w-4 text-brand-text" /> A simple plan</h2>
              <ol className="mt-3 space-y-4 text-sm">
                {report.phases.map((p, i) => ({ p, i })).filter(({ p }) => p.items.length).map(({ p, i }) => (
                  <li key={p.name}>
                    <div className="font-semibold">{PLAN_STEPS[i] ?? p.timeframe}</div>
                    <ul className="mt-1 space-y-1 text-muted">
                      {p.items.map((id) => byId.get(id)).filter((r): r is Recommendation => !!r).map((r) => <li key={r.id}>{r.id.replace(/^R/, "")}. {r.title}</li>)}
                    </ul>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>
      </section>

      <section aria-labelledby="detail-h" className="space-y-3">
        <h2 id="detail-h" className="text-2xl font-bold">Details for each area</h2>
        <p className="text-muted">Open an area to see what we checked and what is already working.</p>
        {report.categories.map((c) => <AreaCard key={c.key} cat={c} />)}
      </section>
    </div>
  );
}

function RecCard({ rec, byId, areaLabel }: { rec: Recommendation; byId: Map<string, Recommendation>; areaLabel?: string }) {
  const [open, setOpen] = useState(rec.priority === "Critical");
  const panel = `rec-${rec.id}`;
  return (
    <Card className="overflow-hidden">
      <button className="flex w-full items-start gap-4 p-5 text-left" aria-expanded={open} aria-controls={panel} onClick={() => setOpen((o) => !o)}>
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand-text">{rec.id.replace(/^R/, "")}</span>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold leading-snug">{rec.title}</div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <Badge tone={PRIORITY_TONE[rec.priority]}>{PRIORITY_LABEL[rec.priority]}</Badge>
            <Badge>{BENEFIT_LABEL[rec.impact]}</Badge>
            <Badge>{WORK_LABEL[rec.effort]}</Badge>
            {areaLabel && <Badge tone="muted">{areaLabel}</Badge>}
          </div>
        </div>
        <ChevronDown className={cn("mt-1 h-5 w-5 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={panel} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
            <div className="space-y-4 border-t border-line/10 px-5 pb-5 pt-4">
              <Field label="What we found" body={rec.observation} />
              <Field label="What to do" body={rec.action} strong />
              {rec.depends_on.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">Do these first:</span>
                  {rec.depends_on.map((d) => <Badge key={d}>{d.replace(/^R/, "")}{byId.get(d) ? `. ${byId.get(d)!.title}` : ""}</Badge>)}
                </div>
              )}
              {rec.fix_snippet && (
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">Ready-made code you can copy</span>
                    <CopyButton text={rec.fix_snippet.code} label="Copy code" className="no-print" />
                  </div>
                  <pre className="scroll-thin overflow-x-auto rounded-md border border-line/10 bg-surface-2 p-4 font-mono text-[12.5px] leading-relaxed"><code>{rec.fix_snippet.code}</code></pre>
                  {rec.fix_snippet.note && <p className="mt-1.5 text-xs text-muted">{rec.fix_snippet.note}</p>}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="How you will know it did not work" body={rec.failure_check} soft />
                <Field label="An early sign it is working" body={rec.leading_indicator} soft />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function Field({ label, body, strong, soft }: { label: string; body: string; strong?: boolean; soft?: boolean }) {
  if (!body) return null;
  return (
    <div className={cn(soft && "rounded-md bg-brand-50 p-3.5")}>
      <div className="text-sm font-semibold text-muted">{label}</div>
      <p className={cn("mt-1 leading-relaxed", strong ? "text-base font-medium" : "text-ink/90")}>{body}</p>
    </div>
  );
}

function AreaCard({ cat }: { cat: CategoryReport }) {
  const [open, setOpen] = useState(false);
  const v = verdict(cat.score);
  return (
    <Card>
      <button className="flex w-full items-center gap-4 p-5 text-left" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <div className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-full font-display text-base font-bold", cat.status === "failed" ? "bg-danger/12 text-danger" : "bg-brand-soft text-brand-text")}>
          {cat.score ?? "–"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{cat.label} <Badge tone={v.tone} className="ml-1">{cat.status === "failed" ? "Could not check" : v.word}</Badge></div>
          <p className="truncate text-sm text-muted">{cat.status === "failed" ? cat.error : cat.summary}</p>
        </div>
        <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-4 border-t border-line/10 p-5 text-sm">
          <p className="leading-relaxed">{cat.summary}</p>
          {cat.what_works.length > 0 && (
            <div>
              <div className="font-semibold text-success">Already working</div>
              <ul className="mt-1.5 list-disc space-y-1 pl-5">{cat.what_works.map((w) => <li key={w}>{w}</li>)}</ul>
            </div>
          )}
          {cat.findings.filter((f) => f.severity !== "Info").length > 0 && (
            <div>
              <div className="font-semibold">What we noticed</div>
              <ul className="mt-2 space-y-2">
                {cat.findings.filter((f) => f.severity !== "Info").map((f) => (
                  <li key={f.id} className="rounded-md bg-surface-2 p-3">
                    <div className="flex flex-wrap items-center gap-2"><Badge tone={PRIORITY_TONE[f.severity]}>{PRIORITY_LABEL[f.severity]}</Badge><span className="font-medium">{f.title}</span></div>
                    {f.description && <p className="mt-1.5 text-muted">{f.description}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
