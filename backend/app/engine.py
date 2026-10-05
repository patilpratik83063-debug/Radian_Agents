"""Bridge to the claude-seo engine: skill/agent prompt loading and the sandboxed script runner."""

from __future__ import annotations

import asyncio
import atexit
import json
import os
import re
import shutil
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.security import TargetRejectedError, validate_target

# Scripts an agent may run, with the flags each accepts. The first argument is always a URL.
URL_SCRIPTS: dict[str, tuple[str, ...]] = {
    "render_page.py": ("--mode", "--viewport", "--timeout-ms", "--max-text", "--a11y-tree", "--json"),
    "fetch_page.py": ("--json", "--max-text", "--timeout", "--googlebot", "--render", "--no-redirects"),
    "sitemap_discovery.py": ("--json",),
    "agentic_check.py": ("--json", "--ua-matrix"),
    "pagespeed_check.py": ("--json", "--strategy", "--crux-only", "--psi-only", "--form-factor"),
}
# Scripts that read their input from stdin and take no file/URL arguments.
STDIN_SCRIPTS: dict[str, tuple[str, ...]] = {
    "parse_html.py": ("--json", "--url"),
    "content_quality.py": ("--json", "--threshold"),
}
ALLOWED_SCRIPTS = set(URL_SCRIPTS) | set(STDIN_SCRIPTS)

_FRONTMATTER = re.compile(r"\A---\n.*?\n---\n", re.DOTALL)
_MAX_CAPTURE = 4_000_000


# Engine scripts treat $HOME as scratch space (caches, state). Point it at a temp dir that is erased on exit,
# so nothing a test run produces survives the process.
_SCRATCH = Path(tempfile.mkdtemp(prefix="radian-scratch-"))
atexit.register(shutil.rmtree, _SCRATCH, ignore_errors=True)


def engine_dir() -> Path:
    return get_settings().engine_dir


def _strip_frontmatter(text: str) -> str:
    return _FRONTMATTER.sub("", text.replace("\r\n", "\n"), count=1).strip()


def load_skill(name: str) -> str:
    """Return the SKILL.md body (frontmatter removed) for skills/<name>."""
    return _strip_frontmatter((engine_dir() / "skills" / name / "SKILL.md").read_text(encoding="utf-8"))


def load_agent_prompt(name: str) -> str:
    return _strip_frontmatter((engine_dir() / "agents" / f"{name}.md").read_text(encoding="utf-8"))


def list_references(skill: str) -> list[str]:
    names: set[str] = set()
    for owner in (skill, "seo"):
        root = engine_dir() / "skills" / owner / "references"
        if root.is_dir():
            names.update(p.name for p in root.glob("*.md"))
    return sorted(names)


def read_reference(skill: str, filename: str, limit: int = 20_000) -> str:
    """Read skills/<skill>/references/<file> (falling back to skills/seo/references); no traversal."""
    if "/" in filename or "\\" in filename or ".." in filename or not filename.endswith(".md"):
        raise ValueError("invalid reference name")
    for owner in (skill, "seo"):
        path = engine_dir() / "skills" / owner / "references" / filename
        if path.is_file():
            return path.read_text(encoding="utf-8")[:limit]
    raise FileNotFoundError(filename)


@dataclass
class ScriptResult:
    script: str
    args: list[str]
    returncode: int
    stdout: str
    stderr: str
    timed_out: bool = False

    @property
    def ok(self) -> bool:
        return self.returncode == 0 and not self.timed_out

    def json(self) -> Any:
        try:
            return json.loads(self.stdout)
        except json.JSONDecodeError:
            return None

    def for_llm(self, limit: int = 12_000) -> str:
        if self.timed_out:
            return f"ERROR: {self.script} timed out"
        if self.ok:
            body = self.stdout
        else:
            body = f"ERROR (exit {self.returncode}): {self.stderr[-2000:]}\n{self.stdout[-2000:]}"
        if len(body) > limit:
            body = body[:limit] + f"\n...[truncated {len(body) - limit} chars]"
        return body


def _sandbox_env() -> dict[str, str]:
    """Minimal environment so LLM keys and app secrets never reach engine scripts."""
    settings = get_settings()
    home = _SCRATCH
    keep = (
        "PATH", "SYSTEMROOT", "TEMP", "TMP", "LOCALAPPDATA", "APPDATA",
        "PLAYWRIGHT_BROWSERS_PATH", "CLAUDE_SEO_LOCAL_TARGETS",
    )
    env = {k: os.environ[k] for k in keep if k in os.environ}
    if settings.google_api_key:
        env["GOOGLE_API_KEY"] = settings.google_api_key
    env.update(HOME=str(home), USERPROFILE=str(home), PYTHONIOENCODING="utf-8", PYTHONUTF8="1")
    return env


def _check_flags(script: str, rest: list[str], allowed: tuple[str, ...]) -> None:
    i = 0
    while i < len(rest):
        token = rest[i]
        if token not in allowed:
            raise TargetRejectedError(f"argument not allowed for {script}: {token}")
        i += 1
        if i < len(rest) and not rest[i].startswith("-"):
            i += 1  # the flag's value


async def run_script(script: str, args: list[str], *, stdin: str | None = None) -> ScriptResult:
    """Run an allow-listed engine script with an argv vector (never a shell).

    The URL positional argument is SSRF-validated before the process starts; the engine scripts
    validate again themselves (defence in depth).
    """
    settings = get_settings()
    if script not in ALLOWED_SCRIPTS:
        raise TargetRejectedError(f"script not allowed: {script}")
    argv = [str(a) for a in args]
    if script in URL_SCRIPTS:
        if not argv or argv[0].startswith("-"):
            raise TargetRejectedError("first argument must be the URL")
        argv[0] = await validate_target(argv[0])
        _check_flags(script, argv[1:], URL_SCRIPTS[script])
    else:
        _check_flags(script, argv, STDIN_SCRIPTS[script])
    proc = await asyncio.create_subprocess_exec(
        sys.executable, str(engine_dir() / "scripts" / script), *argv,
        stdin=asyncio.subprocess.PIPE if stdin is not None else asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=_sandbox_env(),
        cwd=str(engine_dir() / "scripts"),
    )
    try:
        out, err = await asyncio.wait_for(
            proc.communicate(stdin.encode("utf-8") if stdin is not None else None),
            timeout=settings.script_timeout_seconds,
        )
    except TimeoutError:
        proc.kill()
        await proc.wait()
        return ScriptResult(script, argv, -1, "", "", timed_out=True)
    return ScriptResult(
        script, argv, proc.returncode or 0,
        out.decode("utf-8", "replace")[:_MAX_CAPTURE],
        err.decode("utf-8", "replace")[-4000:],
    )
