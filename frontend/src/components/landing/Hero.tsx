import { Badge } from "@/components/ui/core";
import { HeroCard, HeroForm } from "./HeroClient";

/** Server-rendered so the headline paints immediately; only the form and the preview card hydrate. */
export function Hero() {
  return (
    <section className="relative pb-24 pt-36 sm:pt-44">
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <Badge tone="brand" className="rise"><span className="h-1.5 w-1.5 rounded-full bg-brand-hi" /> AI SEO · GEO · AEO audits</Badge>
          <h1 className="mt-5 text-5xl font-extrabold leading-[1.03] sm:text-6xl lg:text-7xl">
            Be found by search.<br /><span className="gradient-text">Be cited by AI.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
            A swarm of specialist agents audits your website in parallel, scores Search SEO and AI Visibility independently, and hands you a prioritized plan where every recommendation can be proven wrong.
          </p>
          <HeroForm />
          <p className="mt-4 flex items-center gap-2 text-xs text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> Nothing is stored: every report is erased automatically
          </p>
        </div>
        <HeroCard />
      </div>
    </section>
  );
}
