/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        uaBlue: '#00B0FF',
        uaYellow: '#FFD500',
      },
      dropShadow: {
        'glow-blue': '0 0 8px rgba(0,176,255,0.6)',
        'glow-yellow': '0 0 8px rgba(255,213,0,0.6)',
      },
      boxShadow: {
        'neon-blue': '0 0 0 1px rgba(0,176,255,0.4), 0 0 12px rgba(0,176,255,0.35)',
        'neon-yellow': '0 0 0 1px rgba(255,213,0,0.45), 0 0 12px rgba(255,213,0,0.35)',
      }
    },
  },
  plugins: [],
};
