const shades = (name, steps) =>
  Object.fromEntries(steps.map((step) => [step, `rgb(var(--${name}-${step}) / <alpha-value>)`]));

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // Every color is a CSS variable (an "r g b" triple) so light and dark
      // themes can swap them; see src/index.css. Tailwind's /opacity
      // modifiers still work through <alpha-value>.
      colors: {
        navy: shades("navy", [950, 900, 850, 800, 700, 600]),
        gold: shades("gold", [300, 400, 500, 600]),
        ink: shades("ink", [100, 200, 300, 500, 600]),
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
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
