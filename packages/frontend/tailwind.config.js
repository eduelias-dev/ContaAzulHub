module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'conta-azul': '#4B6CFF',
        'conta-azul-dark': '#3D55CC',
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
