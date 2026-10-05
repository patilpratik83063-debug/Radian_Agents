"use client";

import { LayoutDashboard, Menu, PlusCircle, Radar, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/core";
import { ThemeToggle } from "./ThemeToggle";
import { CommandPalette } from "./CommandPalette";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/new", label: "Check a website", icon: PlusCircle },
  { href: "/visibility", label: "AI visibility", icon: Radar },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [palette, setPalette] = useState(false);
  const [menu, setMenu] = useState(false);

  useEffect(() => setMenu(false), [pathname]);

  const nav = (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV.map((n) => {
        const active = pathname === n.href || (n.href !== "/dashboard" && pathname.startsWith(n.href));
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={cn("relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors", active ? "text-brand-text" : "text-muted hover:bg-ink/5 hover:text-ink")}
          >
            {active && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-md bg-brand/10" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
            <n.icon className="relative h-[18px] w-[18px]" />
            <span className="relative">{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="no-print sticky top-0 hidden h-screen flex-col justify-between glass border-y-0 border-l-0 p-5 lg:flex">
        <div className="space-y-8">
          <Link href="/dashboard" aria-label="Radian Agents home">
            <Logo height={34} priority />
          </Link>
          {nav}
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="no-print glass sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-x-0 border-t-0 px-4 sm:px-8">
          <div className="flex items-center gap-3 lg:hidden">
            <Button variant="ghost" size="sm" className="w-9 px-0" aria-label="Open menu" onClick={() => setMenu(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <Logo height={28} />
          </div>
          <button
            onClick={() => setPalette(true)}
            className="hidden h-10 w-full max-w-md items-center gap-3 rounded-md border border-line/12 bg-surface px-3.5 text-sm text-muted transition-colors hover:border-line/25 lg:flex"
          >
            <Search className="h-4 w-4" />
            Search or run a command
            <kbd className="ml-auto rounded-md border border-line/15 px-1.5 py-0.5 text-[11px]">Ctrl K</kbd>
          </button>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="w-9 px-0 lg:hidden" aria-label="Open command palette" onClick={() => setPalette(true)}>
              <Search className="h-[18px] w-[18px]" />
            </Button>
            <ThemeToggle />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8 sm:py-10">
          {children}
        </main>
      </div>

      <AnimatePresence>
        {menu && (
          <motion.div className="fixed inset-0 z-50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button aria-label="Close menu" className="absolute inset-0 bg-ink/40" onClick={() => setMenu(false)} />
            <motion.div initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: "spring", stiffness: 380, damping: 36 }} className="absolute inset-y-0 left-0 w-72 bg-surface p-5 shadow-lift">
              <div className="mb-8 flex items-center justify-between">
                <Logo height={30} />
                <Button variant="ghost" size="sm" className="w-9 px-0" aria-label="Close menu" onClick={() => setMenu(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
              {nav}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <CommandPalette open={palette} onOpenChange={setPalette} />
    </div>
  );
}
