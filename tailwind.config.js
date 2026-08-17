/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          // Match the official BebKey Logo system palette
          // (see src/components/Logo.tsx BEBKEY_COLORS).
          blue:   '#1E40AF',
          orange: '#F59E0B',  // "key" gold - used in the bebkey wordmark
          paper:  '#FAFAF8',
          ink:    '#0E1326',
        },
      },
    },
  },
  plugins: [],
}

