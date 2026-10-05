"use client";

import { useParams, useRouter } from "next/navigation";
import { LiveAudit } from "@/components/app/LiveAudit";
import { ReportView } from "@/components/app/ReportView";
import { ButtonLink, ErrorState, Skeleton } from "@/components/ui/core";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";

export default function AuditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, loading, reload } = useAsync(() => api.audit(id), [id]);
  const health = useAsync(() => api.health());

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-56" /><Skeleton className="h-56" /><Skeleton className="h-56" />
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }
  if (error || !data) return <ErrorState title="Could not load this audit" message={error ?? "Not found"} onRetry={reload} />;

  if (data.status === "failed") {
    return (
      <div className="space-y-4">
        <ErrorState title="This audit failed" message={data.error ?? "Unknown error"} />
        <ButtonLink href="/new" variant="secondary">Start a new audit</ButtonLink>
      </div>
    );
  }
  if (data.status !== "done" || !data.report) return <LiveAudit auditId={id} url={data.url} onFinished={reload} />;
  const expiresAt = data.finished_at && health.data ? new Date(data.finished_at).getTime() + health.data.ephemeral_ttl_minutes * 60_000 : null;
  return (
    <ReportView
      report={data.report}
      auditId={id}
      expiresAt={expiresAt}
      onDiscard={async () => {
        await api.discardAudit(id);
        router.replace("/dashboard");
      }}
    />
  );
}
