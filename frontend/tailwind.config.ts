import type { Config } from "tailwindcss";

const c = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: c("bg"),
        surface: c("surface"),
        "surface-2": c("surface-2"),
        ink: c("ink"),
        muted: c("muted"),
        line: c("line"),
        brand: { DEFAULT: c("brand"), hi: c("brand-hi"), soft: c("brand-soft"), text: c("brand-text"), 50: c("brand-50"), 100: c("brand-100") },
        accent: c("accent"),
        success: c("success"),
        warn: c("warn"),
        danger: c("danger"),
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "ui-sans-serif", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: { md: "14px", lg: "18px", xl: "20px", "2xl": "28px" },
      boxShadow: {
        card: "0 1px 0 rgb(var(--line) / 0.04), 0 1px 2px rgb(var(--shadow) / 0.05), 0 8px 24px -12px rgb(var(--shadow) / 0.12)",
        lift: "0 1px 0 rgb(var(--line) / 0.05), 0 4px 8px -2px rgb(var(--shadow) / 0.08), 0 24px 48px -20px rgb(var(--shadow) / 0.22)",
        glow: "0 0 0 1px rgb(var(--brand) / 0.25), 0 8px 32px -6px rgb(var(--brand) / 0.45)",
      },
      keyframes: {
        pulseRing: { "0%": { transform: "scale(0.9)", opacity: "0.7" }, "100%": { transform: "scale(1.9)", opacity: "0" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
      animation: { "pulse-ring": "pulseRing 1.6s cubic-bezier(0.2,0.6,0.2,1) infinite" },
    },
  },
  plugins: [],
};

export default config;
