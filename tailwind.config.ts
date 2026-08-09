import type { Config } from 'tailwindcss';

/** Brand per PART V: institutional fintech, not crypto. */
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        indigo: { brand: '#5B63E8' },
        periwinkle: '#6C7BFF',
        ink: '#0D1030',
        paper: '#F4F4F6',
        state: {
          pass: '#16A34A',
          isolated: '#D97706',
          frozen: '#DC2626',
          quarantined: '#991B1B',
        },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      fontVariantNumeric: { tabular: 'tabular-nums' },
    },
  },
  plugins: [],
};

export default config;
