/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        app: {
          bg: "var(--c-bg)",
          surface: "var(--c-surface)",
          "surface-alt": "var(--c-surface-alt)",
          elevated: "var(--c-elevated)",
          hover: "var(--c-hover)",
          btn: "var(--c-btn)",
          "btn-hover": "var(--c-btn-hover)",
          border: "var(--c-border)",
          "border-light": "var(--c-border-light)",
          text: "var(--c-text)",
          "text-secondary": "var(--c-text-secondary)",
          "text-tertiary": "var(--c-text-tertiary)",
          accent: "var(--c-accent)",
          "accent-bg": "var(--c-accent-bg)",
          "accent-ring": "var(--c-accent-ring)",
          success: "var(--c-success)",
          "success-bg": "var(--c-success-bg)",
          "success-ring": "var(--c-success-ring)",
          error: "var(--c-error)",
          "error-bg": "var(--c-error-bg)",
          "error-ring": "var(--c-error-ring)",
        },
      },
      animation: {
        "slow-drift": "slow-drift 25s ease-in-out infinite",
        "fade-up": "fade-up 0.8s cubic-bezier(0.32, 0.72, 0, 1) forwards",
        "spin-slow": "spin 3s linear infinite",
      },
      keyframes: {
        "slow-drift": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "33%": { transform: "translate(40px, -20px) scale(1.05)" },
          "66%": { transform: "translate(-20px, 30px) scale(0.95)" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(16px) blur(4px)" },
          to: { opacity: "1", transform: "translateY(0) blur(0)" },
        },
      },
    },
  },
  plugins: [],
};
