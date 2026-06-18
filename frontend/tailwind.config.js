/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          purple: '#5F1EBE',
          blue:   '#1055C5',
          light:  '#EDE9FA',
        },
      },
    },
  },
  plugins: [],
}
