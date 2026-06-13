import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1B4F8C',
          50: '#EBF2FA',
          100: '#D6E4F5',
          200: '#ADC9EB',
          300: '#85AEE0',
          400: '#5C93D6',
          500: '#1B4F8C',
          600: '#163F70',
          700: '#102F54',
          800: '#0B2038',
          900: '#05101C',
        },
        secondary: {
          DEFAULT: '#1E7D45',
          50: '#E8F5EE',
          100: '#D1EBDD',
          200: '#A3D7BB',
          300: '#75C399',
          400: '#47AF77',
          500: '#1E7D45',
          600: '#186437',
          700: '#124B29',
          800: '#0C321C',
          900: '#06190E',
        },
        accent: {
          DEFAULT: '#D68910',
          50: '#FDF5E6',
          100: '#FAEBCD',
          200: '#F5D79B',
          300: '#F0C369',
          400: '#EBAF37',
          500: '#D68910',
          600: '#AB6E0D',
          700: '#80530A',
          800: '#563706',
          900: '#2B1C03',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
