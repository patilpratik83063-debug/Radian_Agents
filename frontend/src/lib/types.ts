// Mirrors backend/app/schemas.py
export type Severity = "Critical" | "High" | "Medium" | "Low" | "Info";
export type Level = "Low" | "Medium" | "High";
export type AuditType = "full" | "page" | "geo" | "schema" | "technical" | "local";
export type AuditStatus = "queued" | "running" | "done" | "failed";
export type AgentStatus = "idle" | "running" | "done" | "failed" | "skipped";

export interface FixSnippet { language: string; code: string; note: string }

export interface Finding {
  id: string; agent: string; title: string; severity: Severity; description: string;
  evidence: string; recommendation: string; impact: Level; effort: Level; fix_snippet: FixSnippet | null;
}

export interface Recommendation {
  id: string; title: string; priority: Severity; impact: Level; effort: Level; category: string;
  source_findings: string[]; observation: string; action: string; depends_on: string[];
  failure_check: string; leading_indicator: string; fix_snippet: FixSnippet | null;
}

export interface CategoryReport {
  key: string; label: string; group: "seo" | "ai"; score: number | null; weight: number; status: AgentStatus;
  summary: string; what_works: string[]; findings: Finding[]; error: string | null; duration_ms: number | null;
}

export interface Phase { name: string; timeframe: string; items: string[] }

export interface Report {
  url: string; audit_type: AuditType; seo_score: number | null; ai_score: number | null;
  executive_summary: string; business_type: string; top_findings: string[]; quick_wins: string[];
  categories: CategoryReport[]; recommendations: Recommendation[]; phases: Phase[]; warnings: string[];
  generated_at: string;
}

export interface AuditSummary {
  id: string; url: string; type: AuditType; status: AuditStatus;
  seo_score: number | null; ai_score: number | null; created_at: string; finished_at: string | null; error: string | null;
}
export interface AuditDetail extends AuditSummary { report: Report | null }


export interface Health {
  status: string; llm_configured: boolean; engine_present: boolean; ephemeral_ttl_minutes: number;
  demo_mode: boolean;
}

export interface AgentPlan { key: string; label: string; blurb: string; group: "seo" | "ai" }

export type LogLevel = "info" | "ok" | "warn" | "error" | "finding";

export interface EngineInfo { key: string; label: string; source: "measured" | "simulated"; description: string; available: boolean }
export interface SovPoint {
  date: string; source: "measured" | "simulated"; brand_mentions: number; total_mentions: number;
  share: number | null; by_name: Record<string, number>;
}
export interface VisPrompt {
  id: number; prompt: string; brand: string; competitors: string[]; engines: string[]; created_at: string;
  run_count: number; last_run_at: string | null; sov: SovPoint[];
}
export interface VisRun {
  id: number; prompt_id: number; engine: string; source: "measured" | "simulated"; answer: string;
  mentions: Record<string, number>; cited_urls: string[]; error: string | null; created_at: string;
}

