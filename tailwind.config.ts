import type { Config } from "tailwindcss";

// Tailwind v3 (pure JavaScript). v4's native engine is blocked by Windows App Control on this machine.
// Colour names map to the CSS variables in src/app/globals.css, which switch for dark mode.
const token = (name: string) => `var(--${name})`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: token("bg"),
        surface: token("surface"),
        "surface-2": token("surface-2"),
        line: token("line"),
        text: token("text"),
        muted: token("muted"),
        accent: token("accent"),
        "accent-fg": token("accent-fg"),
        "accent-soft": token("accent-soft"),
        good: token("good"),
        "good-soft": token("good-soft"),
        warn: token("warn"),
        "warn-soft": token("warn-soft"),
        bad: token("bad"),
        "bad-soft": token("bad-soft"),
        info: token("info"),
        "info-soft": token("info-soft"),
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
