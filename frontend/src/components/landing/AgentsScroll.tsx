"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Bot, Braces, FileSearch, Gauge, Globe, Sparkles, Wrench } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const STEPS = [
  { title: "Fetch and render", body: "The page is loaded safely, the way a visitor sees it, so JavaScript-heavy sites are audited accurately. Private networks are never reachable." },
  { title: "Specialists run in parallel", body: "Technical, content, schema, speed, AI-search and agent-readiness specialists each work from the same collected evidence at the same time." },
  { title: "One synthesis pass", body: "A final pass merges duplicate findings into a prioritized plan. Every recommendation cites the finding it rests on, with a failure check and a leading indicator." },
  { title: "Two honest scores", body: "Search SEO and AI Visibility are computed by code from the agent scores, not guessed by a model. Failed agents are reported, never silently scored." },
];

const NODES = [
  { Icon: Globe, label: "Render" }, { Icon: Wrench, label: "Technical" }, { Icon: FileSearch, label: "Content" },
  { Icon: Braces, label: "Schema" }, { Icon: Gauge, label: "Speed" }, { Icon: Sparkles, label: "GEO" }, { Icon: Bot, label: "Agents" },
];

export function AgentsScroll() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const el = root.current;
    if (!el) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference) and (min-width: 1024px)", () => {
      const steps = gsap.utils.toArray<HTMLElement>("[data-step]", el);
      const nodes = gsap.utils.toArray<HTMLElement>("[data-node]", el);
      const tl = gsap.timeline({
        scrollTrigger: { trigger: el, start: "top top", end: "+=" + steps.length * 55 + "%", scrub: 0.6, pin: true, anticipatePin: 1 },
      });
      steps.forEach((s, i) => {
        tl.to(steps, { x: (j: number) => (j === i ? 14 : 0), scale: (j: number) => (j === i ? 1.02 : 1), transformOrigin: "left center", duration: 0.4 }, i);
        tl.to(nodes, { scale: (j: number) => (i === 0 ? (j === 0 ? 1.15 : 1) : i === 1 ? (j > 0 && j < 6 ? 1.15 : 1) : 1), borderColor: (j: number) => (i === 0 ? (j === 0 ? "rgb(44,89,252)" : "") : i === 1 ? (j > 0 && j < 6 ? "rgb(44,89,252)" : "") : "rgb(44,89,252)"), duration: 0.4 }, i);
      });
      return () => { tl.kill(); };
    });
    return () => mm.revert();
  }, []);

  return (
    <section id="how" ref={root} className="relative overflow-hidden py-24 lg:min-h-screen lg:py-0">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 lg:min-h-screen lg:grid-cols-2 lg:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-text">How the agents work</p>
          <h2 className="mt-3 text-4xl font-bold sm:text-5xl">A swarm, not a checklist.</h2>
          <ol className="mt-10 space-y-7">
            {STEPS.map((s, i) => (
              <li key={s.title} data-step className="flex gap-4">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-sm font-bold text-white">{i + 1}</span>
                <div><h3 className="text-xl font-semibold">{s.title}</h3><p className="mt-1.5 text-muted">{s.body}</p></div>
              </li>
            ))}
          </ol>
        </div>
        <div className="surface relative mx-auto grid aspect-square w-full max-w-md place-items-center rounded-2xl p-6" aria-hidden>
          <div className="grid grid-cols-3 gap-4">
            {NODES.map(({ Icon, label }, i) => (
              <div key={label} data-node className={cn("grid h-24 w-24 place-items-center rounded-2xl border-2 border-line/15 bg-surface-2/70", i === 3 && "col-start-2")}>
                <div className="text-center"><Icon className="mx-auto h-6 w-6 text-brand-text" /><div className="mt-1.5 text-xs font-semibold">{label}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
