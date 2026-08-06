// De ontwerp-tokens van de app. Dit is sinds het wegvallen van de Tailwind-CDN
// de enige plek waar ze staan: index.html had er een kopie van in een inline
// <script>, maar die werd alleen door de CDN-versie gelezen en kon dus stilletjes
// uit de pas gaan lopen met wat er daadwerkelijk getoond werd.
//
// De stylesheet wordt bij het opstarten van de server uit dit bestand gebouwd
// (zie buildStylesheet in server.js), zodat het bewerken van app.js zonder
// aparte bouwstap blijft werken zoals het altijd deed.
module.exports = {
  content: [
    "./public/index.html",
    "./public/login.html",
    "./public/app.js",
  ],
  theme: {
    extend: {
      colors: {
        /* Zacht perzik. De schaal heet nog sky zodat alle bestaande klassen
           blijven werken, maar loopt van licht naar donker binnen één warme
           familie — dat is nodig omdat sky-600/700 in de app vaker als
           tekstkleur dan als vlak gebruikt worden en dus leesbaar op wit
           moeten blijven.

             50-200  zachte vlakken, lichte knoppen en scheidingslijnen
             300     Primary (#E9B7A6) — de pastel waar knoppen op staan
             400     Hover/pressed (#E2A792), en "nieuw"/"vandaag"
             600/700 de enige tinten donker genoeg voor accenttekst op wit
                     (contrast 5.1 resp. 6.9) */
        sky: {
          50: "#FDF5F1", 100: "#F8EFEB", 200: "#F1E7E3", 300: "#E9B7A6",
          400: "#E2A792", 500: "#D08E76", 600: "#A85F49", 700: "#8A4B39",
          800: "#6B3A2C", 900: "#502B21",
        },
        /* De warme neutralen: 50 is de achtergrond (#FFF9F6), 100 het lichte
           knopvlak, 200 de scheidingslijn, 500 secundaire tekst (#7F7874) en
           800 primaire tekst (#2F2A28). */
        gray: {
          50: "#FFF9F6", 100: "#F8EFEB", 200: "#F1E7E3", 300: "#CFC6C1",
          400: "#A9A09B", 500: "#7F7874", 600: "#615B57", 700: "#48423F",
          800: "#2F2A28", 900: "#211D1B",
        },
        /* Zachte statuskleuren — alleen voor betekenis, nooit als accent. */
        good: "#A8C7B3",
        info: "#B8D6E8",
        accent: "#F6E2A7",
        coral: "#E2A792",
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', "ui-sans-serif", "-apple-system", '"Segoe UI"', "system-ui", "sans-serif"],
        num: ['"Plus Jakarta Sans"', "ui-sans-serif", "-apple-system", "system-ui", "sans-serif"],
      },
      /* Ruime, zachte hoeken: knoppen 18, kaarten 24, bladen en zwevende
         knoppen 28. De bestaande klassennamen schuiven mee omhoog, zodat
         kaarten (rounded-2xl) in één keer goed staan zonder 200 classNames
         aan te raken. */
      borderRadius: {
        sm: "8px", DEFAULT: "10px", md: "12px", lg: "14px",
        xl: "18px", "2xl": "24px", "3xl": "28px",
      },
      /* Eén zachte, diffuse schaduw in plaats van hoogteverschillen —
         kaarten zweven nauwelijks, ze liggen. */
      boxShadow: {
        sm: "0 2px 10px rgba(0,0,0,0.03)",
        DEFAULT: "0 4px 16px rgba(0,0,0,0.04)",
        md: "0 8px 30px rgba(0,0,0,0.05)",
        lg: "0 10px 34px rgba(0,0,0,0.06)",
        xl: "0 14px 40px rgba(0,0,0,0.07)",
        "2xl": "0 18px 50px rgba(0,0,0,0.08)",
      },
      /* Ingetogen beweging. 220ms is de standaard voor elk element dat al een
         transition-klasse heeft, dus losse duration-klassen zijn de
         uitzondering en niet de regel. */
      transitionDuration: { DEFAULT: "220ms", fast: "120ms", normal: "220ms", slow: "320ms" },
    },
  },
};
