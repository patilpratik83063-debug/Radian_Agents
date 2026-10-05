import type {
  AuditDetail, AuditSummary, AuditType, EngineInfo, Health, VisPrompt, VisRun,
} from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    credentials: "same-origin",
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      // error body was not JSON; keep the status text
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const post = <T,>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  health: () => request<Health>("/health"),
  createAudit: (url: string, type: AuditType) => post<{ id: string }>("/audits", { url, type }),
  audits: (limit = 50) => request<AuditSummary[]>(`/audits?limit=${limit}`),
  audit: (id: string) => request<AuditDetail>(`/audits/${id}`),
  discardAudit: (id: string) => request<void>(`/audits/${id}`, { method: "DELETE" }),
  engines: () => request<EngineInfo[]>("/visibility/engines"),
  prompts: () => request<VisPrompt[]>("/visibility/prompts"),
  createPrompt: (b: { prompt: string; brand: string; competitors: string[]; engines: string[] }) =>
    post<VisPrompt>("/visibility/prompts", b),
  deletePrompt: (id: number) => request<void>(`/visibility/prompts/${id}`, { method: "DELETE" }),
  runPrompt: (id: number) => post<{ status: string }>(`/visibility/prompts/${id}/run`),
  runs: (id: number) => request<VisRun[]>(`/visibility/prompts/${id}/runs`),
};
