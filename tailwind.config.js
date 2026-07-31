/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    {
      pattern: /^(bg|text|border)-(red|green|blue|orange|cyan|purple)-(100|200|400|500|700|900)$/,
      variants: ['hover', 'focus'],
    },
    {
      pattern: /^(bg|text|border)-gray-(100|200|400|500|600|700|800|900)$/,
    }
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        gray: {
          800: '#121212',
          900: '#000000',
          950: '#000000',
        }
      }
    },
  },
  plugins: [],
}
