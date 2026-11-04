/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        darkBg: '#090d16',
        panelBg: '#111827',
        accentCyan: '#06b6d4',
        accentGreen: '#10b981',
        accentAmber: '#f59e0b',
        accentRed: '#ef4444',
      },
    },
  },
  plugins: [],
}