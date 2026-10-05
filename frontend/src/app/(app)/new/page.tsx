"use client";

import { ChevronDown, Globe, Loader2, Rocket } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Magnetic } from "@/components/motion/light";
import { Badge, Button, Card, Input } from "@/components/ui/core";
import { api } from "@/lib/api";
import type { AuditType } from "@/lib/types";
import { cn } from "@/lib/utils";

const TYPES: { value: AuditType; title: string; body: string; agents: string[] }[] = [
  { value: "full", title: "Full check", body: "The complete health check: search, content, speed and AI visibility.", agents: ["Site health", "Sitemap", "Content quality", "Titles & headings", "Search listing data", "Page speed", "Images", "AI search visibility", "AI assistant access", "Visitor match", "Local search (if it applies)"] },
  { value: "page", title: "One page", body: "A close look at a single page.", agents: ["Site health", "Content quality", "Titles & headings", "Search listing data", "Images"] },
  { value: "geo", title: "AI visibility", body: "Can AI tools like ChatGPT find and quote your site?", agents: ["AI search visibility", "AI assistant access"] },
  { value: "schema", title: "Search listing data", body: "The hidden details that help your site look better in search results.", agents: ["Search listing data"] },
  { value: "technical", title: "Site health", body: "Can search engines reach your pages, and are they fast?", agents: ["Site health", "Sitemap", "Page speed"] },
  { value: "local", title: "Local business", body: "Is your business easy to find for people nearby?", agents: ["Local search", "Search listing data", "Titles & headings"] },
];

function NewAuditForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [url, setUrl] = useState(params.get("url") ?? "");
  const [type, setType] = useState<AuditType>("full");
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = TYPES.find((t) => t.value === type)!;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold sm:text-4xl">Check a website</h1>
        <p className="mt-1 text-muted">Type a website address. It takes about 1 to 2 minutes.</p>
      </div>
      <form
        className="space-y-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const { id } = await api.createAudit(url.trim(), type);
            router.push(`/audits/${id}`);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not start the audit");
            setBusy(false);
          }
        }}
      >
        <div>
          <label htmlFor="url" className="mb-2 block text-sm font-medium">Website URL</label>
          <div className="relative">
            <Globe className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input id="url" inputMode="url" autoFocus placeholder="example.com" value={url} onChange={(e) => setUrl(e.target.value)} className="h-14 pl-11 text-base" aria-invalid={!!error} aria-describedby={error ? "url-err" : undefined} />
          </div>
          {error && <p id="url-err" role="alert" className="mt-2 text-sm text-danger">{error}</p>}
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">What do you want to check?</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {TYPES.map((t) => (
              <label key={t.value} className={cn("surface cursor-pointer rounded-lg p-4 transition-transform duration-300 hover:-translate-y-0.5 focus-within:outline focus-within:outline-2 focus-within:outline-brand", type === t.value && "!border-brand ring-2 ring-brand/30")}>
                <input type="radio" name="type" value={t.value} checked={type === t.value} onChange={() => setType(t.value)} className="sr-only" />
                <div className="flex items-center justify-between"><span className="font-semibold">{t.title}</span>{type === t.value && <Badge tone="brand">Selected</Badge>}</div>
                <p className="mt-1 text-sm text-muted">{t.body}</p>
              </label>
            ))}
          </div>
        </fieldset>

        <Card className="overflow-hidden">
          <button type="button" aria-expanded={advanced} onClick={() => setAdvanced((a) => !a)} className="flex w-full items-center justify-between p-4 text-left text-sm font-semibold">
            See what will be checked
            <ChevronDown className={cn("h-4 w-4 transition-transform", advanced && "rotate-180")} />
          </button>
          {advanced && (
            <div className="space-y-3 border-t border-line/10 p-4 text-sm">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Checks for “{selected.title}” (all run at the same time)</div>
                <div className="flex flex-wrap gap-2">{selected.agents.map((a) => <Badge key={a}>{a}</Badge>)}</div>
              </div>
              <ul className="list-disc space-y-1 pl-5 text-muted">
                <li>The page is opened the way a visitor would see it, with strict time limits. Private and internal addresses are refused.</li>
                <li>Audits are rate-limited. A typical run takes 1–2 minutes.</li>
                <li>Nothing is saved: the report disappears automatically after a while.</li>
              </ul>
            </div>
          )}
        </Card>

        <Magnetic>
          <Button type="submit" size="lg" disabled={busy || url.trim().length < 3}>
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Rocket className="h-5 w-5" />}
            {busy ? "Starting…" : "Start the check"}
          </Button>
        </Magnetic>
      </form>
    </div>
  );
}

export default function NewAuditPage() {
  return (
    <Suspense>
      <NewAuditForm />
    </Suspense>
  );
}
