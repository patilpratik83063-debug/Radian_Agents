"""End-to-end UI run against the locally running stack (frontend :3100, backend :8000).

    python tests/e2e_ui.py [base_url] [audit_url]
Writes screenshots to ../screenshots/ and exits non-zero on any console error or failed step.
"""

import re
import sys
import time
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3100"
TARGET = sys.argv[2] if len(sys.argv) > 2 else "https://www.python.org"
SHOTS = Path(__file__).resolve().parent.parent.parent / "screenshots"
SHOTS.mkdir(exist_ok=True)
errors: list[str] = []


def watch(page: Page) -> None:
    page.on("console", lambda m: errors.append(f"console[{m.type}] {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror {e}"))
    page.on("response", lambda r: errors.append(f"http {r.status} {r.url}") if r.status >= 500 else None)


def step(msg: str) -> None:
    print(f"- {msg}", flush=True)


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, color_scheme="light")
        page = ctx.new_page()
        watch(page)

        step("landing page")
        page.goto(BASE, wait_until="networkidle")
        assert "Be cited by AI" in page.inner_text("h1")
        page.screenshot(path=str(SHOTS / "01-landing.png"))
        page.mouse.wheel(0, 1500)
        time.sleep(1.2)
        page.screenshot(path=str(SHOTS / "02-landing-scroll.png"))
        page.locator("#faq button").first.click()

        step("no login: the app opens straight to the dashboard")
        page.goto(f"{BASE}/dashboard")
        assert "/login" not in page.url
        assert page.request.get(f"{BASE}/login").status == 404

        step("dashboard + command palette")
        page.wait_for_selector("text=Recent checks")
        page.screenshot(path=str(SHOTS / "04-dashboard.png"))
        page.keyboard.press("Control+k")
        page.wait_for_selector("[cmdk-input]")
        page.screenshot(path=str(SHOTS / "05-palette.png"))
        page.keyboard.press("Escape")

        step("SSRF target is rejected in the UI")
        page.goto(f"{BASE}/new")
        page.fill("#url", "http://127.0.0.1:8000")
        page.click("button[type=submit]")
        page.wait_for_selector("#url-err")
        assert "public website" in page.inner_text("#url-err")
        page.screenshot(path=str(SHOTS / "06-new-error.png"))

        step(f"start a real audit of {TARGET}")
        page.fill("#url", TARGET)
        page.get_by_text("One page").click()
        page.click("text=See what will be checked")
        page.screenshot(path=str(SHOTS / "07-new.png"))
        page.click("button[type=submit]")
        page.wait_for_url(re.compile(r"/audits/"))
        page.wait_for_selector("text=Checking now")
        time.sleep(8)
        page.screenshot(path=str(SHOTS / "08-live.png"))
        page.wait_for_selector("h2#plan-h", timeout=300_000)
        time.sleep(2)
        page.screenshot(path=str(SHOTS / "09-report.png"), full_page=True)
        audit_url = page.url

        step("report interactions: filter, sort, copy, export")
        page.get_by_role("radio", name="Fix first").click()
        page.locator("select[aria-label='Order']").select_option("easy")
        page.get_by_role("radio", name="All").click()
        first = page.locator("section[aria-labelledby=plan-h] button[aria-expanded]").first
        first.click()
        page.wait_for_selector("text=How you will know it did not work")
        assert page.locator("text=An early sign it is working").count() > 0
        ctx.grant_permissions(["clipboard-read", "clipboard-write"])
        copy_btn = page.get_by_role("button", name="Copy").first
        if copy_btn.count():
            copy_btn.click()
            page.wait_for_selector("text=Copied")
        with page.expect_download() as dl:
            page.get_by_role("button", name="Download").click()
        md = Path(dl.value.path()).read_text(encoding="utf-8")
        assert "How you will know it did not work" in md and "## What to fix" in md

        step("report is marked as not stored and can be erased")
        page.goto(audit_url)
        page.wait_for_selector("text=This report is not saved anywhere")
        assert page.locator("a[href='/history'], a[href='/settings']").count() == 0
        page.screenshot(path=str(SHOTS / "10-not-stored.png"))

        step("AI visibility tracker (simulated + measured labels)")
        page.goto(f"{BASE}/visibility")
        page.wait_for_selector("text=Live data")
        page.click("text=Track a prompt")
        page.fill("input[placeholder^='best project']", "best seo audit tools for agencies")
        page.fill("input[placeholder='Radian Marketing']", "Radian Marketing")
        page.fill("input[placeholder='Acme, Globex']", "Semrush, Ahrefs")
        page.click("text=Add and run now")
        page.wait_for_selector("text=best seo audit tools", timeout=30_000)
        page.wait_for_selector("text=mentions", timeout=240_000)
        page.screenshot(path=str(SHOTS / "11-visibility.png"), full_page=True)

        step("dark mode + mobile")
        page.emulate_media(color_scheme="dark")
        page.evaluate("localStorage.setItem('theme','dark')")
        page.goto(audit_url)
        page.wait_for_selector("h2#plan-h")
        page.screenshot(path=str(SHOTS / "13-report-dark.png"))
        m = browser.new_context(viewport={"width": 390, "height": 844}, color_scheme="light")
        mp = m.new_page()
        watch(mp)
        mp.goto(BASE)
        mp.wait_for_load_state("networkidle")
        mp.screenshot(path=str(SHOTS / "14-mobile-landing.png"))
        mp.goto(audit_url)
        mp.wait_for_selector("h2#plan-h")
        mp.screenshot(path=str(SHOTS / "15-mobile-report.png"))
        overflow = mp.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
        assert not overflow, "horizontal scroll on mobile report"
        step("erase now removes the report")
        page.goto(audit_url)
        page.wait_for_selector("text=Delete now")
        page.click("text=Delete now")
        page.wait_for_url(re.compile(r"/dashboard"))
        gone = page.evaluate("fetch('/api/audits/' + location.href.split('/').pop()).then(r => r.status)")
        assert page.evaluate(f"fetch('/api/audits/{audit_url.rsplit('/', 1)[1]}').then(r => r.status)") == 404, gone
        browser.close()

    ignore = ("favicon", "ERR_ABORTED", "status of 404", "status of 422")  # 404/422 come from the intentional negative tests
    real = [e for e in errors if not any(i in e for i in ignore)]
    print("\nconsole/network errors:", real or "none")
    return 1 if real else 0


if __name__ == "__main__":
    sys.exit(main())
