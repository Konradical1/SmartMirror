/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        mirror: {
          black: '#000000',
          white: '#FFFFFF',
          teal: '#00E5FF',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'SF Pro Display',
          'SF Pro Text',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        softTeal: '0 0 52px rgba(0, 229, 255, 0.12)',
        softWhite: '0 0 56px rgba(255, 255, 255, 0.08)',
      },
    },
  },
  plugins: [],
};
