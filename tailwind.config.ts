import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ais: {
          bg: "#07110D",
          surface: "#101C16",
          elevated: "#18251D",
          panel: "#0D1813",
          border: "#2B3A2F",
          borderSoft: "#223025",
          text: "#E8E1D2",
          muted: "#9C9A89",
          faint: "#747969",
          amber: "#C8924A",
          moss: "#8A9A5B",
          paleGreen: "#B9C9A2",
          danger: "#B8624B",
          warning: "#C9A35A",
          success: "#8FAF7A",
        },
      },
      borderRadius: {
        aisSm: "12px",
        aisMd: "20px",
        aisLg: "28px",
        aisXl: "36px",
      },
      transitionDuration: {
        aisFast: "150ms",
        aisBase: "220ms",
        aisPanel: "360ms",
        aisSlow: "600ms",
      },
      spacing: {
        ais1: "4px",
        ais2: "8px",
        ais3: "12px",
        ais4: "16px",
        ais5: "24px",
        ais6: "32px",
        ais7: "48px",
        ais8: "64px",
      },
      fontFamily: {
        aisSerif: ["IM Fell English", "Georgia", "serif"],
        aisSans: ["DM Sans", "system-ui", "sans-serif"],
        aisMono: ["DM Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
