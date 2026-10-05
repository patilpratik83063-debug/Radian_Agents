"use client";

import * as Accordion from "@radix-ui/react-accordion";
import { Bot, Braces, ChevronDown, FileCheck2, Gauge, EyeOff, Radar, ShieldCheck, Sparkles, Target } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Magnetic, RevealCss } from "@/components/motion/light";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { ButtonLink } from "@/components/ui/core";

const FEATURES = [
  { icon: Sparkles, title: "AI Visibility score", body: "GEO and agent-readiness measured separately from classic SEO, so you see both worlds." },
  { icon: Target, title: "Falsifiable recommendations", body: "Each action carries the evidence it rests on, a failure check and a leading indicator." },
  { icon: Braces, title: "Copy-ready fixes", body: "JSON-LD, meta tags and robots rules you can paste, with one-click copy." },
  { icon: EyeOff, title: "Nothing is stored", body: "Reports live in memory only and are erased automatically. No database, no history, no account data." },
  { icon: Radar, title: "AI visibility tracker", body: "Track your brand across prompts. Live data and simulations are never mixed." },
  { icon: ShieldCheck, title: "Safe by design", body: "Private addresses are blocked, pages load in a sandbox with time limits, and audits are rate-limited." },
  { icon: Gauge, title: "Live swarm view", body: "Watch every agent work in real time with streaming findings and an honest ETA." },
  { icon: FileCheck2, title: "Export anywhere", body: "Markdown and print-ready PDF exports of every report." },
];

const FAQ = [
  { q: "What does it audit?", a: "Technical SEO, content and E-E-A-T, on-page, schema, performance, images, sitemaps, AI search readiness (GEO/AEO) and agent readiness. A local-business agent joins automatically when local signals are detected." },
  { q: "How are the two scores calculated?", a: "Each specialist agent scores its own area from collected evidence. The Search SEO and AI Visibility scores are weighted averages calculated by fixed rules, never guessed by an AI." },
  { q: "Is the AI visibility data real?", a: "Every data point is labelled. Live Google results are real data. AI answer simulations are clearly marked as simulated and never presented as measurements." },
  { q: "Do you store my data?", a: "No. Reports and tracker results are held in server memory only, erased automatically after a short time (or instantly when you discard them) and wiped whenever the server stops. Nothing is written to a database or to disk." },
  { q: "Can it audit private or internal sites?", a: "No. Private and internal addresses are blocked, including when a public address tries to redirect to one." },
];

const CHIPS = ["Technical SEO", "E-E-A-T", "Schema", "Core Web Vitals", "GEO", "AEO", "Agent readiness", "Sitemaps", "Images", "Local SEO", "Search experience", "On-page"];

/** Infinite, pure-CSS marquee of what the swarm covers. */
export function Marquee() {
  const row = [...CHIPS, ...CHIPS];
  return (
    <div className="relative overflow-hidden border-y border-line/10 bg-surface/40 py-5 [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]" aria-label="Areas the agents cover">
      <div className="flex w-max gap-3" style={{ animation: "marquee 38s linear infinite" }}>
        {row.map((c, i) => (
          <span key={`${c}-${i}`} className="surface rounded-full px-5 py-2 text-sm font-semibold text-ink/80">{c}</span>
        ))}
      </div>
    </div>
  );
}

export function Nav() {
  return (
    <header className="glass fixed inset-x-0 top-0 z-40 border-x-0 border-t-0">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" aria-label="Radian Agents home"><Logo height={32} priority /></Link>
        <nav aria-label="Primary" className="hidden items-center gap-7 text-sm font-medium text-muted md:flex">
          <a href="#how" className="hover:text-ink">How it works</a>
          <a href="#features" className="hover:text-ink">Features</a>
          <a href="#faq" className="hover:text-ink">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <ButtonLink href="/dashboard" size="sm" variant="secondary">Open app</ButtonLink>
        </div>
      </div>
    </header>
  );
}

export function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-5 py-24">
      <RevealCss><p className="text-sm font-semibold uppercase tracking-widest text-brand-text">Features</p><h2 className="mt-3 max-w-2xl text-4xl font-bold sm:text-5xl">Everything between a URL and a better ranking.</h2></RevealCss>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <RevealCss key={f.title}>
            <div className="surface group h-full rounded-lg p-6 transition-transform duration-300 hover:-translate-y-1">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-soft text-brand-text transition-transform group-hover:scale-110"><f.icon className="h-5 w-5" /></div>
              <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
            </div>
          </RevealCss>
        ))}
      </div>
    </section>
  );
}

export function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-3xl px-5 py-24">
      <RevealCss><h2 className="text-center text-4xl font-bold sm:text-5xl">Questions, answered.</h2></RevealCss>
      <Accordion.Root type="single" collapsible className="mt-10 space-y-3">
        {FAQ.map((f) => (
          <Accordion.Item key={f.q} value={f.q} className="surface rounded-lg">
            <Accordion.Header>
              <Accordion.Trigger className="group flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-semibold">
                {f.q}
                <ChevronDown className="h-5 w-5 shrink-0 text-muted transition-transform duration-300 group-data-[state=open]:rotate-180" />
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content className="overflow-hidden px-5 pb-5 text-muted data-[state=closed]:hidden">{f.a}</Accordion.Content>
          </Accordion.Item>
        ))}
      </Accordion.Root>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-24">
      <RevealCss>
        <div className="beam p-10 text-center shadow-lift sm:p-16">
          <Bot className="mx-auto h-9 w-9 text-brand-text float" />
          <h2 className="mx-auto mt-5 max-w-2xl text-4xl font-bold sm:text-5xl">See what your site looks like to search and to AI.</h2>
          <div className="mt-8"><Magnetic><ButtonLink href="/new" size="lg">Run a free audit</ButtonLink></Magnetic></div>
        </div>
      </RevealCss>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line/10 py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-5 sm:flex-row sm:items-center">
        <Logo height={32} />
        <p className="max-w-md text-sm text-muted">
          Audit engine, skills and scripts by{" "}
          <a className="font-medium text-ink underline underline-offset-2" href="https://github.com/AgriciDaniel/claude-seo" target="_blank" rel="noreferrer">AgriciDaniel/claude-seo</a>{" "}
          (MIT licence). © {new Date().getFullYear()} Radian Marketing.
        </p>
      </div>
    </footer>
  );
}
