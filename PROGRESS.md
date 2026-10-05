# Progress

## P0 - Scaffold (done)
- Repo layout: `/engine` (claude-seo, MIT), `/backend` (FastAPI), `.env.example`, `docker-compose.yml`, README, DECISIONS.
- Backend skeleton with typed settings and `/api/health`; ruff + mypy clean; health endpoint verified.
- Frontend scaffold and its compose service arrive in P2 so every phase leaves a runnable stack.

## P1 - Backend (done)
- SSRF guard (`security.py`) delegating to the engine's `url_safety` plus an argv-only, allow-listed script runner
  with a stripped environment and timeouts; per-client audit rate limit.
- DeepSeek client via the OpenAI SDK (`llm.py`), skill loader, `run_skill()` with a function-calling loop,
  parallel orchestrator (`asyncio.gather`) and one synthesis call; deterministic scoring.
- Supabase persistence + SSE with persisted, resumable events (`jobs.py`, `store.py`).
- Proven live: `python -m app.cli https://www.python.org --type full` ran 10 agents in parallel, 68 s, SEO 64 / AI 78,
  20 grounded recommendations with failure checks and leading indicators; same flow verified over the HTTP API and SSE.
- 37 tests (SSRF cases, orchestrator, parsers, API/SSE); ruff and mypy --strict clean.
- Known: PageSpeed API is rate-limited without a Google key, so performance runs on source inspection (flagged in warnings).

## P2-P8 - UI, tracker, landing, polish (done)
- Next.js app: landing (Lenis + GSAP scroll section, CSS marquee, tilt hero), dashboard, new audit, live agent-swarm view over SSE,
  report (rings, chart, filter/sort, falsifiable recommendations, copy snippets, Markdown/PDF export, "not stored" countdown),
  AI visibility tracker (real Bright Data SERP output vs DeepSeek simulation, labelled separately), command palette.
- Premium redesign: aurora background, spotlight cards, gradient rings, shine buttons, redesigned dark palette.
- Removed on request: login, settings, history & drift, all persistence.
- Verified: 39 backend tests, ruff, mypy --strict, tsc, eslint; Playwright e2e (`backend/tests/e2e_ui.py`) against a real audit with no
  console errors; Lighthouse desktop 100/100/100/100, mobile (throttled) 84/100/100/100.
- Not verified: `docker compose up` (config validates; images not built here).
