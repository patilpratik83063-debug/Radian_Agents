"use client";

import { Command } from "cmdk";
import { FileText, LayoutDashboard, Moon, PlusCircle, Radar, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AuditSummary } from "@/lib/types";
import { host } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/new", label: "Check a website", icon: PlusCircle },
  { href: "/visibility", label: "AI visibility tracker", icon: Radar },
];

const looksLikeDomain = (s: string) => /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(s.trim());

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [audits, setAudits] = useState<AuditSummary[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (open) api.audits(8).then(setAudits).catch(() => setAudits([]));
    else setQuery("");
  }, [open]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <Command.Dialog open={open} onOpenChange={onOpenChange} label="Command palette" className="fixed inset-0 z-[60] grid place-items-start justify-center bg-ink/30 px-4 pt-[14vh] backdrop-blur-sm">
      <div className="glass w-full max-w-xl overflow-hidden rounded-xl shadow-lift">
        <div className="flex items-center gap-3 border-b border-line/10 px-4">
          <Search className="h-4 w-4 text-muted" />
          <Command.Input value={query} onValueChange={setQuery} placeholder="Search, or paste a URL to audit…" className="h-14 w-full bg-transparent text-[15px] outline-none placeholder:text-muted" />
          <kbd className="rounded-md border border-line/15 px-1.5 py-0.5 text-[11px] text-muted">Esc</kbd>
        </div>
        <Command.List className="scroll-thin max-h-[52vh] overflow-y-auto p-2">
          <Command.Empty className="px-4 py-10 text-center text-sm text-muted">No results.</Command.Empty>
          {looksLikeDomain(query) && (
            <Command.Group heading="Start">
              <Item value={`audit ${query}`} onSelect={() => go(`/new?url=${encodeURIComponent(query.trim())}`)} icon={<PlusCircle className="h-4 w-4" />}>
                Check {query.trim()}
              </Item>
            </Command.Group>
          )}
          <Command.Group heading="Go to">
            {NAV.map((n) => (
              <Item key={n.href} value={n.label} onSelect={() => go(n.href)} icon={<n.icon className="h-4 w-4" />}>
                {n.label}
              </Item>
            ))}
          </Command.Group>
          {audits.length > 0 && (
            <Command.Group heading="Recent checks">
              {audits.map((a) => (
                <Item key={a.id} value={`audit ${host(a.url)} ${a.id}`} onSelect={() => go(`/audits/${a.id}`)} icon={<FileText className="h-4 w-4" />}>
                  {host(a.url)} <span className="ml-2 text-xs text-muted">{a.status}</span>
                </Item>
              ))}
            </Command.Group>
          )}
          <Command.Group heading="Preferences">
            <Item value="toggle theme dark light" onSelect={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} icon={<Moon className="h-4 w-4" />}>
              Toggle theme
            </Item>
          </Command.Group>
        </Command.List>
      </div>
    </Command.Dialog>
  );
}

function Item({ children, icon, ...props }: { children: React.ReactNode; icon: React.ReactNode; value: string; onSelect: () => void }) {
  return (
    <Command.Item {...props} className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm data-[selected=true]:bg-brand/10 data-[selected=true]:text-brand-text">
      <span className="text-muted">{icon}</span>
      {children}
    </Command.Item>
  );
}
