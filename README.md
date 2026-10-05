# Radian Agents

AI SEO / GEO / AEO audits. Enter a URL; a swarm of specialist agents audits it in
parallel and the app reports two independent scores (Search SEO and AI
Visibility), a prioritized action plan, and history over time.

- **Backend**: FastAPI, asyncio job runner, Server-Sent Events. Nothing is persisted: results live in memory and expire.
- **Frontend**: Next.js (App Router), TypeScript, Tailwind, shadcn/ui, Framer Motion, GSAP, Lenis, Recharts.
- **LLM**: DeepSeek only, through the OpenAI-compatible SDK (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`).
- **Engine**: [AgriciDaniel/claude-seo](https://github.com/AgriciDaniel/claude-seo) (MIT), vendored in `/engine`
  (commit `4b99de2`). Its deterministic scripts are the execution layer; its
  `SKILL.md`, references and `agents/*.md` are the agent system prompts.

## Quick start

```bash
cp .env.example .env     # fill LLM_API_KEY, LLM_MODEL (e.g. deepseek-chat)
docker compose up --build   # app on http://localhost:3000, API on :8000
```

## Local development (backend)

```bash
cd backend
python -m venv .venv && .venv/Scripts/pip install -r requirements-dev.txt   # Windows
.venv/Scripts/uvicorn app.main:app --reload
```

## Credits

Audit engine, skills, agent prompts and scripts by **AgriciDaniel/claude-seo**,
used under the MIT License (`engine/LICENSE`).

## Status

See `PROGRESS.md` for phase-by-phase status and `DECISIONS.md` for judgement calls.
