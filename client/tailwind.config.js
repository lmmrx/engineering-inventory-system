/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // GitHub's dark ("Primer") palette — kept under the original token
        // names (navy/gold/ink) so every component that already references
        // them re-themes automatically.
        navy: {
          950: "#0d1117", // canvas.default
          900: "#161b22", // canvas.subtle / card surface
          850: "#1c2128",
          800: "#30363d", // border.default
          700: "#3d444d", // hover border
          600: "#444c56",
        },
        gold: {
          300: "#79c0ff", // accent.fg hover
          400: "#58a6ff", // accent.fg
          500: "#1f6feb", // accent.emphasis (button blue)
          600: "#1158c7",
        },
        ink: {
          100: "#e6edf3", // fg.default
          200: "#c9d1d9",
          300: "#8b949e", // fg.muted
          500: "#6e7681", // fg.subtle
          600: "#57606a",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          '"Noto Sans"',
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          '"SF Mono"',
          "Menlo",
          "Consolas",
          '"Liberation Mono"',
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};
