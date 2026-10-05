"use client";

import { ArrowRight, Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Magnetic } from "@/components/motion/light";
import { ScoreRing } from "@/components/ScoreRing";
import { Badge, Button } from "@/components/ui/core";

export function HeroForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  return (
    <form
      className="rise mt-9 flex max-w-xl flex-col gap-3 sm:flex-row"
      style={{ animationDelay: "0.18s" }}
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/new${url.trim() ? `?url=${encodeURIComponent(url.trim())}` : ""}`);
      }}
    >
      <div className="relative flex-1">
        <Globe className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          aria-label="Website URL"
          inputMode="url"
          placeholder="yourwebsite.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="surface h-14 w-full rounded-md pl-11 pr-4 text-base placeholder:text-muted/80 transition-shadow focus-visible:border-brand focus-visible:shadow-[0_0_0_4px_rgb(var(--brand)/0.2)] focus-visible:outline-none"
        />
      </div>
      <Magnetic>
        <Button type="submit" size="lg" className="h-14 w-full sm:w-auto">
          Check my site <ArrowRight className="h-5 w-5" />
        </Button>
      </Magnetic>
    </form>
  );
}

/** Preview card with a pointer-driven 3D tilt (CSS transition) and an orbiting border beam. */
export function HeroCard() {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className="float relative">
      <div
        ref={ref}
        style={{ transition: "transform 0.2s ease-out" }}
        onPointerMove={(e) => {
          const el = ref.current;
          if (!el || e.pointerType !== "mouse") return;
          const r = el.getBoundingClientRect();
          const ry = ((e.clientX - r.left) / r.width - 0.5) * 10;
          const rx = -((e.clientY - r.top) / r.height - 0.5) * 10;
          el.style.transform = `perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg)`;
        }}
        onPointerLeave={() => {
          if (ref.current) ref.current.style.transform = "";
        }}
        className="beam p-6 shadow-lift sm:p-8"
      >
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">Example result</span>
          <Badge tone="muted">Illustrative preview</Badge>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4">
          <ScoreRing score={82} label="Google & search" size={140} stroke={11} />
          <ScoreRing score={67} label="AI tools" size={140} stroke={11} brand />
        </div>
        <ul className="mt-6 space-y-2.5 text-sm">
          {[["Add Organization JSON-LD", "bg-danger"], ["Publish an XML sitemap", "bg-warn"], ["Allow AI crawlers in robots.txt", "bg-brand-hi"]].map(([t, c]) => (
            <li key={t} className="flex items-center gap-3 rounded-md bg-surface-2/80 px-3.5 py-2.5">
              <span className={`h-2 w-2 rounded-full ${c}`} />
              {t}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
