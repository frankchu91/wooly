import type { Config } from "tailwindcss";
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#FBF8F3", surface: "#FFFFFF", ink: "#1F2A24", muted: "#6B7A72",
        primary: { DEFAULT: "#1E7F5C", dark: "#176549" }, mint: "#DDF3E8",
        // `coral` is decorative only (fills, tints) — it fails contrast as text on
        // cream/surface. Anything readable uses `coral-dark`.
        coral: { DEFAULT: "#F28C6B", dark: "#B9482A" }, gold: "#F5C451",
      },
      fontFamily: {
        heading: ["Manrope Variable", "Manrope", "system-ui", "sans-serif"],
        body: ["Inter Variable", "Inter", "system-ui", "sans-serif"],
      },
      borderRadius: { card: "16px", control: "12px" },
      boxShadow: { card: "0 1px 2px rgba(31,42,36,.06), 0 8px 24px rgba(31,42,36,.06)" },
    },
  },
  plugins: [],
} satisfies Config;
