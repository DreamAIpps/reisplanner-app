const { useState, useEffect, useCallback, useRef } = React;

// ---------- Ontwerp-tokens ----------
// Dezelfde waarden als de Tailwind-schaal in index.html, maar dan bruikbaar op
// plekken waar geen className kan staan: inline styles, kaartmarkeringen van
// Leaflet, SVG-attributen en canvas. Losse hexcodes horen hier vandaan te
// komen, zodat de palet-keuze op één plek ligt.
const PALETTE = {
  primary: "#E9B7A6",       // zacht perzik — draagt knoppen en accenten
  primaryHover: "#E2A792",
  primarySoft: "#F8EFEB",   // lichte knop- en vlakachtergrond
  background: "#FFF9F6",
  surface: "#FFFFFF",
  surfaceSecondary: "#F8EFEB",
  border: "#F1E7E3",        // scheidingslijn
  textPrimary: "#2F2A28",
  textSecondary: "#7F7874",
  textDisabled: "#CFC6C1",
  success: "#A8C7B3",
  info: "#B8D6E8",
  accent: "#F6E2A7",
  coral: "#E2A792",         // "nieuw" en "vandaag"
  coralDeep: "#8A4B39",     // dezelfde familie, maar donker genoeg voor tekst op wit
};

// Alleen nodig voor pushmeldingen (zie PushToggle) — geen offline-cache, dus
// hier verandert verder niets aan hoe de app laadt of ververst.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

// ---------- Error boundary ----------
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-gray-50">
        <div className="bg-white rounded-2xl shadow p-8 max-w-md w-full text-center">
          <Icon name="alert" size={40} strokeWidth={1.3} className="mx-auto mb-4 text-sky-700" />
          <h2 className="text-lg font-bold text-gray-800 mb-2">Er ging iets mis</h2>
          <p className="text-sm text-gray-500 mb-4">{this.state.error.message}</p>
          <button onClick={() => window.location.reload()} className="bg-sky-300 text-gray-800 rounded-xl px-6 h-11 text-sm font-semibold hover:bg-sky-200 transition-colors">Pagina herladen</button>
        </div>
      </div>
    );
    return this.props.children;
  }
}

