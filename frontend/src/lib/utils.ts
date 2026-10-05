import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function timeAgo(iso: string | null) {
  if (!iso) return "never";
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export type Tone = "success" | "warn" | "danger" | "muted";

export function scoreTone(score: number | null): Tone {
  if (score === null) return "muted";
  if (score >= 80) return "success";
  if (score >= 55) return "warn";
  return "danger";
}

export const AUDIT_LABELS: Record<string, string> = {
  full: "Full audit",
  page: "Single page",
  geo: "GEO / AI visibility",
  schema: "Schema",
  technical: "Technical",
  local: "Local",
};
