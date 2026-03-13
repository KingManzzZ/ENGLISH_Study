/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gray: {
          850: '#1f2937', // Custom gray for a nicer dark theme
        }
      }
    },
  },
  plugins: [],
}

