"use client";

import { ArrowUpRight, FileSearch, PlusCircle, Timer } from "lucide-react";
import Link from "next/link";
import { ScoreRing } from "@/components/ScoreRing";
import { AnimatedNumber } from "@/components/motion/light";
import { Stagger, StaggerItem } from "@/components/motion/primitives";
import { Badge, ButtonLink, Card, EmptyState, ErrorState, Skeleton } from "@/components/ui/core";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import type { AuditStatus } from "@/lib/types";
import { AUDIT_LABELS, host, timeAgo } from "@/lib/utils";

const STATUS_TONE: Record<AuditStatus, "success" | "brand" | "danger" | "muted"> = { done: "success", running: "brand", queued: "muted", failed: "danger" };

export default function Dashboard() {
  const audits = useAsync(() => api.audits(20));
  const health = useAsync(() => api.health());

  const latest = audits.data?.find((a) => a.status === "done");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">Dashboard</h1>
          <p className="mt-1 text-muted">Nothing is stored: reports live in memory and vanish on their own.</p>
        </div>
        <ButtonLink href="/new"><PlusCircle className="h-4 w-4" /> Check a website</ButtonLink>
      </div>

      {health.data && !health.data.llm_configured && (
        <ErrorState title="Audits are unavailable" message="The audit service isn't set up on this server yet. Please try again later." />
      )}

      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StaggerItem><Stat label="Reports right now" value={audits.data?.length} loading={audits.loading} icon={<FileSearch className="h-4 w-4" />} /></StaggerItem>
        <StaggerItem><Stat label="Reports disappear after" value={health.data?.ephemeral_ttl_minutes} loading={health.loading} icon={<Timer className="h-4 w-4" />} suffix=" min" /></StaggerItem>
        <StaggerItem className="sm:col-span-2">
          <Card className="flex h-full items-center justify-around gap-4 p-4">
            {audits.loading ? <Skeleton className="h-24 w-full" /> : latest ? (
              <>
                <ScoreRing score={latest.seo_score} label="Google & search engines" size={96} stroke={9} />
                <ScoreRing score={latest.ai_score} label="AI tools like ChatGPT" size={96} stroke={9} brand />
              </>
            ) : <p className="text-sm text-muted">Scores appear after your first audit.</p>}
          </Card>
        </StaggerItem>
      </Stagger>

      <section aria-labelledby="recent-h" className="space-y-3">
        <h2 id="recent-h" className="text-xl font-semibold">Recent checks</h2>
        {audits.error ? (
          <ErrorState message={audits.error} onRetry={audits.reload} />
        ) : audits.loading ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[72px]" />)}</div>
        ) : audits.data && audits.data.length > 0 ? (
          <Stagger className="space-y-3">
            {audits.data.map((a) => (
              <StaggerItem key={a.id}>
                <Link href={`/audits/${a.id}`} className="group flex items-center gap-4 surface rounded-lg p-4 transition-transform duration-300 hover:-translate-y-0.5">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-soft font-display font-bold text-brand-text">{host(a.url).charAt(0).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{host(a.url)}</div>
                    <div className="text-xs text-muted">{AUDIT_LABELS[a.type]} · {timeAgo(a.created_at)}</div>
                  </div>
                  <Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge>
                  {a.status === "done" && (
                    <div className="hidden gap-4 text-sm tabular-nums sm:flex">
                      <span><span className="text-muted">SEO</span> <b>{a.seo_score ?? "–"}</b></span>
                      <span><span className="text-muted">AI</span> <b>{a.ai_score ?? "–"}</b></span>
                    </div>
                  )}
                  <ArrowUpRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </Link>
              </StaggerItem>
            ))}
          </Stagger>
        ) : (
          <EmptyState icon={<FileSearch className="h-6 w-6" />} title="No checks yet" body="Check a website to see how easy it is to find in search and for AI tools." action={<ButtonLink href="/new">Check a website</ButtonLink>} />
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, loading, icon, suffix }: { label: string; value?: number; loading: boolean; icon: React.ReactNode; suffix?: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm text-muted">{icon}{label}</div>
      <div className="mt-2 font-display text-4xl font-bold">{loading || value === undefined ? <Skeleton className="h-10 w-16" /> : <AnimatedNumber value={value} suffix={suffix} />}</div>
    </Card>
  );
}
