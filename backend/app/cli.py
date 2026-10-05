"""CLI: run a real audit against one URL and print the live log plus the final report.

    python -m app.cli https://example.com --type full --json report.json
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any

from app.orchestrator import run_audit
from app.schemas import AuditType
from app.security import TargetRejectedError, validate_target


async def _main(url: str, audit_type: AuditType, out: Path | None) -> int:
    try:
        target = await validate_target(url)
    except TargetRejectedError as exc:
        print(f"Rejected: {exc}", file=sys.stderr)
        return 2

    def sink(etype: str, payload: dict[str, Any]) -> None:
        if etype == "log":
            agent = f"[{payload['agent']}] " if payload.get("agent") else ""
            print(f"  {payload['level']:<7}{agent}{payload['message']}")
        elif etype in ("phase", "scores", "progress"):
            print(f"== {etype}: {json.dumps(payload)}")
        elif etype == "agent":
            print(f"   agent {payload['key']}: {payload['status']}")

    report = await run_audit(target, audit_type, sink)
    print(f"\nSEO score: {report.seo_score}   AI visibility score: {report.ai_score}")
    print(report.executive_summary)
    for rec in report.recommendations:
        print(f"- [{rec.priority}] {rec.id} {rec.title} (impact {rec.impact}, effort {rec.effort})")
    if out:
        out.write_text(report.model_dump_json(indent=2), encoding="utf-8")
        print(f"\nReport written to {out}")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a Radian Agents audit")
    parser.add_argument("url")
    parser.add_argument("--type", default="full", choices=["full", "page", "geo", "schema", "technical", "local"])
    parser.add_argument("--json", type=Path, help="write the report JSON here")
    args = parser.parse_args()
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    sys.exit(asyncio.run(_main(args.url, args.type, args.json)))


if __name__ == "__main__":
    main()
