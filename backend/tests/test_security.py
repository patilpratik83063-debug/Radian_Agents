import socket

import pytest

from app import engine
from app.security import RateLimiter, TargetRejectedError, normalize_url, validate_target_sync

BLOCKED = [
    "file:///etc/passwd",
    "ftp://example.com/x",
    "gopher://example.com",
    "javascript:alert(1)",
    "http://localhost/",
    "http://localhost:8000/api/health",
    "http://127.0.0.1/",
    "http://127.1/",
    "http://2130706433/",
    "http://0x7f000001/",
    "http://0.0.0.0/",
    "http://10.0.0.5/admin",
    "http://172.16.0.1/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://metadata.google.internal/",
    "http://[::1]/",
    "http://[fd00::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://user:pass@example.com/",
    "",
]


@pytest.mark.parametrize("url", BLOCKED)
def test_blocked_targets(url: str) -> None:
    with pytest.raises(TargetRejectedError):
        validate_target_sync(url)


def _fake_dns(ip: str):  # type: ignore[no-untyped-def]
    def getaddrinfo(host, port, *args, **kwargs):  # type: ignore[no-untyped-def]
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, port or 443))]

    return getaddrinfo


def test_dns_rebinding_to_private_ip_is_blocked(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(socket, "getaddrinfo", _fake_dns("10.1.2.3"))
    with pytest.raises(TargetRejectedError):
        validate_target_sync("https://evil.example.com/")


def test_mixed_public_and_private_records_are_blocked(monkeypatch: pytest.MonkeyPatch) -> None:
    def getaddrinfo(host, port, *a, **k):  # type: ignore[no-untyped-def]
        return [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 443)),
        ]

    monkeypatch.setattr(socket, "getaddrinfo", getaddrinfo)
    with pytest.raises(TargetRejectedError):
        validate_target_sync("https://rebind.example.com/")


def test_public_host_is_allowed_and_normalized(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(socket, "getaddrinfo", _fake_dns("93.184.216.34"))
    assert validate_target_sync("Example.com/path#frag").startswith("https://example.com/path")


def test_normalize_adds_scheme_and_strips_fragment() -> None:
    assert normalize_url("example.com#x") == "https://example.com/"


async def test_runner_rejects_unlisted_scripts_and_flags() -> None:
    with pytest.raises(TargetRejectedError):
        await engine.run_script("google_auth.py", ["--check"])
    with pytest.raises(TargetRejectedError):
        await engine.run_script("fetch_page.py", ["--output", "x"])  # first arg must be a URL
    with pytest.raises(TargetRejectedError):
        await engine.run_script("parse_html.py", ["/etc/passwd"])
    with pytest.raises(TargetRejectedError):
        await engine.run_script("fetch_page.py", ["http://127.0.0.1/"])


def test_rate_limiter_window() -> None:
    rl = RateLimiter(2, window_seconds=60)
    assert rl.check("a", now=0) is None
    assert rl.check("a", now=1) is None
    assert rl.check("a", now=2) == pytest.approx(58)
    assert rl.check("b", now=2) is None
    assert rl.check("a", now=61) is None


def test_read_reference_blocks_traversal() -> None:
    for bad in ("../SKILL.md", "a/b.md", "..\\x.md", "notes.txt"):
        with pytest.raises(ValueError):
            engine.read_reference("seo", bad)
