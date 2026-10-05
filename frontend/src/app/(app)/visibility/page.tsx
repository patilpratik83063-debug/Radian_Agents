"use client";

import { FlaskConical, Loader2, Play, Plus, Radar, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Button, Card, EmptyState, ErrorState, Input, Skeleton } from "@/components/ui/core";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import type { EngineInfo, SovPoint, VisPrompt, VisRun } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

function SourceBadge({ source }: { source: "measured" | "simulated" }) {
  return source === "measured" ? (
    <Badge tone="success"><ShieldCheck className="h-3 w-3" /> Live data</Badge>
  ) : (
    <Badge tone="warn"><FlaskConical className="h-3 w-3" /> Simulated</Badge>
  );
}

export default function VisibilityPage() {
  const prompts = useAsync(() => api.prompts());
  const engines = useAsync(() => api.engines());
  const [adding, setAdding] = useState(false);

  // Poll while a run is in flight (runs complete in the background).
  const [pollUntil, setPollUntil] = useState(0);
  useEffect(() => {
    if (!pollUntil) return;
    const t = setInterval(() => {
      prompts.reload();
      if (Date.now() > pollUntil) setPollUntil(0);
    }, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollUntil]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">AI visibility tracker</h1>
          <p className="mt-1 max-w-2xl text-muted">Track whether your brand is named for the prompts your customers ask. Every data point is labelled by where it came from. Nothing is persisted: prompts and results are erased automatically.</p>
        </div>
        <Button onClick={() => setAdding((a) => !a)}><Plus className="h-4 w-4" /> Track a prompt</Button>
      </div>

      <Card className="grid gap-3 p-5 sm:grid-cols-2">
        {engines.data?.map((e) => (
          <div key={e.key} className="flex items-start gap-3">
            <SourceBadge source={e.source} />
            <div className="text-sm"><div className="font-semibold">{e.label}{!e.available && <span className="ml-2 text-xs text-danger">not configured</span>}</div><p className="text-muted">{e.description}</p></div>
          </div>
        )) ?? <Skeleton className="h-12 w-full sm:col-span-2" />}
      </Card>

      {adding && engines.data && <AddPrompt engines={engines.data} onDone={() => { setAdding(false); prompts.reload(); setPollUntil(Date.now() + 150_000); }} />}

      {prompts.error && <ErrorState message={prompts.error} onRetry={prompts.reload} />}
      {prompts.loading && !prompts.data && <Skeleton className="h-64" />}
      {prompts.data && prompts.data.length === 0 && !adding && (
        <EmptyState icon={<Radar className="h-6 w-6" />} title="No prompts tracked" body="Add a prompt such as “best CRM for small agencies”, your brand and its competitors." action={<Button onClick={() => setAdding(true)}>Track your first prompt</Button>} />
      )}
      <div className="space-y-5">
        {prompts.data?.map((p) => <PromptCard key={p.id} prompt={p} onChange={prompts.reload} onRun={() => setPollUntil(Date.now() + 120_000)} running={pollUntil > 0} />)}
      </div>
    </div>
  );
}

function AddPrompt({ engines, onDone }: { engines: EngineInfo[]; onDone: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [brand, setBrand] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [selected, setSelected] = useState<string[]>(engines.filter((e) => e.available).map((e) => e.key));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card className="p-6">
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const created = await api.createPrompt({ prompt, brand, competitors: competitors.split(",").map((c) => c.trim()).filter(Boolean), engines: selected });
            await api.runPrompt(created.id);
            onDone();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed");
            setBusy(false);
          }
        }}
      >
        <label className="text-sm font-medium sm:col-span-2">Prompt<Input className="mt-1.5" required minLength={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="best project management tool for agencies" /></label>
        <label className="text-sm font-medium">Your brand<Input className="mt-1.5" required value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Radian Marketing" /></label>
        <label className="text-sm font-medium">Competitors (comma separated)<Input className="mt-1.5" value={competitors} onChange={(e) => setCompetitors(e.target.value)} placeholder="Acme, Globex" /></label>
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-sm font-medium">Engines</legend>
          <div className="flex flex-wrap gap-3">
            {engines.map((en) => (
              <label key={en.key} className={cn("flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm", selected.includes(en.key) ? "border-brand bg-brand/8" : "border-line/12", !en.available && "opacity-50")}>
                <input type="checkbox" disabled={!en.available} checked={selected.includes(en.key)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, en.key] : s.filter((k) => k !== en.key)))} />
                {en.label} <SourceBadge source={en.source} />
              </label>
            ))}
          </div>
        </fieldset>
        {error && <p role="alert" className="text-sm text-danger sm:col-span-2">{error}</p>}
        <div className="sm:col-span-2"><Button type="submit" disabled={busy || selected.length === 0}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add and run now</Button></div>
      </form>
    </Card>
  );
}

