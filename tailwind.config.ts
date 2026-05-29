import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        app: '#f5f5f7',
        surface: '#ffffff',
        ink: '#1d1d1f',
        'ink-muted': '#6e6e73',
        hairline: '#e6e6eb',
        status: {
          open: '#3b82f6',
          pending: '#f59e0b',
          approved: '#059669',
          rejected: '#ef4444',
          withdrawn: '#94a3b8',
          cancelled: '#9ca3af',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Inter', 'Segoe UI', 'Roboto', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(17, 24, 28, 0.04), 0 12px 32px -18px rgba(17, 24, 28, 0.22)',
        pop: '0 10px 40px -12px rgba(17, 24, 28, 0.28)',
      },
    },
  },
  plugins: [],
};

export default config;
