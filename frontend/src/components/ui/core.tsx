"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Check, Copy, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { forwardRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { cn, type Tone } from "@/lib/utils";

const buttonStyles = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold select-none transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "btn-primary",
        secondary: "surface text-ink hover:bg-surface-2",
        ghost: "text-ink/80 hover:bg-ink/5 hover:text-ink",
        danger: "bg-danger text-white hover:opacity-90",
      },
      size: { sm: "h-9 px-3.5", md: "h-11 px-5", lg: "h-12 px-7 text-base" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonStyles>;

const press = "transition-[transform,background-color,box-shadow] duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.97]";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant, size, ...props }, ref) {
  return <button ref={ref} className={cn(buttonStyles({ variant, size }), press, className)} {...props} />;
});

export function ButtonLink({
  className, variant, size, href, children, ...props
}: { href: string; children: ReactNode; className?: string } & VariantProps<typeof buttonStyles> & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <Link href={href} className={cn(buttonStyles({ variant, size }), press, className)} {...props}>
      {children}
    </Link>
  );
}

export function Card({ className, children, onPointerMove, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("surface rounded-lg", className)}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
        onPointerMove?.(e);
      }}
      {...props}
    >
      {children}
    </div>
  );
}

const toneStyles: Record<Tone | "brand" | "neutral", string> = {
  success: "bg-success/12 text-success",
  warn: "bg-warn/14 text-warn",
  danger: "bg-danger/12 text-danger",
  muted: "bg-ink/6 text-muted",
  brand: "bg-brand/12 text-brand-text",
  neutral: "bg-ink/6 text-ink/80",
};

export function Badge({ tone = "neutral", className, children }: { tone?: Tone | "brand" | "neutral"; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", toneStyles[tone], className)}>
      {children}
    </span>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-md border border-line/15 bg-surface/80 px-4 text-sm text-ink backdrop-blur placeholder:text-muted/80 transition-shadow focus-visible:border-brand focus-visible:shadow-[0_0_0_4px_rgb(var(--brand)/0.18)] focus-visible:outline-none",
        className,
      )}
      {...props}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn("h-11 w-full rounded-md border border-line/15 bg-surface px-3 text-sm text-ink focus-visible:border-brand", className)}
      {...props}
    />
  );
});

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line/20 bg-surface/50 px-6 py-14 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand-text">{icon}</div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-danger/30 bg-danger/8 p-5">
      <div className="flex items-center gap-2 font-semibold text-danger">
        <AlertTriangle className="h-4 w-4" /> {title}
      </div>
      <p className="text-sm text-ink/80">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      className={className}
      aria-live="polite"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
    >
      {done ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
      {done ? "Copied" : label}
    </Button>
  );
}

export function Segmented<T extends string>({
  value, onChange, options, label,
}: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line/10 bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-[10px] px-3 py-1.5 text-sm font-medium transition-colors",
            value === o.value ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
