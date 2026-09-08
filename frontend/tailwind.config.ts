/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#0a0a0a',
          layer1: 'rgba(255,255,255,0.031)',
          layer2: 'rgba(255,255,255,0.056)',
          layer3: 'rgba(255,255,255,0.094)',
          layer4: 'rgba(255,255,255,0.169)',
        },
        text: {
          strong: 'rgba(255,255,255,0.936)',
          base: 'rgba(255,255,255,0.618)',
          muted: 'rgba(255,255,255,0.422)',
          faint: 'rgba(255,255,255,0.284)',
        },
        border: {
          base: 'rgba(255,255,255,0.063)',
          strong: 'rgba(255,255,255,0.141)',
        },
        accent: '#034cff',
        accentHover: '#1d65f7',
        success: '#12c905',
        warning: '#fcd53a',
        danger: '#fc533a',
        info: '#edb2f1',
      },
      borderWidth: {
        'hairline': '0.5px',
      },
    },
  },
  plugins: [],
};
