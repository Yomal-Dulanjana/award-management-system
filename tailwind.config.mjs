/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f5fc',
          100: '#e1eaf8',
          200: '#c3d5f2',
          300: '#95b7e9',
          400: '#6093dd',
          500: '#3b74ce',
          600: '#2858b2',
          700: '#204691',
          800: '#1d3b76',
          900: '#0b2043', // Corporate navy primary
          950: '#071329',
        },
        gold: {
          50: '#fdfbf5',
          100: '#fbf7ea',
          200: '#f5eccb',
          300: '#eddcaa',
          400: '#e2c56b',
          500: '#d97706', // Corporate amber accent
          600: '#b45309',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Oxygen',
          'Ubuntu',
          'Cantarell',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
