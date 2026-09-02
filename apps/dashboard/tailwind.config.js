/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#080C14',
        foreground: '#F8FAFC',
        surface: {
          DEFAULT: '#0F172A',
          card: 'rgba(15, 23, 42, 0.65)',
          hover: 'rgba(30, 41, 59, 0.8)',
          border: 'rgba(51, 65, 85, 0.7)',
        },
        brand: {
          emerald: '#10B981',
          mint: '#34D399',
          indigo: '#6366F1',
          violet: '#8B5CF6',
          rose: '#F43F5E',
          amber: '#F59E0B',
          cyan: '#06B6D4',
        },
      },
      boxShadow: {
        'glow-emerald': '0 0 25px -5px rgba(16, 185, 129, 0.3)',
        'glow-indigo': '0 0 25px -5px rgba(99, 102, 241, 0.3)',
        'glow-rose': '0 0 25px -5px rgba(244, 63, 94, 0.3)',
        'glow-amber': '0 0 25px -5px rgba(245, 158, 11, 0.3)',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.6', transform: 'scale(1.05)' },
        },
        'radar-ping': {
          '0%': { transform: 'scale(0.95)', opacity: '0.8' },
          '70%, 100%': { transform: 'scale(2)', opacity: '0' },
        },
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'radar-ping': 'radar-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
      },
    },
  },
  plugins: [],
}
