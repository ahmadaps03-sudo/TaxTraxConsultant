import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: "#FFFFFF",       // primary background — now white (was near-black)
        charcoal: "#F5F5F5",  // secondary bg / card fill — light grey (was near-black)
        crimson: "#8B0000",   // deep red accent — brand mark, subtle accents
        signal: "#FF0404",    // primary brand red — CTAs (client-specified hex)
        ember: "#D40303",     // hover red
        paper: "#2D2D2D",     // primary text — dark grey (client-specified hex, was light-on-dark)
        smoke: "#6B6B6B",     // muted text — darkened for legibility on white
        ok: "#2E7D32",        // success
        line: "#E3E3E3",      // border / divider — light grey (was dark)
        cream: "#FFF6F6",     // faint red-tinted off-white, hero band variant
        graphite: "#2D2D2D",  // alias of paper, used on the hero/nav
        hairline: "#ECECEC",  // light border, used on the hero/nav
        night: "#141414",     // dark footer background — deliberate contrast band
        mist: "#F1F1F1",      // light text on the dark footer
      },
      fontFamily: {
        serif: ["var(--font-display)", "Source Serif 4", "Georgia", "serif"],
        sans: ["var(--font-body)", "IBM Plex Sans", "system-ui", "sans-serif"],
        urdu: ["var(--font-urdu)", "Noto Nastaliq Urdu", "serif"],
      },
      maxWidth: {
        prose: "68ch",
      },
      letterSpacing: {
        tightish: "-0.01em",
      },
    },
  },
  plugins: [],
};
export default config;
