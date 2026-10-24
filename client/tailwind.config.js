const shades = (name, steps) =>
  Object.fromEntries(steps.map((step) => [step, `rgb(var(--${name}-${step}) / <alpha-value>)`]));
const scaled = (size, lineHeight) => [
  `calc(${size}rem * var(--font-scale, 1))`,
  { lineHeight: `calc(${lineHeight}rem * var(--font-scale, 1))` },
];

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
      // Text sizes follow the user's font-size setting (--font-scale), without
      // scaling spacing the way page zoom does.
      fontSize: {
        xs: scaled(0.75, 1),
        sm: scaled(0.875, 1.25),
        base: scaled(1, 1.5),
        lg: scaled(1.125, 1.75),
        xl: scaled(1.25, 1.75),
        "2xl": scaled(1.5, 2),
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
