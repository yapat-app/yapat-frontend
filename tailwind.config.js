/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        "ibm-sans": ["IBM Plex Sans", "sans-serif"],
        "ibm-mono": ["IBM Plex Mono", "sans-serif"],
      },
    },
  },
  plugins: [],
};
