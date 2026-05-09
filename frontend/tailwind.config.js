/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#eff7ff",
          100: "#daedff",
          200: "#bcdfff",
          300: "#8eccff",
          400: "#5aafff",
          500: "#3690fb",
          600: "#1f72ee",
          700: "#175bd1",
          800: "#194ca7",
          900: "#1a4286",
        },
      },
      keyframes: {
        "pulse-soft": {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
      },
      animation: {
        "pulse-soft": "pulse-soft 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
