import type { Level, Severity } from "./types";

/** Plain-English wording used across the report. The data keeps its original values; only the labels change. */
export const PRIORITY_LABEL: Record<Severity, string> = {
  Critical: "Fix first",
  High: "Important",
  Medium: "Good to do",
  Low: "Optional",
  Info: "Note",
};

export const PRIORITY_TONE = { Critical: "danger", High: "warn", Medium: "brand", Low: "muted", Info: "muted" } as const;
export const PRIORITY_RANK: Record<Severity, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4 };

export const BENEFIT_LABEL: Record<Level, string> = { High: "Big win", Medium: "Good win", Low: "Small win" };
export const WORK_LABEL: Record<Level, string> = { Low: "Quick to do", Medium: "Some work", High: "A lot of work" };
export const BENEFIT_RANK: Record<Level, number> = { High: 0, Medium: 1, Low: 2 };
export const WORK_RANK: Record<Level, number> = { Low: 0, Medium: 1, High: 2 };

export function verdict(score: number | null): { word: string; tone: "success" | "warn" | "danger" | "muted" } {
  if (score === null) return { word: "Not checked", tone: "muted" };
  if (score >= 80) return { word: "Great", tone: "success" };
  if (score >= 60) return { word: "Good, can improve", tone: "warn" };
  if (score >= 40) return { word: "Needs work", tone: "warn" };
  return { word: "Needs attention", tone: "danger" };
}

export const PLAN_STEPS = ["Do this week", "In the next 2 to 3 weeks", "This month", "Keep an eye on it"];

export function minutes(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
