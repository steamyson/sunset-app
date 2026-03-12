/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Sunset palette
        ember: "#E8642A",
        amber: "#F5A623",
        dusk: "#C2478C",
        magenta: "#D4547A",
        plum: "#7B4F8C",
        lavender: "#A882C4",
        mist: "#EDD9C0",
        cream: "#FAF3E8",
        ash: "#B8A99A",
        charcoal: "#3D2E2E",
      },
    },
  },
  plugins: [],
};
