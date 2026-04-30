/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'og-blue': '#3b82f6',
        'og-dark': '#080810',
        'og-card': '#0e0e1c',
        'og-card2': '#13132a',
        'og-border': '#1f1f42',
        'og-border2': '#2a2a5a',
        'mist-purple': '#7c3aed',
        'mist-cyan': '#06b6d4',
        'mist-green': '#10b981',
        'mist-red': '#ef4444',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'mist-glow': 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(124,58,237,0.15), transparent)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'spin-slow': 'spin 3s linear infinite',
      },
    },
  },
  plugins: [],
}
