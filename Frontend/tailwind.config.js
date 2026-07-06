/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        telegram: '#0088cc',
        whatsapp: '#25D366',
        viber: '#7360f2',
        primary: {
          DEFAULT: '#0ea5e9',
          foreground: '#ffffff',
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },
      },
    },
  },
  plugins: [],
  safelist: [
    'bg-gradient-to-br',
    'from-red-600', 'via-orange-500', 'to-rose-900',
    'from-blue-600', 'via-indigo-500', 'to-violet-900',
    'from-emerald-500', 'via-teal-500', 'to-green-900',
    'from-amber-400', 'via-orange-500', 'to-amber-900',
    'from-sky-500', 'via-cyan-500', 'to-primary-900',
    'bg-orange-300/40', 'bg-sky-300/35', 'bg-emerald-200/40', 'bg-yellow-200/45', 'bg-cyan-200/40',
    'bg-rose-500/30', 'bg-violet-400/30', 'bg-teal-400/30', 'bg-orange-500/35', 'bg-primary-400/30',
    'from-emerald-100', 'via-green-300', 'to-emerald-400',
    'from-rose-100', 'via-red-300', 'to-rose-400',
    'from-amber-100', 'via-yellow-200', 'to-amber-300',
    'bg-emerald-400/25', 'text-emerald-100', 'ring-emerald-200/40',
    'bg-rose-400/25', 'text-rose-100', 'ring-rose-200/40',
    'bg-amber-400/25', 'text-amber-100', 'ring-amber-200/40',
  ],
}
