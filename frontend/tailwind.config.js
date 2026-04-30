/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'og-blue': '#0066ff',
        'og-dark': '#0a0a1a',
        'og-card': '#111128',
        'og-border': '#1e1e3f',
      },
    },
  },
  plugins: [],
}
