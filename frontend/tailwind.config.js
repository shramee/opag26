/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'mx-bg': '#000000',
        'mx-soft': '#020a04',
        'mx-green': '#00ff41',
        'mx-dim': '#00b82e',
        'mx-deep': '#005c17',
        'mx-amber': '#ffb000',
        'mx-red': '#ff2a2a',
        'mx-white': '#e8ffe8',
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "'IBM Plex Mono'", "'Courier New'", 'monospace'],
      },
      animation: {
        'blink': 'mx-blink 1s steps(2, start) infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'flicker': 'mx-flicker 6s linear infinite',
      },
      keyframes: {
        'mx-blink': {
          '0%, 49%': { opacity: '1' },
          '50%, 100%': { opacity: '0' },
        },
        'mx-flicker': {
          '0%, 96%, 100%': { opacity: '1' },
          '97%': { opacity: '0.92' },
          '98%': { opacity: '1' },
          '99%': { opacity: '0.88' },
        },
      },
    },
  },
  plugins: [],
}
