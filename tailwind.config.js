/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#050a18",
          900: "#0a1635",
          800: "#0f1f45",
          700: "#152a5c",
        },
        accent: {
          DEFAULT: "#fc7c23",
          hover: "#e66c1b",
          soft: "#fff0e3",
          glow: "rgba(252, 124, 35, 0.35)",
        },
        mist: "#a3b8d7",
        cream: "#ffe6d4",
      },
      fontFamily: {
        sans: [
          '"Plus Jakarta Sans"',
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
        glow: "0 0 80px -20px rgba(252, 124, 35, 0.45)",
        "inner-soft": "inset 0 1px 0 0 rgba(255,255,255,0.06)",
      },
      animation: {
        "fade-up": "fadeUp 0.7s ease-out forwards",
        "pulse-soft": "pulseSoft 4s ease-in-out infinite",
        float: "float 6s ease-in-out infinite",
        "flow-wave": "flowWave 52s linear infinite",
        "signal-flow": "flowWave 56s linear infinite",
        "graph-parallax-slow": "flowWave 78s linear infinite",
        "graph-parallax-mid": "flowWave 52s linear infinite",
        "graph-parallax-fast": "flowWave 38s linear infinite",
        "breathe-glow": "breatheGlow 11s ease-in-out infinite",
        "caret-blink": "caretBlink 1.05s steps(2, end) infinite",
        "float-edge": "floatEdge 18s ease-in-out infinite",
        "float-edge-slow": "floatEdge 22s ease-in-out infinite reverse",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(24px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.7" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        flowWave: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        breatheGlow: {
          "0%, 100%": { transform: "scale(1)", opacity: "0.34" },
          "50%": { transform: "scale(1.09)", opacity: "0.46" },
        },
        caretBlink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        floatEdge: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-5px)" },
        },
      },
    },
  },
  plugins: [],
};
