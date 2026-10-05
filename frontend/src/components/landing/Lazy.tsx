"use client";

import dynamic from "next/dynamic";

// GSAP + Lenis are heavy and not needed for first paint: load them after hydration.
export const LazyAgentsScroll = dynamic(() => import("./AgentsScroll").then((m) => m.AgentsScroll), { ssr: false, loading: () => <div className="min-h-[60vh]" /> });
export const LazySmoothScroll = dynamic(() => import("./SmoothScroll").then((m) => m.SmoothScroll), { ssr: false });
