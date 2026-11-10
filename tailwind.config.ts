import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--color-background)",
        foreground: "var(--color-foreground)",
        surface: "var(--color-surface)",
        "surface-raised": "var(--color-surface-raised)",
        border: "var(--color-border)",
        muted: "var(--color-muted)",
        primary: "var(--color-primary)",
        "primary-foreground": "var(--color-primary-foreground)",
        destructive: "var(--color-destructive)",
        "destructive-muted": "var(--color-destructive-muted)",
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        info: "var(--color-info)",
      },
      boxShadow: {
        shell: "0 18px 48px rgba(16, 24, 40, 0.08)",
        popover: "0 20px 45px rgba(16, 24, 40, 0.16)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [
    // touch: applies on coarse pointers (phones, tablets), matching the
    // .touch-target and field sizing rules in styles.css.
    plugin(({ addVariant }) => {
      addVariant("touch", "@media (pointer: coarse)");
      // short: desktop windows too short for the full Applications chrome
      // above the table (heavy zoom, small laptop windows). A variant, not a
      // raw screen, because raw screens switch off every max-* variant; the
      // :root prefix lets its rules override xl: ones regardless of order.
      addVariant("short", "@media (min-width: 1280px) and (max-height: 700px) { :root & }");
    }),
  ],
} satisfies Config;
