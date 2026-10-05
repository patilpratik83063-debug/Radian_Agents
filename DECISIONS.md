# Decisions

Judgement calls made autonomously. Newest last.

1. **Engine vendored, not submoduled.** `claude-seo` was already cloned; moved to `/engine`, nested `.git`
   removed so the app repo owns the files. Upstream commit: `4b99de2f7de7e7d5247042e5fb5b4ea9368ef734`.
   `LICENSE` kept in place.
2. **Logo.** The Radian logo was found at `engine/public/logo.png` (not repo-root `public/`). Brand blue
   sampled from the file: `#2C59FC` (RGB 44,89,252). Background in the file is `#F7F7F7`.
3. **Engine invoked directly with Python.** claude-seo's `claude-seo run` launcher manages its own venv for
   Claude Code. We call `python engine/scripts/<name>.py` with the backend interpreter instead, via an
   allow-listed runner (no shell, argument-vector only).
4. **Dependencies subset.** The backend installs only the engine dependencies needed by audit scripts
   (not weasyprint/google-ads/matplotlib). Google tier scripts are optional and gated on keys.
5. **Docker base.** `python:3.12-slim` + `playwright install --with-deps chromium` rather than the Playwright
   image, to avoid pip/browser version mismatch.
6. **Tool-use loop.** Claude Code subagents call scripts through Bash. Here each agent gets a constrained
   function-calling tool (`run_script`, `read_reference`) restricted to an allow-list, with URL arguments
   validated through the engine's `url_safety` module.
7. **No storage at all (user instruction, supersedes the earlier SQLite and Supabase decisions).** Reports, SSE events
   and tracker runs live only in process memory (`app/store.py`), are erased after `EPHEMERAL_TTL_MINUTES` (default 60),
   can be erased immediately (`DELETE /api/audits/{id}`, "Erase now"), and are wiped on shutdown. Engine scripts get a
   throwaway `$HOME` (temp dir removed at exit); the drift scripts, which persist to disk, are not exposed. The Supabase
   tables created earlier were dropped and its credentials removed.
8. **Model.** `LLM_MODEL=deepseek-chat` (set in `.env`, never in code).
9. **Bright Data replaces SERP API** for the visibility tracker's measured-engine adapter (`BRIGHTDATA_API_KEY`).
10. **Scoring.** Two independent scores computed in code (`app/scoring.py`), never by the LLM: Search SEO is the
    weighted mean of completed agents using claude-seo's weights (technical 14 + sitemap 8, content 23, on-page 20,
    schema 10, performance 10, images 5, local 10 when detected), AI Visibility is GEO 60 / agent-readiness 40.
    Weights renormalise over agents that completed; failed agents are listed in warnings and never scored.
11. **Visual agent skipped.** claude-seo's `seo-visual` needs screenshots plus a vision model; DeepSeek is
    text-only, so it is not run.
12. **Synthesis grounding.** Recommendations citing no real finding id are dropped, Critical/High findings the
    model skipped are appended unchanged, and fix snippets are copied from the source findings in code.
13. **No login (user instruction).** Auth, sessions and `APP_PASSWORD` were removed. Because anyone who can reach the API can
    now spend LLM credits, keep it on localhost/private network; the per-client audit rate limit and SSRF guard remain.
14. **Removed screens:** Settings, History & Drift, scheduled tracker runs (all need persistence or secrets storage). LLM and
    Google keys are read from `.env` only.
15. **SSE goes browser -> API directly** (CORS via `CORS_ORIGINS`) so Next can keep gzip enabled; other calls use the `/api` proxy.
