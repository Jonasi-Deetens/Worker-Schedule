import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        status: {
          open: '#3b82f6',
          pending: '#f59e0b',
          approved: '#16a34a',
          rejected: '#ef4444',
          withdrawn: '#94a3b8',
          cancelled: '#9ca3af',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
