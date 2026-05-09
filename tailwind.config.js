/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // High-contrast dark palette for outdoor visibility
        bg: {
          primary: '#0a0e14',     // near-black
          secondary: '#11161d',
          tertiary: '#1a212b',
          card: '#161c24',
        },
        border: {
          DEFAULT: '#2a3441',
          strong: '#3d4a5c',
        },
        text: {
          primary: '#e8eef5',     // bright white
          secondary: '#a8b2c0',
          muted: '#6b7686',
        },
        accent: {
          DEFAULT: '#FFB020',     // safety orange/yellow - high vis
          hover: '#FFC340',
          dim: '#8a5f10',
        },
        success: '#00C896',
        danger: '#FF4757',
        warning: '#FFA502',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        // Larger base sizes for outdoor readability
        'btn': ['1.0625rem', { lineHeight: '1.5rem', fontWeight: '600' }],
      },
      boxShadow: {
        'glow': '0 0 0 3px rgba(255, 176, 32, 0.25)',
      },
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
      },
    },
  },
  plugins: [],
}