// ---------- Icons ----------
// Eén getekende set in plaats van emoji. Emoji worden door het besturingssysteem
// getekend, dus ze zien er op elk toestel anders uit, hebben elk hun eigen kleur
// en laten zich niet uitlijnen. Deze staan allemaal op hetzelfde raster van 24,
// hebben dezelfde lijndikte en nemen via currentColor de kleur van hun omgeving over.
const ICONS = {
  // navigatie & structuur
  route: <><circle cx="6" cy="6.5" r="2" /><circle cx="6" cy="12" r="2" /><circle cx="6" cy="17.5" r="2" /><path d="M6 8.5v1.5" /><path d="M6 14v1.5" /><path d="M11 6.5h9" /><path d="M11 12h9" /><path d="M11 17.5h6" /></>,
  book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H19v3H6.5A2.5 2.5 0 0 1 4 20.5z" /></>,
  camera: <><path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.9l1.2-2h6.8l1.2 2h1.9A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" /><circle cx="12" cy="12.5" r="3.4" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17" /><path d="M8 3v4" /><path d="M16 3v4" /></>,
  map: <><path d="M9 4.5 3.5 7v12.5L9 17l6 2.5 5.5-2.5V4.5L15 7z" /><path d="M9 4.5V17" /><path d="M15 7v12.5" /></>,
  // Twee pagina's naast elkaar — het overzicht van het fotoboek.
  grid: <><rect x="3.5" y="5" width="7.5" height="14" rx="1.2" /><rect x="13" y="5" width="7.5" height="14" rx="1.2" /></>,
  // Rasterlijnen met een kader eromheen — "foto's op het raster uitlijnen".
  alignGrid: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 10.7h16" /><path d="M4 15.3h16" /><path d="M10.7 4v16" /><path d="M15.3 4v16" /></>,
  // Een hoofdletter T — voor "Titel toevoegen".
  titleText: <><path d="M5 6h14" /><path d="M12 6v13" /></>,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17" /><path d="M12 3.5c2.3 2.4 3.5 5.3 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.3-3.5-8.5S9.7 5.9 12 3.5z" /></>,
  more: <><circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" /></>,
  dragHandle: <><circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none" /><circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none" /><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none" /><circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none" /></>,
  sliders: <><path d="M4 7h9" /><path d="M17 7h3" /><circle cx="14.5" cy="7" r="2" /><path d="M4 12h3" /><path d="M9.5 12h10.5" /><circle cx="7" cy="12" r="2" /><path d="M4 17h9" /><path d="M17 17h3" /><circle cx="14.5" cy="17" r="2" /></>,
  undo: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 1 1 0 12h-3" /></>,
  crop: <><path d="M6 1v15a2 2 0 0 0 2 2h15" /><path d="M1 6h15a2 2 0 0 1 2 2v15" /></>,
  chevronDown: <><path d="m5.5 9 6.5 6.5L18.5 9" /></>,
  chevronRight: <><path d="m9 5.5 6.5 6.5L9 18.5" /></>,

  // vervoer
  plane: <><path d="M3 13.5 21 7l-4.5 12-3.2-5.1z" /><path d="M13.3 13.9 21 7" /></>,
  train: <><rect x="5.5" y="3.5" width="13" height="13" rx="3" /><path d="M5.5 10h13" /><path d="m8 20 2-3.5" /><path d="m16 20-2-3.5" /><circle cx="9" cy="13.3" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="13.3" r="1" fill="currentColor" stroke="none" /></>,
  bus: <><rect x="4" y="3.5" width="16" height="13" rx="2.5" /><path d="M4 10.5h16" /><path d="M7 16.5V19" /><path d="M17 16.5V19" /><circle cx="8" cy="13.6" r="1" fill="currentColor" stroke="none" /><circle cx="16" cy="13.6" r="1" fill="currentColor" stroke="none" /></>,
  car: <><path d="M4 16v-3.2l1.9-4.6A2 2 0 0 1 7.75 7h8.5a2 2 0 0 1 1.85 1.2L20 12.8V16" /><path d="M4 12.8h16" /><path d="M5.5 16v2" /><path d="M18.5 16v2" /><circle cx="7.8" cy="14.4" r="1" fill="currentColor" stroke="none" /><circle cx="16.2" cy="14.4" r="1" fill="currentColor" stroke="none" /></>,
  boat: <><path d="M4 15h16l-2.3 5H6.3z" /><path d="M12.8 15V3.5L19 15z" /><path d="M10.8 15V7.5L6 15z" /></>,

  // plekken & activiteiten
  bed: <><path d="M3 18v-8" /><path d="M3 13h18v5" /><path d="M21 18v-4.5a2.5 2.5 0 0 0-2.5-2.5H10v2.5" /><circle cx="6.9" cy="11" r="1.9" /></>,
  pin: <><path d="M12 21s6.5-6 6.5-11a6.5 6.5 0 1 0-13 0C5.5 15 12 21 12 21z" /><circle cx="12" cy="10" r="2.4" /></>,
  flag: <><path d="M6 21V4" /><path d="M6 5h10.5l-1.8 3.6 1.8 3.6H6" /></>,
  landmark: <><path d="M4 20h16" /><path d="M5 9.5h14" /><path d="M12 3.5 20 9.5H4z" /><path d="M7.5 9.5V17" /><path d="M12 9.5V17" /><path d="M16.5 9.5V17" /></>,
  fork: <><path d="M7 3v6a2 2 0 0 0 4 0V3" /><path d="M9 11v10" /><path d="M17 3c-1.6 1.3-2.2 3-2.2 5 0 1.6.7 2.6 2.2 3v10" /></>,
  frame: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="m4.5 16 4.3-4.3 3.4 3.4 2.6-2.6 4.7 4.7" /><circle cx="9" cy="9" r="1.3" /></>,
  leaf: <><path d="M20 4c0 9-5.2 13-10 13a5 5 0 0 1-5-5C5 7.7 11.5 4 20 4z" /><path d="M5.5 20c1.5-4.5 4.5-8 9-10" /></>,
  ball: <><circle cx="12" cy="12" r="8.5" /><path d="m12 7.2 4 2.9-1.5 4.7h-5L8 10.1z" /><path d="M12 3.5v3.7" /><path d="m4 9.6 4 .5" /><path d="m20 9.6-4 .5" /><path d="m7.3 19 2.2-4.2" /><path d="m16.7 19-2.2-4.2" /></>,
  bagShop: <><path d="M5 8h14l-1 12H6z" /><path d="M9 8V5.5A2.5 2.5 0 0 1 11.5 3h1A2.5 2.5 0 0 1 15 5.5V8" /></>,
  ticket: <><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h13A1.5 1.5 0 0 1 20 8.5v2a1.7 1.7 0 0 0 0 3v2a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 15.5v-2a1.7 1.7 0 0 0 0-3z" /><path d="M13.5 7v10" /></>,

  // acties
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  pen: <><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z" /><path d="m15 6 3 3" /></>,
  trash: <><path d="M4.5 6.5h15" /><path d="M9.5 6.5V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" /><path d="M6.5 6.5 7.4 19a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5l.9-12.5" /><path d="M10.5 10v6.5" /><path d="M13.5 10v6.5" /></>,
  share: <><circle cx="17.5" cy="6" r="2.5" /><circle cx="6.5" cy="12" r="2.5" /><circle cx="17.5" cy="18" r="2.5" /><path d="M8.8 10.8 15.3 7.3" /><path d="m8.8 13.2 6.5 3.5" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m3.6 6.7 7.3 5.2a2 2 0 0 0 2.2 0l7.3-5.2" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m15.8 15.8 4.2 4.2" /></>,
  alignLeft: <><path d="M4 6h16" /><path d="M4 12h10" /><path d="M4 18h13" /></>,
  alignCenter: <><path d="M4 6h16" /><path d="M7 12h10" /><path d="M5.5 18h13" /></>,
  alignRight: <><path d="M4 6h16" /><path d="M10 12h10" /><path d="M7 18h13" /></>,
  check: <><path d="m5 12.8 4.4 4.2L19 6.5" /></>,
  chat: <><path d="M20 12.5c0 3.9-3.6 6.9-8 6.9a9.4 9.4 0 0 1-2.7-.4L4 21l1.2-3.4A6.6 6.6 0 0 1 4 12.5C4 8.6 7.6 5.6 12 5.6s8 3 8 6.9z" /></>,
  thumb: <><path d="M7 10.5 11 3a2.4 2.4 0 0 1 2.4 2.4V9.5h4.3a2 2 0 0 1 2 2.4l-1.3 6.2a2.4 2.4 0 0 1-2.3 1.9H7" /><rect x="3" y="10.5" width="4" height="9.5" rx="1.4" /></>,
  eye: <><path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></>,
  rotate: <><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20.5 4v4.4h-4.4" /></>,
  clipboard: <><rect x="5" y="4.5" width="14" height="16" rx="2.5" /><path d="M9 4.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4.5v1.2H9z" /><path d="M9 11h6" /><path d="M9 15h4" /></>,
  arrowRight: <><path d="M4 12h15.5" /><path d="m14 6.5 5.5 5.5-5.5 5.5" /></>,
  arrowLeft: <><path d="M20 12H4.5" /><path d="m10 6.5-5.5 5.5 5.5 5.5" /></>,
  arrowUp: <><path d="M12 20V4.5" /><path d="m6.5 10 5.5-5.5 5.5 5.5" /></>,
  arrowUpRight: <><path d="M7 17 17.5 6.5" /><path d="M8.5 6.5h9v9" /></>,
  close: <><path d="m6 6 12 12" /><path d="M18 6 6 18" /></>,

  // status & meta
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5.3l3.3 2" /></>,
  wallet: <><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" /><path d="M4 7.5V17a2.5 2.5 0 0 0 2.5 2.5H19a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H6.5" /><circle cx="16" cy="14" r="1.2" fill="currentColor" stroke="none" /></>,
  suitcase: <><rect x="3" y="7.5" width="18" height="12" rx="2.5" /><path d="M9 7.5V5.3A1.8 1.8 0 0 1 10.8 3.5h2.4A1.8 1.8 0 0 1 15 5.3v2.2" /><path d="M3 12.5h18" /></>,
  bag: <><path d="M6 8h12v10.5a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /><path d="M6 12h12" /></>,
  bulb: <><path d="M9.2 16.5a6 6 0 1 1 5.6 0v1.8H9.2z" /><path d="M10 21h4" /></>,
  sparkle: <><path d="M12 3.5 13.7 9l5.3 1.8L13.7 12.6 12 18l-1.7-5.4L5 10.8 10.3 9z" /><path d="M18.5 16.5 19.2 18.6l2 .7-2 .7L18.5 22l-.7-2-2-.7 2-.7z" /></>,
  alert: <><circle cx="12" cy="12" r="8.7" /><path d="M12 7.5v5.2" /><path d="M12 16.3h.01" /></>,
  user: <><circle cx="12" cy="8.5" r="3.7" /><path d="M4.8 20.2a7.4 7.4 0 0 1 14.4 0" /></>,
  users: <><circle cx="9.5" cy="8.5" r="3.4" /><path d="M3 19.8a6.7 6.7 0 0 1 13 0" /><path d="M16.2 5.5a3.4 3.4 0 0 1 0 6.5" /><path d="M17.6 14.4a6.7 6.7 0 0 1 3.4 5.4" /></>,
  family: <><circle cx="7.5" cy="7.5" r="2.8" /><circle cx="16.5" cy="7.5" r="2.8" /><path d="M3 19.5a4.6 4.6 0 0 1 9 0" /><path d="M12.6 19.5a4.6 4.6 0 0 1 8.4-2.6" /><circle cx="12" cy="14.5" r="2" /><path d="M8.8 21a3.4 3.4 0 0 1 6.4 0" /></>,
  key: <><circle cx="8" cy="14" r="4" /><path d="m11 11.5 8.5-8.5" /><path d="m16 6.5 2.4 2.4" /></>,
  unlock: <><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8.5 10.5V7.2a3.5 3.5 0 0 1 6.8-1.2" /></>,
  lock: <><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M7.5 10.5V7.5a4.5 4.5 0 0 1 9 0v3" /></>,

  // paklijst
  doc: <><path d="M6 3.5h7L18.5 9v11.5H6z" /><path d="M13 3.5V9h5.5" /><path d="M9 13h6" /><path d="M9 16.5h4" /></>,
  shirt: <><path d="M9 3.5 4.5 6l1.9 3.7 2.1-1.1v11.9h7V8.6l2.1 1.1L19.5 6 15 3.5a3.1 3.1 0 0 1-6 0z" /></>,
  plug: <><path d="M9.5 3.5v4.3" /><path d="M14.5 3.5v4.3" /><path d="M5.8 7.8h12.4v2.9a6.2 6.2 0 0 1-12.4 0z" /><path d="M12 16.9v3.6" /></>,
  bottle: <><path d="M9.6 3.5h4.8v2.8H9.6z" /><path d="M9.9 6.3 8.4 9a3.2 3.2 0 0 0-.4 1.5v8a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-8a3.2 3.2 0 0 0-.4-1.5l-1.5-2.7" /><path d="M8 13.2h8" /></>,
  pill: <><rect x="2.8" y="8.5" width="18.4" height="7" rx="3.5" transform="rotate(-45 12 12)" /><path d="m9.2 9.2 5.6 5.6" /></>,

  // weer
  sun: <><circle cx="12" cy="12" r="4.2" /><path d="M12 3.5v2.2" /><path d="M12 18.3v2.2" /><path d="M3.5 12h2.2" /><path d="M18.3 12h2.2" /><path d="m5.8 5.8 1.6 1.6" /><path d="m16.6 16.6 1.6 1.6" /><path d="m18.2 5.8-1.6 1.6" /><path d="m7.4 16.6-1.6 1.6" /></>,
  cloudSun: <><circle cx="8" cy="7.3" r="2.6" /><path d="M8 3.2v1.3" /><path d="m4.6 4.7 1 1" /><path d="M3 8.6h1.3" /><path d="M10 17.8a3.9 3.9 0 0 1-.5-7.7 5 5 0 0 1 9.6-1.6A3.7 3.7 0 0 1 18.7 17.8z" /></>,
  cloud: <><path d="M7 18.5a4.2 4.2 0 0 1-.6-8.4 5.4 5.4 0 0 1 10.4-1.8A4 4 0 0 1 17 18.5z" /></>,
  cloudRain: <><path d="M7 15a4 4 0 0 1-.6-7.9 5.1 5.1 0 0 1 9.8-1.7A3.8 3.8 0 0 1 17 15z" /><path d="M9 18.5 8 21" /><path d="M13 18.5 12 21" /></>,
  cloudSnow: <><path d="M7 15a4 4 0 0 1-.6-7.9 5.1 5.1 0 0 1 9.8-1.7A3.8 3.8 0 0 1 17 15z" /><path d="M9 18.5v.01" /><path d="M13 18.5v.01" /><path d="M9 21v.01" /><path d="M13 21v.01" /></>,
  cloudLightning: <><path d="M7 14a4 4 0 0 1-.6-7.9 5.1 5.1 0 0 1 9.8-1.7A3.8 3.8 0 0 1 17 14z" /><path d="m12.5 14-2.5 4h3l-2 4" /></>,
  fog: <><path d="M4 9.5h12" /><path d="M4 13h16" /><path d="M4 16.5h10" /></>,

  // merken
  google: <>
    <path d="M21.6 12.23c0-.71-.06-1.4-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.89-1.74 2.98-4.3 2.98-7.35z" fill="#4285F4" stroke="none" />
    <path d="M12 22c2.7 0 4.96-.9 6.62-2.42l-3.24-2.5c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.06v2.58A10 10 0 0 0 12 22z" fill="#34A853" stroke="none" />
    <path d="M6.41 13.92a6 6 0 0 1 0-3.83V7.5H3.06a10 10 0 0 0 0 9z" fill="#FBBC05" stroke="none" />
    <path d="M12 5.96c1.47 0 2.79.5 3.83 1.5l2.87-2.87C16.95 2.98 14.7 2 12 2a10 10 0 0 0-8.94 5.5l3.35 2.6C7.2 7.72 9.4 5.95 12 5.95z" fill="#EA4335" stroke="none" />
  </>,
  apple: <><path d="M16.1 12.6c0-2.2 1.8-3.3 1.9-3.3-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.7.8-3.3.8-.7 0-1.7-.8-2.8-.8-1.5 0-2.8.9-3.6 2.2-1.5 2.6-.4 6.5 1.1 8.6.7 1 1.6 2.2 2.7 2.2 1.1 0 1.5-.7 2.8-.7 1.3 0 1.6.7 2.8.7 1.1 0 1.9-1 2.6-2.1.8-1.2 1.2-2.4 1.2-2.5 0 0-2.2-.9-2.2-3.4z" fill="currentColor" stroke="none" /><path d="M14 5.9c.6-.7 1-1.7.9-2.7-.9 0-2 .6-2.6 1.3-.6.6-1.1 1.7-.9 2.6 1 .1 2-.5 2.6-1.2z" fill="currentColor" stroke="none" /></>,
};

function Icon({ name, size = 16, className = "", style, strokeWidth = 1.6 }) {
  const glyph = ICONS[name];
  if (!glyph) return null;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={"inline-block shrink-0 " + className}
         style={style} fill="none" stroke="currentColor" strokeWidth={strokeWidth}
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {glyph}
    </svg>
  );
}