function PromptCard({ prompt, onChange, onRun, running }: { prompt: VisPrompt; onChange: () => void; onRun: () => void; running: boolean }) {
  const [runs, setRuns] = useState<VisRun[] | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open) api.runs(prompt.id).then(setRuns).catch(() => setRuns([]));
  }, [open, prompt.id, prompt.run_count]);

  const series = useMemo(() => {
    const days = [...new Set(prompt.sov.map((s) => s.date))].sort();
    return days.map((d) => {
      const row: Record<string, string | number | null> = { date: d.slice(5) };
      prompt.sov.filter((s: SovPoint) => s.date === d).forEach((s) => { row[s.source] = s.share; });
      return row;
    });
  }, [prompt.sov]);
  const sources = [...new Set(prompt.sov.map((s) => s.source))];
  const latest = (src: "measured" | "simulated") => [...prompt.sov].reverse().find((s) => s.source === src);

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">&ldquo;{prompt.prompt}&rdquo;</h2>
          <p className="mt-1 text-sm text-muted">Brand <b className="text-ink">{prompt.brand}</b> vs {prompt.competitors.join(", ") || "no competitors"} · {prompt.run_count} runs · last {timeAgo(prompt.last_run_at)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" disabled={running} onClick={async () => { await api.runPrompt(prompt.id); onRun(); }}>{running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run now</Button>
          <Button variant="ghost" size="sm" aria-label="Delete prompt" className="w-9 px-0" onClick={async () => { await api.deletePrompt(prompt.id); onChange(); }}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[1fr_260px]">
        <div className="h-52">
          {series.length === 0 ? <p className="grid h-full place-items-center text-sm text-muted">{running ? "Running… results appear here." : "No completed runs yet."}</p> : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ left: -20, right: 8, top: 8 }}>
                <CartesianGrid stroke="rgb(var(--ink) / 0.07)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "rgb(var(--muted))", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} unit="%" tick={{ fill: "rgb(var(--muted))", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "rgb(var(--surface))", border: "1px solid rgb(var(--line) / 0.12)", borderRadius: 12, color: "rgb(var(--ink))" }} />
                <Legend />
                {sources.includes("measured") && <Line type="monotone" dataKey="measured" name="Brand mentions: live data" stroke="rgb(var(--success))" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />}
                {sources.includes("simulated") && <Line type="monotone" dataKey="simulated" name="Brand mentions: simulated" stroke="rgb(var(--warn))" strokeWidth={2.5} strokeDasharray="6 4" dot={{ r: 4 }} connectNulls />}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="space-y-3">
          {(["measured", "simulated"] as const).map((src) => {
            const l = latest(src);
            if (!prompt.engines.some((e) => (src === "measured" ? e === "google_live" : e === "ai_simulation"))) return null;
            return (
              <div key={src} className="rounded-md bg-surface-2 p-3">
                <SourceBadge source={src} />
                <div className="mt-2 font-display text-3xl font-bold tabular-nums">{l?.share != null ? `${l.share}%` : "–"}</div>
                <div className="text-xs text-muted">{l ? `${l.brand_mentions} of ${l.total_mentions} mentions` : "no data yet"}</div>
              </div>
            );
          })}
        </div>
      </div>

      <button className="mt-4 text-sm font-semibold text-brand-text" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? "Hide runs" : "Show runs & cited sources"}</button>
      {open && (
        <div className="mt-3 space-y-3">
          {runs === null ? <Skeleton className="h-24" /> : runs.length === 0 ? <p className="text-sm text-muted">No runs yet.</p> : runs.slice(0, 8).map((r) => (
            <div key={r.id} className="rounded-md border border-line/10 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2"><SourceBadge source={r.source} /><span className="text-muted">{r.source === "measured" ? "Live Google results" : "AI answer simulation"} · {timeAgo(r.created_at)}</span></div>
              {r.error ? <p className="mt-2 text-danger">Run failed: {r.error}</p> : (
                <>
                  <div className="mt-2 flex flex-wrap gap-2">{Object.entries(r.mentions).map(([n, c]) => <Badge key={n} tone={n === prompt.brand ? "brand" : "neutral"}>{n}: {c}</Badge>)}</div>
                  {r.cited_urls.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-muted">{r.cited_urls.slice(0, 6).map((u) => <li key={u} className="truncate">{u}</li>)}</ul>}
                  {r.source === "simulated" && <p className="mt-2 whitespace-pre-wrap text-ink/80">{r.answer.slice(0, 600)}{r.answer.length > 600 ? "…" : ""}</p>}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
