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

// ---------- Constants ----------
const TRANSPORT_TYPES = ["Vliegtuig", "Trein", "Bus", "Huurauto", "Taxi", "Boot", "Anders"];
const EXPENSE_CATEGORIES = ["Vluchten", "Accommodatie", "Vervoer", "Eten & Drinken", "Activiteiten", "Winkelen", "Overig"];
const ACTIVITY_CATEGORIES = ["Bezienswaardigheid", "Restaurant", "Museum", "Natuur", "Sport", "Shopping", "Anders"];
// Acht diepe, licht ingehouden tinten die alle acht naast het warme grijs kunnen staan.
// Omslagkleuren voor een reis. Allemaal uit het palet zelf — de vier pastels
// voorop, daarna dezelfde tinten in een diepe variant, zodat er genoeg
// onderling verschil is zonder dat er een kleur bijkomt die nergens anders
// in de app voorkomt.
const COVER_COLORS = [
  PALETTE.primary, PALETTE.coral, PALETTE.accent, PALETTE.success,
  PALETTE.info, PALETTE.coralDeep, PALETTE.textSecondary, PALETTE.textPrimary,
];

// ---------- API ----------
async function apiFetch(url, options = {}) {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
  if (!res.ok) {
    let msg = `Fout ${res.status}`;
    try { const d = await res.json(); if (d.error) msg = d.error; } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ---------- Guest Storage ----------
const _GK = "rp_guest";
function _gr() { try { return JSON.parse(localStorage.getItem(_GK) || "{}"); } catch { return {}; } }
function _gw(d) {
  try { localStorage.setItem(_GK, JSON.stringify(d)); }
  catch (err) {
    // Quota exceeded. Swallowing this made writes look successful while the
    // data was thrown away, so a guest's photo just vanished with no message.
    throw new Error("Opslagruimte vol. Log in om je reis op de server te bewaren, of verwijder enkele foto's.");
  }
}
function _gid() { return "g" + Date.now() + Math.random().toString(36).slice(2, 5); }

// UTC-vast opgebouwd (net als de server se generate_series-migratie): een
// stap via setDate() zou over een zomertijdovergang heen 23 uur vooruit
// gaan, met een dubbele of ontbrekende dag tot gevolg.
function dateRange(start, end) {
  const days = [];
  let d = new Date(start + "T00:00:00Z");
  const endD = new Date(end + "T00:00:00Z");
  while (d <= endD) {
    days.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86400000);
  }
  return days;
}

let _guestMode = false;
function setGuestMode(v) { _guestMode = v; }

const guestApi = {
  getTrips() {
    const d = _gr(); const acts = d.activities || [];
    return Promise.resolve((d.trips || []).map(t => ({ ...t, is_owner: true, activity_count: acts.filter(a => a.trip_id === t.id).length })));
  },
  getTrip(id) {
    const t = (_gr().trips || []).find(t => t.id === id);
    return t ? Promise.resolve({ ...t, is_owner: true }) : Promise.reject(new Error("Reis niet gevonden"));
  },
  createTrip(data) {
    const d = _gr(); const t = { ...data, id: _gid(), created_at: new Date().toISOString() };
    d.trips = [...(d.trips || []), t];
    // Zonder dit blijft een gast-reis voorgoed leeg: er is geen "+ Dag
    // toevoegen"-knop meer, dus dit is de enige plek waar een gast ooit een
    // dagkaart krijgt — precies zoals de ingelogde API het bij aanmaken doet.
    if (data.start_date && data.end_date) {
      const newDays = dateRange(data.start_date, data.end_date).map((date) => ({ id: _gid(), trip_id: t.id, date }));
      d.days = [...(d.days || []), ...newDays];
    }
    _gw(d); return Promise.resolve(t);
  },
  updateTrip(id, data) {
    const d = _gr(); let found;
    d.trips = (d.trips || []).map(t => t.id === id ? (found = { ...t, ...data }) : t); _gw(d); return Promise.resolve(found);
  },
  deleteTrip(id) {
    const d = _gr();
    d.trips = (d.trips || []).filter(t => t.id !== id);
    const kept = new Set((d.days || []).filter(day => day.trip_id !== id).map(day => day.id));
    d.days = (d.days || []).filter(day => day.trip_id !== id);
    d.activities = (d.activities || []).filter(a => kept.has(a.day_id));
    d.accommodations = (d.accommodations || []).filter(a => a.trip_id !== id);
    d.transports = (d.transports || []).filter(t => t.trip_id !== id);
    d.expenses = (d.expenses || []).filter(e => e.trip_id !== id);
    d.photos = (d.photos || []).filter(p => p.trip_id !== id);
    d.journal_entries = (d.journal_entries || []).filter(e => e.trip_id !== id);
    _gw(d); return Promise.resolve(null);
  },
  getDays(tripId) {
    const d = _gr();
    const days = (d.days || []).filter(day => day.trip_id === tripId).sort((a, b) => (a.date || "") < (b.date || "") ? -1 : 1);
    const acts = d.activities || [];
    return Promise.resolve(days.map(day => ({ ...day, activities: acts.filter(a => a.day_id === day.id).sort((a, b) => (a.time || "") < (b.time || "") ? -1 : 1) })));
  },
  addDay(tripId, data) {
    const d = _gr(); const day = { ...data, id: _gid(), trip_id: tripId };
    d.days = [...(d.days || []), day]; _gw(d); return Promise.resolve({ ...day, activities: [] });
  },
  updateDay(id, data) {
    const d = _gr(); let found;
    d.days = (d.days || []).map(day => day.id === id ? (found = { ...day, ...data }) : day); _gw(d); return Promise.resolve(found);
  },
  deleteDay(id) {
    const d = _gr();
    d.days = (d.days || []).filter(day => day.id !== id);
    d.activities = (d.activities || []).filter(a => a.day_id !== id);
    d.photos = (d.photos || []).filter(p => p.day_id !== id);
    d.journal_entries = (d.journal_entries || []).filter(e => e.day_id !== id);
    _gw(d); return Promise.resolve(null);
  },
  addActivity(dayId, data) {
    const d = _gr(); const day = (d.days || []).find(day => day.id === dayId);
    const act = { ...data, id: _gid(), day_id: dayId, trip_id: day && day.trip_id };
    d.activities = [...(d.activities || []), act]; _gw(d); return Promise.resolve(act);
  },
  updateActivity(id, data) {
    const d = _gr(); let found;
    d.activities = (d.activities || []).map(a => a.id === id ? (found = { ...a, ...data }) : a); _gw(d); return Promise.resolve(found);
  },
  deleteActivity(id) {
    const d = _gr();
    d.activities = (d.activities || []).filter(a => a.id !== id);
    d.photos = (d.photos || []).filter(p => p.activity_id !== id);
    d.journal_entries = (d.journal_entries || []).filter(e => e.activity_id !== id);
    _gw(d); return Promise.resolve(null);
  },
  getAccommodations(tripId) {
    return Promise.resolve((_gr().accommodations || []).filter(a => a.trip_id === tripId));
  },
  addAccommodation(tripId, data) {
    const d = _gr(); const acc = { ...data, id: _gid(), trip_id: tripId };
    d.accommodations = [...(d.accommodations || []), acc]; _gw(d); return Promise.resolve(acc);
  },
  updateAccommodation(id, data) {
    const d = _gr(); let found;
    d.accommodations = (d.accommodations || []).map(a => a.id === id ? (found = { ...a, ...data }) : a); _gw(d); return Promise.resolve(found);
  },
  deleteAccommodation(id) {
    const d = _gr();
    d.accommodations = (d.accommodations || []).filter(a => a.id !== id);
    d.journal_entries = (d.journal_entries || []).filter(e => e.accommodation_id !== id);
    d.photos = (d.photos || []).filter(p => p.accommodation_id !== id);
    _gw(d); return Promise.resolve(null);
  },
  getTransports(tripId) {
    return Promise.resolve((_gr().transports || []).filter(t => t.trip_id === tripId));
  },
  addTransport(tripId, data) {
    const d = _gr(); const tr = { ...data, id: _gid(), trip_id: tripId };
    d.transports = [...(d.transports || []), tr]; _gw(d); return Promise.resolve(tr);
  },
  updateTransport(id, data) {
    const d = _gr(); let found;
    d.transports = (d.transports || []).map(t => t.id === id ? (found = { ...t, ...data }) : t); _gw(d); return Promise.resolve(found);
  },
  deleteTransport(id) {
    const d = _gr();
    d.transports = (d.transports || []).filter(t => t.id !== id);
    d.journal_entries = (d.journal_entries || []).filter(e => e.transport_id !== id);
    d.photos = (d.photos || []).filter(p => p.transport_id !== id);
    _gw(d); return Promise.resolve(null);
  },
  getExpenses(tripId) {
    return Promise.resolve((_gr().expenses || []).filter(e => e.trip_id === tripId));
  },
  addExpense(tripId, data) {
    const d = _gr(); const exp = { ...data, id: _gid(), trip_id: tripId };
    d.expenses = [...(d.expenses || []), exp]; _gw(d); return Promise.resolve(exp);
  },
  updateExpense(id, data) {
    const d = _gr(); let found;
    d.expenses = (d.expenses || []).map(e => e.id === id ? (found = { ...e, ...data }) : e); _gw(d); return Promise.resolve(found);
  },
  deleteExpense(id) {
    const d = _gr(); d.expenses = (d.expenses || []).filter(e => e.id !== id); _gw(d); return Promise.resolve(null);
  },
  getPackingItems(tripId) {
    return Promise.resolve((_gr().packing_items || []).filter(p => p.trip_id === tripId).sort((a, b) => (a.category < b.category ? -1 : 1)));
  },
  addPackingItem(tripId, data) {
    const d = _gr(); const item = { ...data, id: _gid(), trip_id: tripId, checked: false, created_at: new Date().toISOString() };
    d.packing_items = [...(d.packing_items || []), item]; _gw(d); return Promise.resolve(item);
  },
  updatePackingItem(id, data) {
    const d = _gr(); let found;
    d.packing_items = (d.packing_items || []).map(p => p.id === id ? (found = { ...p, ...data }) : p); _gw(d); return Promise.resolve(found);
  },
  deletePackingItem(id) {
    const d = _gr(); d.packing_items = (d.packing_items || []).filter(p => p.id !== id); _gw(d); return Promise.resolve(null);
  },
  getPhotos(tripId) {
    return Promise.resolve((_gr().photos || []).filter(p => p.trip_id === tripId));
  },
  addPhoto(tripId, data) {
    const d = _gr();
    const url = `data:${data.image.mediaType};base64,${data.image.data}`;
    const p = { id: _gid(), trip_id: tripId, day_id: data.day_id || null, activity_id: data.activity_id || null, transport_id: data.transport_id || null, accommodation_id: data.accommodation_id || null, caption: data.caption || null, taken_at: data.taken_at || null, latitude: data.latitude ?? null, longitude: data.longitude ?? null, url, created_at: new Date().toISOString() };
    d.photos = [...(d.photos || []), p]; _gw(d); return Promise.resolve(p);
  },
  deletePhoto(id) {
    const d = _gr(); d.photos = (d.photos || []).filter(p => p.id !== id); _gw(d); return Promise.resolve(null);
  },
  setPhotoCaption(id, caption) {
    const d = _gr(); let found;
    d.photos = (d.photos || []).map(p => p.id === id ? (found = { ...p, caption: caption || null }) : p);
    _gw(d); return Promise.resolve(found);
  },
  updatePhoto(id, data) {
    const d = _gr(); let found;
    d.photos = (d.photos || []).map(p => p.id === id ? (found = { ...p, day_id: data.day_id || null, activity_id: data.activity_id || null, transport_id: data.transport_id || null, accommodation_id: data.accommodation_id || null }) : p);
    _gw(d); return Promise.resolve(found);
  },
  getJournal(tripId) {
    const d = _gr();
    return Promise.resolve({
      entries: (d.journal_entries || []).filter(e => e.trip_id === tripId).map(e => ({ ...e, is_new: false })),
      comments: (d.journal_comments || []).filter(c => c.trip_id === tripId),
      slot_likes: {},
    });
  },
  saveJournalEntry(tripId, data) {
    const d = _gr();
    const list = d.journal_entries || [];
    const key = data.day_id ? "day_id" : data.activity_id ? "activity_id" : data.transport_id ? "transport_id" : data.accommodation_id ? "accommodation_id" : null;
    if (!key) return Promise.reject(new Error("Koppel het verhaal aan precies één dag, activiteit, vervoer of verblijf"));
    const val = data[key];
    const idx = list.findIndex(e => e[key] === val);
    let entry;
    if (idx >= 0) {
      entry = { ...list[idx], title: data.title || null, body: data.body, updated_at: new Date().toISOString() };
      list[idx] = entry;
    } else {
      entry = { id: _gid(), trip_id: tripId, day_id: data.day_id || null, activity_id: data.activity_id || null, transport_id: data.transport_id || null, accommodation_id: data.accommodation_id || null, title: data.title || null, body: data.body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      list.push(entry);
    }
    d.journal_entries = list; _gw(d); return Promise.resolve(entry);
  },
  deleteJournalEntry(id) {
    const d = _gr(); d.journal_entries = (d.journal_entries || []).filter(e => e.id !== id); _gw(d); return Promise.resolve(null);
  },
  addJournalComment(tripId, data) {
    const d = _gr();
    const c = { id: _gid(), trip_id: tripId, body: data.body, created_at: new Date().toISOString(),
      author: null, is_new: false, like_count: 0, liked_by_me: false,
      day_id: data.day_id || null, activity_id: data.activity_id || null,
      transport_id: data.transport_id || null, accommodation_id: data.accommodation_id || null,
      photo_id: data.photo_id || null };
    d.journal_comments = [...(d.journal_comments || []), c]; _gw(d); return Promise.resolve(c);
  },
  deleteJournalComment(id) {
    const d = _gr(); d.journal_comments = (d.journal_comments || []).filter(c => c.id !== id); _gw(d); return Promise.resolve(null);
  },
  toggleJournalLike() { return Promise.resolve({ liked: false }); },
  importEmail() { return Promise.reject(new Error("Log in om e-mailimport te gebruiken")); },
  createInvite() { return Promise.reject(new Error("Log in om reizen te delen")); },
  getAdminTrips() { return Promise.resolve([]); },
  getAdminUsers() { return Promise.resolve([]); },
  assignTrip() { return Promise.resolve(null); },
};

const api = {
  getTrips: () => _guestMode ? guestApi.getTrips() : apiFetch("/api/trips"),
  getTrip: (id) => _guestMode ? guestApi.getTrip(id) : apiFetch(`/api/trips/${id}`),
  createTrip: (d) => _guestMode ? guestApi.createTrip(d) : apiFetch("/api/trips", { method: "POST", body: JSON.stringify(d) }),
  updateTrip: (id, d) => _guestMode ? guestApi.updateTrip(id, d) : apiFetch(`/api/trips/${id}`, { method: "PUT", body: JSON.stringify(d) }),
  deleteTrip: (id) => _guestMode ? guestApi.deleteTrip(id) : apiFetch(`/api/trips/${id}`, { method: "DELETE" }),
  getDays: (tripId) => _guestMode ? guestApi.getDays(tripId) : apiFetch(`/api/trips/${tripId}/days`),
  addDay: (tripId, d) => _guestMode ? guestApi.addDay(tripId, d) : apiFetch(`/api/trips/${tripId}/days`, { method: "POST", body: JSON.stringify(d) }),
  updateDay: (id, d) => _guestMode ? guestApi.updateDay(id, d) : apiFetch(`/api/days/${id}`, { method: "PUT", body: JSON.stringify(d) }),
  deleteDay: (id) => _guestMode ? guestApi.deleteDay(id) : apiFetch(`/api/days/${id}`, { method: "DELETE" }),
  addActivity: (dayId, d) => _guestMode ? guestApi.addActivity(dayId, d) : apiFetch(`/api/days/${dayId}/activities`, { method: "POST", body: JSON.stringify(d) }),
  updateActivity: (id, d) => _guestMode ? guestApi.updateActivity(id, d) : apiFetch(`/api/activities/${id}`, { method: "PUT", body: JSON.stringify(d) }),
  deleteActivity: (id) => _guestMode ? guestApi.deleteActivity(id) : apiFetch(`/api/activities/${id}`, { method: "DELETE" }),
  getAccommodations: (tripId) => _guestMode ? guestApi.getAccommodations(tripId) : apiFetch(`/api/trips/${tripId}/accommodations`),
  addAccommodation: (tripId, d) => _guestMode ? guestApi.addAccommodation(tripId, d) : apiFetch(`/api/trips/${tripId}/accommodations`, { method: "POST", body: JSON.stringify(d) }),
  updateAccommodation: (id, d) => _guestMode ? guestApi.updateAccommodation(id, d) : apiFetch(`/api/accommodations/${id}`, { method: "PUT", body: JSON.stringify(d) }),
  deleteAccommodation: (id) => _guestMode ? guestApi.deleteAccommodation(id) : apiFetch(`/api/accommodations/${id}`, { method: "DELETE" }),
  getTransports: (tripId) => _guestMode ? guestApi.getTransports(tripId) : apiFetch(`/api/trips/${tripId}/transports`),
  addTransport: (tripId, d) => _guestMode ? guestApi.addTransport(tripId, d) : apiFetch(`/api/trips/${tripId}/transports`, { method: "POST", body: JSON.stringify(d) }),
  updateTransport: (id, d) => _guestMode ? guestApi.updateTransport(id, d) : apiFetch(`/api/transports/${id}`, { method: "PUT", body: JSON.stringify(d) }),
  deleteTransport: (id) => _guestMode ? guestApi.deleteTransport(id) : apiFetch(`/api/transports/${id}`, { method: "DELETE" }),
  getExpenses: (tripId) => _guestMode ? guestApi.getExpenses(tripId) : apiFetch(`/api/trips/${tripId}/expenses`),
  addExpense: (tripId, d) => _guestMode ? guestApi.addExpense(tripId, d) : apiFetch(`/api/trips/${tripId}/expenses`, { method: "POST", body: JSON.stringify(d) }),
  updateExpense: (id, d) => _guestMode ? guestApi.updateExpense(id, d) : apiFetch(`/api/expenses/${id}`, { method: "PUT", body: JSON.stringify(d) }),
  deleteExpense: (id) => _guestMode ? guestApi.deleteExpense(id) : apiFetch(`/api/expenses/${id}`, { method: "DELETE" }),
  getPhotos: (tripId) => _guestMode ? guestApi.getPhotos(tripId) : apiFetch(`/api/trips/${tripId}/photos`),
  addPhoto: (tripId, d) => _guestMode ? guestApi.addPhoto(tripId, d) : apiFetch(`/api/trips/${tripId}/photos`, { method: "POST", body: JSON.stringify(d) }),
  deletePhoto: (id) => _guestMode ? guestApi.deletePhoto(id) : apiFetch(`/api/photos/${id}`, { method: "DELETE" }),
  updatePhoto: (id, d) => _guestMode ? guestApi.updatePhoto(id, d) : apiFetch(`/api/photos/${id}`, { method: "PUT", body: JSON.stringify(d) }),
  getJournal: (tripId) => _guestMode ? guestApi.getJournal(tripId) : apiFetch(`/api/trips/${tripId}/journal`),
  saveJournalEntry: (tripId, d) => _guestMode ? guestApi.saveJournalEntry(tripId, d) : apiFetch(`/api/trips/${tripId}/journal`, { method: "POST", body: JSON.stringify(d) }),
  deleteJournalEntry: (id) => _guestMode ? guestApi.deleteJournalEntry(id) : apiFetch(`/api/journal/${id}`, { method: "DELETE" }),
  addJournalComment: (tripId, d) => _guestMode ? guestApi.addJournalComment(tripId, d) : apiFetch(`/api/trips/${tripId}/journal-comments`, { method: "POST", body: JSON.stringify(d) }),
  deleteJournalComment: (id) => _guestMode ? guestApi.deleteJournalComment(id) : apiFetch(`/api/journal-comments/${id}`, { method: "DELETE" }),
  rotatePhoto: (id) => _guestMode ? Promise.reject(new Error("Log in om foto's te draaien")) : apiFetch(`/api/photos/${id}/rotate`, { method: "POST", body: JSON.stringify({ turns: 1 }) }),
  setPhotoCaption: (id, caption) => _guestMode ? guestApi.setPhotoCaption(id, caption) : apiFetch(`/api/photos/${id}/caption`, { method: "PUT", body: JSON.stringify({ caption }) }),
  toggleJournalLike: (tripId, d) => _guestMode ? guestApi.toggleJournalLike(tripId, d) : apiFetch(`/api/trips/${tripId}/journal-likes`, { method: "POST", body: JSON.stringify(d) }),
  sendTestMail: () => apiFetch("/api/admin/test-mail", { method: "POST", body: "{}" }),
  setNotifyEmail: (enabled) => apiFetch("/auth/notify-email", { method: "PUT", body: JSON.stringify({ enabled }) }),
  getPushPublicKey: () => apiFetch("/api/push/public-key"),
  subscribePush: (subscription) => apiFetch("/api/push/subscribe", { method: "POST", body: JSON.stringify(subscription) }),
  unsubscribePush: (endpoint) => apiFetch("/api/push/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint }) }),
  pingTrip: (tripId) => _guestMode ? Promise.resolve() : apiFetch(`/api/trips/${tripId}/ping`, { method: "POST", body: "{}" }),
  importEmail: (tripId, text) => _guestMode ? guestApi.importEmail() : apiFetch(`/api/trips/${tripId}/import`, { method: "POST", body: JSON.stringify({ text }) }),
  createInvite: (tripId, role) => _guestMode ? guestApi.createInvite() : apiFetch(`/api/trips/${tripId}/invite`, { method: "POST", body: JSON.stringify({ role }) }),
  getShareStats: (tripId) => _guestMode ? Promise.resolve({ members: [], total_views: 0, views_24h: 0 }) : apiFetch(`/api/trips/${tripId}/share-stats`),
  getQuizSession: (tripId) => _guestMode ? Promise.resolve({ session: null }) : apiFetch(`/api/trips/${tripId}/quiz/session`),
  createQuizSession: (tripId, opts) => _guestMode ? Promise.reject(new Error("De fotoquiz vereist een account.")) : apiFetch(`/api/trips/${tripId}/quiz/sessions`, { method: "POST", body: JSON.stringify(opts || {}) }),
  startQuizSession: (tripId, sessionId) => apiFetch(`/api/trips/${tripId}/quiz/sessions/${sessionId}/start`, { method: "POST", body: "{}" }),
  stopQuizSession: (tripId, sessionId) => apiFetch(`/api/trips/${tripId}/quiz/sessions/${sessionId}/stop`, { method: "POST", body: "{}" }),
  getQuizState: (sessionId) => apiFetch(`/api/quiz-sessions/${sessionId}/state`),
  answerQuizQuestion: (sessionId, questionIndex, choice) => apiFetch(`/api/quiz-sessions/${sessionId}/answer`, { method: "POST", body: JSON.stringify({ questionIndex, choice }) }),
  getQuizStats: (tripId) => _guestMode ? Promise.resolve([]) : apiFetch(`/api/trips/${tripId}/quiz/stats`),
  getPhotobooks: (tripId) => _guestMode ? Promise.resolve([]) : apiFetch(`/api/trips/${tripId}/photobooks`),
  createPhotobook: (tripId, opts) => _guestMode ? Promise.reject(new Error("Het fotoboek vereist een account.")) : apiFetch(`/api/trips/${tripId}/photobooks`, { method: "POST", body: JSON.stringify(opts || {}) }),
  getPhotobook: (id) => apiFetch(`/api/photobooks/${id}`),
  updatePhotobook: (id, d) => apiFetch(`/api/photobooks/${id}`, { method: "PUT", body: JSON.stringify(d) }),
  deletePhotobook: (id) => apiFetch(`/api/photobooks/${id}`, { method: "DELETE" }),
  savePhotobookPages: (id, pages) => apiFetch(`/api/photobooks/${id}/pages`, { method: "PUT", body: JSON.stringify({ pages }) }),
  getPhotobookPrintQuote: (id) => _guestMode ? Promise.resolve({ available: false }) : apiFetch(`/api/photobooks/${id}/print-quote`),
  getAdminTrips: () => _guestMode ? guestApi.getAdminTrips() : apiFetch("/api/admin/trips"),
  getAdminUsers: () => _guestMode ? guestApi.getAdminUsers() : apiFetch("/api/admin/users"),
  assignTrip: (tripId, userId) => _guestMode ? guestApi.assignTrip() : apiFetch(`/api/admin/trips/${tripId}/assign`, { method: "PATCH", body: JSON.stringify({ user_id: userId }) }),
  deleteAdminTrip: (tripId) => apiFetch(`/api/admin/trips/${tripId}`, { method: "DELETE" }),
  deleteAdminUser: (userId) => apiFetch(`/api/admin/users/${userId}`, { method: "DELETE" }),
  backfillPhotoGps: () => apiFetch("/api/admin/backfill-photo-gps", { method: "POST", body: "{}" }),
  getStorageInfo: () => apiFetch("/api/admin/storage"),
  getCockpitMetrics: () => apiFetch("/api/admin/metrics"),
  shrinkPhotos: (afterId) => apiFetch("/api/admin/shrink-photos", { method: "POST", body: JSON.stringify({ afterId: afterId || 0 }) }),
  getPackingItems: (tripId) => _guestMode ? guestApi.getPackingItems(tripId) : apiFetch(`/api/trips/${tripId}/packing`),
  addPackingItem: (tripId, d) => _guestMode ? guestApi.addPackingItem(tripId, d) : apiFetch(`/api/trips/${tripId}/packing`, { method: "POST", body: JSON.stringify(d) }),
  updatePackingItem: (id, d) => _guestMode ? guestApi.updatePackingItem(id, d) : apiFetch(`/api/packing/${id}`, { method: "PUT", body: JSON.stringify(d) }),
  deletePackingItem: (id) => _guestMode ? guestApi.deletePackingItem(id) : apiFetch(`/api/packing/${id}`, { method: "DELETE" }),
};

// ---------- Helpers ----------
function fmt(date) {
  if (!date) return "—";
  const d = new Date(String(date).slice(0, 10) + "T12:00:00Z");
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
function fmtDatetime(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}
// Voor de handjevol plekken die Leaflet-popups/tooltips als kant-en-klare
// HTML-string opbouwen (Leaflet accepteert daar geen JSX) — vrij ingevulde
// tekst als een activiteitnaam mag daar niet ongefilterd in belanden.
const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}
function fmtMoney(n, currency = "EUR") {
  if (n == null || n === "") return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

// ---------- Leesbare tekst op een reiskleur ----------
// De omslagkleur van een reis (accent) bepaalt op veel plekken een achtergrond
// of tekstkleur, en die acht keuzes lopen uiteen van fel oranje tot donker
// groen. Vaste "witte tekst" of "accent als tekstkleur" aannemen gaat mis
// zodra de kleur zelf te licht is (zoals het felle oranje) — vandaar dat het
// contrast hier expliciet wordt uitgerekend in plaats van aangenomen.
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function rgbToHex([r, g, b]) {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
}
function relLuminance([r, g, b]) {
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrastRatio(hexA, hexB) {
  const la = relLuminance(hexToRgb(hexA));
  const lb = relLuminance(hexToRgb(hexB));
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}
// Voor een accentkleur als tekst op een lichte achtergrond: is de kleur zelf te
// licht om te lezen, dan wordt hij in stappen donkerder gemaakt tot het
// contrast voldoet — met behoud van de tint, dus het blijft "dezelfde kleur".
function legibleOn(hex, bgHex = "#FFFFFF", target = 4.5) {
  let rgb = hexToRgb(hex);
  let out = hex;
  for (let i = 0; i < 8 && contrastRatio(out, bgHex) < target; i++) {
    rgb = rgb.map((c) => c * 0.85);
    out = rgbToHex(rgb);
  }
  return out;
}
// Spiegelbeeld van legibleOn(): welke tekstkleur leg je ÓP een gekleurd vlak?
// Sinds de pastels zijn dat meestal donkere letters, terwijl een verzadigde
// reiskleur nog steeds om wit vraagt — dus uitrekenen in plaats van aannemen.
function textOn(hex) {
  return contrastRatio(PALETTE.textPrimary, hex) >= contrastRatio(PALETTE.surface, hex)
    ? PALETTE.textPrimary : PALETTE.surface;
}
function tripDuration(start, end) {
  if (!start || !end) return null;
  const days = Math.round((new Date(end) - new Date(start)) / 86400000) + 1;
  return `${days} dag${days === 1 ? "" : "en"}`;
}
function daysUntilDeparture(startDate) {
  if (!startDate) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(startDate); start.setHours(0, 0, 0, 0);
  return Math.round((start - today) / 86400000);
}
// Reizen-overzicht: aankomende reizen bovenaan, oplopend naar vertrek (dus de
// eerstvolgende reis staat als eerste). Afgelopen reizen komen daarna, met de
// meest recente bovenaan. Reizen zonder datum sluiten de rij.
// 0 = nu bezig (vandaag valt tussen start en eind), 1 = aankomend, 2 =
// afgelopen, 3 = geen datum bekend.
function tripCategory(startDate, endDate) {
  if (!startDate) return 3;
  const untilStart = daysUntilDeparture(startDate);
  if (endDate && untilStart <= 0 && daysUntilDeparture(endDate) >= 0) return 0;
  return untilStart >= 0 ? 1 : 2;
}
function sortTripsByDeparture(trips) {
  return [...trips].sort((a, b) => {
    const ca = tripCategory(a.start_date, a.end_date), cb = tripCategory(b.start_date, b.end_date);
    if (ca !== cb) return ca - cb;
    if (ca === 3) return 0;
    const da = daysUntilDeparture(a.start_date), db = daysUntilDeparture(b.start_date);
    return ca === 2 ? db - da : da - db; // afgelopen: meest recent eerst, anders oplopend
  });
}
// Guards the journal payload: on an array response `.entries` resolves to
// Array.prototype.entries, and passing that function to setState makes React
// treat it as an updater and call it with no receiver.
function asList(v) { return Array.isArray(v) ? v : []; }

// Zonder tijdzone bepaalt de klok van het eigen toestel wat "vandaag" is. Bij
// een reis buiten de eigen tijdzone (bv. Tokio vanuit Nederland) kan dat
// "vandaag" een dag laten verschillen van wat er op de bestemming zelf geldt
// — met als gevolg dat een reactie op de verkeerde dagkaart belandt. Is er een
// IANA-tijdzone bekend (het reisdoel), dan telt die in plaats van het toestel.
function dateIsoInTimezone(date, timezone) {
  if (!timezone) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  try {
    // en-CA geeft direct YYYY-MM-DD terug, zonder zelf onderdelen te herschikken.
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  } catch {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
}

function yesterdayIso(timezone) {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dateIsoInTimezone(d, timezone);
}

function todayIso(timezone) {
  return dateIsoInTimezone(new Date(), timezone);
}
function tomorrowIso(timezone) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return dateIsoInTimezone(d, timezone);
}
function greeting(name) {
  const h = new Date().getHours();
  const first = name ? name.split(" ")[0] : "";
  const prefix = h < 12 ? "Goedemorgen" : h < 18 ? "Goedemiddag" : "Goedenavond";
  return first ? `${prefix}, ${first}` : prefix;
}

// ---------- UI Components ----------
// Keuzeblad dat vanaf de onderkant omhoog glijdt — dichter bij hoe een
// telefoon-app een lijstje acties aanbiedt dan een dialoog midden in beeld,
// en het houdt de duim binnen bereik. Rijen komen als children binnen, zodat
// dit alleen over presentatie gaat en niets over wat de acties doen.
function BottomSheet({ title, subtitle, onClose, children }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center rp-veil"
      style={{ background: "rgba(47,42,40,0.28)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rp-sheet bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[85vh] flex flex-col"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {/* Greepje: puur een aanwijzing dat dit blad van onderen komt. */}
        <div className="pt-3 pb-1 flex justify-center sm:hidden" aria-hidden="true">
          <span className="w-10 h-1 rounded-full bg-gray-200" />
        </div>
        <div className="px-6 pt-4 pb-2">
          <h2 className="font-display text-[26px] font-semibold text-gray-800 leading-tight">{title}</h2>
          {subtitle && <p className="text-[15px] text-gray-500 mt-1 leading-relaxed">{subtitle}</p>}
        </div>
        <div className="overflow-y-auto px-4 pb-4 pt-2">{children}</div>
      </div>
    </div>
  );
}

// Eén rij in een BottomSheet: icoon in een zacht vlakje, titel, uitleg.
function SheetAction({ icon, label, description, onClick }) {
  return (
    <button type="button" onClick={onClick}
      className="rp-press w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-left hover:bg-gray-50 transition-colors">
      <span className="shrink-0 w-11 h-11 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center">
        <Icon name={icon} size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[19px] font-semibold text-gray-800 leading-snug">{label}</span>
        {description && <span className="block text-[13px] font-medium text-gray-500 mt-0.5">{description}</span>}
      </span>
      <Icon name="chevronRight" size={16} className="shrink-0 text-gray-300" />
    </button>
  );
}

function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: "rgba(55,52,50,0.28)" }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`bg-white rounded-3xl shadow-2xl w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between gap-4 px-6 pt-6 pb-4">
          <h2 className="font-display text-[21px] font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} aria-label="Sluiten" className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-800 hover:bg-gray-100 transition-colors"><Icon name="close" size={18} /></button>
        </div>
        <div className="overflow-y-auto px-6 pb-6 flex-1">{children}</div>
      </div>
    </div>
  );
}

// Lichte opmaak voor fotoboek-tekst: vet, cursief en lettertype, als een
// beperkte HTML-substring (b/i/font/br) — geen zichtbare markers, gewoon
// direct zichtbaar terwijl je typt. DOMPurify is de enige plek die bepaalt
// wat er ooit gerenderd wordt, dus dat is waar de echte veiligheidsgrens zit.
const RICH_TEXT_ALLOWED_TAGS = ["b", "i", "font", "br", "div"];
// "style" mag erbij voor de lettergrootte in punten; DOMPurify ontleedt de CSS
// zelf en gooit er alles uit wat geen nette eigenschap is, dus dit opent geen
// deur naar url()/expression-trucs. size blijft toegestaan zodat tekst uit
// oudere boeken (<font size="1..7">) gewoon blijft werken.
const RICH_TEXT_ALLOWED_ATTR = ["face", "color", "size", "style"];
function sanitizeRichText(html) {
  return window.DOMPurify
    ? window.DOMPurify.sanitize(html || "", { ALLOWED_TAGS: RICH_TEXT_ALLOWED_TAGS, ALLOWED_ATTR: RICH_TEXT_ALLOWED_ATTR })
    : "";
}
const RICH_TEXT_FONTS = [
  { key: "sans", label: "Standaard", family: 'ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif' },
  { key: "serif", label: "Klassiek", family: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif' },
  { key: "mono", label: "Mono", family: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' },
  { key: "rounded", label: "Rond", family: '"Trebuchet MS", Verdana, "Segoe UI", sans-serif' },
  { key: "elegant", label: "Sierlijk", family: '"Big Caslon", Didot, serif' },
  { key: "script", label: "Script", family: '"Bradley Hand", "Segoe Script", "Comic Sans MS", cursive' },
];
// Kleine, verzorgde tekstkleur-set — de app-inkt plus een paar duidelijk van
// elkaar te onderscheiden tinten, geen volledige kleurenkiezer nodig.
const RICH_TEXT_COLORS = [PALETTE.textPrimary, PALETTE.textSecondary, PALETTE.coralDeep, PALETTE.info, PALETTE.success, "#ffffff"];
// Uitlijning geldt voor het hele tekstveld (titel/beschrijving/bijschrift),
// niet per selectie zoals vet/cursief/kleur — daarom apart bijgehouden i.p.v.
// als HTML-opmaak, en gewoon via CSS text-align toegepast.
const RICH_TEXT_ALIGNMENTS = [
  { key: "left", icon: "alignLeft" },
  { key: "center", icon: "alignCenter" },
  { key: "right", icon: "alignRight" },
];
// document.execCommand("fontSize", ...) gebruikt de oude HTML-schaal van 1
// t/m 7 (3 = standaard) en wikkelt de selectie in <font size="N">, dezelfde
// aanpak als de lettertype- en kleurknoppen hierboven — de browser (en de
// PDF-export, zie pdfParseRichHtml op de server) kennen dat attribuut al.
// Lettergrootte in punten, dezelfde eenheid als de PDF gebruikt — zo staat er
// in het boek ook echt wat je kiest. Opgeslagen als font-size op een <font>,
// niet als de oude size="1..7"; die schaal had maar zeven stappen en zei niets
// over de uiteindelijke afdruk.
const RICH_TEXT_SIZES_PT = [8, 10, 12, 14, 18, 24, 32, 48];
// Alleen-lezen weergave van opgeslagen fotoboek-tekst — altijd door de
// sanitizer heen, ook al is er clientside al gesaneerd vóór het opslaan (de
// databasewaarde is niet per se te vertrouwen als enige bron).
function RichTextView({ html, align, className }) {
  if (!html) return null;
  return <div className={className} style={{ textAlign: align || "left" }} dangerouslySetInnerHTML={{ __html: sanitizeRichText(html) }} />;
}
// contentEditable in plaats van een input/textarea, zodat vet/cursief/
// lettertype meteen zichtbaar zijn terwijl je typt — geen **markers** die je
// zelf moet interpreteren.
const RichTextEditable = React.forwardRef(function RichTextEditable({ value, onChange, placeholder, className, align }, ref) {
  const innerRef = useRef(null);
  const lastValue = useRef(value);
  React.useImperativeHandle(ref, () => innerRef.current);

  // Los van de sync-effect hieronder: die vergelijkt tegen lastValue, dat bij
  // het allereerste render al op de meegekregen `value` staat (via useRef's
  // lazy initializer) — dus als een pagina met bestaand tekst laadt (bijv.
  // een automatisch gegenereerde titel), ziet die effect "geen wijziging" en
  // zet de DOM nooit. Deze mount-only effect zet 'm altijd hardhandig één keer.
  useEffect(() => {
    if (innerRef.current) innerRef.current.innerHTML = sanitizeRichText(value || "");
  }, []);

  useEffect(() => {
    if (innerRef.current && value !== lastValue.current && value !== innerRef.current.innerHTML) {
      innerRef.current.innerHTML = sanitizeRichText(value || "");
    }
    lastValue.current = value;
  }, [value]);

  function sync() {
    const raw = innerRef.current.innerHTML;
    const html = sanitizeRichText(raw);
    // Als saneren iets veranderde (een niet-toegestane tag/attribuut), moet de
    // DOM zelf ook bijgewerkt worden — anders blijft het scherm iets tonen
    // dat niet is wat er straks opgeslagen/getoond wordt elders.
    if (html !== raw) innerRef.current.innerHTML = html;
    lastValue.current = html;
    onChange(html);
  }
  function handleFocus() {
    // Regeleinden altijd als <br> (niet <div>/<p>) zodat weergave en PDF één
    // simpel formaat hoeven te begrijpen; stijl via tags, niet inline CSS.
    try {
      document.execCommand("defaultParagraphSeparator", false, "br");
      document.execCommand("styleWithCSS", false, false);
    } catch {}
  }
  const isEmpty = !value || value === "<br>";
  return (
    // w-full/h-full zijn hier geen opsmuk: dit wrappertje staat op de
    // fotoboek-canvas in een flex-container. Zonder breedte krimpt het als
    // flex-item mee met zijn inhoud, en bij een léég veld is dat nul — dan
    // valt er niets aan te tikken en opent er dus ook geen toetsenbord. De
    // w-full op het veld zelf hielp niet, want dat is 100% van nul. Bij een
    // ouder zonder eigen hoogte is h-full simpelweg auto, dus elders schaadt
    // het niet.
    <div className="relative w-full h-full">
      {isEmpty && placeholder && (
        <div className="absolute inset-0 px-3 py-2 text-sm text-gray-400 pointer-events-none truncate" style={{ textAlign: align || "left" }}>{placeholder}</div>
      )}
      {/* select-text is hier geen detail maar noodzaak: dit veld hangt op de
          fotoboek-canvas in een container met select-none (nodig om te kunnen
          slepen zonder dat je tekst selecteert). iOS weigert de cursor én het
          toetsenbord in een contentEditable waar -webkit-user-select: none op
          van kracht is — op de desktop krijgt het veld wél gewoon focus, dus
          dit valt alleen op een telefoon op. Direct gezet wint het van de
          geërfde waarde. */}
      <div ref={innerRef} contentEditable suppressContentEditableWarning
        onFocus={handleFocus} onInput={sync} onBlur={sync}
        style={{ textAlign: align || "left" }}
        className={`select-text w-full min-h-[2.5rem] border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent whitespace-pre-wrap break-words ${className || ""}`} />
    </div>
  );
});
// Werkt op de browser-selectie in het bijbehorende contentEditable-veld —
// document.execCommand is verouderd maar nog altijd de simpelste manier om
// vet/cursief/lettertype op een selectie toe te passen zonder een hele
// rich-text-library toe te voegen.
function RichTextToolbar({ getEl, onChange, align, onAlignChange }) {
  // Alles in het veld selecteren voordat een opdracht wordt uitgevoerd. Deze
  // tekstvakken zijn klein en staan op een canvas; eerst met je vinger een
  // stuk tekst aanwijzen om het daarna vet te maken is een omweg die niemand
  // wil. Een tik op een opmaakknop geldt dus voor het hele vak.
  function selectWhole(el) {
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
  function run(cmd, value) {
    const el = getEl();
    if (!el) return;
    selectWhole(el);
    document.execCommand(cmd, false, value);
    onChange(sanitizeRichText(el.innerHTML));
  }
  // Lettergrootte in punten. execCommand kent alleen de schaal 1..7, dus die
  // wordt gebruikt om de selectie in <font>-elementen te laten verpakken (dat
  // is precies wat de browser goed doet) waarna die elementen hier een echte
  // font-size in punten krijgen en het size-attribuut kwijtraken. Omdat dit
  // altijd op het hele veld werkt, worden meteen ook oude size="1..7"-restanten
  // in dat veld omgezet — bestaande boeken blijven verder ongemoeid.
  function applySizePt(pt) {
    const el = getEl();
    if (!el) return;
    selectWhole(el);
    document.execCommand("fontSize", false, "7");
    el.querySelectorAll("font[size]").forEach((f) => {
      f.removeAttribute("size");
      f.style.fontSize = `${pt}pt`;
    });
    setCurrentPt(pt);
    onChange(sanitizeRichText(el.innerHTML));
  }
  // De keuzelijst laat zien wat er nú staat in plaats van een lege plek. De
  // browser rekent pt om naar px (1pt = 1/72 duim, 1px = 1/96), dus terug is
  // maal 0,75. Zonder eigen grootte in het veld staat er de geërfde maat, en
  // die valt lang niet altijd samen met een van de keuzes — dan blijft de
  // lijst leeg staan in plaats van een verkeerde waarde aan te wijzen.
  const [currentPt, setCurrentPt] = useState(null);
  useEffect(() => {
    const el = getEl();
    if (!el) return;
    const gemarkeerd = el.querySelector('[style*="font-size"]');
    if (!gemarkeerd) { setCurrentPt(null); return; }
    const px = parseFloat(getComputedStyle(gemarkeerd).fontSize);
    setCurrentPt(Number.isFinite(px) ? Math.round(px * 0.75) : null);
  }, [getEl]);
  // De opmaakknoppen staan meteen open. Ze zaten achter één "Aa"-knop om
  // ruimte te sparen, maar dat kostte bij elke tekstwijziging een extra tik.
  //
  // Wél in één rij die horizontaal schuift, niet omgebroken over meerdere
  // regels: uitgeklapt over drie regels wordt het zwevende paneel zo hoog dat
  // het over het tekstvak op de canvas valt, en dan is de tekst zelf niet meer
  // aan te tikken.
  //
  // Lettergrootte en lettertype zijn keuzelijsten en geen rijen losse knoppen.
  // Als knoppen waren dat samen veertien stuks, en die duwden de puntgroottes —
  // helemaal achteraan — op een telefoon volledig buiten beeld, zonder dat te
  // zien was dat de rij nog doorliep. Als lijst kosten ze samen twee plekken,
  // staat de grootte vooraan, en laat het bovendien zien wat er nú staat.
  const CONTROL = "h-8 rounded-lg border border-gray-300 bg-white text-xs text-gray-700 hover:border-gray-400 transition-colors px-1.5";
  return (
    <div className="flex items-center gap-1.5 mb-1.5 overflow-x-auto [&>*]:shrink-0">
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => run("bold")} title="Vet"
        className="w-8 h-8 rounded-lg border border-gray-300 flex items-center justify-center font-bold text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors">B</button>
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => run("italic")} title="Cursief"
        className="w-8 h-8 rounded-lg border border-gray-300 flex items-center justify-center italic text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors">I</button>
      <div className="w-px h-6 bg-gray-200 mx-0.5" />
      {/* Het getal is de maat: wat hier staat is wat er in de PDF komt. */}
      <select value={currentPt ?? ""} title="Lettergrootte in punten"
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => applySizePt(Number(e.target.value))}
        className={`${CONTROL} tnum`}>
        <option value="" disabled>pt</option>
        {RICH_TEXT_SIZES_PT.map((pt) => <option key={pt} value={pt}>{pt} pt</option>)}
      </select>
      <select defaultValue="" title="Lettertype"
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => { const f = RICH_TEXT_FONTS.find((x) => x.key === e.target.value); if (f) run("fontName", f.family); }}
        className={CONTROL}>
        <option value="" disabled>Letter</option>
        {RICH_TEXT_FONTS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
      </select>
      <div className="w-px h-6 bg-gray-200 mx-0.5" />
      {onAlignChange && RICH_TEXT_ALIGNMENTS.map((a) => (
        <button key={a.key} type="button" onClick={() => onAlignChange(a.key)} title={`Uitlijnen: ${a.key}`}
          className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors ${(align || "left") === a.key ? "border-sky-400 bg-sky-50 text-sky-700" : "border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400"}`}>
          <Icon name={a.icon} size={15} />
        </button>
      ))}
      {onAlignChange && <div className="w-px h-6 bg-gray-200 mx-0.5" />}
      {RICH_TEXT_COLORS.map((c) => (
        <button key={c} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => run("foreColor", c)} title="Tekstkleur"
          className="w-6 h-6 rounded-full border border-gray-300 shrink-0" style={{ background: c }} />
      ))}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
        {label}{hint && <span className="ml-1 font-normal normal-case text-gray-400">({hint})</span>}
      </label>
      {children}
    </div>
  );
}

// Eén set veldstijlen voor input/textarea/select, zodat ze niet uit elkaar
// kunnen lopen: rustige rand, ruime binnenmarge en een zachte koraalring bij
// focus in plaats van een harde blauwe systeemring.
const FIELD = "w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-400/50 focus:border-sky-300 transition-colors";

const Input = React.forwardRef(function Input({ className = "", ...props }, ref) {
  return <input ref={ref} className={`${FIELD} ${className}`} {...props} />;
});

const Textarea = React.forwardRef(function Textarea({ className = "", ...props }, ref) {
  return <textarea ref={ref} className={`${FIELD} resize-none ${className}`} {...props} />;
});

function Select({ className = "", children, ...props }) {
  return <select className={`${FIELD} ${className}`} {...props}>{children}</select>;
}

// Gevulde knoppen, geen omlijnde: primair is de pastel zelf met donkere letters,
// secundair hetzelfde in het lichtste perzik. "lg" is de volle-breedte
// hoofdactie (56px) — de standaard blijft compact genoeg voor knoppenrijen,
// maar houdt 44px aan zodat het op een telefoon een eerlijk trefvlak is.
function Button({ variant = "primary", size = "md", className = "", children, ...props }) {
  const base = "rp-press inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer";
  const sizes = {
    md: "px-4 h-11 text-sm",
    lg: "px-6 h-14 text-base",
  };
  const styles = {
    // sky-100 en niet sky-50: dat laatste ligt zo dicht bij de warme
    // achtergrond dat een secundaire knop er niet meer als knop uitziet.
    primary: "bg-sky-300 text-gray-800 hover:bg-sky-200",
    secondary: "bg-sky-100 text-gray-800 hover:bg-sky-200",
    danger: "bg-red-50 text-red-700 hover:bg-red-100",
  };
  return <button className={`${base} ${sizes[size]} ${styles[variant]} ${className}`} {...props}>{children}</button>;
}

function Tabs({ tabs, active, onChange, accentColor }) {
  const primary = tabs.filter((t) => t.primary);
  const secondary = tabs.filter((t) => !t.primary);
  return (
    <div className="mb-6 space-y-2">
      {primary.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className="w-full h-14 px-4 rounded-xl text-base font-semibold transition-colors whitespace-nowrap flex items-center justify-center gap-2"
          style={active === t.key
            ? { background: accentColor || PALETTE.primary, color: textOn(accentColor || PALETTE.primary) }
            : { background: PALETTE.surfaceSecondary, color: PALETTE.textSecondary }}
        >
          <Icon name={t.icon} size={17} /> {t.label}
        </button>
      ))}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {secondary.map((t) => (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`shrink-0 py-2 px-3 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${active === t.key ? "bg-white shadow-sm text-gray-800 font-semibold" : "text-gray-500 hover:text-gray-800"}`}
          >
            <Icon name={t.icon} size={15} /> {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- Trip form ----------
const EMPTY_TRIP = { name: "", destination: "", start_date: "", end_date: "", budget: "", currency: "EUR", notes: "", cover_color: PALETTE.primary, cover_image: "", timezone: "" };

// Bepaalt of "vandaag" op de reisbestemming rekent of op de klok van wie er
// toevallig op de app kijkt. Leeg (automatisch) is de standaard, want die
// klopt bijna altijd — alleen bij een reis in een duidelijk andere tijdzone
// dan de reizigers zelf loont het om 'm expliciet te zetten.
const TIMEZONE_OPTIONS = (() => {
  try { return Intl.supportedValuesOf("timeZone"); }
  catch {
    return ["Europe/Amsterdam", "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Rome",
      "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
      "Asia/Tokyo", "Asia/Bangkok", "Asia/Dubai", "Asia/Singapore", "Asia/Hong_Kong",
      "Australia/Sydney", "Australia/Perth", "Pacific/Auckland"];
  }
})();

// Gegroepeerd per werelddeel: een <select> met optgroups is te overzien, een
// platte lijst van vierhonderd regels niet. Zones zonder "/" (zoals UTC) komen
// onder "Overig" terecht.
const TIMEZONES_PER_REGIO = TIMEZONE_OPTIONS.reduce((acc, tz) => {
  const regio = tz.includes("/") ? tz.split("/")[0].replace(/_/g, " ") : "Overig";
  (acc[regio] = acc[regio] || []).push(tz);
  return acc;
}, {});

function fmtShortDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTH_NAMES[m - 1]}`;
}

// Zes weken (42 vakjes), maandag-eerst, met null voor de dagen buiten de
// maand — zodat de aanroeper alleen de echte dagen hoeft te tekenen.
function buildMonthGrid(year, month) {
  const firstDay = new Date(Date.UTC(year, month, 1));
  const firstWeekday = (firstDay.getUTCDay() + 6) % 7; // 0=ma .. 6=zo
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ iso: `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`, day: d });
  }
  return cells;
}

// Eén klikbaar veld dat een kalender opent waarin je met twee tikken een
// periode selecteert — zoals bij boekingssites — in plaats van twee losse
// datumvelden die je apart moet invullen.
function DateRangePicker({ startDate, endDate, onChange }) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    const base = startDate ? new Date(startDate + "T00:00:00Z") : new Date();
    return { year: base.getUTCFullYear(), month: base.getUTCMonth() };
  });
  const [tempStart, setTempStart] = useState(startDate || null);
  const [tempEnd, setTempEnd] = useState(endDate || null);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function openPicker() {
    setTempStart(startDate || null); setTempEnd(endDate || null);
    if (startDate) {
      const base = new Date(startDate + "T00:00:00Z");
      setViewDate({ year: base.getUTCFullYear(), month: base.getUTCMonth() });
    }
    setOpen(true);
  }

  function changeMonth(delta) {
    setViewDate(({ year, month }) => {
      const d = new Date(Date.UTC(year, month + delta, 1));
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
    });
  }

  function pickDay(iso) {
    if (!tempStart || tempEnd) { setTempStart(iso); setTempEnd(null); }
    else if (iso < tempStart) { setTempEnd(tempStart); setTempStart(iso); }
    else { setTempEnd(iso); }
  }

  function apply() {
    onChange({ start_date: tempStart || "", end_date: tempEnd || tempStart || "" });
    setOpen(false);
  }
  function clear() {
    onChange({ start_date: "", end_date: "" });
    setOpen(false);
  }

  const label = startDate
    ? `${fmtShortDate(startDate)}${endDate && endDate !== startDate ? ` – ${fmtShortDate(endDate)}` : ""}`
    : "Selecteer data";

  return (
    <div className="relative" ref={wrapRef}>
      <button type="button" onClick={openPicker}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-left flex items-center gap-2 hover:border-gray-300 transition-colors">
        <Icon name="calendar" size={15} className="text-gray-400 shrink-0" />
        <span className={startDate ? "text-gray-800" : "text-gray-400"}>{label}</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 p-4" style={{ width: 300 }}>
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={() => changeMonth(-1)}
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500">‹</button>
            <div className="font-semibold text-sm text-gray-800">
              {["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"][viewDate.month]} {viewDate.year}
            </div>
            <button type="button" onClick={() => changeMonth(1)}
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500">›</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-[10px] text-gray-400 uppercase font-semibold mb-1 text-center">
            {[1, 2, 3, 4, 5, 6, 0].map((i) => <div key={i}>{DAY_NAMES[i]}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {buildMonthGrid(viewDate.year, viewDate.month).map((cell, i) => {
              if (!cell) return <div key={i} />;
              const inRange = tempStart && tempEnd && cell.iso > tempStart && cell.iso < tempEnd;
              const isEdge = cell.iso === tempStart || cell.iso === tempEnd;
              return (
                <button key={cell.iso} type="button" onClick={() => pickDay(cell.iso)}
                  className={`text-xs h-8 rounded-full tnum transition-colors ${
                    isEdge ? "bg-sky-300 text-gray-800 font-semibold"
                      : inRange ? "bg-sky-50 text-gray-700"
                        : "text-gray-600 hover:bg-gray-100"
                  }`}>
                  {cell.day}
                </button>
              );
            })}
          </div>
          <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-100">
            <button type="button" onClick={clear} className="text-xs text-gray-400 hover:text-gray-600">Wissen</button>
            <Button type="button" onClick={apply} className="!text-xs !px-4 !py-1.5">Klaar</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TripForm({ initial, onSaved, onClose }) {
  const [form, setForm] = useState(initial ? { ...EMPTY_TRIP, ...initial, start_date: initial.start_date ? initial.start_date.slice(0,10) : "", end_date: initial.end_date ? initial.end_date.slice(0,10) : "", cover_image: initial.cover_image || "", timezone: initial.timezone || "" } : { ...EMPTY_TRIP });
  // Alleen uitklappen voor wie de tijdzone echt zelf wil zetten.
  const [toonTijdzone, setToonTijdzone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const saved = initial?.id ? await api.updateTrip(initial.id, form) : await api.createTrip(form);
      onSaved(saved);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  return (
    <Modal title={initial?.id ? "Reis bewerken" : "Nieuwe reis"} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
        <Field label="Naam van de reis">
          <Input required value={form.name} onChange={set("name")} placeholder="bijv. Zomervakantie Italië 2026" />
        </Field>
        <Field label="Bestemming">
          <Input value={form.destination} onChange={set("destination")} placeholder="bijv. Rome, Italië" />
        </Field>
        <Field label="Reisperiode">
          <DateRangePicker startDate={form.start_date} endDate={form.end_date}
            onChange={({ start_date, end_date }) => setForm((f) => ({ ...f, start_date, end_date }))} />
        </Field>
        {/* Dit veld gooide alle ~400 IANA-tijdzones als platte lijst in het
            formulier, terwijl bijna niemand 'm hoeft aan te raken. Nu staat er
            standaard alleen "Automatisch", met een linkje voor wie het wél
            nodig heeft; de lijst zelf is gegroepeerd per werelddeel, zodat je
            er doorheen kunt scannen in plaats van scrollen. */}
        <Field label="Tijdzone van de bestemming">
          {form.timezone || toonTijdzone ? (
            <Select value={form.timezone} onChange={set("timezone")}>
              <option value="">Automatisch — de klok van elke kijker</option>
              {Object.entries(TIMEZONES_PER_REGIO).map(([regio, zones]) => (
                <optgroup key={regio} label={regio}>
                  {zones.map((tz) => <option key={tz} value={tz}>{tz.split("/").slice(1).join(" · ").replace(/_/g, " ")}</option>)}
                </optgroup>
              ))}
            </Select>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-[15px] text-gray-600 flex-1">Automatisch — de klok van elke kijker</span>
              <button type="button" onClick={() => setToonTijdzone(true)}
                className="rp-press shrink-0 text-[13px] font-semibold text-sky-700 px-3 h-10 rounded-xl hover:bg-sky-50 transition-colors">
                Zelf kiezen
              </button>
            </div>
          )}
          <p className="text-xs text-gray-400 mt-1">Alleen nodig als de reis in een andere tijdzone is dan de reizigers — voorkomt dat "vandaag" per toestel verschilt.</p>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Budget">
            <Input type="number" min="0" step="0.01" value={form.budget} onChange={set("budget")} placeholder="0,00" />
          </Field>
          <Field label="Valuta">
            <Select value={form.currency} onChange={set("currency")}>
              {["EUR","USD","GBP","JPY","CHF","AUD","CAD"].map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Kleur">
          <div className="flex gap-2 flex-wrap mt-1">
            {COVER_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, cover_color: c }))}
                className={`w-7 h-7 rounded-full border-2 transition-transform ${form.cover_color === c ? "border-gray-800 scale-110" : "border-transparent"}`}
                style={{ background: c }} />
            ))}
          </div>
        </Field>
        <Field label="Omslagfoto">
          <div className="space-y-2">
            <Input value={form.cover_image} onChange={set("cover_image")} placeholder="Foto-URL" />
            {form.cover_image && (
              <div className="relative rounded-lg overflow-hidden h-32">
                <img src={form.cover_image} alt="preview" className="w-full h-full object-cover" />
                <button type="button" onClick={() => setForm((f) => ({ ...f, cover_image: "" }))}
                  className="absolute top-1 right-1 bg-black/50 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-black/70">×</button>
              </div>
            )}
          </div>
        </Field>
        <Field label="Notities"><Textarea rows={3} value={form.notes} onChange={set("notes")} placeholder="Bijzonderheden, wensen..." /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Annuleren</Button>
          <Button type="submit" disabled={saving}>{saving ? "Opslaan..." : "Opslaan"}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- Trip card ----------
function TripCard({ trip, onClick }) {
  const dur = tripDuration(trip.start_date, trip.end_date);
  const until = daysUntilDeparture(trip.start_date);
  const accent = trip.cover_color || PALETTE.primary;
  // Bij een foto weten we niet hoe licht de onderkant is, dus daar blijft de
  // donkere sluier met witte letters nodig. Bij een effen omslagkleur weten we
  // het wél: dan kan de sluier weg en bepaalt textOn() de leesbare tekstkleur —
  // anders zou witte tekst op een pastel omslag vrijwel onleesbaar worden.
  const onPhoto = !!trip.cover_image;
  const coverInk = onPhoto ? "#FFFFFF" : textOn(accent);

  return (
    <div onClick={onClick} className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow cursor-pointer overflow-hidden border border-gray-200 group" style={{ WebkitTapHighlightColor: "transparent" }}>
      {/* Cover */}
      <div className="relative overflow-hidden" style={{ height: 190 }}>
        {trip.cover_image
          ? <img src={trip.cover_image} alt={trip.destination || trip.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          : <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}bb)` }} />
        }
        {onPhoto && <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />}
        {/* Badges top */}
        <div className="absolute top-4 left-4 right-4 flex justify-between items-start">
          {until !== null && until >= 0 && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/95 text-sky-700">
              {until === 0 ? "Vandaag!" : until === 1 ? "Morgen" : `${until} dagen`}
            </span>
          )}
          {trip.is_owner === false && <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-white/95 text-gray-700 ml-auto">{trip.role === "viewer" ? "Alleen-lezen" : "Gedeeld"}</span>}
        </div>
        {/* Title */}
        <div className="absolute bottom-0 left-0 right-0 p-5">
          <h3 className="font-semibold text-lg leading-tight" style={{ color: coverInk }}>{trip.name}</h3>
          {trip.destination && (
            <div className="text-sm mt-1 flex items-center gap-1" style={{ color: coverInk, opacity: 0.85 }}>
              <Icon name="pin" size={13} />{trip.destination}
            </div>
          )}
        </div>
      </div>

      <div className="px-5 py-4">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="font-medium">{trip.start_date ? `${fmt(trip.start_date)}${dur ? ` · ${dur}` : ""}` : "Datum onbekend"}</div>
          <div className="flex gap-4 items-center">
            {trip.activity_count > 0 && <span className="flex items-center gap-1.5"><Icon name="route" size={13} /><span className="tnum">{trip.activity_count}</span></span>}
            {trip.budget && <span className="flex items-center gap-1.5"><Icon name="wallet" size={13} /><span className="tnum">{fmtMoney(trip.budget, trip.currency)}</span></span>}
          </div>
        </div>
        {until !== null && until > 0 && (
          <div className="mt-3 text-xs font-semibold rounded-lg px-3 py-2 text-center" style={{ background: accent + "1F", color: legibleOn(accent) }}>
            Nog {until} dag{until === 1 ? "" : "en"} tot vertrek
          </div>
        )}
        {until === 0 && (
          <div className="mt-3 text-xs font-semibold text-gray-800 rounded-lg px-3 py-2 text-center" style={{ background: PALETTE.success + "40" }}>
            Vandaag vertrek!
          </div>
        )}
        {until !== null && until < 0 && trip.end_date && new Date(trip.end_date) >= new Date() && (
          <div className="mt-3 text-xs font-semibold text-gray-800 rounded-lg px-3 py-2 text-center" style={{ background: PALETTE.success + "40" }}>
            Onderweg — dag {Math.abs(until) + 1}
          </div>
        )}
      </div>
    </div>
  );
}

// Standaard openbaar: wie de reis deelt (viewer-rol) ziet dit gewoon mee. Aan
// zetten verbergt het item voor die kijkers — dezelfde rol die nu al geen
// kosten te zien krijgt — terwijl editors het zelf gewoon blijven zien.
function PrivacyToggle({ value, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!value)}
      className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all active:scale-95 ${
        value ? "bg-gray-50 text-gray-600 border-gray-200" : "bg-sky-50 text-sky-700 border-sky-200"
      }`}>
      <Icon name={value ? "lock" : "globe"} size={14} />
      {value ? "Privé — alleen zichtbaar voor jou" : "Zichtbaar voor iedereen"}
    </button>
  );
}

// ---------- Activity form ----------
function ActivityForm({ dayId, tripId, tripTimezone, initial, days, onSaved, onClose, onImport, onDelete, photos, onPhotosChange, journalEntries, onJournalChange, currentUserId, readOnly, showPhotos = false, stayOpenAfterCreate = false, onCreated, presetCategory }) {
  // Once created, the activity behaves like an existing one for the rest of this
  // dialog, which is what unlocks the dagboek section below.
  const [created, setCreated] = useState(null);
  const activity = initial || created;
  const [form, setForm] = useState(() => {
    if (initial) {
      // `initial` is the raw DB row, where empty columns are null. Feeding null
      // into a controlled <Input> makes React flip it to uncontrolled on typing.
      return {
        ...initial,
        time: initial.time ?? "", location: initial.location ?? "",
        notes: initial.notes ?? "", cost: initial.cost ?? "",
        category: initial.category ?? "Bezienswaardigheid",
        is_private: initial.is_private ?? false,
      };
    }
    // The day whose "+ Activiteit" button was pressed is an explicit choice and
    // always wins. Today is only the default when no day was specified at all
    // (and only if today actually falls inside the trip).
    const todayDay = (days || []).find((d) => d.date && String(d.date).slice(0, 10) === todayIso(tripTimezone));
    // presetCategory komt van het keuzeblad ("Restaurant" opent hetzelfde
    // formulier, maar met die categorie al ingevuld) — verder verandert er niets.
    return { time: "", title: "", location: "", notes: "", category: presetCategory || "Bezienswaardigheid", cost: "", is_private: false, day_id: dayId ?? todayDay?.id ?? "" };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true); setError(null);
    try {
      const target = initial?.id || created?.id;
      const saved = target
        ? await api.updateActivity(target, form)
        : await api.addActivity(form.day_id || dayId, { ...form, trip_id: tripId });
      if (!target && stayOpenAfterCreate) {
        setCreated(saved);
        onCreated?.(saved);   // refresh the timeline behind the dialog
      } else {
        onSaved(saved);
      }
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }
  return (
    <Modal title={activity?.id ? "Activiteit bewerken" : "Activiteit toevoegen"} onClose={() => (created ? onSaved(created) : onClose())}>
      {!activity && onImport && (
        <>
          <button type="button" onClick={onImport}
            className="w-full flex items-center justify-center gap-2 px-4 h-14 rounded-xl bg-sky-300 hover:bg-sky-200 text-gray-800 font-semibold text-sm transition-colors mb-3">
            <Icon name="mail" size={14} className="mr-1.5" />Importeren uit bevestiging
          </button>
          <div className="relative my-3">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
            <div className="relative text-center"><span className="bg-white px-3 text-xs text-gray-400">of handmatig invullen</span></div>
          </div>
        </>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
        {days?.length > 0 && (
          <Field label="Datum">
            <Select value={form.day_id} onChange={set("day_id")} disabled={readOnly}>
              {days.map((d) => <option key={d.id} value={d.id}>{dayOptionLabel(d)}</option>)}
            </Select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Tijd"><Input type="time" value={form.time} onChange={set("time")} disabled={readOnly} /></Field>
          <Field label="Categorie">
            <Select value={form.category} onChange={set("category")} disabled={readOnly}>
              {ACTIVITY_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Titel"><Input required value={form.title} onChange={set("title")} placeholder="bijv. Colosseum bezoek" disabled={readOnly} /></Field>
        <Field label="Locatie"><Input value={form.location} onChange={set("location")} placeholder="bijv. Via Sacra, Rome" disabled={readOnly} /></Field>
        {!readOnly && <Field label="Kosten (€)"><Input type="number" min="0" step="0.01" value={form.cost} onChange={set("cost")} placeholder="0,00" /></Field>}
        <Field label="Notities"><Textarea rows={2} value={form.notes} onChange={set("notes")} disabled={readOnly} /></Field>
        {!readOnly && (
          <Field label="Zichtbaarheid">
            <PrivacyToggle value={form.is_private} onChange={(v) => setForm((f) => ({ ...f, is_private: v }))} />
          </Field>
        )}
        {activity?.id && (
          <Field label="Dagboek">
            {created && (
              <div className="bg-green-50 text-green-700 text-xs px-3 py-2 rounded-lg mb-2">
                Activiteit toegevoegd. Schrijf er meteen iets bij of voeg een foto toe.
              </div>
            )}
            <JournalEntryBox entries={(journalEntries || []).filter((e) => e.activity_id === activity.id)} currentUserId={currentUserId} placeholder={`Vertel over ${form.title || "deze activiteit"}...`}
              onSave={(text) => api.saveJournalEntry(tripId, { activity_id: activity.id, body: text }).then(onJournalChange)}
              onDelete={(id) => api.deleteJournalEntry(id).then(onJournalChange)}
              photos={(photos || []).filter((p) => p.activity_id === activity.id)}
              tripId={tripId} dayId={dayId} activityId={activity.id} onPhotosChange={onPhotosChange} readOnly={readOnly} showPhotos={showPhotos} />
          </Field>
        )}
        <div className="flex justify-between items-center pt-2">
          {onDelete && !readOnly ? (
            <button type="button" onClick={onDelete}
              className="text-sm text-red-500 hover:text-red-700 px-2 py-1">
              <Icon name="trash" size={14} className="mr-1.5" />Verwijderen
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>{readOnly ? "Sluiten" : "Annuleren"}</Button>
            {!readOnly && <Button type="submit" disabled={saving}>{saving ? "Opslaan..." : "Opslaan"}</Button>}
          </div>
        </div>
      </form>
    </Modal>
  );
}

// ---------- Accommodation form ----------
function AccommodationForm({ tripId, initial, onSaved, onClose, onImport, journalEntries, onJournalChange, currentUserId, photos, onPhotosChange, readOnly, showPhotos = false }) {
  // `initial` is the raw DB row, where empty columns are null. Feeding null
  // into a controlled <Input> makes React flip it to uncontrolled on typing.
  const [form, setForm] = useState(initial ? {
    ...initial,
    check_in: initial.check_in ? String(initial.check_in).slice(0,10) : "", check_out: initial.check_out ? String(initial.check_out).slice(0,10) : "",
    address: initial.address ?? "", booking_ref: initial.booking_ref ?? "", cost: initial.cost ?? "", notes: initial.notes ?? "",
  } : { name: "", check_in: "", check_out: "", address: "", booking_ref: "", cost: "", notes: "", is_private: false });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true);
    try {
      const saved = initial?.id ? await api.updateAccommodation(initial.id, form) : await api.addAccommodation(tripId, form);
      onSaved(saved);
    } finally { setSaving(false); }
  }
  return (
    <Modal title={initial?.id ? "Verblijf bewerken" : "Verblijf toevoegen"} onClose={onClose} wide>
      {!initial && onImport && (
        <>
          <button type="button" onClick={onImport}
            className="w-full flex items-center justify-center gap-2 px-4 h-14 rounded-xl bg-sky-300 hover:bg-sky-200 text-gray-800 font-semibold text-sm transition-colors mb-3">
            <Icon name="mail" size={14} className="mr-1.5" />Importeren uit bevestiging
          </button>
          <div className="relative my-3">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
            <div className="relative text-center"><span className="bg-white px-3 text-xs text-gray-400">of handmatig invullen</span></div>
          </div>
        </>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Naam"><Input required value={form.name} onChange={set("name")} placeholder="bijv. Hotel Roma Centrale" disabled={readOnly} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Check-in"><Input type="date" value={form.check_in} onChange={set("check_in")} disabled={readOnly} /></Field>
          <Field label="Check-out"><Input type="date" value={form.check_out} onChange={set("check_out")} disabled={readOnly} /></Field>
        </div>
        <Field label="Adres"><Input value={form.address} onChange={set("address")} placeholder="Straat, stad" disabled={readOnly} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Boekingsnummer"><Input value={form.booking_ref} onChange={set("booking_ref")} disabled={readOnly} /></Field>
          {!readOnly && <Field label="Kosten totaal (€)"><Input type="number" min="0" step="0.01" value={form.cost} onChange={set("cost")} placeholder="0,00" /></Field>}
        </div>
        <Field label="Notities"><Textarea rows={2} value={form.notes} onChange={set("notes")} disabled={readOnly} /></Field>
        {!readOnly && (
          <Field label="Zichtbaarheid">
            <PrivacyToggle value={form.is_private} onChange={(v) => setForm((f) => ({ ...f, is_private: v }))} />
          </Field>
        )}
        {initial?.id && (
          <Field label="Dagboek">
            <JournalEntryBox entries={journalEntries || []} currentUserId={currentUserId} placeholder={`Vertel over ${form.name || "dit verblijf"}...`}
              onSave={(text) => api.saveJournalEntry(tripId, { accommodation_id: initial.id, body: text }).then(onJournalChange)}
              onDelete={(id) => api.deleteJournalEntry(id).then(onJournalChange)}
              photos={(photos || []).filter((p) => p.accommodation_id === initial.id)}
              tripId={tripId} accommodationId={initial.id} onPhotosChange={onPhotosChange} readOnly={readOnly} showPhotos={showPhotos} />
          </Field>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>{readOnly ? "Sluiten" : "Annuleren"}</Button>
          {!readOnly && <Button type="submit" disabled={saving}>{saving ? "Opslaan..." : "Opslaan"}</Button>}
        </div>
      </form>
    </Modal>
  );
}

// ---------- Transport form ----------
function TransportForm({ tripId, initial, onSaved, onClose, onImport, journalEntries, onJournalChange, currentUserId, photos, onPhotosChange, readOnly, showPhotos = false }) {
  // `initial` is the raw DB row, where empty columns are null. Feeding null
  // into a controlled <Input> makes React flip it to uncontrolled on typing.
  const [form, setForm] = useState(initial ? {
    ...initial,
    from_location: initial.from_location ?? "", to_location: initial.to_location ?? "",
    departure_time: initial.departure_time ? new Date(initial.departure_time).toISOString().slice(0,16) : "",
    arrival_time: initial.arrival_time ? new Date(initial.arrival_time).toISOString().slice(0,16) : "",
    cost: initial.cost ?? "",
    booking_ref: initial.booking_ref ?? "",
    notes: initial.notes ?? "",
    baggage_allowance: initial.baggage_allowance ?? "",
  } : { type: "Vliegtuig", from_location: "", to_location: "", departure_time: "", arrival_time: "", booking_ref: "", cost: "", notes: "", baggage_allowance: "", is_private: false });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true);
    try {
      const saved = initial?.id ? await api.updateTransport(initial.id, form) : await api.addTransport(tripId, form);
      onSaved(saved);
    } finally { setSaving(false); }
  }
  return (
    <Modal title={initial?.id ? "Vervoer bewerken" : "Vervoer toevoegen"} onClose={onClose} wide>
      {!initial && onImport && (
        <>
          <button type="button" onClick={onImport}
            className="w-full flex items-center justify-center gap-2 px-4 h-14 rounded-xl bg-sky-300 hover:bg-sky-200 text-gray-800 font-semibold text-sm transition-colors mb-3">
            <Icon name="mail" size={14} className="mr-1.5" />Importeren uit bevestiging
          </button>
          <div className="relative my-3">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
            <div className="relative text-center"><span className="bg-white px-3 text-xs text-gray-400">of handmatig invullen</span></div>
          </div>
        </>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Type">
          <Select value={form.type} onChange={set("type")} disabled={readOnly}>
            {TRANSPORT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Van"><Input value={form.from_location} onChange={set("from_location")} placeholder="Vertrekpunt" disabled={readOnly} /></Field>
          <Field label="Naar"><Input value={form.to_location} onChange={set("to_location")} placeholder="Bestemming" disabled={readOnly} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Vertrek"><Input type="datetime-local" value={form.departure_time} onChange={set("departure_time")} disabled={readOnly} /></Field>
          <Field label="Aankomst"><Input type="datetime-local" value={form.arrival_time} onChange={set("arrival_time")} disabled={readOnly} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Boekingsnummer"><Input value={form.booking_ref} onChange={set("booking_ref")} disabled={readOnly} /></Field>
          {!readOnly && <Field label="Kosten (€)"><Input type="number" min="0" step="0.01" value={form.cost} onChange={set("cost")} placeholder="0,00" /></Field>}
        </div>
        <Field label="Bagageregels"><Input value={form.baggage_allowance ?? ""} onChange={set("baggage_allowance")} placeholder="bijv. 1x 23kg ruimbagage + 10kg handbagage" disabled={readOnly} /></Field>
        <Field label="Notities"><Textarea rows={2} value={form.notes} onChange={set("notes")} disabled={readOnly} /></Field>
        {!readOnly && (
          <Field label="Zichtbaarheid">
            <PrivacyToggle value={form.is_private} onChange={(v) => setForm((f) => ({ ...f, is_private: v }))} />
          </Field>
        )}
        {initial?.id && (
          <Field label="Dagboek">
            <JournalEntryBox entries={journalEntries || []} currentUserId={currentUserId} placeholder="Vertel over deze reis..."
              onSave={(text) => api.saveJournalEntry(tripId, { transport_id: initial.id, body: text }).then(onJournalChange)}
              onDelete={(id) => api.deleteJournalEntry(id).then(onJournalChange)}
              photos={(photos || []).filter((p) => p.transport_id === initial.id)}
              tripId={tripId} transportId={initial.id} onPhotosChange={onPhotosChange} readOnly={readOnly} showPhotos={showPhotos} />
          </Field>
        )}
        <div className="flex items-center justify-between pt-2">
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>{readOnly ? "Sluiten" : "Annuleren"}</Button>
            {!readOnly && <Button type="submit" disabled={saving}>{saving ? "Opslaan..." : "Opslaan"}</Button>}
          </div>
        </div>
      </form>
    </Modal>
  );
}

// ---------- Expense form ----------
function ExpenseForm({ tripId, initial, onSaved, onClose }) {
  // `initial` is the raw DB row, where empty columns are null. Feeding null
  // into a controlled <Input>/<Select> makes React flip it to uncontrolled on
  // typing.
  const [form, setForm] = useState(initial ? {
    ...initial, date: initial.date?.slice(0,10)||"",
    category: initial.category ?? "Overig", paid_by: initial.paid_by ?? "",
  } : { date: new Date().toISOString().slice(0,10), category: "Overig", description: "", amount: "", paid_by: "" });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true);
    try {
      const saved = initial?.id ? await api.updateExpense(initial.id, form) : await api.addExpense(tripId, form);
      onSaved(saved);
    } finally { setSaving(false); }
  }
  return (
    <Modal title={initial?.id ? "Uitgave bewerken" : "Uitgave toevoegen"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Datum"><Input type="date" value={form.date} onChange={set("date")} /></Field>
          <Field label="Categorie">
            <Select value={form.category} onChange={set("category")}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Omschrijving"><Input required value={form.description} onChange={set("description")} placeholder="bijv. Lunch Trattoria Roma" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Bedrag (€)"><Input required type="number" min="0" step="0.01" value={form.amount} onChange={set("amount")} placeholder="0,00" /></Field>
          <Field label="Betaald door"><Input value={form.paid_by} onChange={set("paid_by")} placeholder="bijv. Emiel" /></Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Annuleren</Button>
          <Button type="submit" disabled={saving}>{saving ? "Opslaan..." : "Opslaan"}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- Photo gallery / uploader ----------
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

// EXIF GPS coordinates come as [degrees, minutes, seconds]
function exifGpsToDecimal(dms, ref) {
  if (!dms || dms.length < 3) return null;
  let dec = dms[0] + dms[1] / 60 + dms[2] / 3600;
  if (ref === "S" || ref === "W") dec = -dec;
  return dec;
}

// EXIF dates look like "YYYY:MM:DD HH:MM:SS" with no timezone
function exifDateToIso(str) {
  const m = typeof str === "string" && str.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : null;
}

function readExif(file) {
  return new Promise((resolve) => {
    if (typeof EXIF === "undefined") { resolve({}); return; }
    try {
      EXIF.getData(file, function () {
        try {
          const lat = exifGpsToDecimal(EXIF.getTag(this, "GPSLatitude"), EXIF.getTag(this, "GPSLatitudeRef"));
          const lon = exifGpsToDecimal(EXIF.getTag(this, "GPSLongitude"), EXIF.getTag(this, "GPSLongitudeRef"));
          const taken_at = exifDateToIso(EXIF.getTag(this, "DateTimeOriginal") || EXIF.getTag(this, "DateTime"));
          resolve({ latitude: lat, longitude: lon, taken_at });
        } catch { resolve({}); }
      });
    } catch { resolve({}); }
  });
}

// Uploaden loopt vaak over een trage mobiele verbinding, dus hoe minder bytes
// de foto zelf kost hoe eerder hij aankomt. De server verkleint toch alles
// boven FULL_MAX_EDGE — door dat al in de browser te doen stuurt een 4000px
// telefoonfoto van 6 MB nog maar een paar honderd KB over de lijn in plaats
// van het volledige origineel. HEIC laat de browser meestal niet eens tekenen
// (canvas blijft leeg of faalt stil), dus die gaan ongemoeid naar de server,
// die ze al kan converteren.
const UPLOAD_MAX_EDGE = 2000;
function downscaleImage(file) {
  return new Promise((resolve) => {
    if (!/^image\/(jpe?g|png|webp)$/i.test(file.type || "")) { resolve(null); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, UPLOAD_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
      if (scale >= 1) { resolve(null); return; } // al klein genoeg — origineel is prima
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) { resolve(null); return; }
        const reader = new FileReader();
        reader.onload = () => resolve({ dataUrl: reader.result, mediaType: "image/jpeg" });
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      }, "image/jpeg", 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Kon foto niet lezen"));
    reader.readAsDataURL(file);
  });
}

async function readForUpload(file) {
  return (await downscaleImage(file)) || { dataUrl: await readAsDataUrl(file), mediaType: file.type };
}

// Voert fn per item uit met maximaal `limit` tegelijk, zodat een batch foto's
// niet meer een voor een op elkaars volledige upload-rondje hoeft te wachten.
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Fullscreen photo viewer, shared by the dagboek strips and the Foto's grid.
// The image fills the screen; everything else floats over it, so tapping a
// photo gives you the photo rather than a boxed preview with panels under it.
function PhotoLightbox({ photos, index, onClose, onIndexChange, assign, onDelete, onRotate, onCaption, comments, slotLikes, tripId, currentUserId, isOwner, onCommentsChange }) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotated, setRotated] = useState(0);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionText, setCaptionText] = useState("");
  const [savingCaption, setSavingCaption] = useState(false);
  // De foto is nu het hele scherm: verhaal en reacties liggen er als een laag
  // overheen die je met een tik weg kan tikken, zodat de foto zelf de
  // hoofdrol houdt in plaats van een kaartje ernaast.
  const [chromeVisible, setChromeVisible] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [postingReply, setPostingReply] = useState(false);
  const [heartBurst, setHeartBurst] = useState(0);
  const touchStart = useRef(null);
  const tapTimer = useRef(null);
  const lastSwipeAt = useRef(0);

  const safeIndex = photos.length ? Math.min(index, photos.length - 1) : null;
  const viewing = safeIndex == null ? null : photos[safeIndex];

  const showNext = useCallback(() => onIndexChange((i) => (Math.min(i, photos.length - 1) + 1) % photos.length), [photos.length, onIndexChange]);
  const showPrev = useCallback(() => onIndexChange((i) => (Math.min(i, photos.length - 1) - 1 + photos.length) % photos.length), [photos.length, onIndexChange]);

  useEffect(() => { if (!photos.length) onClose(); }, [photos.length, onClose]);

  // Voorkomt dat een bijschrift of reactie die je nog aan het typen bent op de
  // verkeerde foto belandt als die intussen (via de pijltjestoetsen hieronder,
  // of anders) is doorgeschoven naar de volgende/vorige foto.
  useEffect(() => { setEditingCaption(false); setCaptionText(""); setReplyText(""); }, [viewing?.id]);

  useEffect(() => {
    function handleKey(e) {
      // Cursor verplaatsen in het bijschrift-tekstveld mag niet als foto-navigatie
      // gelden — anders springt een pijltje-tik tijdens het typen naar de
      // volgende foto en belandt de tekst straks op de verkeerde.
      const tag = document.activeElement?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if (e.key === "ArrowRight") showNext();
      else if (e.key === "ArrowLeft") showPrev();
      else if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [showNext, showPrev, onClose]);

  // Lock the page behind the viewer so a swipe doesn't scroll the dagboek.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  function handleTouchStart(e) {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY, locked: null };
    setDragging(true);
  }
  function handleTouchMove(e) {
    if (!touchStart.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    if (touchStart.current.locked === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
      touchStart.current.locked = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (touchStart.current.locked === "x") setDragX(dx);
  }
  function handleTouchCancel() {
    touchStart.current = null; setDragging(false); setDragX(0);
  }
  function handleTouchEnd(e) {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    const wasHorizontal = touchStart.current.locked === "x";
    touchStart.current = null;
    if (wasHorizontal && Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) showNext(); else showPrev();
      lastSwipeAt.current = Date.now();
      setDragX(0);
    } else {
      setDragging(false); setDragX(0);
    }
  }

  // Eén tik verbergt/toont verhaal en reacties, zodat de foto zelf even het
  // hele scherm krijgt; twee snel na elkaar waarderen de foto — net als
  // overal elders in de app is dat een duimpje, geen hartje. Kort na een
  // swipe telt een tik niet mee, anders wisselt de chrome per ongeluk mee
  // met de synthetische click die op touch-apparaten na een swipe volgt.
  function handleTap() {
    if (Date.now() - lastSwipeAt.current < 300) return;
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      handleDoubleTap();
    } else {
      tapTimer.current = setTimeout(() => {
        tapTimer.current = null;
        setChromeVisible((v) => !v);
      }, 220);
    }
  }

  async function handleDoubleTap() {
    setHeartBurst((n) => n + 1);
    if (!chromeVisible) setChromeVisible(true);
    if (canReact && currentUserId && !photoLike.liked_by_me) {
      try {
        await api.toggleJournalLike(tripId, { photo_id: viewing.id });
        await onCommentsChange();
      } catch {}
    }
  }

  async function handlePostReply(e) {
    e.preventDefault();
    if (!replyText.trim() || postingReply) return;
    setPostingReply(true);
    try {
      await api.addJournalComment(tripId, { photo_id: viewing.id, body: replyText.trim() });
      setReplyText("");
      await onCommentsChange();
    } catch (err) { alert(err.message || "Reactie plaatsen mislukt"); }
    finally { setPostingReply(false); }
  }

  if (!viewing) return null;

  const photoComments = comments ? comments.filter((c) => c.photo_id === viewing.id) : [];
  const photoLike = (slotLikes && slotLikes[`photo_id:${viewing.id}`]) || { like_count: 0, liked_by_me: false };
  const canReact = !!(comments && tripId && onCommentsChange);

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[200] bg-black select-none" style={{ height: "100dvh", touchAction: "manipulation" }}
      onClick={handleTap} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd} onTouchCancel={handleTouchCancel}>

      <img src={`${viewing.url}${rotated ? (viewing.url.includes("?") ? "&" : "?") + "r=" + rotated : ""}`} alt="" draggable={false}
        className="absolute inset-0 w-full h-full object-contain"
        style={{ transform: `translateX(${dragX}px)`, transition: dragging ? "none" : "transform 200ms ease-out", touchAction: "manipulation" }} />

      {heartBurst > 0 && (
        <div key={heartBurst} className="rp-heartpop absolute left-1/2 top-1/2 pointer-events-none z-[60] text-white">
          <Icon name="thumb" size={84} strokeWidth={1.3} style={{ filter: "drop-shadow(0 6px 18px rgba(0,0,0,.4))" }} />
        </div>
      )}

      {/* Top chrome */}
      <div className={`absolute top-0 left-0 right-0 flex items-center gap-2 px-3 pb-3 bg-gradient-to-b from-black/70 to-transparent transition-opacity duration-300 ${chromeVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
        onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose}
          className="w-9 h-9 rounded-full bg-black/50 text-white text-xl leading-none flex items-center justify-center hover:bg-black/70 transition-colors">
          ×
        </button>
        <div className="flex-1 text-center text-white/80 text-xs">
          {photos.length > 1 && <span>{safeIndex + 1} / {photos.length}</span>}
          {viewing.taken_at && <span className="ml-2 inline-flex items-center gap-1"><Icon name="clock" size={12} />{fmtDatetime(viewing.taken_at)}</span>}
        </div>
        {onRotate && (
          <button type="button" onClick={async () => { setRotating(true); try { await onRotate(viewing); setRotated(Date.now()); } finally { setRotating(false); } }}
            disabled={rotating}
            className="w-9 h-9 rounded-full bg-black/50 text-white text-base flex items-center justify-center hover:bg-black/70 transition-colors disabled:opacity-50"
            title="Kwartslag draaien">
            {rotating ? "…" : "↻"}
          </button>
        )}
        {onDelete && (
          <button type="button" onClick={() => onDelete(viewing)}
            className="w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
            title="Foto verwijderen">
            <Icon name="trash" size={16} />
          </button>
        )}
        {assign ? (
          <button type="button" onClick={() => setShowAssign((v) => !v)}
            className={`text-xs font-medium px-3 py-2 rounded-full transition-colors ${showAssign ? "bg-white text-gray-800" : "bg-black/50 text-white hover:bg-black/70"}`}>
            Toewijzen
          </button>
        ) : <span className="w-9" />}
      </div>

      {(viewing.caption || onCaption || canReact) && !showAssign && (
        <div className={`absolute left-0 right-0 bottom-0 px-4 bg-gradient-to-t from-black/85 via-black/40 to-transparent transition-all duration-300 ${chromeVisible ? "opacity-100" : "opacity-0 pointer-events-none translate-y-2"}`}
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)", paddingTop: "3rem" }}
          onClick={(e) => e.stopPropagation()}>

          {(viewing.caption || onCaption) && (
            editingCaption ? (
              <div className="space-y-2 max-w-lg mx-auto mb-3.5">
                <Textarea rows={2} autoFocus value={captionText} maxLength={500}
                  onChange={(e) => setCaptionText(e.target.value)} placeholder="Waar gaat deze foto over?" />
                <div className="flex gap-2">
                  <Button disabled={savingCaption}
                    onClick={async () => {
                      setSavingCaption(true);
                      try { await onCaption(viewing, captionText); setEditingCaption(false); }
                      finally { setSavingCaption(false); }
                    }}>{savingCaption ? "Opslaan..." : "Opslaan"}</Button>
                  <Button variant="secondary" onClick={() => setEditingCaption(false)}>Annuleren</Button>
                </div>
              </div>
            ) : viewing.caption ? (
              <p className="font-display text-white text-[17px] leading-relaxed whitespace-pre-wrap mb-3.5" style={{ textWrap: "balance", textShadow: "0 1px 8px rgba(0,0,0,.35)" }}>
                {viewing.caption}
                {onCaption && (
                  <button type="button" onClick={() => { setCaptionText(viewing.caption || ""); setEditingCaption(true); }}
                    className="ml-2 align-middle text-white/60 hover:text-white" aria-label="Bewerken"><Icon name="pen" size={14} /></button>
                )}
              </p>
            ) : onCaption ? (
              <button type="button" onClick={() => { setCaptionText(""); setEditingCaption(true); }}
                className="block text-white/70 hover:text-white text-xs mb-3.5">+ Verhaal toevoegen</button>
            ) : null
          )}

          {canReact && (
            <>
              {photoComments.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {photoComments.map((c) => (
                    <div key={c.id} className="flex items-start gap-2 rounded-2xl bg-white/15 px-3 py-1.5 max-w-[88%]" style={{ backdropFilter: "blur(6px)" }}>
                      <span className="text-[13px] text-white leading-snug break-words">
                        <b className="font-semibold">{c.author || "Iemand"}</b> {c.body}
                      </span>
                      {(c.user_id === currentUserId || isOwner) && (
                        <button type="button" onClick={async () => { if (confirm("Reactie verwijderen?")) { try { await api.deleteJournalComment(c.id); await onCommentsChange(); } catch (err) { alert(err.message || "Verwijderen mislukt"); } } }}
                          className="shrink-0 text-white/50 hover:text-white ml-auto" aria-label="Verwijderen">
                          <Icon name="trash" size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2.5">
                <button type="button" onClick={async (e) => {
                    e.stopPropagation();
                    if (!currentUserId) return;
                    try { await api.toggleJournalLike(tripId, { photo_id: viewing.id }); await onCommentsChange(); } catch (err) { alert(err.message || "Liken mislukt"); }
                  }}
                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${photoLike.liked_by_me ? "bg-sky-400 text-gray-900" : "bg-white/15 text-white hover:bg-white/25"}`}
                  title={photoLike.liked_by_me ? "Like weghalen" : "Vind ik leuk"}>
                  <Icon name="thumb" size={16} />
                </button>
                {photoLike.like_count > 0 && <span className="text-xs text-white/70 tnum shrink-0">{photoLike.like_count}</span>}
                {currentUserId && (
                  <form onSubmit={handlePostReply} className="flex-1 min-w-0">
                    <input value={replyText} onChange={(e) => setReplyText(e.target.value)} maxLength={2000}
                      placeholder="Reageer..." disabled={postingReply}
                      className="w-full h-9 rounded-full border border-white/25 bg-white/10 text-white placeholder-white/55 text-[13px] px-4 outline-none focus:border-white/50 disabled:opacity-60" />
                  </form>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {photos.length > 1 && (
        <>
          <button type="button" onClick={(e) => { e.stopPropagation(); showPrev(); }}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 text-white text-2xl flex items-center justify-center hover:bg-black/70 transition-colors">
            ‹
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); showNext(); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 text-white text-2xl flex items-center justify-center hover:bg-black/70 transition-colors">
            ›
          </button>
        </>
      )}

      {assign && showAssign && (
        <div className="absolute left-0 right-0 bottom-0 bg-white p-4 space-y-2 rounded-t-2xl"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
          onClick={(e) => e.stopPropagation()}>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Toewijzen aan</label>
          <Select value={photoTargetValue(viewing)} onChange={(e) => assign.onChange(viewing, e.target.value)}>
            <option value="">— Niet toegewezen —</option>
            {assign.dayGroups.map(({ day, transports: dayT, accommodations: dayA }) => (
              <optgroup key={day.id} label={dayOptionLabel(day)}>
                <option value={`day:${day.id}`}>Hele dag</option>
                {dayT.map((t) => (
                  <option key={"t" + t.id} value={`transport:${t.id}`}>{t.type || "Vervoer"} · {t.from_location} → {t.to_location}</option>
                ))}
                {dayA.map((a) => (
                  <option key={"a" + a.id} value={`accommodation:${a.id}`}>Verblijf · {a.name}</option>
                ))}
                {(day.activities || []).map((act) => (
                  <option key={act.id} value={`activity:${act.id}`}>{act.category || "Activiteit"} · {act.title}</option>
                ))}
              </optgroup>
            ))}
            {(assign.otherTransports.length > 0 || assign.otherAccommodations.length > 0) && (
              <optgroup label="Overig (geen datum gekoppeld)">
                {assign.otherTransports.map((t) => (
                  <option key={"t" + t.id} value={`transport:${t.id}`}>{t.type || "Vervoer"} · {t.from_location} → {t.to_location}</option>
                ))}
                {assign.otherAccommodations.map((a) => (
                  <option key={"a" + a.id} value={`accommodation:${a.id}`}>Verblijf · {a.name}</option>
                ))}
              </optgroup>
            )}
          </Select>
        </div>
      )}
    </div>,
    document.body
  );
}

function PhotoCaption({ photo, readOnly, onChanged, maxWidth }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(photo.caption || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!editing) setText(photo.caption || ""); }, [photo.caption, editing]);

  async function save() {
    setSaving(true);
    try { await api.setPhotoCaption(photo.id, text.trim()); setEditing(false); await onChanged(); }
    catch (err) { alert(err.message || "Opslaan mislukt"); }
    finally { setSaving(false); }
  }

  if (readOnly) {
    return photo.caption
      ? <p className="mt-1.5 text-xs text-gray-600 leading-snug whitespace-pre-wrap" style={{ maxWidth }}>{photo.caption}</p>
      : null;
  }

  if (editing) {
    return (
      <div className="mt-1.5 space-y-1.5" style={{ maxWidth }} onClick={(e) => e.stopPropagation()}>
        <Textarea rows={2} autoFocus value={text} maxLength={500}
          onChange={(e) => setText(e.target.value)} placeholder="Korte beschrijving..." />
        <div className="flex gap-2">
          <Button onClick={save} disabled={saving} className="!text-xs !px-2.5 !py-1">{saving ? "Opslaan..." : "Opslaan"}</Button>
          <Button variant="secondary" onClick={() => { setText(photo.caption || ""); setEditing(false); }} className="!text-xs !px-2.5 !py-1">Annuleren</Button>
        </div>
      </div>
    );
  }

  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      className="mt-1.5 block text-left text-xs leading-snug w-full" style={{ maxWidth }}>
      {photo.caption
        ? <span className="text-gray-600 whitespace-pre-wrap">{photo.caption}</span>
        : <span className="text-gray-400 italic hover:text-sky-600 transition-colors">+ Beschrijving</span>}
    </button>
  );
}

// Voortgang tijdens het uploaden van foto's. Uploaden duurt per foto merkbaar
// lang (verkleinen, versturen, opslaan), en een knop die alleen "Uploaden..."
// zegt geeft geen enkel houvast of er nog iets gebeurt — zeker niet bij een
// stapel foto's. Vandaar het aantal erbij en een balk die daadwerkelijk vult.
function UploadProgress({ done, total, className = "" }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{done} van {total} {total === 1 ? "foto" : "foto's"} geüpload</span>
        <span className="tnum">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden"
        role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total}
        aria-label="Voortgang uploaden">
        <div className="h-full rounded-full bg-sky-300 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PhotoStrip({ photos, tripId, dayId, activityId, transportId, accommodationId, onChange, readOnly, days, transports, accommodations, large, comments, slotLikes, currentUserId, isOwner, onCommentsChange }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [viewingIndex, setViewingIndex] = useState(null);
  // Los in het dagverhaal geüploade foto (nog aan geen activiteit gekoppeld)
  // krijgt meteen de vraag of hij tot een activiteit gepromoveerd moet worden.
  // Alleen zinvol op dat dagniveau — een foto die al bij een activiteit hoort
  // is al "van" iets, en buiten het dagboek (large=false, bijv. de foto's-tab)
  // is er geen losse dag-context om dit aan te bieden.
  const [activityPromptPhoto, setActivityPromptPhoto] = useState(null);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const canAssign = !readOnly && !!days;
  const canOfferActivity = large && !readOnly && !!dayId && !activityId && !transportId && !accommodationId && !!days;
  const { dayGroups, otherTransports, otherAccommodations } = canAssign
    ? computeDayGroups(days, transports || [], accommodations || [])
    : { dayGroups: [], otherTransports: [], otherAccommodations: [] };

  async function handleFiles(e) {
    const files = [...e.target.files];
    e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    setProgress({ done: 0, total: files.length });
    // Each file stands alone: one failure used to abort the whole batch AND skip
    // the refresh, so already-uploaded photos stayed invisible and the rest were
    // never attempted. Uploads run a few at a time instead of strictly one after
    // another — a batch of ten photos no longer waits for nine full round-trips
    // before the tenth even starts.
    const failed = [];
    const uploaded = [];
    await mapWithConcurrency(files, 3, async (file) => {
      try {
        const [image, exif] = await Promise.all([readForUpload(file), readExif(file)]);
        const base64 = image.dataUrl.split(",")[1];
        // Pas ná het eventueel verkleinen checken: anders werd precies de grote
        // telefoonfoto die downscaleImage moest redden alsnog geweigerd.
        if ((base64.length * 3) / 4 > MAX_PHOTO_BYTES) { failed.push(`${file.name} (te groot, max 8 MB)`); return; }
        const saved = await api.addPhoto(tripId, {
          day_id: dayId || null, activity_id: activityId || null, transport_id: transportId || null, accommodation_id: accommodationId || null,
          image: { data: base64, mediaType: image.mediaType },
          taken_at: exif.taken_at || null, latitude: exif.latitude ?? null, longitude: exif.longitude ?? null,
        });
        uploaded.push(saved);
      } catch (err) {
        failed.push(`${file.name} (${err.message || "mislukt"})`);
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    });
    setUploading(false);
    onChange();
    // Bij meerdere foto's tegelijk maar één keer aanbieden, voor de eerst
    // geüploade — anders volgt er een hele stapel prompts achter elkaar.
    if (canOfferActivity && uploaded.length) setActivityPromptPhoto(uploaded[0]);
    if (failed.length) {
      alert(`${files.length - failed.length} van ${files.length} foto's geüpload.\n\nNiet gelukt:\n${failed.join("\n")}`);
    }
  }

  // De foto hing al ergens (los in het dagverhaal) toen de activiteit nog
  // niet bestond — na het aanmaken hoeft dus alleen de koppeling verlegd te
  // worden, niet opnieuw geüpload.
  async function handleActivityCreated(activity) {
    if (activityPromptPhoto) {
      await api.updatePhoto(activityPromptPhoto.id, { day_id: activity.day_id, activity_id: activity.id, transport_id: null, accommodation_id: null });
    }
    setShowActivityForm(false);
    setActivityPromptPhoto(null);
    onChange();
  }

  async function handleDelete(id) {
    if (!confirm("Foto verwijderen?")) return;
    await api.deletePhoto(id);
    onChange();
  }

  async function handleAssign(photo, value) {
    await api.updatePhoto(photo.id, assignPhotoPayload(days, value));
    setViewingIndex(null);
    onChange();
  }

  // "Veel groter" is bewust ook hier doorgevoerd, niet alleen in de
  // volledig-scherm-viewer erachter: bijna schermbreed in plaats van de oude
  // 70vw, met een ruimere bovengrens op grotere schermen.
  const thumbClass = large ? "w-[88vw] h-[88vw] max-w-[420px] max-h-[420px] sm:w-96 sm:h-96" : "w-24 h-24";
  const largeMaxWidth = "88vw";

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <div className={`flex ${large ? "gap-4 snap-x snap-mandatory" : "gap-2"} overflow-x-auto pb-1`}>
        {photos.map((p, i) => (
          <div key={p.id} className={`relative shrink-0 group ${large ? "snap-center" : ""}`}>
            <img src={p.thumb_url || p.url} alt={p.caption || ""} loading="lazy" decoding="async" onClick={() => setViewingIndex(i)}
              className={`${thumbClass} ${large ? "rounded-2xl" : "rounded-lg"} object-cover cursor-pointer border border-gray-100`} />
            {large && (
              <PhotoCaption photo={p} readOnly={readOnly} onChanged={onChange} maxWidth={largeMaxWidth} />
            )}
            {large && comments && (
              <div className="mt-1.5" style={{ maxWidth: largeMaxWidth }} onClick={(e) => e.stopPropagation()}>
                <JournalComments slot={{ photo_id: p.id }}
                  comments={comments.filter((c) => c.photo_id === p.id)}
                  like={(slotLikes && slotLikes[`photo_id:${p.id}`]) || { like_count: 0, liked_by_me: false }}
                  tripId={tripId} currentUserId={currentUserId} isOwner={isOwner} onChanged={onCommentsChange} />
              </div>
            )}
            {!readOnly && (
              <button type="button" onClick={() => handleDelete(p.id)}
                className={`absolute -top-1.5 -right-1.5 rounded-full bg-white shadow text-red-500 leading-none opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity flex items-center justify-center ${large ? "w-8 h-8 text-base" : "w-6 h-6 text-sm"}`}>
                ×
              </button>
            )}
          </div>
        ))}
        {/* In de compacte grid (foto's-tab) blijft de "+"-tegel gewoon in de
            scrollende rij staan — de tegels zijn klein genoeg om zichtbaar te
            blijven. In het dagboek (large) duwden de nu veel bredere foto's
            'm daar helemaal buiten beeld: bij één foto van bijna schermbreed
            stond de knop achter de rand, onbereikbaar zonder te weten dat je
            opzij moest vegen. Die staat daarom hieronder, los van de
            scrollende rij, altijd zichtbaar. */}
        {!readOnly && !large && (
          <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()}
            className="shrink-0 w-24 h-24 rounded-lg border-2 border-dashed border-gray-200 hover:border-gray-300 flex items-center justify-center text-gray-400 hover:text-gray-500 text-2xl transition-colors">
            {uploading ? "…" : "＋"}
          </button>
        )}
      </div>
      {!readOnly && large && !uploading && (
        <button type="button" onClick={() => fileRef.current?.click()}
          className="mt-2 inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-gray-200 bg-white text-xs font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-colors">
          <span className="text-base leading-none">＋</span>
          Foto toevoegen
        </button>
      )}
      {!readOnly && uploading && (
        <div className="mt-2" style={large ? { maxWidth: largeMaxWidth } : undefined}>
          <UploadProgress done={progress.done} total={progress.total} />
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
      {/* Deze vraag stond als een dun regeltje van 12px met "Ja" als tekstlink
          en een kruisje ernaast — te makkelijk over het hoofd te zien, en het
          was niet duidelijk dat je hier iets kon kiezen. Nu een echte kaart met
          de foto erbij (zodat zichtbaar is wélke foto het betreft) en twee
          even grote knoppen met een duidelijk ja en nee. */}
      {canOfferActivity && activityPromptPhoto && (
        <div className="rp-rise mt-3 p-3 rounded-2xl border border-sky-200 bg-sky-50 shadow-sm" style={{ maxWidth: largeMaxWidth }}>
          <div className="flex items-center gap-3">
            <img src={activityPromptPhoto.thumb_url || activityPromptPhoto.url} alt=""
              className="w-14 h-14 rounded-xl object-cover shrink-0" />
            <div className="min-w-0">
              <div className="font-display text-[17px] text-gray-800 leading-snug">Activiteit van deze foto maken?</div>
              <div className="text-xs text-gray-500 mt-0.5">Dan komt hij op de planning te staan met een naam en tijd.</div>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={() => setActivityPromptPhoto(null)}
              className="rp-press flex-1 h-11 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-600 hover:border-gray-300 transition-colors">
              Nee
            </button>
            <button type="button" onClick={() => setShowActivityForm(true)}
              className="rp-press flex-1 h-11 rounded-xl bg-sky-300 text-sm font-semibold text-gray-800 hover:bg-sky-400 transition-colors">
              Ja
            </button>
          </div>
        </div>
      )}
      {showActivityForm && (
        <ActivityForm dayId={dayId} tripId={tripId} days={days}
          onSaved={handleActivityCreated}
          onClose={() => { setShowActivityForm(false); setActivityPromptPhoto(null); }} />
      )}
      {viewingIndex != null && (
        <PhotoLightbox photos={photos} index={viewingIndex}
          onClose={() => setViewingIndex(null)} onIndexChange={setViewingIndex}
          assign={canAssign ? { dayGroups, otherTransports, otherAccommodations, onChange: handleAssign } : null}
          onDelete={readOnly ? null : (p) => handleDelete(p.id)}
          onRotate={readOnly ? null : async (p) => { await api.rotatePhoto(p.id); await onChange(); }}
          onCaption={readOnly ? null : async (p, text) => { await api.setPhotoCaption(p.id, text); await onChange(); }}
          comments={comments} slotLikes={slotLikes} tripId={tripId} currentUserId={currentUserId} isOwner={isOwner} onCommentsChange={onCommentsChange} />
      )}
    </div>
  );
}

// ---------- Bulk photo upload with automatic day allocation ----------
function dayOptionLabel(day) {
  if (!day.date) return "Dag zonder datum";
  return new Date(day.date).toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

function BulkPhotoUpload({ tripId, days, onClose, onUploaded }) {
  const [items, setItems] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef(null);

  function matchDay(takenAt) {
    if (!takenAt) return "";
    const dateStr = takenAt.slice(0, 10);
    const match = days.find((d) => d.date && d.date.slice(0, 10) === dateStr);
    return match ? String(match.id) : "";
  }

  async function handleSelectFiles(e) {
    const files = [...e.target.files];
    e.target.value = "";
    if (!files.length) return;
    setProcessing(true);
    const newItems = await mapWithConcurrency(files, 4, async (file) => {
      const key = `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`;
      try {
        const [image, exif] = await Promise.all([readForUpload(file), readExif(file)]);
        // Pas ná het eventueel verkleinen checken: anders werd precies de grote
        // telefoonfoto die downscaleImage moest redden alsnog geweigerd.
        if ((image.dataUrl.split(",")[1].length * 3) / 4 > MAX_PHOTO_BYTES) return { key, name: file.name, error: "Te groot (max 8 MB)" };
        return { key, name: file.name, dataUrl: image.dataUrl, mediaType: image.mediaType, exif, dayId: matchDay(exif.taken_at) };
      } catch {
        return { key, name: file.name, error: "Kon foto niet lezen" };
      }
    });
    setItems((prev) => [...prev, ...newItems]);
    setProcessing(false);
  }

  function setItemDay(key, dayId) {
    setItems((prev) => prev.map((it) => it.key === key ? { ...it, dayId } : it));
  }
  function removeItem(key) {
    setItems((prev) => prev.filter((it) => it.key !== key));
  }

  const uploadable = items.filter((it) => !it.error);
  const matchedCount = uploadable.filter((it) => it.dayId).length;

  async function handleUploadAll() {
    if (!uploadable.length) return;
    setUploading(true); setProgress(0);
    const failed = [];
    await mapWithConcurrency(uploadable, 3, async (it) => {
      const base64 = it.dataUrl.split(",")[1];
      try {
        await api.addPhoto(tripId, {
          day_id: it.dayId || null, activity_id: null,
          image: { data: base64, mediaType: it.mediaType },
          taken_at: it.exif.taken_at || null, latitude: it.exif.latitude ?? null, longitude: it.exif.longitude ?? null,
        });
      } catch (err) {
        failed.push(`${it.name} (${err.message || "mislukt"})`);
      }
      setProgress((p) => p + 1);
    });
    setUploading(false);
    onUploaded();
    onClose();
    if (failed.length) {
      alert(`${uploadable.length - failed.length} van ${uploadable.length} foto's geüpload.\n\nNiet gelukt:\n${failed.join("\n")}`);
    }
  }

  return (
    <Modal title="Foto's uploaden" onClose={onClose} wide>
      {items.length === 0 ? (
        <div>
          <p className="text-sm text-gray-500 mb-4">
            Selecteer meerdere foto's tegelijk. Ze worden automatisch aan de juiste reisdag gekoppeld op basis van de datum waarop de foto is gemaakt.
          </p>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={processing}
            className="w-full border-2 border-dashed border-gray-200 rounded-xl py-10 text-sm text-gray-400 hover:border-gray-300 hover:text-gray-500 transition-colors">
            {processing ? "Foto's verwerken..." : <><Icon name="camera" size={15} className="mr-1.5" />Klik om foto's te kiezen</>}
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleSelectFiles} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm text-gray-500">
              {matchedCount} van de {uploadable.length} foto's automatisch gekoppeld aan een dag.
            </p>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={processing || uploading}
              className="text-xs font-medium text-sky-600 hover:text-sky-700 disabled:opacity-50">+ Meer foto's</button>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleSelectFiles} />
          </div>
          {processing && <div className="text-xs text-gray-400">Nieuwe foto's verwerken...</div>}
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {items.map((it) => (
              <div key={it.key} className="flex items-center gap-3 border border-gray-100 rounded-lg p-2">
                {it.dataUrl ? (
                  <img src={it.dataUrl} alt="" className="w-20 h-20 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-red-50 flex items-center justify-center text-red-400 shrink-0"><Icon name="alert" size={22} /></div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-700 truncate">{it.name}</div>
                  {it.error ? (
                    <div className="text-xs text-red-500">{it.error}</div>
                  ) : (
                    <div className="text-xs text-gray-400">{it.exif?.taken_at ? fmtDatetime(it.exif.taken_at) : "Geen datum gevonden"}</div>
                  )}
                </div>
                {!it.error && (
                  <Select value={it.dayId} onChange={(e) => setItemDay(it.key, e.target.value)} className="!w-40 shrink-0">
                    <option value="">Geen dag</option>
                    {days.map((d) => <option key={d.id} value={d.id}>{dayOptionLabel(d)}</option>)}
                  </Select>
                )}
                <button type="button" onClick={() => removeItem(it.key)} className="text-gray-300 hover:text-red-500 p-1 shrink-0" aria-label="Verwijderen"><Icon name="trash" size={15} /></button>
              </div>
            ))}
          </div>
          {uploading && <UploadProgress done={progress} total={uploadable.length} />}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={uploading}>Annuleren</Button>
            <Button type="button" onClick={handleUploadAll} disabled={uploading || !uploadable.length}>
              {uploading ? "Uploaden..." : `Uploaden (${uploadable.length})`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---------- Day planning tab ----------
const CATEGORY_ICONS = { Bezienswaardigheid: "landmark", Restaurant: "fork", Museum: "frame", Natuur: "leaf", Sport: "ball", Shopping: "bagShop", Anders: "flag" };
function categoryIcon(cat) { return CATEGORY_ICONS[cat] || "flag"; }

// Eén kaartje op de tijdlijn — vervoer, verblijf en activiteit zien er verder
// hetzelfde uit, dus alleen de inhoud verschilt. Het stipje links valt precies
// op de verticale lijn van de dag (zie de lijn in DayPlanningTab).
// Een locatie in de planning opent rechtstreeks Google Maps — onderweg is dat
// vrijwel altijd wat je met een adres wilt, en anders moest je het overtypen.
// stopPropagation is hier geen bijzaak: de kaart eromheen opent bij een tik het
// bewerkscherm, en zonder dit deed een tik op het adres dat óók.
function MapsLink({ query, className = "" }) {
  if (!query) return null;
  return (
    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`}
      target="_blank" rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={`${query} openen in Google Maps`}
      className={`inline-flex items-baseline gap-1.5 py-2.5 -my-2.5 text-sky-700 hover:underline transition-colors ${className}`}>
      {/* Speldje én tekst in accentkleur: op mobiel is er geen hover, dus zonder
          kleur zag het eruit als gewone tekst en was niet te zien dat je erop
          kon tikken om de kaart te openen. */}
      <Icon name="pin" size={14} className="shrink-0 self-center" />
      <span className="min-w-0">{query}</span>
    </a>
  );
}

function TimelineCard({ time, icon, title, subtitle, meta, aside, trailing, onClick }) {
  return (
    <div className="relative pl-8">
      <span aria-hidden="true"
        className="absolute left-0 top-7 w-2.5 h-2.5 rounded-full bg-sky-300 ring-4 ring-gray-50" />
      <div onClick={onClick}
        className="rp-press bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow cursor-pointer p-5">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[13px] font-medium text-gray-400">
              <span className="tnum">{time || "—"}</span>
              {meta && <span className="truncate">{meta}</span>}
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <Icon name={icon} size={17} className="shrink-0 text-sky-700" />
              <span className="text-[19px] font-semibold text-gray-800 leading-snug min-w-0">{title}</span>
            </div>
            {subtitle && <div className="text-[15px] text-gray-500 mt-1 leading-relaxed">{subtitle}</div>}
            {aside}
          </div>
          {trailing && <div className="shrink-0 flex items-center gap-1">{trailing}</div>}
        </div>
      </div>
    </div>
  );
}


const DAY_NAMES = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const MONTH_NAMES = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

// Naar-boven-knop die zich gedraagt: hij verschijnt pas als je daadwerkelijk
// een eind naar beneden bent. Eerder stond hij er altijd — ook op een lege
// pagina die helemaal niet scrolt, waar hij dan over de tekst heen zweefde en
// nergens heen kon. Stond twee keer bijna identiek in het bestand (dagplanning
// en dagboek); nu één keer.
function ScrollTopButton() {
  const [zichtbaar, setZichtbaar] = useState(false);
  useEffect(() => {
    function kijk() {
      const kanScrollen = document.documentElement.scrollHeight > window.innerHeight + 200;
      setZichtbaar(kanScrollen && window.scrollY > 400);
    }
    kijk();
    window.addEventListener("scroll", kijk, { passive: true });
    window.addEventListener("resize", kijk);
    return () => { window.removeEventListener("scroll", kijk); window.removeEventListener("resize", kijk); };
  }, []);
  if (!zichtbaar) return null;
  return (
    <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      title="Naar boven" aria-label="Naar boven"
      className="rp-press rp-rise fixed right-5 z-40 w-11 h-11 rounded-full flex items-center justify-center transition-colors hover:brightness-95"
      style={{ background: PALETTE.primary, color: PALETTE.textPrimary, boxShadow: "0 8px 30px rgba(0,0,0,0.12)", bottom: "calc(72px + env(safe-area-inset-bottom) + 16px)" }}>
      <Icon name="arrowUp" size={19} />
    </button>
  );
}

function DayPlanningTab({ trip, days, transports, accommodations, onRefresh, readOnly, currentUserId, onShareEditor, onEditTrip }) {
  const [showActivityForm, setShowActivityForm] = useState(null);
  const [editingActivity, setEditingActivity] = useState(null);
  const [editingTransport, setEditingTransport] = useState(null);
  const [addingTransport, setAddingTransport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editingAccommodation, setEditingAccommodation] = useState(null);
  const [addingAccommodation, setAddingAccommodation] = useState(false);
  const [tripJournal, setTripJournal] = useState([]);
  const [tipsLocation, setTipsLocation] = useState(null);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const didAutoScroll = useRef(false);
  const accent = trip.cover_color || PALETTE.primary;

  const loadJournal = useCallback(async () => {
    try { setTripJournal(asList((await api.getJournal(trip.id)).entries)); } catch {}
  }, [trip.id]);
  useEffect(() => { loadJournal(); }, [loadJournal]);

  // Geen bevestigingsvraag meer: de activiteit gaat meteen weg en je krijgt een
  // paar tellen de kans om dat terug te draaien. Dat scheelt een tik bij elke
  // bedoelde verwijdering én helpt echt bij een onbedoelde — de prullenbak zit
  // vlak naast het gebied dat de kaart opent.
  async function handleDeleteActivity(act) {
    await api.deleteActivity(act.id);
    onRefresh();
    toonMelding(`"${act.title}" verwijderd`, {
      label: "Ongedaan maken",
      run: async () => {
        // Zelfde velden terug; de activiteit krijgt wel een nieuw id, wat verder
        // nergens toe doet omdat er niets anders naar verwijst.
        await api.addActivity(act.day_id, {
          time: act.time, title: act.title, location: act.location, notes: act.notes,
          category: act.category, cost: act.cost, is_private: act.is_private,
        });
        onRefresh();
      },
    });
  }
  async function handleDeleteDay(id) {
    if (!confirm("Dag verwijderen (inclusief activiteiten)?")) return;
    await api.deleteDay(id); onRefresh();
  }

  const isoDate = (dt) => dt ? String(dt).slice(0, 10) : null;
  const todayDay = days.find((d) => isoDate(d.date) === todayIso(trip.timezone));

  function scrollToToday() {
    if (!todayDay) return;
    document.getElementById(`day-${todayDay.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Land op vandaag zodra de dagplanning opent — net als bij het dagboek is
  // dat de dag waar je tijdens de reis voor komt kijken. Eenmalig per reis,
  // anders trekt een refresh (bijv. na het toevoegen van een activiteit) je
  // terug naar vandaag terwijl je net ergens anders aan het scrollen was.
  useEffect(() => { didAutoScroll.current = false; }, [trip.id]);
  useEffect(() => {
    if (didAutoScroll.current || !todayDay) return;
    didAutoScroll.current = true;
    requestAnimationFrame(() => {
      document.getElementById(`day-${todayDay.id}`)?.scrollIntoView({ block: "start" });
    });
  }, [todayDay, trip.id]);

  // Alle "toevoegen"-acties zaten als vijf losse knoppen op de pagina en namen
  // meer ruimte in dan de planning zelf. Nu één primaire actie, met de keuze in
  // een blad — dezelfde handelingen, alleen niet meer allemaal tegelijk in beeld.
  const addActions = [
    { key: "activity", icon: categoryIcon("Bezienswaardigheid"), label: "Activiteit", description: "Bezienswaardigheid, museum, wandeling",
      run: () => setShowActivityForm({ dayId: todayDay?.id }) },
    { key: "transport", icon: "plane", label: "Vervoer", description: "Vlucht, trein, auto of boot",
      run: () => setAddingTransport(true) },
    { key: "stay", icon: "bed", label: "Verblijf", description: "Hotel, appartement of camping",
      run: () => setAddingAccommodation(true) },
    { key: "restaurant", icon: categoryIcon("Restaurant"), label: "Restaurant", description: "Reservering of eetadres",
      run: () => setShowActivityForm({ dayId: todayDay?.id, category: "Restaurant" }) },
    { key: "import", icon: "mail", label: "Reisbevestiging uploaden", description: "Wij halen de gegevens er zelf uit",
      run: () => setImporting(true) },
    ...(onShareEditor ? [{ key: "share", icon: "share", label: "Reis delen met reisgenoot", description: "Samen plannen aan dezelfde reis",
      run: () => onShareEditor() }] : []),
  ];

  return (
    <div>
      {/* Sectietitel krijgt lucht boven en onder; de datumspanne eronder vertelt
          waar je naar kijkt zonder dat er een tweede regel chrome bij komt. */}
      <div className="flex items-end justify-between gap-4 pt-2 pb-8">
        <div className="min-w-0">
          <h3 className="font-display text-[32px] font-semibold text-gray-800 leading-tight">Dagplanning</h3>
          {days.length > 0 && (
            <p className="text-[15px] text-gray-500 mt-1.5 leading-relaxed">
              {days.length} dag{days.length === 1 ? "" : "en"}
              {trip.destination ? ` in ${trip.destination}` : ""}
            </p>
          )}
        </div>
        {todayDay && (
          <button type="button" onClick={scrollToToday}
            className="rp-press shrink-0 text-[13px] font-medium text-gray-500 hover:text-gray-800 inline-flex items-center gap-1.5 px-3 h-10 rounded-xl hover:bg-gray-100 transition-colors">
            <Icon name="pin" size={14} />Vandaag
          </button>
        )}
      </div>

      {/* Hier stond een "Binnenkort"-kaart met de eerstvolgende vijf items. Die
          verscheen alleen tijdens een lopende reis — en juist dán opent de
          dagplanning al op de dag van vandaag (zie het effect hierboven), dus
          je landde er altijd onder en kreeg 'm nooit te zien. Wat hij toonde
          staat bovendien direct daaronder in de dagenlijst zelf: dezelfde
          activiteiten, met dezelfde tijden en hetzelfde weer. Twee lijsten van
          hetzelfde, waarvan er één onzichtbaar was. */}

      {!readOnly && (
        <div className="mb-8">
          <Button size="lg" className="w-full" onClick={() => setShowAddSheet(true)}>
            <Icon name="plus" size={19} />Toevoegen
          </Button>
        </div>
      )}

      {/* Deze melding vertelde je wat je moest doen ("stel data in bij de reis")
          maar bracht je er niet heen — je moest zelf bedenken dat dat achter het
          "..."-menu zit. Een lege staat hoort de knop te zijn die je verder helpt,
          niet alleen een aanwijzing. */}
      {days.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          <Icon name="calendar" size={44} strokeWidth={1.2} className="mx-auto mb-4 text-gray-300" />
          <div className="text-[19px] font-semibold text-gray-600">Nog geen dagen gepland</div>
          <div className="text-[15px] mt-2 leading-relaxed">
            Zodra deze reis een vertrek- en terugkomstdatum heeft, staan de dagen hier vanzelf.
          </div>
          {!readOnly && onEditTrip && (
            <Button onClick={onEditTrip} className="mt-5 !w-auto !inline-flex">
              <Icon name="calendar" size={17} />Reisdata instellen
            </Button>
          )}
        </div>
      )}

      {/* Timeline */}
      <div className="relative">
        <div>
          {days.map((day, dayIndex) => {
            const dayStr = day.date ? day.date.slice(0, 10) : null;
            const dayTransports = transports.filter((t) => isoDate(t.departure_time) === dayStr || isoDate(t.arrival_time) === dayStr);
            const dayAccommodations = accommodations.filter((a) => isoDate(a.check_in) === dayStr || isoDate(a.check_out) === dayStr);

            const d = day.date ? new Date(day.date) : null;
            const dayNum = d ? d.getUTCDate() : "?";
            const dayName = d ? DAY_NAMES[d.getUTCDay()] : "";
            const monthName = d ? MONTH_NAMES[d.getUTCMonth()] : "";
            const totalItems = dayTransports.length + dayAccommodations.length + day.activities.length;
            const nightAccommodation = dayStr ? accommodations.find(a => {
              if (!a.check_in || !a.check_out) return false;
              return isoDate(a.check_in) <= dayStr && isoDate(a.check_out) > dayStr;
            }) : null;
            // Verblijf van die nacht is de betrouwbaarste locatie voor het weer;
            // zonder verblijf valt dit terug op de eerste activiteit met een
            // locatie, zodat een dag zonder overnachting niet zomaar leeg blijft.
            const weatherQuery = nightAccommodation
              ? (nightAccommodation.address || nightAccommodation.name)
              : (day.activities.find((a) => a.location)?.location || null);

            const isToday = dayStr === todayIso(trip.timezone);

            const tipsButton = (loc) => (
              <button onClick={(e) => { e.stopPropagation(); setTipsLocation(loc); }}
                className="rp-press w-10 h-10 rounded-xl flex items-center justify-center text-gray-400 hover:text-sky-700 hover:bg-sky-50 transition-colors"
                title="Lokale tips" aria-label="Lokale tips">
                <Icon name="bulb" size={17} />
              </button>
            );

            return (
              <div key={day.id} id={`day-${day.id}`} className="rp-rise"
                style={{ scrollMarginTop: "5rem", animationDelay: `${Math.min(dayIndex, 6) * 40}ms` }}>
                {/* Dagkop: het dagnummer draagt de dag, met gewicht in plaats van
                    kleur. Alleen "vandaag" krijgt het perzik. */}
                <div className="flex items-center gap-3 mb-5">
                  <span className={`font-display text-[26px] font-bold leading-none tnum ${isToday ? "text-sky-700" : "text-gray-800"}`}>{dayNum}</span>
                  <span className={`text-[13px] font-semibold uppercase tracking-[0.14em] ${isToday ? "text-sky-700" : "text-gray-400"}`}>
                    {dayName} {monthName}
                  </span>
                  {isToday && (
                    <span className="text-[13px] font-semibold px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-700">Vandaag</span>
                  )}
                  <span className="ml-auto shrink-0"><DayWeatherBadge query={weatherQuery} date={dayStr} size={15} /></span>
                </div>

                {(day.title || nightAccommodation) && (
                  <div className="pl-8 -mt-2 mb-4 space-y-1">
                    {day.title && <div className="text-[19px] font-semibold text-gray-800 leading-snug">{day.title}</div>}
                    {nightAccommodation && (
                      <div className="text-[13px] font-medium text-gray-400 flex items-center gap-1.5">
                        <Icon name="bed" size={14} />
                        <span className="truncate">{nightAccommodation.address || nightAccommodation.name}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* De lijn loopt door achter de kaartjes; elk kaartje zet er zelf
                    een stipje op (zie TimelineCard). */}
                <div className={`relative ${dayIndex === days.length - 1 ? "pb-6" : "pb-12"}`}>
                  {totalItems > 0 && (
                    <span aria-hidden="true" className="absolute left-[5px] top-2 bottom-0 w-px bg-gray-200" />
                  )}
                  <div className="space-y-4">
                    {/* Vervoer */}
                    {dayTransports.map((t) => {
                      const isArrival = isoDate(t.arrival_time) === dayStr && isoDate(t.departure_time) !== dayStr;
                      const time = isArrival ? t.arrival_time : t.departure_time;
                      return (
                        <TimelineCard
                          key={t.id + (isArrival ? "-a" : "-d")}
                          onClick={() => setEditingTransport(t)}
                          time={time ? new Date(time).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) : null}
                          icon={transportIcon(t.type)}
                          meta={[isArrival ? "Aankomst" : "Vertrek", t.booking_ref ? `#${t.booking_ref}` : null, t.cost ? fmtMoney(t.cost, trip.currency) : null].filter(Boolean).join(" · ")}
                          title={<>{t.from_location} → {t.to_location}{t.is_private && <Icon name="lock" size={12} className="inline text-gray-300 ml-1.5" />}</>}
                          subtitle={t.baggage_allowance || null}
                          trailing={t.to_location ? tipsButton(t.to_location) : null}
                        />
                      );
                    })}

                    {/* Verblijf */}
                    {dayAccommodations.map((a) => {
                      const isCheckIn = isoDate(a.check_in) === dayStr;
                      const isCheckOut = isoDate(a.check_out) === dayStr;
                      return (
                        <TimelineCard
                          key={a.id}
                          onClick={() => setEditingAccommodation(a)}
                          time={isCheckIn && isCheckOut ? "In & uit" : isCheckIn ? "Check-in" : "Check-out"}
                          icon="bed"
                          meta={a.cost ? fmtMoney(a.cost, trip.currency) : null}
                          title={<>{a.name}{a.is_private && <Icon name="lock" size={12} className="inline text-gray-300 ml-1.5" />}</>}
                          subtitle={a.address ? <MapsLink query={a.address} /> : null}
                          trailing={tipsButton(a.address || a.name)}
                        />
                      );
                    })}

                    {/* Activiteiten */}
                    {day.activities.map((act) => (
                      <TimelineCard
                        key={act.id}
                        onClick={() => setEditingActivity(act)}
                        time={act.time}
                        icon={categoryIcon(act.category)}
                        meta={[act.category || "Activiteit", act.cost ? fmtMoney(act.cost, trip.currency) : null].filter(Boolean).join(" · ")}
                        title={<>{act.title}{act.is_private && <Icon name="lock" size={12} className="inline text-gray-300 ml-1.5" />}</>}
                        subtitle={act.location ? <MapsLink query={act.location} /> : null}
                        aside={act.notes ? <div className="text-[15px] text-gray-500 mt-2 leading-relaxed">{act.notes}</div> : null}
                        trailing={!readOnly ? (
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteActivity(act); }}
                            className="rp-press w-10 h-10 rounded-xl flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                            aria-label="Verwijderen"><Icon name="trash" size={17} /></button>
                        ) : null}
                      />
                    ))}

                    {totalItems === 0 && !readOnly && (
                      <button onClick={() => setShowActivityForm({ dayId: day.id })}
                        className="rp-press w-full rounded-2xl py-6 text-[15px] font-medium text-gray-400 bg-white/60 hover:bg-white hover:text-gray-600 transition-colors">
                        + Iets toevoegen op deze dag
                      </button>
                    )}
                    {/* Vaste "+ Activiteit"-knop per dag zodra er al iets staat:
                        zo hoef je niet meer via het algemene Toevoegen-blad de
                        juiste dag te kiezen — een tik voegt meteen aan díe dag
                        toe. Bij een lege dag doet de grote knop hierboven dat al,
                        dus dan geen tweede knop. pl-8 lijnt 'm uit met de
                        kaartjes (langs de tijdlijn), niet met de stip ervoor. */}
                    {totalItems > 0 && !readOnly && (
                      <div className="pl-8">
                        <button onClick={() => setShowActivityForm({ dayId: day.id })}
                          className="rp-press inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full border border-gray-200 bg-white text-[13px] font-semibold text-gray-500 hover:text-sky-700 hover:border-sky-200 transition-colors">
                          <Icon name="plus" size={15} />Activiteit
                        </button>
                      </div>
                    )}
                    {totalItems === 0 && readOnly && (
                      <div className="text-[15px] text-gray-400 py-2">Niets gepland.</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showAddSheet && (
        <BottomSheet title="Toevoegen" subtitle="Wat wil je aan deze reis toevoegen?" onClose={() => setShowAddSheet(false)}>
          {addActions.map((a) => (
            <SheetAction key={a.key} icon={a.icon} label={a.label} description={a.description}
              onClick={() => { setShowAddSheet(false); a.run(); }} />
          ))}
        </BottomSheet>
      )}

      {showActivityForm && (
        <ActivityForm dayId={showActivityForm.dayId} tripId={trip.id} tripTimezone={trip.timezone} days={days}
          presetCategory={showActivityForm.category}
          onSaved={() => { setShowActivityForm(null); onRefresh(); }}
          onClose={() => setShowActivityForm(null)}
          onImport={() => { setShowActivityForm(null); setImporting(true); }} />
      )}
      {editingActivity && (
        <ActivityForm dayId={editingActivity.day_id} tripId={trip.id} tripTimezone={trip.timezone} initial={editingActivity} days={days}
          journalEntries={tripJournal.filter((e) => e.activity_id === editingActivity.id)} onJournalChange={loadJournal} currentUserId={currentUserId}
          onSaved={() => { setEditingActivity(null); onRefresh(); }}
          onClose={() => setEditingActivity(null)}
          onDelete={async () => { const act = editingActivity; setEditingActivity(null); await handleDeleteActivity(act); }} />
      )}
      {(editingTransport || addingTransport) && (
        <TransportForm tripId={trip.id} initial={editingTransport || undefined}
          onSaved={() => { setEditingTransport(null); setAddingTransport(false); onRefresh(); }}
          onClose={() => { setEditingTransport(null); setAddingTransport(false); }}
          onImport={() => { setEditingTransport(null); setAddingTransport(false); setImporting(true); }} />
      )}
      {(editingAccommodation || addingAccommodation) && (
        <AccommodationForm tripId={trip.id} initial={editingAccommodation || undefined}
          onSaved={() => { setEditingAccommodation(null); setAddingAccommodation(false); onRefresh(); }}
          onClose={() => { setEditingAccommodation(null); setAddingAccommodation(false); }}
          onImport={() => { setEditingAccommodation(null); setAddingAccommodation(false); setImporting(true); }} />
      )}
      {importing && <ImportModal tripId={trip.id} onImported={() => { setImporting(false); onRefresh(); }} onClose={() => setImporting(false)} />}
      {tipsLocation && (
        <TipsModal tripId={trip.id} trip={trip} location={tipsLocation} onClose={() => setTipsLocation(null)} />
      )}

      <ScrollTopButton />
    </div>
  );
}

// Apple's JS SDK is only on the login page; pull it in on demand so the app
// shell doesn't carry another blocking CDN script for a rarely-used action.
function loadAppleSdk() {
  if (window.AppleID) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("Apple kon niet worden geladen"));
    document.head.appendChild(el);
  });
}

// De VAPID-sleutel komt als base64url-tekst van de server, maar de Push API
// wil 'm als Uint8Array — standaard kost-wat-kost-conversie, hoort bij elke
// Web Push implementatie.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent);

// Gedeeld door de handmatige schakelaar hieronder en de automatische
// eerste-bezoek-prompt verderop: vraagt toestemming en registreert het
// abonnement bij de server. Gooit door bij weigering/fout — de aanroeper vangt
// dat zelf af.
async function subscribeToPush(publicKey) {
  const reg = await navigator.serviceWorker.ready;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Toestemming geweigerd");
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  await api.subscribePush(sub.toJSON());
  return sub;
}

// Vraagt automatisch, één keer per toestel, om pushtoestemming vlak nadat
// iemand inlogt — in plaats van te wachten tot iemand het zelf opzoekt in
// Account. Wie weigert of het wegklikt, wordt niet nogmaals gevraagd; de
// schakelaar in Account blijft daarna gewoon staan om het later alsnog aan te
// zetten. Toont zelf niets — de browser tekent zijn eigen dialoogje.
function AutoPushPrompt({ user }) {
  useEffect(() => {
    if (!user) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
    const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    if (IS_IOS && !standalone) return; // buiten de geïnstalleerde app werkt dit op iOS toch niet

    let alreadyPrompted = false;
    try { alreadyPrompted = localStorage.getItem("rp_push_autoprompted") === "1"; } catch {}
    if (alreadyPrompted) return;

    let cancelled = false;
    const markDone = () => { try { localStorage.setItem("rp_push_autoprompted", "1"); } catch {} };

    (async () => {
      try {
        const cfg = await api.getPushPublicKey();
        if (cancelled) return;
        if (!cfg.key) return; // server nog niet geconfigureerd — dan later nog eens proberen
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (existing) { markDone(); return; }
        if (Notification.permission === "denied") { markDone(); return; }
        await subscribeToPush(cfg.key);
        markDone();
      } catch {
        markDone();
      }
    })();

    return () => { cancelled = true; };
  }, [user]);

  return null;
}

// Pushmeldingen zijn per toestel/browser, niet per account — de knop laat dus
// zien of DIT toestel een actief abonnement heeft, niet een serverbrede
// voorkeur zoals de e-mail-toggle hierboven.
function PushToggle() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [publicKey, setPublicKey] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
      try {
        const cfg = await api.getPushPublicKey();
        if (!cfg.key) return; // server heeft geen VAPID-sleutels ingesteld
        setPublicKey(cfg.key);
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
        setSupported(true);
      } catch {}
    })();
  }, []);

  async function toggle(e) {
    const next = e.target.checked;
    setBusy(true); setError(null);
    try {
      if (next) {
        await subscribeToPush(publicKey);
        setSubscribed(true);
      } else {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) { await api.unsubscribePush(sub.endpoint); await sub.unsubscribe(); }
        setSubscribed(false);
      }
    } catch (err) {
      setError(err.message || "Instellen mislukt");
    } finally { setBusy(false); }
  }

  if (!supported) return IS_IOS ? (
    <p className="text-xs text-gray-400 mt-2 leading-relaxed">
      Pushmeldingen op iPhone kunnen alleen als de app op je beginscherm staat: deel-icoon → "Zet op beginscherm".
    </p>
  ) : null;

  return (
    <div className="mt-2">
      <label className="flex items-center gap-3 text-sm px-3 py-2 rounded-lg bg-gray-50 cursor-pointer">
        <input type="checkbox" checked={subscribed} disabled={busy} onChange={toggle} />
        <span className="flex-1">Pushmeldingen op dit toestel</span>
      </label>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

function AccountModal({ user, onClose, onChanged, onLogout }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [mailBusy, setMailBusy] = useState(false);
  const [mailResult, setMailResult] = useState(null);
  const [notify, setNotify] = useState(user.notify_email !== false);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const linked = user.linked || {};

  async function linkApple() {
    setBusy(true); setError(null);
    try {
      await loadAppleSdk();
      const cfg = await fetch("/auth/apple/client-id").then((r) => r.json());
      if (!cfg.clientId) throw new Error("Apple Sign In is niet geconfigureerd op de server.");
      window.AppleID.auth.init({
        clientId: cfg.clientId, scope: "name email",
        redirectURI: window.location.origin + "/auth/apple/callback", usePopup: true,
      });
      const response = await window.AppleID.auth.signIn();
      const idToken = response.authorization?.id_token;
      if (!idToken) throw new Error("Apple stuurde geen token.");
      const res = await fetch("/auth/apple/link", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: idToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Koppelen mislukt");
      setDone(true);
      await onChanged();
    } catch (err) {
      if (err && (err.error === "popup_closed_by_user" || err.error === "user_trigger_new_signin_flow")) {
        // dismissed — say nothing
      } else setError(err.message || "Koppelen mislukt");
    } finally { setBusy(false); }
  }

  return (
    <Modal title="Account" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          {user.avatar
            ? <img src={user.avatar} alt="" className="w-12 h-12 rounded-full" />
            : <div className="w-12 h-12 rounded-full bg-sky-100 text-gray-800 flex items-center justify-center font-semibold">{(user.given_name || user.name || "?")[0].toUpperCase()}</div>}
          <div className="min-w-0">
            <div className="font-semibold text-gray-800 truncate">{user.name || "—"}</div>
            <div className="text-xs text-gray-500 truncate">{user.email || "geen e-mailadres bekend"}</div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Inlogmethoden</label>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-gray-50">
              <Icon name="google" size={17} /><span className="flex-1">Google</span>
              <span className={linked.google ? "text-green-600 text-xs font-semibold" : "text-gray-400 text-xs"}>
                {linked.google ? "gekoppeld" : "niet gekoppeld"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-gray-50">
              <span></span><span className="flex-1">Apple</span>
              {linked.apple || done ? (
                <span className="text-green-600 text-xs font-semibold">gekoppeld</span>
              ) : (
                <Button onClick={linkApple} disabled={busy} className="!text-xs !px-2.5 !py-1">
                  {busy ? "Bezig..." : "Koppelen"}
                </Button>
              )}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Notificaties</label>
          <label className="flex items-center gap-3 text-sm px-3 py-2 rounded-lg bg-gray-50 cursor-pointer">
            <input type="checkbox" checked={notify} disabled={notifyBusy}
              onChange={async (e) => {
                const next = e.target.checked;
                setNotify(next); setNotifyBusy(true);
                try { await api.setNotifyEmail(next); await onChanged(); }
                catch { setNotify(!next); }
                finally { setNotifyBusy(false); }
              }} />
            <span className="flex-1">Mail me bij nieuwe verhalen, foto's en reacties</span>
          </label>
          <PushToggle />
        </div>

        {user.is_admin && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Testmail</label>
            <Button variant="secondary" disabled={mailBusy} onClick={async () => {
              setMailBusy(true); setMailResult(null);
              try {
                const r = await api.sendTestMail();
                setMailResult({ ok: true, text: `Testmail verstuurd naar ${r.to} via ${r.provider}.` });
              } catch (err) {
                setMailResult({ ok: false, text: err.message || "Versturen mislukt" });
              } finally { setMailBusy(false); }
            }}>{mailBusy ? "Versturen..." : <><Icon name="mail" size={14} className="mr-1.5" />Testmail sturen</>}</Button>
            {mailResult && (
              <div className={`mt-2 text-sm px-3 py-2 rounded-lg ${mailResult.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                {mailResult.text}
              </div>
            )}
          </div>
        )}

        {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
        {done && <div className="bg-green-50 text-green-700 text-sm px-3 py-2 rounded-lg">Apple is gekoppeld. Je kunt voortaan met Apple inloggen op dit account, ook met een verborgen e-mailadres.</div>}

        {!linked.apple && !done && (
          <p className="text-xs text-gray-500 leading-relaxed">
            Koppel Apple terwijl je hier ingelogd bent. Doe je dat niet en log je later met Apple in met een
            verborgen e-mailadres, dan kan de app je niet herkennen en krijg je een leeg account.
          </p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button type="button" onClick={onLogout}
            className="rp-press text-[15px] font-semibold text-gray-500 hover:text-red-600 px-3 h-11 rounded-xl hover:bg-red-50 transition-colors">
            Uitloggen
          </button>
          <div className="flex-1" />
          <Button variant="secondary" onClick={onClose}>Sluiten</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Journal (dagboek) ----------
function LikeButton({ tripId, target, count, liked, onChanged, disabled }) {
  const [busy, setBusy] = useState(false);
  async function toggle(e) {
    e.stopPropagation();
    if (busy || disabled) return;
    setBusy(true);
    try { await api.toggleJournalLike(tripId, target); await onChanged(); }
    catch (err) { alert(err.message || "Liken mislukt"); }
    finally { setBusy(false); }
  }
  return (
    <button type="button" onClick={toggle} disabled={busy || disabled}
      className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-colors disabled:opacity-50 ${
        liked ? "bg-sky-50 border-sky-300 text-sky-700" : "bg-white border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300"
      }`}
      title={liked ? "Like weghalen" : "Vind ik leuk"}>
      <Icon name="thumb" size={14} />
      {count > 0 && <span className="font-semibold leading-none">{count}</span>}
    </button>
  );
}


// Reactions under a story. Read-only members can post these — it is the one
// write a viewer is allowed, so family following a trip can respond.
function JournalComments({ slot, comments, like, tripId, currentUserId, isOwner, onChanged }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleAdd(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true); setError(null);
    try {
      await api.addJournalComment(tripId, { ...slot, body: text.trim() });
      setText(""); setOpen(false);
      await onChanged();
    } catch (err) { setError(err.message || "Reactie plaatsen mislukt"); }
    finally { setSaving(false); }
  }

  async function handleDelete(id) {
    if (!confirm("Reactie verwijderen?")) return;
    try { await api.deleteJournalComment(id); await onChanged(); }
    catch (err) { alert(err.message || "Verwijderen mislukt"); }
  }

  return (
    <div className="mt-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
      {comments.map((c) => (
        <div key={c.id} className={`group flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-sm ${c.is_new ? "bg-sky-50 border border-sky-200" : "bg-gray-50"}`}>
          <Icon name="chat" size={13} className="mt-0.5 text-gray-400" />
          <div className="min-w-0 flex-1">
            <p className="text-gray-700 whitespace-pre-wrap leading-snug break-words">{c.body}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-[11px] text-gray-400">
                {c.author || "Iemand"}{c.created_at ? ` · ${fmtDatetime(c.created_at)}` : ""}
              </span>
              {currentUserId && (
                <LikeButton tripId={tripId} target={{ comment_id: c.id }}
                  count={c.like_count || 0} liked={!!c.liked_by_me} onChanged={onChanged} />
              )}
            </div>
          </div>
          {(c.user_id === currentUserId || isOwner) && (
            <button type="button" onClick={() => handleDelete(c.id)}
              className="shrink-0 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
              aria-label="Reactie verwijderen">
              <Icon name="trash" size={14} />
            </button>
          )}
        </div>
      ))}

      {error && <div className="text-xs text-red-600">{error}</div>}

      {currentUserId && !open && (
        <div className="flex items-center gap-2">
          <LikeButton tripId={tripId} target={slot} count={like.like_count} liked={like.liked_by_me} onChanged={onChanged} />
          <button type="button" onClick={() => setOpen(true)}
            className="text-xs text-gray-400 hover:text-sky-600 transition-colors">
            <Icon name="chat" size={13} className="mr-1.5" />{comments.length ? "Reageer ook" : "Reageer"}
          </button>
        </div>
      )}

      {!currentUserId ? null : open ? (
        <form onSubmit={handleAdd} className="space-y-1.5">
          <Textarea rows={2} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Schrijf een reactie..." />
          <div className="flex gap-2">
            <Button type="submit" disabled={saving || !text.trim()}>{saving ? "Plaatsen..." : "Plaatsen"}</Button>
            <Button type="button" variant="secondary" onClick={() => { setOpen(false); setText(""); setError(null); }}>Annuleren</Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}


function JournalEntryBox({ entries, currentUserId, isOwner, placeholder, onSave, onDelete, onCommentsChange, reactions, photos, tripId, dayId, activityId, transportId, accommodationId, onPhotosChange, readOnly, days, transports, accommodations, showPhotos = true, comments, slotLikes }) {
  const allEntries = entries || [];
  const myEntry = currentUserId ? allEntries.find((e) => e.user_id === currentUserId) : allEntries[0] || null;
  const othersEntries = currentUserId ? allEntries.filter((e) => e.user_id !== currentUserId) : [];

  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(myEntry?.body || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!editing) setText(myEntry?.body || ""); }, [myEntry?.body, editing]);

  async function handleSave() {
    if (!text.trim()) return;
    setSaving(true);
    try { await onSave(text.trim()); setEditing(false); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!confirm("Verhaal verwijderen?")) return;
    await onDelete(myEntry.id);
    setText(""); setEditing(false);
  }


  return (
    <div className="space-y-2">
      {othersEntries.map((e) => (
        <div key={e.id} className={`rounded-lg px-3 py-2 ${e.is_new ? "bg-sky-50 border border-sky-200" : "bg-gray-50"}`}>
          <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{e.body}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {e.author && <span className="text-xs text-gray-400">— {e.author}</span>}
            {e.is_new && (
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] px-2 py-0.5 rounded-full bg-sky-400 text-gray-900">Nieuw</span>
            )}
          </div>
        </div>
      ))}

      {editing ? (
        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
          <Textarea rows={4} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} />
          <div className="flex items-center gap-2">
            <Button onClick={handleSave} disabled={saving || !text.trim()}>{saving ? "Opslaan..." : "Opslaan"}</Button>
            <Button variant="secondary" onClick={() => { setText(myEntry?.body || ""); setEditing(false); }}>Annuleren</Button>
            {myEntry && <button type="button" onClick={handleDelete} className="ml-auto text-xs text-red-500 hover:text-red-700"><Icon name="trash" size={14} className="mr-1.5" />Verwijderen</button>}
          </div>
        </div>
      ) : myEntry?.body ? (
        <div onClick={(e) => e.stopPropagation()} className="group">
          <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{myEntry.body}</p>
          <div className="flex items-center gap-2 mt-1">
            {myEntry.author && currentUserId && <span className="text-xs text-gray-400">— {myEntry.author}</span>}
            {!readOnly && (
              <button type="button" onClick={() => setEditing(true)}
                className="ml-auto text-xs text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">
                <Icon name="pen" size={14} className="mr-1.5" />Bewerken
              </button>
            )}
          </div>
        </div>
      ) : readOnly ? null : (
        <button type="button" onClick={(e) => { e.stopPropagation(); setEditing(true); }}
          className="text-xs text-gray-400 hover:text-sky-600 italic transition-colors">
          + {othersEntries.length > 0 ? "Jouw verhaal toevoegen" : "Verhaal schrijven"}
        </button>
      )}

      {reactions && tripId != null && (
        <JournalComments slot={reactions.slot} comments={reactions.comments} like={reactions.like}
          tripId={tripId} currentUserId={currentUserId} isOwner={isOwner} onChanged={onCommentsChange} />
      )}

      {showPhotos && tripId != null && (photos?.length > 0 || !readOnly) && (
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          <PhotoStrip photos={photos || []} tripId={tripId} dayId={dayId} activityId={activityId} transportId={transportId} accommodationId={accommodationId} onChange={onPhotosChange} readOnly={readOnly}
            days={days} transports={transports} accommodations={accommodations} large
            comments={comments} slotLikes={slotLikes} currentUserId={currentUserId} isOwner={isOwner} onCommentsChange={onCommentsChange} />
        </div>
      )}
    </div>
  );
}

// Naam van een activiteit in het dagboek — tikken zet ‘m om in een tekstveld,
// Enter/weg-klikken slaat op, Escape annuleert. Alleen de titel gaat mee in
// het PUT-verzoek, maar de server verwacht de hele activiteit terug (anders
// verdwijnen tijd/locatie/notities/categorie stilletjes) — vandaar dat we
// hier de volledige activiteit doorsturen met alleen de titel vervangen.
function JournalActivityTitle({ act, readOnly, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(act.title || "");
  const inputRef = useRef(null);

  useEffect(() => { if (!editing) setValue(act.title || ""); }, [act.title, editing]);
  useEffect(() => { if (editing) { inputRef.current?.focus(); inputRef.current?.select(); } }, [editing]);

  async function commit() {
    const trimmed = value.trim();
    setEditing(false);
    if (!trimmed || trimmed === act.title) { setValue(act.title || ""); return; }
    try { await onSave(trimmed); } catch { setValue(act.title || ""); }
  }

  if (editing) {
    return (
      <input ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)} onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          else if (e.key === "Escape") { setValue(act.title || ""); setEditing(false); }
        }}
        className="text-sm font-bold text-gray-600 bg-white border border-sky-300 rounded px-1.5 -my-0.5 -ml-1.5 focus:outline-none focus:ring-1 focus:ring-sky-400"
        style={{ minWidth: "6rem" }} />
    );
  }
  return (
    <span onClick={() => !readOnly && setEditing(true)} title={readOnly ? undefined : "Klik om te wijzigen"}
      className={readOnly ? "" : "cursor-pointer hover:text-sky-600 transition-colors rounded px-0.5 -mx-0.5"}>
      {act.title}
    </span>
  );
}

function JournalTab({ trip, days, transports, accommodations, readOnly, currentUserId, onRefresh, onPreviewViewer, onShare, onGoToPlanning }) {
  const [entries, setEntries] = useState([]);
  const [comments, setComments] = useState([]);
  const [slotLikes, setSlotLikes] = useState({});
  const [tripPhotos, setTripPhotos] = useState([]);
  const [addingActivity, setAddingActivity] = useState(null);
  const [entriesLoaded, setEntriesLoaded] = useState(false);
  const didAutoScroll = useRef(false);
  const accent = trip.cover_color || PALETTE.primary;

  const loadEntries = useCallback(async () => {
    try {
      const d = await api.getJournal(trip.id);
      setEntries(asList(d.entries));
      setComments(asList(d.comments));
      setSlotLikes(d.slot_likes || {});
    } catch {}
    finally { setEntriesLoaded(true); }
  }, [trip.id]);
  useEffect(() => { loadEntries(); }, [loadEntries]);

  const loadPhotos = useCallback(async () => {
    try { setTripPhotos(await api.getPhotos(trip.id)); } catch {}
  }, [trip.id]);
  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  const isoDate = (dt) => dt ? String(dt).slice(0, 10) : null;

  async function saveEntry(target, text) {
    await api.saveJournalEntry(trip.id, { ...target, body: text });
    await loadEntries();
  }
  async function deleteEntry(entryId) {
    await api.deleteJournalEntry(entryId);
    await loadEntries();
  }

  const todayDay = days.find((d) => isoDate(d.date) === todayIso(trip.timezone));

  // Land on today when the dagboek opens — that is the entry you came to read
  // or write. Guarded so it happens once per trip: re-running it after every
  // refresh would yank you back to today mid-scroll whenever a comment or photo
  // reloaded the entries.
  useEffect(() => { didAutoScroll.current = false; }, [trip.id]);
  useEffect(() => {
    if (didAutoScroll.current || !entriesLoaded || !todayDay) return;
    didAutoScroll.current = true;
    requestAnimationFrame(() => {
      document.getElementById(`journal-day-${todayDay.id}`)?.scrollIntoView({ block: "start" });
    });
  }, [entriesLoaded, todayDay, trip.id]);

  function scrollToToday() {
    if (!todayDay) return;
    document.getElementById(`journal-day-${todayDay.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Anything written by someone else since this user's previous visit. The
  // server decides what counts as "previous visit" — see advanceJournalRead.
  const newCount = entries.filter((e) => e.is_new).length + comments.filter((c) => c.is_new).length;
  // Entries/comments come in chronological (created_at ASC) order, so a plain
  // .find() lands on the OLDEST new item — the opposite of what "nieuw" should
  // jump to. Sort the combined new items newest-first instead.
  const newestFirst = [
    ...entries.filter((e) => e.is_new).map((e) => ({ ...e, _ts: e.updated_at || e.created_at })),
    ...comments.filter((c) => c.is_new).map((c) => ({ ...c, _ts: c.created_at })),
  ].sort((a, b) => new Date(b._ts) - new Date(a._ts));
  const latestNew = newestFirst[0];
  function scrollToFirstNew() {
    if (!latestNew) return;
    // Een reactie op een foto draagt zelf geen dag/activiteit-koppeling — die
    // zit op de foto waar hij op reageert. Zonder deze stap kan zo'n reactie
    // nooit naar een dag herleid worden en doet de knop stilzwijgend niets.
    const photo = latestNew.photo_id && tripPhotos.find((p) => p.id === latestNew.photo_id);
    const effective = photo ? {
      day_id: latestNew.day_id || photo.day_id,
      activity_id: latestNew.activity_id || photo.activity_id,
      transport_id: latestNew.transport_id || photo.transport_id,
      accommodation_id: latestNew.accommodation_id || photo.accommodation_id,
    } : latestNew;
    // Vervoer/verblijf hebben geen eigen kaart meer in het dagboek — val terug
    // op de dag waar het item bij hoort, zodat een "nieuw" op zo'n item nog
    // ergens naartoe kan scrollen.
    const transport = effective.transport_id && transports.find((t) => t.id === effective.transport_id);
    const accommodation = effective.accommodation_id && accommodations.find((a) => a.id === effective.accommodation_id);
    const fallbackDateStr = transport ? isoDate(transport.departure_time || transport.arrival_time)
      : accommodation ? isoDate(accommodation.check_in)
      : null;
    const dayId = effective.day_id
      || days.find((d) => (d.activities || []).some((a) => a.id === effective.activity_id))?.id
      || days.find((d) => isoDate(d.date) === fallbackDateStr)?.id;
    document.getElementById(`journal-day-${dayId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Everything a block needs to show and post reactions for its own slot.
  const reactionsFor = (slot) => {
    const [col, id] = Object.entries(slot)[0];
    return {
      slot,
      comments: comments.filter((c) => c[col] === id),
      like: slotLikes[`${col}:${id}`] || { like_count: 0, liked_by_me: false },
    };
  };

  if (days.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <Icon name="book" size={40} strokeWidth={1.2} className="mx-auto mb-3 text-gray-300" />
        <div className="font-medium">Nog geen dagen gepland</div>
        <div className="text-sm mt-1">Het dagboek volgt de dagen van je reis. Zodra die er zijn, kun je hier schrijven.</div>
        {onGoToPlanning && (
          <Button onClick={onGoToPlanning} className="mt-4 !w-auto !inline-flex">
            <Icon name="calendar" size={17} />Naar de dagplanning
          </Button>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-2 flex-wrap">
        <h3 className="font-display text-[21px] text-gray-800">Dagboek</h3>
        <div className="flex gap-2 flex-wrap w-full sm:w-auto sm:justify-end">
          {newCount > 0 && (
            <button onClick={scrollToFirstNew}
              className="text-xs font-semibold px-3 py-1.5 rounded-full bg-sky-300 text-gray-800 hover:bg-sky-200 transition-colors inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-white" /><span className="tnum">{newCount}</span> nieuw
            </button>
          )}
          {!readOnly && todayDay && (
            <Button onClick={() => setAddingActivity({ dayId: todayDay.id })}>+ Activiteit vandaag</Button>
          )}
          {todayDay && <Button onClick={scrollToToday} variant="secondary"><Icon name="pin" size={14} className="mr-1.5" />Vandaag</Button>}
          {onShare && !readOnly && (
            <Button onClick={onShare} variant="secondary"><Icon name="share" size={14} className="mr-1.5" />Delen</Button>
          )}
          {onPreviewViewer && !readOnly && (
            <Button onClick={onPreviewViewer} variant="secondary"><Icon name="eye" size={14} className="mr-1.5" />Bekijk als gast</Button>
          )}
        </div>
      </div>
      <JournalOverviewMap trip={trip} days={days} photos={tripPhotos} accommodations={accommodations} />
      <div className="space-y-4">
        {(() => {
          // Claim each transport/accommodation on the first day it matches
          // (departure/check-in, falling back to arrival/check-out) and never
          // again — guards against multi-day items AND duplicate day rows
          // that share a date, either of which would otherwise render the
          // same journal entry twice on the timeline.
          const claimedTransportIds = new Set();
          const claimedAccommodationIds = new Set();
          // Match on EITHER date, so an item whose preferred date has no day row
          // (e.g. a flight departing the evening before the trip's first day)
          // still shows up — the claimed-set is what prevents the second match
          // from rendering it again.
          const matchesDay = (a, b, dayStr) => isoDate(a) === dayStr || isoDate(b) === dayStr;
          // Where you sleep that night — the same rule the planning tab uses, so
          // the dagboek reads with the same sense of place.
          const nightAccommodationOn = (ds) => ds ? accommodations.find((a) => {
            if (!a.check_in || !a.check_out) return false;
            return isoDate(a.check_in) <= ds && isoDate(a.check_out) > ds;
          }) : null;
          return days.map((day) => {
          const dayStr = day.date ? day.date.slice(0, 10) : null;
          const dayTransports = transports.filter((t) => {
            if (claimedTransportIds.has(t.id)) return false;
            if (!matchesDay(t.departure_time, t.arrival_time, dayStr)) return false;
            claimedTransportIds.add(t.id);
            return true;
          });
          const dayAccommodations = accommodations.filter((a) => {
            if (claimedAccommodationIds.has(a.id)) return false;
            if (!matchesDay(a.check_in, a.check_out, dayStr)) return false;
            claimedAccommodationIds.add(a.id);
            return true;
          });
          const dayEntries = entries.filter((e) => e.day_id === day.id);
          const d = day.date ? new Date(day.date) : null;
          const dayNum = d ? d.getUTCDate() : "?";
          const dayName = d ? DAY_NAMES[d.getUTCDay()] : "";
          const monthName = d ? MONTH_NAMES[d.getUTCMonth()] : "";
          const hasSubItems = day.activities.length > 0;
          const nightAccommodation = nightAccommodationOn(dayStr);
          // De kalenderdag ervoor, niet "de vorige rij in de lijst" — een
          // verwijderde tussenliggende dag zou anders het verblijf van een dag
          // eerder tonen dan de werkelijke vorige nacht.
          const prevDayStr = dayStr ? new Date(new Date(dayStr + "T00:00:00Z").getTime() - 86400000).toISOString().slice(0, 10) : null;
          const prevNightAccommodation = prevDayStr ? nightAccommodationOn(prevDayStr) : null;
          const isToday = dayStr === todayIso(trip.timezone);
          const isYesterday = dayStr === yesterdayIso(trip.timezone);

          // Kaartje alleen bij vandaag en gisteren — de dagen die je nog vers
          // bijhoudt — en zodra er minstens één bezochte plek is (het verblijf
          // zelf telt hier niet in mee, dat komt er sowieso apart bij).
          // Telt alle foto's die ergens op déze dag horen: los op de dag zelf,
          // of aan een activiteit/vervoer/verblijf van die dag.
          let dayPlaces = [];
          if (isToday || isYesterday) {
            const dayPhotoSet = tripPhotos.filter((p) =>
              (p.day_id === day.id && !p.activity_id && !p.transport_id && !p.accommodation_id)
              || dayTransports.some((t) => t.id === p.transport_id)
              || dayAccommodations.some((a) => a.id === p.accommodation_id)
              || day.activities.some((act) => act.id === p.activity_id));
            dayPlaces = labelPlaces(clusterPhotoPlaces(dayPhotoSet), day.activities);
          }
          const showDayMap = dayPlaces.length > 0;

          return (
            <div key={day.id} id={`journal-day-${day.id}`} className="rounded-2xl border border-gray-100 shadow-sm bg-white" style={{ scrollMarginTop: "5rem" }}>
              {/* Blijft bovenin staan zolang er nog entries van déze dag in
                  beeld zijn, en schuift dan weg zodra de volgende dag begint —
                  zo weet je bij veel verhalen per dag altijd welke dag je leest. */}
              <div className="sticky z-10 flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white rounded-t-2xl"
                style={{ top: "calc(3rem + env(safe-area-inset-top))" }}>
                {/* Zelfde dagmarkering als op de planning, zodat de twee schermen
                    familie van elkaar blijven zonder identiek te zijn. */}
                <div className="shrink-0 text-right" style={{ width: "2.6rem" }}>
                  <div className={`font-display text-[28px] leading-none tnum ${isToday ? "text-sky-400" : "text-gray-800"}`}>{dayNum}</div>
                  <div className={`text-[9px] uppercase tracking-[0.12em] font-semibold mt-0.5 whitespace-nowrap ${isToday ? "text-sky-400" : "text-gray-400"}`}>
                    {dayName} {monthName}
                  </div>
                </div>
                <div className="min-w-0 border-l border-gray-200 pl-3 self-stretch flex flex-col justify-center">
                  <div className="flex items-center gap-2">
                    {isToday && (
                      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-sky-400 shrink-0">Vandaag</span>
                    )}
                    {day.title && <div className="font-display text-gray-800 text-[17px] truncate">{day.title}</div>}
                  </div>
                </div>
                {!readOnly && (
                  <button onClick={() => setAddingActivity({ dayId: day.id })}
                    className="ml-auto shrink-0 text-xs font-semibold px-3 py-2 rounded-full border border-gray-200 text-gray-600 hover:border-sky-300 hover:text-sky-700 active:scale-95 transition-all inline-flex items-center gap-1">
                    <Icon name="plus" size={13} />Activiteit
                  </button>
                )}
              </div>

              <div className="p-4 space-y-4">
                {nightAccommodation && (
                  <AccommodationTransition current={nightAccommodation} previous={prevNightAccommodation} date={dayStr} />
                )}
                {showDayMap && (
                  <div>
                    <div className="text-xs font-semibold text-gray-500 mb-1.5">
                      De locaties van {isToday ? "vandaag" : "gisteren"}:
                    </div>
                    <DayMiniMap places={dayPlaces} accommodation={nightAccommodation} />
                  </div>
                )}
                <JournalEntryBox entries={dayEntries} currentUserId={currentUserId} isOwner={trip.is_owner} placeholder="Hoe was deze dag?"
                  onSave={(text) => saveEntry({ day_id: day.id }, text)}
                  onDelete={deleteEntry} onCommentsChange={loadEntries}
                  photos={tripPhotos.filter((p) => p.day_id === day.id && !p.activity_id && !p.transport_id && !p.accommodation_id)}
                  tripId={trip.id} dayId={day.id} onPhotosChange={loadPhotos} readOnly={readOnly}
                  reactions={reactionsFor({ day_id: day.id })}
                  comments={comments} slotLikes={slotLikes}
                  days={days} transports={transports} accommodations={accommodations} />

                {hasSubItems && (
                  <div className="pt-3 space-y-3 border-t border-gray-50">
                    {day.activities.map((act) => {
                      const actEntries = entries.filter((e) => e.activity_id === act.id);
                      return (
                        <div key={"act" + act.id} id={`journal-activity-${act.id}`} className="pl-3 border-l border-gray-200" style={{ scrollMarginTop: "5rem" }}>
                          <div className="text-sm font-bold text-gray-600 mb-1.5 flex items-center gap-1.5">
                            <Icon name={categoryIcon(act.category)} size={13} className="text-gray-400 shrink-0" />
                            <JournalActivityTitle act={act} readOnly={readOnly}
                              onSave={async (title) => { await api.updateActivity(act.id, { ...act, title }); onRefresh?.(); }} />
                          </div>
                          <JournalEntryBox entries={actEntries} currentUserId={currentUserId} isOwner={trip.is_owner} placeholder={`Vertel over ${act.title}...`}
                            onSave={(text) => saveEntry({ activity_id: act.id }, text)}
                            onDelete={deleteEntry} onCommentsChange={loadEntries}
                            photos={tripPhotos.filter((p) => p.activity_id === act.id)}
                            tripId={trip.id} dayId={day.id} activityId={act.id} onPhotosChange={loadPhotos} readOnly={readOnly}
                            reactions={reactionsFor({ activity_id: act.id })}
                            comments={comments} slotLikes={slotLikes}
                            days={days} transports={transports} accommodations={accommodations} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
          });
        })()}
      </div>

      {addingActivity && (
        <ActivityForm dayId={addingActivity.dayId} tripId={trip.id} tripTimezone={trip.timezone} days={days} showPhotos
          stayOpenAfterCreate
          onCreated={onRefresh}
          photos={tripPhotos} onPhotosChange={loadPhotos}
          journalEntries={entries} onJournalChange={loadEntries} currentUserId={currentUserId}
          onSaved={() => { setAddingActivity(null); onRefresh?.(); }}
          onClose={() => setAddingActivity(null)} />
      )}

      <ScrollTopButton />
    </div>
  );
}

// ---------- Accommodation tab ----------
function AccommodationTab({ trip, accommodations, onRefresh, readOnly, currentUserId }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState(false);
  const [journal, setJournal] = useState([]);
  const [tripPhotos, setTripPhotos] = useState([]);

  const loadJournal = useCallback(async () => {
    try { setJournal(asList((await api.getJournal(trip.id)).entries)); } catch {}
  }, [trip.id]);
  useEffect(() => { loadJournal(); }, [loadJournal]);

  const loadPhotos = useCallback(async () => {
    try { setTripPhotos(await api.getPhotos(trip.id)); } catch {}
  }, [trip.id]);
  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  async function handleDelete(a) {
    await api.deleteAccommodation(a.id);
    onRefresh();
    toonMelding(`"${a.name}" verwijderd`, {
      label: "Ongedaan maken",
      run: async () => {
        await api.addAccommodation(trip.id, {
          name: a.name, check_in: a.check_in, check_out: a.check_out, address: a.address,
          booking_ref: a.booking_ref, cost: a.cost, notes: a.notes, is_private: a.is_private,
        });
        onRefresh();
      },
    });
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-display text-[21px] text-gray-800">Accommodaties</h3>
        {!readOnly && <Button onClick={() => setShowForm(true)} variant="secondary">+ Verblijf toevoegen</Button>}
      </div>

      {accommodations.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Icon name="bed" size={34} strokeWidth={1.2} className="mx-auto mb-3 text-gray-300" />
          <div>Nog geen verblijven toegevoegd</div>
        </div>
      ) : (
        <div className="space-y-3">
          {accommodations.map((acc) => {
            const nights = (acc.check_in && acc.check_out)
              ? Math.round((new Date(acc.check_out) - new Date(acc.check_in)) / 86400000)
              : null;
            const perNight = nights > 0 && acc.cost ? Number(acc.cost) / nights : null;
            return (
            <div key={acc.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 group">
              <div className="flex gap-4 items-start">
                <Icon name="bed" size={20} className="text-gray-400 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-gray-800">{acc.name}</div>
                  {acc.address && <div className="text-sm text-gray-500 flex items-center gap-1"><Icon name="pin" size={13} />{acc.address}</div>}
                  <div className="flex gap-4 mt-1 text-sm text-gray-500 flex-wrap">
                    {acc.check_in && <span>Check-in: {fmt(acc.check_in)}</span>}
                    {acc.check_out && <span>Check-out: {fmt(acc.check_out)}</span>}
                    {acc.booking_ref && <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">#{acc.booking_ref}</span>}
                  </div>
                  {acc.cost && (
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="font-medium text-sm" style={{ color: PALETTE.coralDeep }}>{fmtMoney(acc.cost, trip.currency)}</span>
                      {perNight && nights && (
                        <span className="text-xs text-gray-400">· {nights} {nights === 1 ? "nacht" : "nachten"} · <span className="text-gray-500 font-medium">{fmtMoney(perNight, trip.currency)}/nacht</span></span>
                      )}
                    </div>
                  )}
                  {acc.notes && <div className="text-sm text-gray-500 mt-1">{acc.notes}</div>}
                </div>
                <div className={readOnly ? "flex gap-1" : "opacity-0 group-hover:opacity-100 flex gap-1"}>
                  <button onClick={() => setEditing(acc)} className="text-gray-400 hover:text-sky-600"><Icon name={readOnly ? "eye" : "pen"} size={16} /></button>
                  {!readOnly && <button onClick={() => handleDelete(acc)} className="text-gray-400 hover:text-red-500" aria-label="Verwijderen"><Icon name="trash" size={16} /></button>}
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {showForm && <AccommodationForm tripId={trip.id} onSaved={() => { setShowForm(false); onRefresh(); }} onClose={() => setShowForm(false)} onImport={() => { setShowForm(false); setImporting(true); }} />}
      {editing && (
        <AccommodationForm tripId={trip.id} initial={editing}
          journalEntries={journal.filter((e) => e.accommodation_id === editing.id)} onJournalChange={loadJournal} currentUserId={currentUserId}
          photos={tripPhotos} onPhotosChange={loadPhotos} readOnly={readOnly} showPhotos
          onSaved={() => { setEditing(null); onRefresh(); }} onClose={() => setEditing(null)} />
      )}
      {importing && <ImportModal tripId={trip.id} onImported={() => { setImporting(false); onRefresh(); }} onClose={() => setImporting(false)} />}
    </div>
  );
}

// ---------- Transport tab ----------
const TRANSPORT_ICONS = { Vliegtuig: "plane", Trein: "train", Bus: "bus", Huurauto: "car", Taxi: "car", Boot: "boat", Anders: "route" };
function transportIcon(type) { return TRANSPORT_ICONS[type] || "route"; }

function TransportTab({ trip, transports, onRefresh, readOnly, currentUserId }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState(false);
  const [journal, setJournal] = useState([]);
  const [tripPhotos, setTripPhotos] = useState([]);

  const loadJournal = useCallback(async () => {
    try { setJournal(asList((await api.getJournal(trip.id)).entries)); } catch {}
  }, [trip.id]);
  useEffect(() => { loadJournal(); }, [loadJournal]);

  const loadPhotos = useCallback(async () => {
    try { setTripPhotos(await api.getPhotos(trip.id)); } catch {}
  }, [trip.id]);
  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  async function handleDelete(t) {
    await api.deleteTransport(t.id);
    onRefresh();
    toonMelding(`${t.from_location || "Vervoer"} → ${t.to_location || ""} verwijderd`.trim(), {
      label: "Ongedaan maken",
      run: async () => {
        await api.addTransport(trip.id, {
          type: t.type, from_location: t.from_location, to_location: t.to_location,
          departure_time: t.departure_time, arrival_time: t.arrival_time, booking_ref: t.booking_ref,
          cost: t.cost, notes: t.notes, baggage_allowance: t.baggage_allowance, is_private: t.is_private,
        });
        onRefresh();
      },
    });
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-display text-[21px] text-gray-800">Vervoer</h3>
        {!readOnly && <Button onClick={() => setShowForm(true)} variant="secondary">+ Vervoer toevoegen</Button>}
      </div>

      {transports.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Icon name="plane" size={34} strokeWidth={1.2} className="mx-auto mb-3 text-gray-300" />
          <div>Nog geen vervoer toegevoegd</div>
        </div>
      ) : (
        <div className="space-y-3">
          {transports.map((t) => (
            <div key={t.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 group">
              <div className="flex items-start gap-3">
                <Icon name={transportIcon(t.type)} size={20} className="text-gray-400 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-gray-800">{t.type}: {t.from_location} → {t.to_location}</div>
                  <div className="flex gap-4 mt-1 text-sm text-gray-500 flex-wrap">
                    {t.departure_time && <span>Vertrek: {fmtDatetime(t.departure_time)}</span>}
                    {t.arrival_time && <span>Aankomst: {fmtDatetime(t.arrival_time)}</span>}
                    {t.booking_ref && <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">#{t.booking_ref}</span>}
                    {t.cost && <span className="font-medium" style={{ color: PALETTE.coralDeep }}>{fmtMoney(t.cost)}</span>}
                  </div>
                  {t.baggage_allowance && <div className="text-sm text-gray-500 mt-1 flex items-center gap-1.5"><Icon name="suitcase" size={14} />{t.baggage_allowance}</div>}
                  {t.notes && <div className="text-sm text-gray-500 mt-1">{t.notes}</div>}
                </div>
                <div className={readOnly ? "flex gap-1" : "opacity-0 group-hover:opacity-100 flex gap-1"}>
                  <button onClick={() => setEditing(t)} className="text-gray-400 hover:text-sky-600"><Icon name={readOnly ? "eye" : "pen"} size={16} /></button>
                  {!readOnly && <button onClick={() => handleDelete(t)} className="text-gray-400 hover:text-red-500" aria-label="Verwijderen"><Icon name="trash" size={16} /></button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && <TransportForm tripId={trip.id} onSaved={() => { setShowForm(false); onRefresh(); }} onClose={() => setShowForm(false)} onImport={() => { setShowForm(false); setImporting(true); }} />}
      {editing && (
        <TransportForm tripId={trip.id} initial={editing}
          journalEntries={journal.filter((e) => e.transport_id === editing.id)} onJournalChange={loadJournal} currentUserId={currentUserId}
          photos={tripPhotos} onPhotosChange={loadPhotos} readOnly={readOnly} showPhotos
          onSaved={() => { setEditing(null); onRefresh(); }} onClose={() => setEditing(null)} />
      )}
      {importing && <ImportModal tripId={trip.id} onImported={() => { setImporting(false); onRefresh(); }} onClose={() => setImporting(false)} />}
    </div>
  );
}

// ---------- Budget tab ----------
function BudgetTab({ trip, expenses, transports, accommodations, days, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  async function handleDelete(e) {
    await api.deleteExpense(e.id);
    onRefresh();
    toonMelding(`"${e.description || "Uitgave"}" verwijderd`, {
      label: "Ongedaan maken",
      run: async () => {
        await api.addExpense(trip.id, {
          date: e.date, category: e.category, description: e.description,
          amount: e.amount, paid_by: e.paid_by,
        });
        onRefresh();
      },
    });
  }

  const activities = days.flatMap((d) => d.activities || []);

  const transportTotal = transports.filter((t) => t.cost).reduce((s, t) => s + Number(t.cost), 0);
  const accommodationTotal = accommodations.filter((a) => a.cost).reduce((s, a) => s + Number(a.cost), 0);
  const activityTotal = activities.filter((a) => a.cost).reduce((s, a) => s + Number(a.cost), 0);
  const expenseTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const total = expenseTotal + transportTotal + accommodationTotal + activityTotal;

  const budget = Number(trip.budget) || 0;
  const pct = budget > 0 ? Math.min(100, (total / budget) * 100) : null;

  const byCategory = EXPENSE_CATEGORIES.map((cat) => ({
    cat,
    total: expenses.filter((e) => e.category === cat).reduce((s, e) => s + Number(e.amount), 0),
  })).filter((x) => x.total > 0);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-display text-[21px] text-gray-800">Budget & uitgaven</h3>
        <Button onClick={() => setShowForm(true)} variant="secondary">+ Uitgave toevoegen</Button>
      </div>

      {/* Summary */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-5">
        <div className="flex justify-between items-end mb-3">
          <div>
            <div className="text-2xl font-bold text-gray-900">{fmtMoney(total, trip.currency)}</div>
            <div className="text-sm text-gray-500">van {budget > 0 ? fmtMoney(budget, trip.currency) : "geen budget ingesteld"}</div>
          </div>
          {pct !== null && (
            <div className={`text-lg font-bold ${pct > 90 ? "text-red-500" : pct > 70 ? "text-amber-600" : "text-green-600"}`}>
              {Math.round(pct)}%
            </div>
          )}
        </div>
        {pct !== null && (
          <div className="w-full bg-gray-100 rounded-full h-2.5">
            <div className={`h-2.5 rounded-full transition-all ${pct > 90 ? "bg-red-500" : pct > 70 ? "bg-yellow-400" : "bg-green-500"}`} style={{ width: `${pct}%` }} />
          </div>
        )}
        {byCategory.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
            {byCategory.map(({ cat, total: t }) => (
              <div key={cat} className="bg-gray-50 rounded-lg px-3 py-2">
                <div className="text-xs text-gray-500">{cat}</div>
                <div className="font-semibold text-gray-800 text-sm">{fmtMoney(t, trip.currency)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Expense list */}
      {expenses.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Icon name="wallet" size={34} strokeWidth={1.2} className="mx-auto mb-3 text-gray-300" />
          <div>Nog geen uitgaven geregistreerd</div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-50">
            {expenses.map((exp) => (
              <div key={exp.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-800 text-sm">{exp.description}</span>
                    <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{exp.category}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {fmt(exp.date)}{exp.paid_by ? ` · ${exp.paid_by}` : ""}
                  </div>
                </div>
                <div className="font-semibold text-gray-800">{fmtMoney(exp.amount, trip.currency)}</div>
                <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                  <button onClick={() => setEditing(exp)} className="text-gray-400 hover:text-sky-700" aria-label="Bewerken"><Icon name="pen" size={14} /></button>
                  <button onClick={() => handleDelete(exp)} className="text-gray-400 hover:text-red-500" aria-label="Verwijderen"><Icon name="trash" size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transports with cost */}
      {transports.some((t) => t.cost) && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
            <span className="font-semibold text-gray-700 text-sm flex items-center gap-1.5"><Icon name="plane" size={14} className="text-gray-400" />Vervoer</span>
            <span className="font-semibold text-gray-800 text-sm">{fmtMoney(transportTotal, trip.currency)}</span>
          </div>
          <div className="divide-y divide-gray-50">
            {transports.filter((t) => t.cost).map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 text-sm text-gray-800">{t.type}: {t.from_location} → {t.to_location}</div>
                <div className="font-semibold text-gray-800 text-sm">{fmtMoney(t.cost, trip.currency)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Accommodations with cost */}
      {accommodations.some((a) => a.cost) && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
            <span className="font-semibold text-gray-700 text-sm flex items-center gap-1.5"><Icon name="bed" size={14} className="text-gray-400" />Verblijf</span>
            <span className="font-semibold text-gray-800 text-sm">{fmtMoney(accommodationTotal, trip.currency)}</span>
          </div>
          <div className="divide-y divide-gray-50">
            {accommodations.filter((a) => a.cost).map((a) => {
              const nights = (a.check_in && a.check_out)
                ? Math.round((new Date(a.check_out) - new Date(a.check_in)) / 86400000)
                : null;
              const perNight = nights > 0 ? Number(a.cost) / nights : null;
              return (
                <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 text-sm text-gray-800">
                    {a.name}
                    {nights > 0 && <span className="ml-2 text-xs text-gray-400">{nights} nacht{nights !== 1 ? "en" : ""}</span>}
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-gray-800 text-sm">{fmtMoney(a.cost, trip.currency)}</div>
                    {perNight && <div className="text-xs text-gray-400">{fmtMoney(perNight, trip.currency)} / nacht</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Activities with cost */}
      {activities.some((a) => a.cost) && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
            <span className="font-semibold text-gray-700 text-sm flex items-center gap-1.5"><Icon name="route" size={14} className="text-gray-400" />Activiteiten</span>
            <span className="font-semibold text-gray-800 text-sm">{fmtMoney(activityTotal, trip.currency)}</span>
          </div>
          <div className="divide-y divide-gray-50">
            {activities.filter((a) => a.cost).map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 text-sm text-gray-800">{a.title}</div>
                <div className="font-semibold text-gray-800 text-sm">{fmtMoney(a.cost, trip.currency)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showForm && <ExpenseForm tripId={trip.id} onSaved={() => { setShowForm(false); onRefresh(); }} onClose={() => setShowForm(false)} />}
      {editing && <ExpenseForm tripId={trip.id} initial={editing} onSaved={() => { setEditing(null); onRefresh(); }} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ---------- Tips accordion ----------
const TIP_CATEGORIES = [
  { category: "Lokaal vervoer", icon: "train" },
  { category: "Taxi & apps", icon: "car" },
  { category: "Restaurants", icon: "fork" },
  { category: "Activiteiten", icon: "flag" },
  { category: "Met kinderen", icon: "family" },
  { category: "Evenementen & agenda", icon: "ticket" },
];

function TipAccordion({ tripId, category, icon, accentColor, location, cacheKeyPrefix }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const cacheKey = `${cacheKeyPrefix}_cat_${category}`;

  function load() {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { data, ts } = JSON.parse(cached);
        if (Date.now() - ts < 24 * 60 * 60 * 1000) { setItems(data); return; }
      }
    } catch {}
    setLoading(true); setError(null);
    const params = new URLSearchParams({ category });
    if (location) params.set("location", location);
    apiFetch(`/api/trips/${tripId}/tips?${params}`)
      .then((d) => {
        setItems(d.items || []);
        try { localStorage.setItem(cacheKey, JSON.stringify({ data: d.items || [], ts: Date.now() })); } catch {}
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  function handleClick() {
    if (!open) { setOpen(true); if (!items) load(); }
    else setOpen(false);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <button onClick={handleClick} className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors">
        <span className="text-lg">{icon}</span>
        <span className="font-semibold text-gray-800 text-sm flex-1">{category}</span>
        <span className="text-gray-400 text-xs" style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", display: "inline-block", transition: "transform .2s" }}>▾</span>
      </button>
      {open && (
        <div className="border-t border-gray-100">
          {loading ? (
            <div className="px-4 py-3 text-sm text-gray-400">Laden...</div>
          ) : error ? (
            <div className="px-4 py-3 text-sm text-red-500">{error} <button onClick={load} className="underline">Opnieuw</button></div>
          ) : items?.length ? (
            <ul className="divide-y divide-gray-50">
              {items.map((tip, j) => {
                const tipText = typeof tip === "string" ? tip : tip.text;
                const tipUrl = typeof tip === "object" ? tip.url : null;
                return (
                  <li key={j} className="flex items-start gap-3 px-4 py-2.5">
                    <span className="w-1.5 h-1.5 rounded-full mt-2 shrink-0" style={{ background: legibleOn(accentColor) }} />
                    <span className="text-sm text-gray-700 leading-relaxed">
                      {tipText}
                      {tipUrl && <a href={tipUrl} target="_blank" rel="noopener noreferrer" className="ml-1.5 text-sky-600 underline text-xs whitespace-nowrap">↗ website</a>}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : items ? (
            <div className="px-4 py-3 text-sm text-gray-400">Geen tips beschikbaar.</div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ---------- Tips modal (per locatie) ----------
function TipsModal({ tripId, trip, location, onClose }) {
  const [didYouKnow, setDidYouKnow] = useState(null);
  const [dykLoading, setDykLoading] = useState(true);
  const tripMonth = trip?.start_date ? String(trip.start_date).slice(0, 7) : "";
  const cacheKeyPrefix = `tips_loc_${location}_${tripMonth}`;
  const dykKey = `${cacheKeyPrefix}_dyk`;

  useEffect(() => {
    try {
      const cached = localStorage.getItem(dykKey);
      if (cached) { const { data, ts } = JSON.parse(cached); if (Date.now() - ts < 24*60*60*1000) { setDidYouKnow(data); setDykLoading(false); return; } }
    } catch {}
    apiFetch(`/api/trips/${tripId}/tips?location=${encodeURIComponent(location)}`)
      .then((d) => { setDidYouKnow(d.did_you_know || null); try { localStorage.setItem(dykKey, JSON.stringify({ data: d.did_you_know, ts: Date.now() })); } catch {} })
      .catch(() => {})
      .finally(() => setDykLoading(false));
  }, [location]);

  return (
    <Modal title={`Tips voor ${location}`} onClose={onClose} wide>
      <div className="space-y-2">
        {dykLoading ? (
          <div className="rounded-xl p-4 bg-sky-50 border border-sky-100 mb-1 animate-pulse">
            <div className="h-3 w-20 bg-sky-200 rounded mb-2" />
            <div className="h-4 w-full bg-sky-100 rounded" />
          </div>
        ) : didYouKnow ? (
          <div className="rounded-xl p-4 bg-sky-50 border border-sky-100 mb-1">
            <div className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: PALETTE.coralDeep }}>Wist je dat?</div>
            <div className="text-sm text-gray-700 leading-relaxed">{didYouKnow}</div>
          </div>
        ) : null}
        <div className="text-xs text-gray-400 text-center pb-1">Klik op een categorie om tips te laden</div>
        {TIP_CATEGORIES.map(({ category, icon }) => (
          <TipAccordion key={category} tripId={tripId} category={category} icon={icon}
            accentColor={PALETTE.primary} location={location} cacheKeyPrefix={cacheKeyPrefix} />
        ))}
      </div>
    </Modal>
  );
}

// ---------- Tips tab ----------
function TipsTab({ trip }) {
  const [didYouKnow, setDidYouKnow] = useState(null);
  const [dykLoading, setDykLoading] = useState(true);
  const accent = trip.cover_color || PALETTE.primary;
  const tripMonth = trip.start_date ? String(trip.start_date).slice(0, 7) : "";
  const cacheKeyPrefix = `tips_${trip.id}_${trip.destination}_${tripMonth}`;
  const dykKey = `${cacheKeyPrefix}_dyk`;

  useEffect(() => {
    if (!trip.destination) { setDykLoading(false); return; }
    try {
      const cached = localStorage.getItem(dykKey);
      if (cached) { const { data, ts } = JSON.parse(cached); if (Date.now() - ts < 24*60*60*1000) { setDidYouKnow(data); setDykLoading(false); return; } }
    } catch {}
    apiFetch(`/api/trips/${trip.id}/tips`)
      .then((d) => { setDidYouKnow(d.did_you_know || null); try { localStorage.setItem(dykKey, JSON.stringify({ data: d.did_you_know, ts: Date.now() })); } catch {} })
      .catch(() => {})
      .finally(() => setDykLoading(false));
  }, [trip.id, trip.destination]);

  if (!trip.destination) return (
    <div className="text-center py-16 text-gray-400">
      <Icon name="bulb" size={34} strokeWidth={1.2} className="mx-auto mb-3 text-gray-300" />
      <div className="font-medium">Geen bestemming ingesteld</div>
      <div className="text-sm mt-1">Voeg een bestemming toe aan je reis voor AI-tips</div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-[21px] text-gray-800">Tips voor {trip.destination}</h3>
        <span className="text-xs text-gray-400 flex items-center gap-1"><Icon name="sparkle" size={12} />Gegenereerd door Claude</span>
      </div>

      {dykLoading ? (
        <div className="rounded-xl p-4 mb-4 border animate-pulse" style={{ background: accent + "10", borderColor: accent + "30" }}>
          <div className="h-3 w-20 rounded mb-2" style={{ background: accent + "40" }} />
          <div className="h-4 w-full rounded" style={{ background: accent + "20" }} />
        </div>
      ) : didYouKnow ? (
        <div className="rounded-xl p-4 mb-4 border" style={{ background: accent + "10", borderColor: accent + "30" }}>
          <div className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: legibleOn(accent) }}>Wist je dat?</div>
          <div className="text-sm text-gray-700 leading-relaxed">{didYouKnow}</div>
        </div>
      ) : null}

      <div className="text-xs text-gray-400 text-center mb-3">Klik op een categorie om tips te laden</div>

      <div className="space-y-2">
        {TIP_CATEGORIES.map(({ category, icon }) => (
          <TipAccordion key={category} tripId={trip.id} category={category} icon={icon}
            accentColor={accent} cacheKeyPrefix={cacheKeyPrefix} />
        ))}
      </div>
    </div>
  );
}

// ---------- Waar je geweest bent ----------
// De planningskaart laat zien waar je heen zóu gaan. Dit laat zien waar je
// werkelijk geweest bent, en dat weten we uit de GPS die in je foto's zit.

function numOrNull(v) {
  // pg geeft NUMERIC terug als tekst, en Number(null) is 0 — wat een geldige
  // coördinaat lijkt maar het niet is. Vandaar deze omweg.
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function photoPoint(p) {
  const lat = numOrNull(p.latitude);
  const lon = numOrNull(p.longitude);
  if (lat === null || lon === null) return null;
  // Precies 0,0 ligt in de Atlantische Oceaan voor Ghana. Dat is geen vakantie,
  // dat is een leeggelopen GPS-veld.
  if (lat === 0 && lon === 0) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { ...p, lat, lon, when: p.taken_at || p.created_at || null };
}

function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Groepeer op nabijheid, niet op tijd: kom je twee keer op hetzelfde plein, dan
// is dat één plek op de kaart en geen twee losse stippen.
function clusterPhotoPlaces(photos, radiusM = 300) {
  const pts = asList(photos).map(photoPoint).filter(Boolean)
    .sort((a, b) => String(a.when || "").localeCompare(String(b.when || "")));
  const places = [];
  for (const pt of pts) {
    let best = null;
    let bestD = Infinity;
    for (const pl of places) {
      const d = haversineMeters(pt, pl);
      if (d < bestD) { bestD = d; best = pl; }
    }
    if (best && bestD <= radiusM) {
      best.photos.push(pt);
      best.lat = best.photos.reduce((s, p) => s + p.lat, 0) / best.photos.length;
      best.lon = best.photos.reduce((s, p) => s + p.lon, 0) / best.photos.length;
    } else {
      places.push({ lat: pt.lat, lon: pt.lon, photos: [pt] });
    }
  }
  for (const pl of places) {
    const times = pl.photos.map((p) => p.when).filter(Boolean).sort();
    pl.first = times[0] || null;
    pl.last = times[times.length - 1] || null;
  }
  return places;
}

// De route is de volgorde waarin je die plekken bezocht hebt. Ga je heen en
// weer naar hetzelfde hotel, dan hoort dat als losse etappes in de lijn — maar
// twee foto's achter elkaar op dezelfde plek zijn geen etappe.
function visitRoute(places) {
  const stops = [];
  places.forEach((pl, i) => pl.photos.forEach((p) => stops.push({ when: p.when, i })));
  stops.sort((a, b) => String(a.when || "").localeCompare(String(b.when || "")));
  const route = [];
  for (const s of stops) {
    if (route.length === 0 || route[route.length - 1] !== s.i) route.push(s.i);
  }
  return route.map((i) => places[i]);
}

function routeDistanceMeters(route) {
  let total = 0;
  for (let i = 1; i < route.length; i++) total += haversineMeters(route[i - 1], route[i]);
  return total;
}

// Een boogje in plaats van een rechte lijn tussen twee punten — dezelfde
// vluchtroute-boog als op de planningskaart, hier hergebruikt voor elke etappe
// tussen twee bezochte plekken. De boog schaalt met de afstand: vlak bij elkaar
// is hij bijna recht, ver uit elkaar duidelijk gebogen, zoals een vluchtpad.
function arcLatLngs(from, to, bulge = 0.08, steps = 40) {
  const latlngs = [];
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const lat = from.lat + (to.lat - from.lat) * t;
    const lon = from.lon + (to.lon - from.lon) * t;
    const arc = Math.sin(Math.PI * t) * (Math.abs(to.lat - from.lat) + Math.abs(to.lon - from.lon)) * bulge;
    latlngs.push([lat + arc, lon]);
  }
  return latlngs;
}

function fmtDistance(m) {
  if (m < 1000) return `${Math.round(m)} m`;
  if (m < 100000) return `${(m / 1000).toFixed(1).replace(".", ",")} km`;
  return `${Math.round(m / 1000).toLocaleString("nl-NL")} km`;
}

// Een label als "14:07" oogt op een kaart alsof het naar de minuut nauwkeurig
// is gepland, wat het nooit is. Afgerond op een kwartier leest het als wat het
// is: een indicatie.
function roundTimeToQuarterHour(time) {
  const m = /^(\d{1,2}):(\d{2})/.exec(time || "");
  if (!m) return null;
  const total = (Number(m[1]) * 60 + Number(m[2]));
  const rounded = Math.round(total / 15) * 15 % (24 * 60);
  const h = Math.floor(rounded / 60);
  const min = rounded % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

// Koppelt elke foto-cluster op de dagboek-kaart aan de activiteit waar de
// meeste van zijn foto's bij horen, zodat de kaart niet alleen stippen toont
// maar ook waar je was en (afgerond) hoe laat.
function labelPlaces(places, activities) {
  places.forEach((pl) => {
    const counts = {};
    pl.photos.forEach((p) => { if (p.activity_id) counts[p.activity_id] = (counts[p.activity_id] || 0) + 1; });
    const topId = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    const act = topId && activities.find((a) => String(a.id) === topId);
    pl.label = act ? act.title : null;
    pl.time = act ? roundTimeToQuarterHour(act.time) : null;
    pl.activityId = act ? act.id : null;
  });
  return places;
}

// ---------- Kaart tab ----------
// Mapbox-tegels als er een token staat, anders de gratis CARTO-tegels. Eén keer
// ophalen per sessie; de kaart mag er niet op wachten als het misgaat.
let _mapConfig = null;
function mapConfig() {
  if (!_mapConfig) {
    _mapConfig = fetch("/api/config/map")
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
  }
  return _mapConfig;
}

function addBaseLayer(L, map, cfg) {
  if (cfg && cfg.mapboxToken) {
    // Een rustige ondergrond: het spoor is het onderwerp, niet de kaart.
    L.tileLayer(
      `https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/512/{z}/{x}/{y}@2x?access_token=${cfg.mapboxToken}`,
      { attribution: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', tileSize: 512, zoomOffset: -1, maxZoom: 20 },
    ).addTo(map);
    return;
  }
  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
    maxZoom: 19,
  }).addTo(map);
}

// v3: valt terug op Engels wanneer Nominatim geen Nederlandse naam heeft —
// zonder die fallback levert een plaats zonder nl-vertaling (bijv. Takayama)
// zijn lokale schrift op (高山市) in plaats van een Latijnse naam. Eigen
// cache-prefix, want oudere gecachte resultaten (van vóór deze fallback)
// kunnen nog zo'n onvertaalde naam bevatten.
//
// Meerdere dagkaarten met hetzelfde verblijf mounten allemaal tegelijk, en
// missen dan allemaal de (nog lege) cache — zonder deze in-flight-registratie
// vuurt dat evenveel gelijktijdige Nominatim-verzoeken af, wat de bedoelde
// snelheidslimiet van 1/sec juist doorbreekt.
const _geocodeInFlight = new Map();
async function geocode(query) {
  const key = `geocode3_${query}`;
  try {
    const c = localStorage.getItem(key);
    if (c) return JSON.parse(c);
  } catch {}
  if (_geocodeInFlight.has(query)) return _geocodeInFlight.get(query);
  const promise = (async () => {
    await new Promise((r) => setTimeout(r, 1100)); // Nominatim rate limit: 1/sec
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1`;
    const res = await fetch(url, { headers: { "Accept-Language": "nl,en;q=0.8", "User-Agent": "ReisplannerApp/1.0" } });
    const data = await res.json();
    const addr = data[0]?.address || {};
    const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || null;
    const result = data[0] ? { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), display: data[0].display_name, city } : null;
    if (result) { try { localStorage.setItem(key, JSON.stringify(result)); } catch {} }
    return result;
  })();
  _geocodeInFlight.set(query, promise);
  try {
    return await promise;
  } finally {
    _geocodeInFlight.delete(query);
  }
}

// Nominatim's addressdetails levert niet altijd het niveau dat je wilt (soms
// een wijk, soms een regio) en soms geen bruikbare naam voor een klein
// verblijfsadres. Laat Claude de plaatsnaam uit de ruwe naam/adrestekst
// destilleren; valt terug op Nominatim's eigen city-veld als dat niet lukt
// (geen API-key, netwerkfout, of een gast zonder server-sessie).
async function deriveCityName(query, fallbackCity) {
  if (_guestMode) return fallbackCity || null;
  const key = `placename_${query}`;
  try {
    const c = localStorage.getItem(key);
    if (c) return c;
  } catch {}
  try {
    const data = await apiFetch("/api/geocode/place-name", { method: "POST", body: JSON.stringify({ query }) });
    if (data?.city) {
      try { localStorage.setItem(key, data.city); } catch {}
      return data.city;
    }
  } catch {}
  return fallbackCity || null;
}

// Combineert een geocode-lookup met een schone plaatsnaam. Een compleet
// hoteladres (naam + straat + wijk) is vaak te specifiek voor Nominatim om
// coördinaten voor te vinden — een schone plaatsnaam ("Kyoto") vindt hij wél
// vrijwel altijd, dus die wordt als tweede poging gebruikt zodra de eerste
// lookup niets oplevert. Zonder deze stap kreeg zo'n dag geen kaartje én geen
// schone naam: beide vielen terug op het rauwe adres.
async function geocodePlace(query) {
  let geo = await geocode(query).catch(() => null);
  const city = await deriveCityName(query, geo?.city);
  if (city && geo?.lat == null) {
    geo = await geocode(city).catch(() => null);
  }
  if (geo) return { ...geo, city: city || geo.city };
  return city ? { city } : null;
}

// WMO-weercodes (zoals Open-Meteo ze levert) teruggebracht tot de drie dingen
// die er in een dagboek toe doen: zon, bewolking, neerslag — niet de volledige
// lijst met precieze varianten.
function weatherFromCode(code) {
  if (code === 0) return { icon: "sun", label: "Zonnig" };
  if (code === 1) return { icon: "sun", label: "Overwegend zonnig" };
  if (code === 2) return { icon: "cloudSun", label: "Half bewolkt" };
  if (code === 3) return { icon: "cloud", label: "Bewolkt" };
  if ([45, 48].includes(code)) return { icon: "fog", label: "Mist" };
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { icon: "cloudRain", label: "Regen" };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { icon: "cloudSnow", label: "Sneeuw" };
  if ([95, 96, 99].includes(code)) return { icon: "cloudLightning", label: "Onweer" };
  return { icon: "cloud", label: "Bewolkt" };
}

// Open-Meteo: gratis, geen key nodig. De forecast-endpoint dekt recent
// verleden t/m 16 dagen vooruit; voor oudere reisdagen valt dit terug op het
// archief. Buiten beide bereiken (of bij een netwerkfout) blijft het weer
// gewoon leeg — dit is een leuk detail, geen essentieel onderdeel van de app.
// v2: neemt ook de gevoelstemperatuur mee, voor het detailkaartje achter een
// klik op het weer-icoon. Eigen cache-prefix, want oudere gecachte resultaten
// (van vóór dit veld bestond) missen die waarde.
async function fetchDayWeather(lat, lon, dateStr) {
  if (lat == null || lon == null || !dateStr) return null;
  const key = `weather2_${lat.toFixed(2)}_${lon.toFixed(2)}_${dateStr}`;
  try {
    const c = localStorage.getItem(key);
    if (c) return JSON.parse(c);
  } catch {}
  const parse = async (url) => {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const d = data?.daily;
    if (!d?.weathercode?.length) return null;
    return {
      tempMax: d.temperature_2m_max[0], tempMin: d.temperature_2m_min[0], code: d.weathercode[0],
      feelsMax: d.apparent_temperature_max?.[0] ?? null, feelsMin: d.apparent_temperature_min?.[0] ?? null,
      precip: d.precipitation_sum?.[0] ?? null,
    };
  };
  const params = `daily=weathercode,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum&timezone=auto&start_date=${dateStr}&end_date=${dateStr}`;
  let result = null;
  try { result = await parse(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&${params}`); } catch {}
  if (!result) {
    try { result = await parse(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&${params}`); } catch {}
  }
  if (result) { try { localStorage.setItem(key, JSON.stringify(result)); } catch {} }
  return result;
}

// Zelfstandig badge-je: geocodeert de meegegeven locatietekst zelf en haalt er
// het weer bij, zodat elke plek in de app (dagplanning, het "Binnenkort"-
// lijstje) dit met één regel kan tonen zonder de geocode/weer-logica zelf te
// herhalen.
// Het icoontje zelf blijft bewust minimaal (icoon + max-temperatuur) — een
// klik erop laat het detail zien: gevoelstemperatuur, min/max en neerslag.
// Zo blijft het rustig in de dagkaart, maar is er meer te vinden voor wie het
// wil weten.
function WeatherBadge({ weather, size = 13, className = "" }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!weather) return null;
  const info = weatherFromCode(weather.code);

  return (
    <span className={"relative inline-flex shrink-0 " + className} ref={wrapRef}>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="flex items-center gap-1 text-gray-400 hover:text-gray-600 active:scale-95 transition-all">
        <Icon name={info.icon} size={size} />
        <span className="tnum text-gray-600 font-medium">{Math.round(weather.tempMax)}°</span>
      </button>
      {open && (
        <div onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-full mt-1.5 z-50 bg-white rounded-xl shadow-xl border border-gray-100 px-3.5 py-3 text-xs whitespace-nowrap">
          <div className="flex items-center gap-1.5 font-semibold text-gray-800 mb-1.5">
            <Icon name={info.icon} size={15} className="text-gray-400" />{info.label}
          </div>
          <div className="tnum text-gray-600">{Math.round(weather.tempMax)}° / {Math.round(weather.tempMin)}°</div>
          {weather.feelsMax != null && (
            <div className="tnum text-gray-400 mt-0.5">Voelt als {Math.round(weather.feelsMax)}°</div>
          )}
          {weather.precip != null && weather.precip > 0 && (
            <div className="tnum text-gray-400 mt-0.5">{weather.precip.toFixed(1).replace(".", ",")} mm neerslag</div>
          )}
        </div>
      )}
    </span>
  );
}

function DayWeatherBadge({ query, date, size = 13 }) {
  const [weather, setWeather] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!query || !date) { if (!cancelled) setWeather(null); return; }
      const geo = await geocodePlace(query).catch(() => null);
      if (cancelled) return;
      if (geo?.lat == null) { setWeather(null); return; }
      const w = await fetchDayWeather(geo.lat, geo.lon, date).catch(() => null);
      if (!cancelled) setWeather(w);
    })();
    return () => { cancelled = true; };
  }, [query, date]);

  return <WeatherBadge weather={weather} size={size} />;
}

function MapTab({ trip, accommodations, transports, days }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;

    async function buildMap() {
      // Collect unique locations to geocode
      const items = []; // {label, sublabel, type, query}

      accommodations.forEach((a) => {
        const q = a.address || a.name;
        if (q) items.push({ label: a.name, sublabel: a.address || "", type: "hotel", query: q });
      });

      days.forEach((day) => {
        (day.activities || []).forEach((act) => {
          if (act.location) items.push({ label: act.name || act.location, sublabel: act.location, type: "activity", query: act.location + (trip.destination ? `, ${trip.destination}` : "") });
        });
      });

      // Transport: unique cities from origin/destination
      // Use airport codes or city names — append country context from trip destination if short
      const transportPairs = [];
      transports.forEach((t) => {
        if (t.from_location && t.to_location) {
          const fromQ = t.from_location;
          const toQ = t.to_location;
          transportPairs.push({ from: fromQ, to: toQ, type: t.type });
          if (!items.find((i) => i.query === fromQ)) items.push({ label: t.from_location, sublabel: "", type: "transport", query: fromQ });
          if (!items.find((i) => i.query === toQ)) items.push({ label: t.to_location, sublabel: "", type: "transport", query: toQ });
        }
      });

      if (items.length === 0) { setStatus("empty"); return; }
      setTotal(items.length);

      // Geocode sequentially (Nominatim rate limit)
      const coordMap = {};
      for (let i = 0; i < items.length; i++) {
        if (cancelled) return;
        const item = items[i];
        if (coordMap[item.query] === undefined) {
          const geo = await geocode(item.query);
          coordMap[item.query] = geo;
        }
        setProgress(i + 1);
      }

      if (cancelled) return;

      const validItems = items.filter((item) => coordMap[item.query]);
      if (validItems.length === 0) { setStatus("error"); return; }

      // Init Leaflet map
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
      const L = window.L;
      const map = L.map(mapRef.current);
      mapInstanceRef.current = map;
      addBaseLayer(L, map, await mapConfig());

      const bounds = [];

      // Draw transport lines first (below markers)
      transportPairs.forEach((pair) => {
        const fromGeo = coordMap[pair.from];
        const toGeo = coordMap[pair.to];
        if (!fromGeo || !toGeo) return;
        const isAir = (pair.type || "").toLowerCase().includes("vlieg") || (pair.type || "").toLowerCase().includes("fly") || (pair.type || "").toLowerCase().includes("air") || !pair.type;
        if (isAir) {
          L.polyline(arcLatLngs(fromGeo, toGeo), { color: PALETTE.info, weight: 2.5, opacity: 0.7, dashArray: "8 5" }).addTo(map);
        } else {
          L.polyline([[fromGeo.lat, fromGeo.lon], [toGeo.lat, toGeo.lon]], { color: PALETTE.success, weight: 2, opacity: 0.6 }).addTo(map);
        }
      });

      // Add markers. Leaflet wil ruwe HTML, dus deze drie iconen staan hier als
      // padstring in plaats van als JSX — het zijn dezelfde tekeningen.
      const iconSvg = (paths, color) => L.divIcon({
        className: "leaflet-reisplanner-icon",
        html: `<div style="background:${color};border:2.5px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);width:34px;height:34px;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center">`
          + `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(45deg);display:block">${paths}</svg></div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 34],
        popupAnchor: [0, -36],
      });

      // Op een kaart wint onderscheidbaarheid het van kleurzuiverheid: drie
      // duidelijk verschillende, diepe tinten die naast het oranje kunnen staan.
      const typeConfig = {
        hotel: { paths: '<path d="M3 18v-8"/><path d="M3 13h18v5"/><path d="M21 18v-4.5a2.5 2.5 0 0 0-2.5-2.5H10v2.5"/><circle cx="6.9" cy="11" r="1.9"/>', color: PALETTE.coralDeep },
        activity: { paths: '<path d="M6 21V4"/><path d="M6 5h10.5l-1.8 3.6 1.8 3.6H6"/>', color: PALETTE.success },
        transport: { paths: '<path d="M3 13.5 21 7l-4.5 12-3.2-5.1z"/><path d="M13.3 13.9 21 7"/>', color: PALETTE.info },
      };

      // Deduplicate markers by query
      const seen = new Set();
      validItems.forEach((item) => {
        if (seen.has(item.query)) return;
        seen.add(item.query);
        const geo = coordMap[item.query];
        const cfg = typeConfig[item.type] || typeConfig.activity;
        const marker = L.marker([geo.lat, geo.lon], { icon: iconSvg(cfg.paths, cfg.color) }).addTo(map);
        // item.label/sublabel komen uit vrij in te vullen tekst (activiteit-,
        // verblijf- en vervoernamen) — ongefilterd in deze HTML-string plakken
        // zou opgeslagen XSS zijn, dus escapen vóór het aan bindPopup te geven.
        const popup = `<div style="font-family:system-ui;min-width:140px">
          <div style="font-weight:600;font-size:13px;color:${PALETTE.textPrimary}">${escapeHtml(item.label)}</div>
          ${item.sublabel && item.sublabel !== item.label ? `<div style="font-size:11px;color:${PALETTE.textSecondary};margin-top:2px">${escapeHtml(item.sublabel)}</div>` : ""}
        </div>`;
        marker.bindPopup(popup);
        bounds.push([geo.lat, geo.lon]);
      });

      if (bounds.length > 0) map.fitBounds(bounds, { padding: [40, 40] });
      setStatus("ready");
    }

    buildMap().catch(() => setStatus("error"));
    return () => { cancelled = true; };
  }, [trip.id]);

  useEffect(() => {
    return () => { if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; } };
  }, []);

  const hasLocations = accommodations.some((a) => a.address || a.name) ||
    transports.some((t) => t.from_location && t.to_location) ||
    days.some((d) => (d.activities || []).some((a) => a.location));

  if (!hasLocations) return (
    <div className="text-center py-16 text-gray-400">
      <Icon name="map" size={34} strokeWidth={1.2} className="mx-auto mb-3 text-gray-300" />
      <div className="font-medium">Geen locaties om te tonen</div>
      <div className="text-sm mt-1">Voeg hotels, activiteiten of vervoer toe met locatiegegevens</div>
    </div>
  );

  return (
    <div>
      <div className="flex gap-3 text-xs text-gray-500 mb-3 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: PALETTE.coralDeep }} />Verblijf</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: PALETTE.success }} />Activiteit</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: PALETTE.info }} />Vervoer</span>
      </div>
      <div className="rounded-3xl overflow-hidden border border-gray-200 shadow-sm relative z-0" style={{ height: 480 }}>
        {status === "loading" && (
          <div className="absolute inset-0 bg-white/90 z-[1000] flex flex-col items-center justify-center gap-3">
            <Icon name="map" size={30} strokeWidth={1.2} className="animate-pulse text-gray-300" />
            <div className="text-sm text-gray-600 font-medium">Locaties ophalen…</div>
            {total > 0 && (
              <div className="w-48">
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-sky-500 rounded-full transition-all" style={{ width: `${(progress / total) * 100}%` }} />
                </div>
                <div className="text-xs text-gray-400 text-center mt-1">{progress} / {total}</div>
              </div>
            )}
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 bg-white/90 z-[1000] flex items-center justify-center">
            <div className="text-center text-gray-400">
              <Icon name="alert" size={30} strokeWidth={1.3} className="mx-auto mb-2 text-gray-300" />
              <div className="text-sm">Kaart kon niet worden geladen</div>
            </div>
          </div>
        )}
        <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
      </div>
      <div className="text-xs text-gray-400 text-center mt-2">© OpenStreetMap contributors</div>
    </div>
  );
}

// Het spoor dat je zelf hebt achtergelaten: elke foto met GPS is een bewijsstuk
// dat je daar stond. Geen geocoding nodig, dus deze kaart staat er meteen.
function VisitedMap({ trip }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [photos, setPhotos] = useState(null);
  const [failed, setFailed] = useState(false);
  const [viewing, setViewing] = useState(null); // { photos, index }

  useEffect(() => {
    let cancelled = false;
    api.getPhotos(trip.id)
      .then((list) => { if (!cancelled) setPhotos(asList(list)); })
      .catch(() => { if (!cancelled) { setPhotos([]); setFailed(true); } });
    return () => { cancelled = true; };
  }, [trip.id]);

  const places = React.useMemo(() => clusterPhotoPlaces(photos || []), [photos]);
  const route = React.useMemo(() => visitRoute(places), [places]);
  const withoutGps = (photos || []).length - places.reduce((n, p) => n + p.photos.length, 0);

  useEffect(() => {
    if (!mapRef.current || places.length === 0) return;
    let cancelled = false;

    (async () => {
      const cfg = await mapConfig();
      if (cancelled || !mapRef.current) return;
      const L = window.L;
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
      const map = L.map(mapRef.current, { scrollWheelZoom: false });
      mapInstanceRef.current = map;
      addBaseLayer(L, map, cfg);

      if (route.length > 1) {
        L.polyline(route.map((p) => [p.lat, p.lon]),
          { color: PALETTE.coralDeep, weight: 2.5, opacity: 0.75 }).addTo(map);
      }

      // De stip groeit met het aantal foto's, zodat je in één oogopslag ziet
      // waar je lang gebleven bent.
      //
      // Genummerd op eerste bezoek, niet op positie in de route: kom je 's avonds
      // terug in hetzelfde hotel, dan houdt die stip zijn eigen nummer 1 en telt
      // de reeks netjes door zonder gaten. De lijn laat het heen en weer al zien.
      const order = new Map();
      route.forEach((p) => { if (!order.has(p)) order.set(p, order.size + 1); });
      places.forEach((pl) => {
        const size = Math.min(46, 24 + Math.round(Math.sqrt(pl.photos.length) * 5));
        const nr = order.get(pl);
        const marker = L.marker([pl.lat, pl.lon], {
          icon: L.divIcon({
            className: "leaflet-reisplanner-icon",
            html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${PALETTE.coralDeep};border:2.5px solid #fff;box-shadow:0 2px 8px rgba(55,52,50,.35);color:#fff;display:flex;align-items:center;justify-content:center;font-size:${size < 30 ? 10 : 12}px;font-weight:700;font-variant-numeric:tabular-nums">${nr || ""}</div>`,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          }),
        }).addTo(map);
        const when = pl.first ? fmt(pl.first.slice(0, 10)) : "";
        marker.bindTooltip(
          `${pl.photos.length} foto${pl.photos.length === 1 ? "" : "'s"}${when ? ` · ${when}` : ""}`,
          { direction: "top", offset: [0, -size / 2] },
        );
        marker.on("click", () => setViewing({ photos: pl.photos, index: 0 }));
      });

      const bounds = places.map((p) => [p.lat, p.lon]);
      if (bounds.length === 1) map.setView(bounds[0], 13);
      else map.fitBounds(bounds, { padding: [45, 45] });
    })();

    return () => { cancelled = true; };
  }, [places, route]);

  useEffect(() => () => {
    if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
  }, []);

  if (photos === null) return <div className="text-center py-16 text-gray-400 text-sm">Foto's ophalen…</div>;

  if (places.length === 0) return (
    <div className="text-center py-14 text-gray-400">
      <Icon name="pin" size={34} strokeWidth={1.2} className="mx-auto mb-3 text-gray-300" />
      <div className="font-medium text-gray-600">Nog geen plekken om te tonen</div>
      <div className="text-sm mt-1 max-w-sm mx-auto leading-relaxed">
        {failed
          ? "De foto's konden niet worden opgehaald. Probeer het zo nog eens."
          : withoutGps > 0
            ? `Er ${withoutGps === 1 ? "is 1 foto" : `zijn ${withoutGps} foto's`} in deze reis, maar zonder locatie. Foto's die via WhatsApp of een screenshot binnenkomen hebben hun GPS verloren; die rechtstreeks vanaf de camera-rol komen meestal wel.`
            : "Zodra je foto's uploadt die met locatie zijn genomen, tekent deze kaart je route."}
      </div>
    </div>
  );

  const days = new Set(places.flatMap((p) => p.photos.map((x) => (x.when || "").slice(0, 10))).filter(Boolean));
  const distance = routeDistanceMeters(route);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mb-3 text-sm">
        <span className="flex items-center gap-1.5 text-gray-700">
          <Icon name="pin" size={14} className="text-sky-700" />
          <span className="font-semibold tnum">{places.length}</span> {places.length === 1 ? "plek" : "plekken"}
        </span>
        {distance > 0 && (
          <span className="flex items-center gap-1.5 text-gray-700">
            <Icon name="route" size={14} className="text-sky-700" />
            <span className="font-semibold tnum">{fmtDistance(distance)}</span>
            <span className="text-gray-400 text-xs">in vogelvlucht</span>
          </span>
        )}
        {days.size > 0 && (
          <span className="flex items-center gap-1.5 text-gray-700">
            <Icon name="calendar" size={14} className="text-sky-700" />
            <span className="font-semibold tnum">{days.size}</span> {days.size === 1 ? "dag" : "dagen"}
          </span>
        )}
      </div>

      <div className="rounded-3xl overflow-hidden border border-gray-200 shadow-sm relative z-0" style={{ height: 480 }}>
        <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
      </div>

      <div className="text-xs text-gray-400 mt-2 leading-relaxed">
        De cijfers volgen de volgorde waarin je er was. Tik op een stip voor de foto's van die plek.
        {withoutGps > 0 && ` ${withoutGps} ${withoutGps === 1 ? "foto heeft" : "foto's hebben"} geen locatie en staan hier dus niet op.`}
      </div>

      {viewing && (
        <PhotoLightbox photos={viewing.photos} index={viewing.index}
          onClose={() => setViewing(null)}
          onIndexChange={(i) => setViewing((v) => ({ ...v, index: i }))} />
      )}
    </div>
  );
}

// Een klein, ingezoomd kaartje in het dagboek zelf: alleen voor vandaag en
// gisteren (de dagen die je nog vers bijhoudt), en alleen als er genoeg
// plekken zijn om een kaartje ook echt iets te laten zien. Places komen al
// geclusterd binnen (clusterPhotoPlaces) — hier alleen tonen en fitBounds.
// Het verblijf van die nacht komt er als startpunt bij: dat heeft geen GPS,
// dus wordt (eenmalig, met caching) geocodeerd op zijn adres.
function DayMiniMap({ places, accommodation }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    if (!mapRef.current || places.length === 0) return;
    let cancelled = false;

    (async () => {
      const cfg = await mapConfig();
      const accQuery = accommodation?.address || accommodation?.name;
      const accGeo = accQuery ? await geocode(accQuery).catch(() => null) : null;
      if (cancelled || !mapRef.current) return;
      const L = window.L;
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
      const map = L.map(mapRef.current, {
        scrollWheelZoom: false, dragging: false, zoomControl: false,
        attributionControl: false, tap: false,
      });
      mapInstanceRef.current = map;
      addBaseLayer(L, map, cfg);

      places.forEach((pl) => {
        const marker = L.marker([pl.lat, pl.lon], {
          icon: L.divIcon({
            className: "leaflet-reisplanner-icon",
            html: `<div style="width:14px;height:14px;border-radius:50%;background:${PALETTE.coralDeep};border:2px solid #fff;box-shadow:0 1px 4px rgba(55,52,50,.4)"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          }),
        }).addTo(map);
        // Heeft de stip een activiteit als label, dan ga je daar naartoe — dat is
        // waar iemand op tikt. Alleen bij een plek zonder activiteit (losse
        // dagfoto's) blijft de oude foto-preview over als enige zinvolle actie.
        marker.on("click", () => {
          if (pl.activityId) document.getElementById(`journal-activity-${pl.activityId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
          else setViewing({ photos: pl.photos, index: 0 });
        });
        if (pl.label) {
          const shortLabel = pl.label.length > 20 ? pl.label.slice(0, 19) + "…" : pl.label;
          const timeSuffix = pl.time ? ` · ${escapeHtml(pl.time)}` : "";
          marker.bindTooltip(`<span style="font-weight:600">${escapeHtml(shortLabel)}</span>${timeSuffix}`, {
            permanent: true, direction: "top", offset: [0, -8], opacity: 0.95,
            className: "leaflet-reisplanner-tooltip",
          });
        }
      });

      // Een huisje in plaats van de oranje foto-stippen, zodat meteen duidelijk
      // is dat dit het startpunt (verblijf) is en niet nog een bezochte plek.
      // Geen naamlabel erbij — het icoon alleen zegt al genoeg.
      if (accGeo) {
        L.marker([accGeo.lat, accGeo.lon], {
          icon: L.divIcon({
            className: "leaflet-reisplanner-icon",
            html: `<div style="width:18px;height:18px;border-radius:50%;background:${PALETTE.textPrimary};border:2px solid #fff;box-shadow:0 1px 4px rgba(55,52,50,.4);display:flex;align-items:center;justify-content:center">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-9"/>
              </svg></div>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
          }),
        }).addTo(map);
      }

      // Iets ruimer uitgezoomd dan strikt nodig — met de naam-labels erbij oogt
      // een kaartje dat precies om de stippen sluit al snel te vol.
      const bounds = places.map((p) => [p.lat, p.lon]);
      if (accGeo) bounds.push([accGeo.lat, accGeo.lon]);
      if (bounds.length === 1) map.setView(bounds[0], 13);
      else map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
    })();

    return () => { cancelled = true; };
  }, [places, accommodation]);

  useEffect(() => () => {
    if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
  }, []);

  return (
    <div className="rounded-2xl overflow-hidden border border-gray-100 relative z-0" style={{ height: 190 }}>
      <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
      {viewing && (
        <PhotoLightbox photos={viewing.photos} index={viewing.index}
          onClose={() => setViewing(null)}
          onIndexChange={(i) => setViewing((v) => ({ ...v, index: i }))} />
      )}
    </div>
  );
}

// Toont waar je die nacht sliep, met een schone plaatsnaam (geocodeerd, net als
// het huisje op de dag-kaart) in plaats van het rauwe adres. Verandert het
// verblijf ten opzichte van de vorige dag — een reisdag — dan komt er ook een
// klein kaartje bij met beide plekken, verbonden met hetzelfde boogje als de
// andere kaarten in de app.
function AccommodationTransition({ current, previous, date }) {
  const [currentGeo, setCurrentGeo] = useState(null);
  const [previousGeo, setPreviousGeo] = useState(null);
  const [weather, setWeather] = useState(null);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const isTravelDay = !!(current && previous && current.id !== previous.id);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const q = current?.address || current?.name;
      if (!q) { if (!cancelled) setCurrentGeo(null); return; }
      const geo = await geocodePlace(q);
      if (!cancelled) setCurrentGeo(geo);
    })();
    return () => { cancelled = true; };
  }, [current?.id]);

  useEffect(() => {
    if (!isTravelDay) { setPreviousGeo(null); return; }
    let cancelled = false;
    (async () => {
      const q = previous.address || previous.name;
      if (!q) { if (!cancelled) setPreviousGeo(null); return; }
      const geo = await geocodePlace(q);
      if (!cancelled) setPreviousGeo(geo);
    })();
    return () => { cancelled = true; };
  }, [isTravelDay, previous?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (currentGeo?.lat == null || !date) { if (!cancelled) setWeather(null); return; }
      const w = await fetchDayWeather(currentGeo.lat, currentGeo.lon, date).catch(() => null);
      if (!cancelled) setWeather(w);
    })();
    return () => { cancelled = true; };
  }, [currentGeo?.lat, currentGeo?.lon, date]);

  // currentGeo/previousGeo kunnen alsnog city-only zijn (geen lat/lon) als
  // zelfs de schone plaatsnaam niet te geocoden viel — dan is er wel een
  // naam om te tonen, maar geen kaartje om te tekenen.
  const hasCoords = currentGeo?.lat != null && previousGeo?.lat != null;

  useEffect(() => {
    if (!isTravelDay || !mapRef.current || !hasCoords) return;
    let cancelled = false;

    (async () => {
      const cfg = await mapConfig();
      if (cancelled || !mapRef.current) return;
      const L = window.L;
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
      const map = L.map(mapRef.current, {
        scrollWheelZoom: false, dragging: false, zoomControl: false,
        attributionControl: false, tap: false,
      });
      mapInstanceRef.current = map;
      addBaseLayer(L, map, cfg);

      L.polyline(arcLatLngs(previousGeo, currentGeo), { color: PALETTE.coralDeep, weight: 2.5, opacity: 0.75 }).addTo(map);

      const dotIcon = () => L.divIcon({
        className: "leaflet-reisplanner-icon",
        html: `<div style="width:14px;height:14px;border-radius:50%;background:${PALETTE.coralDeep};border:2px solid #fff;box-shadow:0 1px 4px rgba(55,52,50,.4)"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      L.marker([previousGeo.lat, previousGeo.lon], { icon: dotIcon() }).addTo(map);
      L.marker([currentGeo.lat, currentGeo.lon], { icon: dotIcon() }).addTo(map);

      map.fitBounds([[previousGeo.lat, previousGeo.lon], [currentGeo.lat, currentGeo.lon]], { padding: [36, 36] });
    })();

    return () => { cancelled = true; };
  }, [isTravelDay, hasCoords, currentGeo, previousGeo]);

  useEffect(() => () => {
    if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
  }, []);

  if (!current) return null;

  const currentLabel = currentGeo?.city || current.address || current.name;
  const previousLabel = previousGeo?.city || previous?.address || previous?.name;

  return (
    <div>
      <span className="text-xs text-gray-500 flex items-center gap-1.5 min-w-0">
        <Icon name="bed" size={12} className="text-gray-400 shrink-0" />
        <span className="truncate">{isTravelDay ? `Van ${previousLabel} naar ${currentLabel}` : currentLabel}</span>
        <WeatherBadge weather={weather} className="ml-auto" />
      </span>
      {isTravelDay && hasCoords && (
        <>
          <div className="text-xs text-gray-400 flex items-center gap-1.5 mt-1">
            <Icon name="route" size={11} />
            <span className="tnum font-medium text-gray-600">{fmtDistance(haversineMeters(previousGeo, currentGeo))}</span>
            <span>in vogelvlucht</span>
          </div>
          <div className="rounded-xl overflow-hidden border border-gray-100 relative z-0 mt-1.5" style={{ height: 140 }}>
            <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
          </div>
        </>
      )}
    </div>
  );
}

// De kaart waar het dagboek nu mee opent: één stip per dag — de eerst
// bezochte plek van die dag — genummerd op het dagnummer en verbonden met
// speelse boogjes, dezelfde vluchtroute-boog als op de planningskaart, in
// plaats van rechte lijnen. Een tik op een dagnummer springt direct naar dat
// dagkaartje verderop in het dagboek, zodat de kaart een navigatiemiddel is,
// niet alleen een plaatje.
function JournalOverviewMap({ trip, days, photos, accommodations }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [upcomingGeo, setUpcomingGeo] = useState([]);

  const dayInfoByDate = React.useMemo(() => {
    const m = new Map();
    days.forEach((d, i) => { if (d.date) m.set(String(d.date).slice(0, 10), { number: i + 1, id: d.id }); });
    return m;
  }, [days]);

  // clusterPhotoPlaces levert de plekken al in de volgorde waarin ze voor het
  // eerst voorkwamen (chronologisch) — de eerste plek per dagnummer die we
  // tegenkomen is dus meteen de eerst bezochte plek van die dag.
  const dayMarkers = React.useMemo(() => {
    const places = clusterPhotoPlaces(photos || []);
    const seen = new Set();
    const markers = [];
    places.forEach((pl) => {
      const dayIso = pl.first ? String(pl.first).slice(0, 10) : null;
      const info = dayIso ? dayInfoByDate.get(dayIso) : null;
      if (!info || seen.has(info.number)) return;
      seen.add(info.number);
      markers.push({ ...pl, dayNumber: info.number, dayId: info.id });
    });
    return markers;
  }, [photos, dayInfoByDate]);

  const visitedDayNumbers = React.useMemo(() => new Set(dayMarkers.map((m) => m.dayNumber)), [dayMarkers]);

  // Dagen die nog moeten komen (of vandaag, zolang daar nog geen foto van is):
  // de eerste geplande activiteit met een locatie, anders het verblijf van die
  // nacht. Zo toont de kaart in één oogopslag de hele route, niet alleen het
  // deel dat al bezocht is.
  const upcomingItems = React.useMemo(() => {
    const todayStr = todayIso(trip?.timezone);
    if (!todayStr) return [];
    const isoDateLocal = (dt) => dt ? String(dt).slice(0, 10) : null;
    const nightAccommodationOn = (ds) => ds ? (accommodations || []).find((a) => {
      if (!a.check_in || !a.check_out) return false;
      return isoDateLocal(a.check_in) <= ds && isoDateLocal(a.check_out) > ds;
    }) : null;
    const items = [];
    (days || []).forEach((day, i) => {
      const dayStr = isoDateLocal(day.date);
      const dayNumber = i + 1;
      if (!dayStr || dayStr < todayStr || visitedDayNumbers.has(dayNumber)) return;
      const firstActivity = (day.activities || []).find((a) => a.location);
      const acc = nightAccommodationOn(dayStr);
      const query = firstActivity ? firstActivity.location : (acc ? (acc.address || acc.name) : null);
      if (query) items.push({ dayNumber, dayId: day.id, query });
    });
    return items;
  }, [days, accommodations, trip?.timezone, visitedDayNumbers]);

  // Sequentieel i.p.v. Promise.all: dit kan een handvol nog niet eerder
  // opgezochte plekken zijn, en geocode()'s ingebouwde Nominatim-pacing is
  // per aanroep — parallel zou dat alsnog als een burst afvuren.
  useEffect(() => {
    if (!upcomingItems.length) { setUpcomingGeo([]); return; }
    let cancelled = false;
    (async () => {
      const resolved = [];
      for (const item of upcomingItems) {
        const geo = await geocodePlace(item.query).catch(() => null);
        if (cancelled) return;
        if (geo?.lat != null) resolved.push({ ...item, lat: geo.lat, lon: geo.lon });
      }
      if (!cancelled) setUpcomingGeo(resolved);
    })();
    return () => { cancelled = true; };
  }, [upcomingItems]);

  useEffect(() => {
    if (!mapRef.current || (dayMarkers.length === 0 && upcomingGeo.length === 0)) return;
    let cancelled = false;

    (async () => {
      const cfg = await mapConfig();
      if (cancelled || !mapRef.current) return;
      const L = window.L;
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
      // dragging/tap uit: dit kaartje staat ingebed in een scrollende pagina, en
      // een sleepgebaar dat wordt onderbroken (bv. door een tik die de kaart
      // opnieuw opbouwt) kan Leaflet's touch-afhandeling in de war laten, met
      // als gevolg dat de pagina daarna niet meer wil scrollen. Pinch-zoom en de
      // zoomknoppen blijven gewoon werken, alleen slepen niet.
      const map = L.map(mapRef.current, { scrollWheelZoom: false, dragging: false, tap: false });
      mapInstanceRef.current = map;
      addBaseLayer(L, map, cfg);

      for (let i = 1; i < dayMarkers.length; i++) {
        L.polyline(arcLatLngs(dayMarkers[i - 1], dayMarkers[i]), { color: PALETTE.coralDeep, weight: 2.5, opacity: 0.75 }).addTo(map);
      }
      // Route die nog moet komen: lichter en gestippeld — nog niet gelopen,
      // in tegenstelling tot de dikke ononderbroken lijn hierboven.
      const futureChain = [...(dayMarkers.length ? [dayMarkers[dayMarkers.length - 1]] : []), ...upcomingGeo];
      for (let i = 1; i < futureChain.length; i++) {
        L.polyline(arcLatLngs(futureChain[i - 1], futureChain[i]), { color: PALETTE.coralDeep, weight: 2, opacity: 0.45, dashArray: "2 8" }).addTo(map);
      }

      dayMarkers.forEach((pl) => {
        const marker = L.marker([pl.lat, pl.lon], {
          icon: L.divIcon({
            className: "leaflet-reisplanner-icon",
            html: `<div style="width:30px;height:30px;border-radius:50%;background:${PALETTE.coralDeep};border:2.5px solid #fff;box-shadow:0 2px 8px rgba(55,52,50,.35);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;cursor:pointer">${pl.dayNumber}</div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          }),
          // Twee dagen op (bijna) dezelfde plek vallen bij een uitgezoomde reis
          // al snel samen tot één stip. Leaflet tekent dan standaard de laatst
          // toegevoegde — dus de laatste dag — bovenop; met deze offset wint
          // altijd de vroegste dag, want dat is de dag waarop je er aankwam.
          zIndexOffset: 100000 - pl.dayNumber * 100,
        }).addTo(map);
        marker.bindTooltip(`Dag ${pl.dayNumber}`, { direction: "top", offset: [0, -16] });
        marker.on("click", () => {
          document.getElementById(`journal-day-${pl.dayId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });

      // Nog te gaan: hol en gestippeld omlijnd i.p.v. gevuld, zodat in één
      // oogopslag duidelijk is wat al gedaan is en wat nog moet komen.
      upcomingGeo.forEach((pl) => {
        const marker = L.marker([pl.lat, pl.lon], {
          icon: L.divIcon({
            className: "leaflet-reisplanner-icon",
            html: `<div style="width:26px;height:26px;border-radius:50%;background:#fff;border:2.5px dashed ${PALETTE.coralDeep};box-shadow:0 2px 6px rgba(55,52,50,.2);color:${PALETTE.coralDeep};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;cursor:pointer">${pl.dayNumber}</div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13],
          }),
          zIndexOffset: 50000 - pl.dayNumber * 100,
        }).addTo(map);
        marker.bindTooltip(`Dag ${pl.dayNumber} · nog te gaan`, { direction: "top", offset: [0, -14] });
        marker.on("click", () => {
          document.getElementById(`journal-day-${pl.dayId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });

      const bounds = [...dayMarkers, ...upcomingGeo].map((p) => [p.lat, p.lon]);
      if (bounds.length === 1) map.setView(bounds[0], 13);
      else map.fitBounds(bounds, { padding: [36, 36] });
    })();

    return () => { cancelled = true; };
  }, [dayMarkers, upcomingGeo]);

  useEffect(() => () => {
    if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
  }, []);

  if (dayMarkers.length === 0 && upcomingItems.length === 0) return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 text-center py-8 px-4 mb-6 text-sm text-gray-400">
      Zodra je foto's uploadt, of een verblijf/activiteit met locatie plant, verschijnt hier de kaart van je reis.
    </div>
  );

  return (
    <div className="rounded-3xl overflow-hidden border border-gray-200 shadow-sm relative z-0 mb-6" style={{ height: 280 }}>
      <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

// Twee kaarten met dezelfde ondergrond, maar met een andere vraag: waar ga ik
// heen, en waar ben ik geweest.
function TripMapTab({ trip, accommodations, transports, days }) {
  const [mode, setMode] = useState("visited");
  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h3 className="font-display text-[21px] text-gray-800">Reiskaart</h3>
        <div className="flex gap-1 bg-gray-100 rounded-full p-1">
          {[["visited", "Geweest"], ["planned", "Planning"]].map(([key, label]) => (
            <button key={key} onClick={() => setMode(key)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${mode === key ? "bg-white shadow-sm text-gray-800 font-semibold" : "text-gray-500 hover:text-gray-700"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {mode === "visited"
        ? <VisitedMap trip={trip} />
        : <MapTab trip={trip} accommodations={accommodations} transports={transports} days={days} />}
    </div>
  );
}

// ---------- Import modal ----------
function ImportModal({ tripId, onImported, onClose }) {
  // Items added one at a time only updated local state; onImported ran solely
  // from saveAll. Closing after individual adds therefore left the trip stale
  // until the user navigated away and back. Track it and refresh on close.
  const savedAnyRef = useRef(false);
  const handleClose = () => (savedAnyRef.current ? onImported() : onClose());
  const [mode, setMode] = useState("text"); // "text" | "image"
  const [text, setText] = useState("");
  const [imagePreview, setImagePreview] = useState(null);
  const [imageData, setImageData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState({ transports: [], accommodations: [], activities: [] });
  const [days, setDays] = useState([]);
  const [activityDays, setActivityDays] = useState({});
  const [existing, setExisting] = useState({ transports: [], accommodations: [] });
  const [confirmReplace, setConfirmReplace] = useState(null); // { type, item, idx, conflicts }
  const fileRef = useRef(null);

  useEffect(() => {
    api.getDays(tripId).then(setDays);
    Promise.all([
      api.getTransports(tripId),
      api.getAccommodations(tripId),
    ]).then(([t, a]) => setExisting({ transports: t, accommodations: a })).catch(() => {});
  }, [tripId]);

  function conflictsForTransport(t) {
    const dates = [t.departure_time, t.arrival_time].filter(Boolean).map((d) => String(d).slice(0, 10));
    return existing.transports.filter((e) =>
      [e.departure_time, e.arrival_time].filter(Boolean).some((d) => dates.includes(String(d).slice(0, 10)))
    );
  }

  function conflictsForAccommodation(a) {
    if (!a.check_in && !a.check_out) return [];
    return existing.accommodations.filter((e) =>
      (a.check_in && (String(e.check_in).slice(0, 10) === String(a.check_in).slice(0, 10) ||
                      String(e.check_out).slice(0, 10) === String(a.check_in).slice(0, 10))) ||
      (a.check_out && (String(e.check_in).slice(0, 10) === String(a.check_out).slice(0, 10) ||
                       String(e.check_out).slice(0, 10) === String(a.check_out).slice(0, 10)))
    );
  }

  function handleImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError("Afbeelding is te groot (max 10 MB)"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      setImagePreview(dataUrl);
      const base64 = dataUrl.split(",")[1];
      setImageData({ data: base64, mediaType: file.type });
      setError(null);
    };
    reader.readAsDataURL(file);
  }

  async function handleAnalyze(e) {
    e.preventDefault();
    if (_guestMode) {
      setError("De importfunctie vereist een account. Log in of maak een account aan om deze functie te gebruiken.");
      return;
    }
    setLoading(true); setError(null); setResult(null);
    try {
      const body = mode === "image" ? { image: imageData } : { text };
      const data = await apiFetch(`/api/trips/${tripId}/import`, { method: "POST", body: JSON.stringify(body) });
      setResult(data);
      const defaults = {};
      (data.activities || []).forEach((act, i) => {
        if (act.date) {
          const match = days.find((d) => d.date && d.date.slice(0, 10) === act.date);
          if (match) defaults[i] = match.id;
        }
      });
      setActivityDays(defaults);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function doSaveTransport(t, idx, replace) {
    setSaving(true);
    try {
      if (replace) await Promise.all(replace.map((e) => apiFetch(`/api/transports/${e.id}`, { method: "DELETE" })));
      await api.addTransport(tripId, t);
      setSaved((s) => ({ ...s, transports: [...s.transports, idx] }));
      savedAnyRef.current = true;
    } catch (err) { alert(err.message); }
    finally { setSaving(false); setConfirmReplace(null); }
  }

  async function saveTransport(t, idx) {
    const conflicts = conflictsForTransport(t);
    if (conflicts.length) { setConfirmReplace({ type: "transport", item: t, idx, conflicts }); return; }
    await doSaveTransport(t, idx, []);
  }

  async function doSaveAccommodation(a, idx, replace) {
    setSaving(true);
    try {
      if (replace) await Promise.all(replace.map((e) => apiFetch(`/api/accommodations/${e.id}`, { method: "DELETE" })));
      await api.addAccommodation(tripId, a);
      setSaved((s) => ({ ...s, accommodations: [...s.accommodations, idx] }));
      savedAnyRef.current = true;
    } catch (err) { alert(err.message); }
    finally { setSaving(false); setConfirmReplace(null); }
  }

  async function saveAccommodation(a, idx) {
    const conflicts = conflictsForAccommodation(a);
    if (conflicts.length) { setConfirmReplace({ type: "accommodation", item: a, idx, conflicts }); return; }
    await doSaveAccommodation(a, idx, []);
  }

  async function saveActivity(act, idx) {
    const dayId = activityDays[idx];
    if (!dayId) { alert("Selecteer eerst een dag voor deze activiteit."); return; }
    setSaving(true);
    try {
      await api.addActivity(dayId, { ...act, trip_id: tripId });
      setSaved((s) => ({ ...s, activities: [...s.activities, idx] }));
      savedAnyRef.current = true;
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  }

  async function saveAll() {
    setSaving(true);
    try {
      for (let i = 0; i < (result.transports || []).length; i++) {
        if (!saved.transports.includes(i)) await api.addTransport(tripId, result.transports[i]);
      }
      for (let i = 0; i < (result.accommodations || []).length; i++) {
        if (!saved.accommodations.includes(i)) await api.addAccommodation(tripId, result.accommodations[i]);
      }
      for (let i = 0; i < (result.activities || []).length; i++) {
        if (!saved.activities.includes(i) && activityDays[i]) {
          await api.addActivity(activityDays[i], { ...result.activities[i], trip_id: tripId });
        }
      }
      onImported();
      onClose();
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  }

  const totalFound = result ? (result.transports.length + result.accommodations.length + result.activities.length) : 0;
  const totalSaved = saved.transports.length + saved.accommodations.length + saved.activities.length;

  if (confirmReplace) {
    const { type, item, idx, conflicts } = confirmReplace;
    return (
      <Modal title="Bestaande items vervangen?" onClose={() => setConfirmReplace(null)} wide>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Op deze datum{conflicts.length > 1 ? "s zijn" : " is"} al {conflicts.length === 1 ? "een item" : `${conflicts.length} items`} aanwezig:
          </p>
          <ul className="space-y-1">
            {conflicts.map((c) => (
              <li key={c.id} className="text-sm bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-gray-700">
                {type === "transport" ? `${c.type}: ${c.from_location} → ${c.to_location}` : c.name}
              </li>
            ))}
          </ul>
          <p className="text-sm text-gray-600">Wil je {conflicts.length === 1 ? "dit item" : "deze items"} vervangen door de nieuwe import?</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => {
              setConfirmReplace(null);
              if (type === "transport") doSaveTransport(item, idx, []);
              else doSaveAccommodation(item, idx, []);
            }}>Naast elkaar bewaren</Button>
            <Button onClick={() => {
              if (type === "transport") doSaveTransport(item, idx, conflicts);
              else doSaveAccommodation(item, idx, conflicts);
            }} disabled={saving}>{saving ? "Bezig..." : "Vervangen"}</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Bevestiging importeren" onClose={handleClose} wide>
      {!result ? (
        <form onSubmit={handleAnalyze} className="space-y-4">
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            <button type="button" onClick={() => setMode("text")}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${mode === "text" ? "bg-white shadow-sm text-gray-800 font-semibold" : "text-gray-500 hover:text-gray-700"}`}>
              <Icon name="clipboard" size={15} className="mr-1.5" />Tekst plakken
            </button>
            <button type="button" onClick={() => setMode("image")}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${mode === "image" ? "bg-white shadow-sm text-gray-800 font-semibold" : "text-gray-500 hover:text-gray-700"}`}>
              <Icon name="camera" size={15} className="mr-1.5" />Foto uploaden
            </button>
          </div>

          {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}

          {mode === "text" ? (
            <Field label="Tekst van de bevestiging">
              <Textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="Plak hier de volledige tekst van je boekingsbevestiging..." />
            </Field>
          ) : (
            <div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
              {imagePreview ? (
                <div className="relative rounded-xl overflow-hidden">
                  <img src={imagePreview} alt="preview" className="w-full max-h-72 object-contain bg-gray-50" />
                  <button type="button" onClick={() => { setImagePreview(null); setImageData(null); }}
                    className="absolute top-2 right-2 bg-black/50 text-white rounded-full w-7 h-7 flex items-center justify-center hover:bg-black/70">×</button>
                </div>
              ) : (
                <div onClick={() => fileRef.current.click()}
                  className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center cursor-pointer hover:border-sky-400 hover:bg-sky-50 transition-colors">
                  <Icon name="camera" size={34} strokeWidth={1.2} className="mx-auto mb-3 text-gray-300" />
                  <div className="text-sm font-medium text-gray-600">Klik om een foto of screenshot te kiezen</div>
                  <div className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP — max 10 MB</div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>Annuleren</Button>
            <Button type="submit" disabled={loading || (mode === "text" ? !text.trim() : !imageData)}>
              {loading ? "Toevoegen..." : <><Icon name="plus" size={15} className="mr-1.5" />Toevoegen</>}
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-5">
          {totalFound === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Icon name="search" size={34} strokeWidth={1.2} className="mx-auto mb-3 text-gray-300" />
              <div>Niets gevonden in deze tekst.</div>
              <div className="text-sm mt-1">Probeer het met een andere bevestiging.</div>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500">{totalFound} item{totalFound !== 1 ? "s" : ""} gevonden. Voeg toe aan je reis:</p>

              {result.transports.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-700 mb-2 flex items-center gap-1.5"><Icon name="plane" size={15} className="text-gray-400" />Vervoer ({result.transports.length})</h3>
                  <div className="space-y-2">
                    {result.transports.map((t, i) => (
                      <div key={i} className={`bg-gray-50 rounded-xl p-4 flex items-start justify-between gap-4 ${saved.transports.includes(i) ? "opacity-50" : ""}`}>
                        <div className="flex-1">
                          <div className="font-medium text-gray-800">{t.type}: {t.from_location} → {t.to_location}</div>
                          <div className="text-sm text-gray-500 mt-0.5 flex gap-3 flex-wrap">
                            {t.departure_time && <span>Vertrek: {fmtDatetime(t.departure_time)}</span>}
                            {t.arrival_time && <span>Aankomst: {fmtDatetime(t.arrival_time)}</span>}
                            {t.booking_ref && <span className="font-mono text-xs bg-gray-200 px-1.5 py-0.5 rounded">#{t.booking_ref}</span>}
                            {t.cost != null && <span>{fmtMoney(t.cost)}</span>}
                          </div>
                          {t.notes && <div className="text-xs text-gray-500 mt-1">{t.notes}</div>}
                        </div>
                        {saved.transports.includes(i)
                          ? <span className="text-green-600 text-sm shrink-0 flex items-center gap-1"><Icon name="check" size={14} />Toegevoegd</span>
                          : <Button variant="secondary" onClick={() => saveTransport(t, i)} disabled={saving}>Toevoegen</Button>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.accommodations.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-700 mb-2 flex items-center gap-1.5"><Icon name="bed" size={15} className="text-gray-400" />Verblijf ({result.accommodations.length})</h3>
                  <div className="space-y-2">
                    {result.accommodations.map((a, i) => (
                      <div key={i} className={`bg-gray-50 rounded-xl p-4 flex items-start justify-between gap-4 ${saved.accommodations.includes(i) ? "opacity-50" : ""}`}>
                        <div className="flex-1">
                          <div className="font-medium text-gray-800">{a.name}</div>
                          <div className="text-sm text-gray-500 mt-0.5 flex gap-3 flex-wrap">
                            {a.check_in && <span>Check-in: {fmt(a.check_in)}</span>}
                            {a.check_out && <span>Check-out: {fmt(a.check_out)}</span>}
                            {a.booking_ref && <span className="font-mono text-xs bg-gray-200 px-1.5 py-0.5 rounded">#{a.booking_ref}</span>}
                            {a.cost != null && <span>{fmtMoney(a.cost)}</span>}
                          </div>
                          {a.address && <div className="text-xs text-gray-500 mt-1 flex items-center gap-1"><Icon name="pin" size={12} />{a.address}</div>}
                          {a.notes && <div className="text-xs text-gray-500 mt-1">{a.notes}</div>}
                        </div>
                        {saved.accommodations.includes(i)
                          ? <span className="text-green-600 text-sm shrink-0 flex items-center gap-1"><Icon name="check" size={14} />Toegevoegd</span>
                          : <Button variant="secondary" onClick={() => saveAccommodation(a, i)} disabled={saving}>Toevoegen</Button>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.activities.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-700 mb-2 flex items-center gap-1.5"><Icon name="route" size={15} className="text-gray-400" />Activiteiten ({result.activities.length})</h3>
                  <div className="space-y-2">
                    {result.activities.map((act, i) => (
                      <div key={i} className={`bg-gray-50 rounded-xl p-4 ${saved.activities.includes(i) ? "opacity-50" : ""}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="font-medium text-gray-800">{act.title}</div>
                            <div className="text-sm text-gray-500 mt-0.5 flex gap-3 flex-wrap">
                              {act.date && <span className="flex items-center gap-1"><Icon name="calendar" size={12} />{fmt(act.date)}</span>}
                              {act.time && <span className="flex items-center gap-1"><Icon name="clock" size={12} /><span className="tnum">{act.time}</span></span>}
                              {act.location && <span className="flex items-center gap-1"><Icon name="pin" size={12} />{act.location}</span>}
                              {act.cost != null && <span>{fmtMoney(act.cost)}</span>}
                            </div>
                            {act.notes && <div className="text-xs text-gray-500 mt-1">{act.notes}</div>}
                          </div>
                          {saved.activities.includes(i)
                            ? <span className="text-green-600 text-sm shrink-0 flex items-center gap-1"><Icon name="check" size={14} />Toegevoegd</span>
                            : <Button variant="secondary" onClick={() => saveActivity(act, i)} disabled={saving || !activityDays[i]}>Toevoegen</Button>}
                        </div>
                        {!saved.activities.includes(i) && (
                          <div className="mt-3">
                            <Select
                              value={activityDays[i] || ""}
                              onChange={(e) => setActivityDays((d) => ({ ...d, [i]: e.target.value }))}
                            >
                              <option value="">— Kies een dag —</option>
                              {days.map((d) => (
                                <option key={d.id} value={d.id}>{fmt(d.date)}{d.title ? ` — ${d.title}` : ""}</option>
                              ))}
                            </Select>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="secondary" onClick={onClose}>Sluiten</Button>
            {totalFound > 0 && totalSaved < totalFound && (
              <Button onClick={saveAll} disabled={saving}>{saving ? "Opslaan..." : "Alles toevoegen"}</Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---------- Share modal ----------
function fmtDuration(minutes) {
  const m = Number(minutes) || 0;
  if (!m) return "";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} u ${rest} min` : `${h} uur`;
}

// Herleidt een reactie/duimpje naar de dag waar die bij hoort — dezelfde
// dag/activiteit/vervoer/verblijf-koppeling als photoAssignmentInfo hierboven,
// maar dan met de dag-id als navigatiedoel in plaats van een label alleen.
function recentActivityTarget(item, days, transports, accommodations) {
  if (item.day_id) {
    const day = days.find((d) => d.id === item.day_id);
    return day ? { dayId: day.id, label: dayOptionLabel(day) } : null;
  }
  if (item.activity_id) {
    for (const day of days) {
      const act = (day.activities || []).find((a) => a.id === item.activity_id);
      if (act) return { dayId: day.id, label: act.title };
    }
    return null;
  }
  if (item.transport_id) {
    const t = (transports || []).find((t) => t.id === item.transport_id);
    if (!t) return null;
    const dayStr = t.departure_time ? String(t.departure_time).slice(0, 10) : t.arrival_time ? String(t.arrival_time).slice(0, 10) : null;
    const day = days.find((d) => d.date && String(d.date).slice(0, 10) === dayStr);
    return day ? { dayId: day.id, label: `${t.from_location} → ${t.to_location}` } : null;
  }
  if (item.accommodation_id) {
    const a = (accommodations || []).find((a) => a.id === item.accommodation_id);
    if (!a) return null;
    const dayStr = a.check_in ? String(a.check_in).slice(0, 10) : null;
    const day = days.find((d) => d.date && String(d.date).slice(0, 10) === dayStr);
    return day ? { dayId: day.id, label: a.name } : null;
  }
  return null;
}

function ShareModal({ tripId, onClose, role = "viewer", days, transports, accommodations, onJumpToDay }) {
  const [link, setLink] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);

  function generateLink(r) {
    setLink(null); setLoading(true); setError(null);
    api.createInvite(tripId, r)
      .then((d) => setLink(d.link))
      // Guest trips report is_owner, so the Delen button is offered and this
      // rejected with no handler — an unhandled rejection and a blank modal.
      .catch((err) => setError(err.message || "Delen is niet gelukt"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { generateLink(role); }, [tripId, role]);

  const loadStats = useCallback(() => {
    api.getShareStats(tripId).then(setStats).catch(() => {});
  }, [tripId]);
  useEffect(() => { loadStats(); }, [loadStats]);

  function handleCopy() {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Modal title={role === "editor" ? "Reis delen met reisgenoot" : "Reis delen"} onClose={onClose} wide>
      <div className="space-y-4">
        <div className={`rounded-xl px-3 py-2.5 ${role === "editor" ? "bg-sky-50 border border-sky-200" : "bg-gray-50 border border-gray-200"}`}>
          <div className="text-sm font-semibold text-gray-800">
            {role === "editor" ? "Reisgenoot" : "Alleen-lezen"}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {role === "editor"
              ? "Kan alles zien en aanpassen, inclusief budget en kosten."
              : "Voor familie & vrienden — ziet het dagboek en de foto's, geen budget of kosten, en kan niets wijzigen."}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-4 text-gray-400">Link aanmaken...</div>
        ) : link && (
          <>
            <div className="flex gap-2">
              <input
                readOnly
                value={link}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-gray-50 focus:outline-none"
                onClick={(e) => e.target.select()}
              />
              <Button onClick={handleCopy} variant={copied ? "secondary" : "primary"}>
                {copied ? <><Icon name="check" size={14} className="mr-1.5" />Gekopieerd</> : "Kopiëren"}
              </Button>
            </div>
            <a
              href={`mailto:?subject=${encodeURIComponent("Uitnodiging: bekijk onze reis")}&body=${encodeURIComponent(`Hoi!\n\nIk wil deze reis met je delen via Reisplanner.\n\nKlik op de link hieronder om toegang te krijgen:\n${link}\n\nTot snel!`)}`}
              className="flex items-center justify-center gap-2 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Icon name="mail" size={15} className="mr-1.5" />Verstuur via Mail
            </a>
          </>
        )}
        <p className="text-xs text-gray-400">De link blijft geldig totdat je hem verwijdert.</p>

        {role === "viewer" && stats && (stats.members.length > 0) && (
          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Wie heeft de reis bekeken</label>
              <div className="flex gap-3 text-xs text-gray-500">
                <span><b className="text-gray-700">{stats.total_views}</b> keer bekeken</span>
                <span><b className="text-gray-700">{stats.views_24h}</b> in 24u</span>
              </div>
            </div>
            <div className="space-y-1.5">
              {stats.members.map((m) => {
                const open = expanded === m.id;
                const hasDetail = m.minutes > 0 || m.comments > 0 || m.likes > 0;
                return (
                  <div key={m.id} className="rounded-lg bg-gray-50 overflow-hidden">
                    <button type="button" onClick={() => setExpanded(open ? null : m.id)}
                      className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left">
                      {m.avatar ? (
                        <img src={m.avatar} alt="" className="w-7 h-7 rounded-full shrink-0" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-500 shrink-0">
                          {(m.given_name || m.name || "?")[0].toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-700 truncate">{m.given_name || m.name || m.email}</div>
                        <div className="text-xs text-gray-400">
                          {m.role === "viewer" ? "Alleen-lezen" : "Bewerker"}
                          {m.visits > 0 && ` · ${m.visits}x langsgeweest`}
                          {m.minutes > 0 && ` · ${fmtDuration(m.minutes)} gelezen`}
                          {m.last_active_at && ` · laatst ${fmtDatetime(m.last_active_at)}`}
                        </div>
                      </div>
                      {hasDetail && <span className="text-gray-300 text-xs shrink-0">{open ? "▲" : "▼"}</span>}
                    </button>

                    {open && hasDetail && (
                      <div className="px-2.5 pb-2.5 pt-1 space-y-2 border-t border-gray-100">
                        <div className="grid grid-cols-3 gap-2 text-center">
                          {[["Bezoeken", m.visits], ["Gelezen", fmtDuration(m.minutes)], ["Langste bezoek", fmtDuration(m.longest_minutes)]]
                            .map(([label, value]) => (
                              <div key={label} className="bg-white rounded-lg py-1.5">
                                <div className="text-sm font-semibold text-gray-700">{value || "—"}</div>
                                <div className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</div>
                              </div>
                            ))}
                        </div>
                        <div className="text-xs text-gray-500">
                          <Icon name="chat" size={12} className="mr-1" />{m.comments} reactie{m.comments === 1 ? "" : "s"} · <Icon name="thumb" size={12} className="mx-1" />{m.likes} duimpje{m.likes === 1 ? "" : "s"}
                          {m.first_active_at && ` · volgt sinds ${fmtDatetime(m.first_active_at)}`}
                        </div>
                        {m.recent.length > 0 && (
                          <div className="space-y-1">
                            {m.recent.map((a, i) => {
                              const target = onJumpToDay ? recentActivityTarget(a, days || [], transports, accommodations) : null;
                              return (
                                <div key={i} onClick={() => target && onJumpToDay(target.dayId)}
                                  className={`text-xs text-gray-500 flex gap-2 rounded-md -mx-1 px-1 py-0.5 ${target ? "cursor-pointer hover:bg-white hover:text-sky-700 transition-colors" : ""}`}>
                                  <Icon name={a.kind === "comment" ? "chat" : "thumb"} size={13} className="mt-0.5 text-gray-400 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="truncate">{a.kind === "comment" ? a.detail : "gaf een duimpje"}</div>
                                    {target && <div className="text-[10px] text-gray-400 truncate">bij {target.label}</div>}
                                  </div>
                                  <span className="shrink-0 text-gray-300">{fmtDatetime(a.at)}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>Sluiten</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Photo gallery tab ----------
function photoAssignmentInfo(photo, days, transports, accommodations) {
  if (photo.activity_id) {
    for (const day of days) {
      const act = (day.activities || []).find((a) => a.id === photo.activity_id);
      if (act) return { icon: categoryIcon(act.category), text: act.title };
    }
    return { icon: categoryIcon(), text: "Activiteit" };
  }
  if (photo.transport_id) {
    const t = transports.find((t) => t.id === photo.transport_id);
    return { icon: transportIcon(t?.type), text: t ? `${t.from_location} → ${t.to_location}` : "Vervoer" };
  }
  if (photo.accommodation_id) {
    const a = accommodations.find((a) => a.id === photo.accommodation_id);
    return { icon: "bed", text: a ? a.name : "Verblijf" };
  }
  if (photo.day_id) {
    const day = days.find((d) => d.id === photo.day_id);
    return { icon: "calendar", text: day ? dayOptionLabel(day) : "Dag" };
  }
  return null;
}

function photoTargetValue(photo) {
  if (photo.activity_id) return `activity:${photo.activity_id}`;
  if (photo.transport_id) return `transport:${photo.transport_id}`;
  if (photo.accommodation_id) return `accommodation:${photo.accommodation_id}`;
  if (photo.day_id) return `day:${photo.day_id}`;
  return "";
}

function computeDayGroups(days, transports, accommodations) {
  const isoDate = (dt) => dt ? String(dt).slice(0, 10) : null;
  const dayGroups = days.map((day) => {
    const dayStr = day.date ? day.date.slice(0, 10) : null;
    return {
      day,
      transports: transports.filter((t) => isoDate(t.departure_time) === dayStr || isoDate(t.arrival_time) === dayStr),
      accommodations: accommodations.filter((a) => isoDate(a.check_in) === dayStr || isoDate(a.check_out) === dayStr),
    };
  });
  const matchedTransportIds = new Set(dayGroups.flatMap((g) => g.transports.map((t) => t.id)));
  const matchedAccommodationIds = new Set(dayGroups.flatMap((g) => g.accommodations.map((a) => a.id)));
  const otherTransports = transports.filter((t) => !matchedTransportIds.has(t.id));
  const otherAccommodations = accommodations.filter((a) => !matchedAccommodationIds.has(a.id));
  return { dayGroups, otherTransports, otherAccommodations };
}

function assignPhotoPayload(days, value) {
  const payload = { day_id: null, activity_id: null, transport_id: null, accommodation_id: null };
  if (!value) return payload;
  // Only the first ":" separates type from id — guest-mode ids are strings like
  // "g1721…", so coercing with Number() would yield NaN and silently null out
  // every field on the way to the API.
  const sep = value.indexOf(":");
  const type = value.slice(0, sep);
  const idStr = value.slice(sep + 1);
  const id = /^\d+$/.test(idStr) ? Number(idStr) : idStr;
  if (type === "day") payload.day_id = id;
  else if (type === "activity") {
    payload.activity_id = id;
    const day = days.find((d) => (d.activities || []).some((a) => a.id === id));
    if (day) payload.day_id = day.id;
  } else if (type === "transport") payload.transport_id = id;
  else if (type === "accommodation") payload.accommodation_id = id;
  return payload;
}

function PhotoGalleryTab({ trip, days, transports, accommodations, readOnly, currentUserId }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewingIndex, setViewingIndex] = useState(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [comments, setComments] = useState([]);
  const [slotLikes, setSlotLikes] = useState({});

  const loadPhotos = useCallback(async () => {
    try { setPhotos(await api.getPhotos(trip.id)); } catch {} finally { setLoading(false); }
  }, [trip.id]);
  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  // Alleen nodig voor de reacties-laag in de fotoviewer — dezelfde bron als
  // het dagboek, hier gebruikt om los van dat tabblad te kunnen reageren.
  const loadComments = useCallback(async () => {
    try {
      const d = await api.getJournal(trip.id);
      setComments(asList(d.comments));
      setSlotLikes(d.slot_likes || {});
    } catch {}
  }, [trip.id]);
  useEffect(() => { loadComments(); }, [loadComments]);

  const isoDate = (dt) => dt ? String(dt).slice(0, 10) : null;
  const { dayGroups, otherTransports, otherAccommodations } = computeDayGroups(days, transports, accommodations);

  const todayGroup = dayGroups.find((g) => isoDate(g.day.date) === todayIso(trip.timezone));
  const todayPhoto = todayGroup && photos.find((p) => {
    if (p.day_id === todayGroup.day.id) return true;
    if (p.activity_id && (todayGroup.day.activities || []).some((a) => a.id === p.activity_id)) return true;
    if (p.transport_id && todayGroup.transports.some((t) => t.id === p.transport_id)) return true;
    if (p.accommodation_id && todayGroup.accommodations.some((a) => a.id === p.accommodation_id)) return true;
    if (isoDate(p.taken_at) === todayIso(trip.timezone)) return true;
    return false;
  });
  function scrollToToday() {
    if (!todayPhoto) return;
    document.getElementById(`gallery-photo-${todayPhoto.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }




  async function handleAssign(photo, value) {
    const updated = await api.updatePhoto(photo.id, assignPhotoPayload(days, value));
    setPhotos((prev) => prev.map((p) => (p.id === photo.id ? updated : p)));
  }

  async function handleDelete(photo) {
    if (!confirm("Foto verwijderen?")) return;
    await api.deletePhoto(photo.id);
    setViewingIndex(null);
    loadPhotos();
  }

  if (loading) return <div className="text-center py-16 text-gray-400">Laden...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-2 flex-wrap">
        <h3 className="font-display text-[21px] text-gray-800">Foto's{photos.length > 0 ? ` (${photos.length})` : ""}</h3>
        <div className="flex gap-2">
          {todayPhoto && <Button onClick={scrollToToday} variant="secondary"><Icon name="pin" size={14} className="mr-1.5" />Vandaag</Button>}
          {!readOnly && <Button onClick={() => setBulkUploading(true)}><Icon name="camera" size={14} className="mr-1.5" />Foto's uploaden</Button>}
        </div>
      </div>

      {bulkUploading && (
        <BulkPhotoUpload tripId={trip.id} days={days}
          onClose={() => setBulkUploading(false)}
          onUploaded={loadPhotos} />
      )}

      {photos.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Icon name="camera" size={40} strokeWidth={1.2} className="mx-auto mb-3 text-gray-300" />
          <div className="font-medium">Nog geen foto's</div>
          <div className="text-sm mt-1">Gebruik "Foto's uploaden" hierboven, of voeg ze toe bij een verhaal in het Dagboek</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {photos.map((p, i) => {
            const assignment = photoAssignmentInfo(p, days, transports, accommodations);
            return (
              <button key={p.id} id={`gallery-photo-${p.id}`} onClick={() => setViewingIndex(i)}
                className="relative aspect-square rounded-lg overflow-hidden border border-gray-100 group"
                style={{ scrollMarginTop: "5rem", boxShadow: p.id === todayPhoto?.id ? `0 0 0 3px ${PALETTE.coral}` : undefined }}>
                <img src={p.thumb_url || p.url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                {assignment ? (
                  <div className="absolute bottom-1.5 left-1.5 right-1.5 text-white text-xs font-medium truncate flex items-center gap-1">
                    <Icon name={assignment.icon} size={13} /><span className="truncate">{assignment.text}</span>
                  </div>
                ) : (
                  <div className="absolute bottom-1.5 left-1.5 right-1.5 text-white/80 text-xs font-semibold">Niet toegewezen</div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {viewingIndex != null && (
        <PhotoLightbox photos={photos} index={viewingIndex}
          onClose={() => setViewingIndex(null)} onIndexChange={setViewingIndex}
          assign={readOnly ? null : { dayGroups, otherTransports, otherAccommodations, onChange: handleAssign }}
          onDelete={readOnly ? null : handleDelete}
          onRotate={readOnly ? null : async (p) => { await api.rotatePhoto(p.id); await loadPhotos(); }}
          onCaption={readOnly ? null : async (p, text) => { await api.setPhotoCaption(p.id, text); await loadPhotos(); }}
          comments={comments} slotLikes={slotLikes} tripId={trip.id} currentUserId={currentUserId} isOwner={trip.is_owner} onCommentsChange={loadComments} />
      )}
    </div>
  );
}

// ---------- Packing tab ----------
// De sleutel staat als tekst in de database (packing_items.category), dus die
// blijft ongewijzigd — inclusief de emoji, anders raken bestaande paklijsten hun
// categorie kwijt. Alleen wat de gebruiker ziet is vervangen door label + icoon.
// ---------- Fotoboek ----------
function PhotobookTab({ trip }) {
  const [books, setBooks] = useState(undefined); // undefined = laden
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [openBookId, setOpenBookId] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  // 1 = staand/liggend, 2 = hoeken van de foto's, 3 = achtergrondkleur,
  // 4 = automatisch vullen?, 5 = hoeveel foto's per pagina?,
  // 6 = paginatitels uit het dagboek?
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardOrientation, setWizardOrientation] = useState("portrait");
  const [wizardCorner, setWizardCorner] = useState(0);
  const [wizardBackground, setWizardBackground] = useState(null); // null = wit laten
  const [wizardPerPage, setWizardPerPage] = useState(1);

  const load = useCallback(async () => {
    try { setBooks(await api.getPhotobooks(trip.id)); }
    catch { setBooks([]); }
  }, [trip.id]);

  useEffect(() => { load(); }, [load]);

  // Drukwerkprijzen komen van Print API en dus van buiten: apart ophalen, ná de
  // lijst, zodat het overzicht meteen staat en een trage of onbereikbare
  // Print API hooguit betekent dat er geen prijs bij staat. Elke boek-aanvraag
  // vangt zijn eigen fout op, zodat één mislukking de rest niet meesleept.
  const [quotes, setQuotes] = useState({});
  useEffect(() => {
    if (!books || !books.length) return;
    let cancelled = false;
    Promise.all(books.map((b) =>
      api.getPhotobookPrintQuote(b.id).then((q) => [b.id, q]).catch(() => [b.id, { available: false }])
    )).then((pairs) => {
      if (!cancelled) setQuotes(Object.fromEntries(pairs));
    });
    return () => { cancelled = true; };
  }, [books]);

  async function handleCreate(opts) {
    setCreating(true); setError(null);
    try {
      const book = await api.createPhotobook(trip.id, opts);
      setWizardOpen(false);
      setOpenBookId(book.id);
      load();
    } catch (err) { setError(err.message || "Kon geen fotoboek maken"); }
    finally { setCreating(false); }
  }

  if (openBookId) {
    return <PhotobookEditor tripId={trip.id} bookId={openBookId} onBack={() => { setOpenBookId(null); load(); }} />;
  }

  if (books === undefined) return <div className="text-center py-16 text-gray-400">Laden...</div>;

  // Elke keuze toont meteen het bijpassende paginasjabloon (zelfde indelingen
  // als de "Pagina sjablonen" in de editor), zodat je ziet wat je kiest.
  const PHOTOBOOK_AUTOFILL_CHOICES = [
    { n: 1, layout: PHOTOBOOK_LAYOUTS[0] },
    { n: 2, layout: PHOTOBOOK_LAYOUTS[1] },
    { n: 3, layout: PHOTOBOOK_LAYOUTS[3] },
    { n: 4, layout: PHOTOBOOK_LAYOUTS[4] },
  ];

  return (
    <div className="max-w-md mx-auto">
      <div className="text-center py-6">
        <Icon name="frame" size={38} strokeWidth={1.2} className="mx-auto mb-3 text-sky-400" />
        <h3 className="font-display text-[21px] text-gray-800 mb-2">Fotoboek</h3>
        <p className="text-sm text-gray-500 leading-relaxed mb-5">
          Stel samen een fotoboek van deze reis samen — een voorgestelde selectie, volgorde en bijschrift om mee te beginnen, die je zelf verder aanpast.
        </p>
        {error && !wizardOpen && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg mb-4 text-left">{error}</div>}
        <Button onClick={() => { setWizardStep(1); setWizardOrientation("portrait"); setWizardCorner(0); setWizardBackground(null); setWizardPerPage(1); setWizardOpen(true); setError(null); }} disabled={creating}>+ Nieuw fotoboek</Button>
      </div>

      {wizardOpen && (
        <Modal title="Nieuw fotoboek" onClose={() => !creating && setWizardOpen(false)}>
          {wizardStep === 1 && (
            <div>
              <p className="text-sm text-gray-600 mb-4">Staand of liggend formaat?</p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <button type="button" onClick={() => { setWizardOrientation("portrait"); setWizardStep(2); }} disabled={creating}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border border-gray-200 hover:border-sky-300 hover:bg-sky-50 transition-colors disabled:opacity-50">
                  <div className="w-12 h-16 rounded border-2 border-gray-300 bg-gray-50" />
                  <span className="text-sm font-medium text-gray-800">Staand</span>
                </button>
                <button type="button" onClick={() => { setWizardOrientation("landscape"); setWizardStep(2); }} disabled={creating}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border border-gray-200 hover:border-sky-300 hover:bg-sky-50 transition-colors disabled:opacity-50">
                  <div className="w-16 h-12 rounded border-2 border-gray-300 bg-gray-50" />
                  <span className="text-sm font-medium text-gray-800">Liggend</span>
                </button>
              </div>
            </div>
          )}
          {wizardStep === 2 && (
            <div>
              <p className="text-sm text-gray-600 mb-4">
                Welke hoeken wil je voor de foto's? Dit geldt voor het hele boek — per foto kun je het later nog bijstellen.
              </p>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {PHOTOBOOK_CORNER_PRESETS.map((p) => (
                  <button key={p.value} type="button" onClick={() => { setWizardCorner(p.value); setWizardStep(3); }} disabled={creating}
                    className="flex flex-col items-center gap-2 p-2.5 rounded-xl border border-gray-200 hover:border-sky-300 hover:bg-sky-50 transition-colors disabled:opacity-50">
                    {/* Het voorbeeldje is 40px; de presets zijn fracties van een
                        paginazijde, dus hier omgerekend naar deze maat zodat het
                        blokje toont wat je op de pagina krijgt. */}
                    <span className="w-10 h-10 bg-sky-200 shrink-0" style={{ borderRadius: `${p.value * 40 * 4}px` }} />
                    <span className="text-xs font-medium text-gray-800">{p.label}</span>
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setWizardStep(1)} disabled={creating}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors">← Terug</button>
            </div>
          )}
          {wizardStep === 3 && (
            <div>
              <p className="text-sm text-gray-600 mb-4">
                Wil je de pagina's een achtergrondkleur geven? Die geldt voor het hele boek — per pagina kun je 'm later nog wijzigen.
              </p>
              <div className="grid grid-cols-4 gap-2 mb-4">
                <button type="button" onClick={() => { setWizardBackground(null); setWizardStep(4); }} disabled={creating}
                  className="flex flex-col items-center gap-2 p-2.5 rounded-xl border border-gray-200 hover:border-sky-300 hover:bg-sky-50 transition-colors disabled:opacity-50">
                  <span className="w-10 h-10 rounded-lg shrink-0 border border-gray-200 bg-white" />
                  <span className="text-xs font-medium text-gray-800">Wit</span>
                </button>
                {PHOTOBOOK_BG_SWATCHES.map((c) => (
                  <button key={c} type="button" onClick={() => { setWizardBackground(c); setWizardStep(4); }} disabled={creating}
                    className="flex flex-col items-center gap-2 p-2.5 rounded-xl border border-gray-200 hover:border-sky-300 hover:bg-sky-50 transition-colors disabled:opacity-50">
                    <span className="w-10 h-10 rounded-lg shrink-0 border border-black/5" style={{ background: c }} />
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setWizardStep(2)} disabled={creating}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors">← Terug</button>
            </div>
          )}
          {wizardStep === 4 && (
            <div>
              <p className="text-sm text-gray-600 mb-4">
                Wil je een automatisch voorgevuld fotoboek maken, met de foto's van deze reis alvast verdeeld over de pagina's?
              </p>
              <div className="space-y-2">
                <button type="button" onClick={() => setWizardStep(5)} disabled={creating}
                  className="w-full text-left p-3 rounded-xl border border-sky-200 bg-sky-50 hover:border-sky-300 transition-colors disabled:opacity-50">
                  <div className="font-medium text-gray-800">Ja, vul automatisch</div>
                  <div className="text-xs text-gray-500 mt-0.5">Alle foto's van de reis worden verdeeld over pagina's, die je daarna zelf verder aanpast.</div>
                </button>
                <button type="button" onClick={() => handleCreate({ autofill: false, orientation: wizardOrientation, cornerRadius: wizardCorner, backgroundColor: wizardBackground })} disabled={creating}
                  className="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors disabled:opacity-50">
                  <div className="font-medium text-gray-800">Nee, ik begin leeg</div>
                  <div className="text-xs text-gray-500 mt-0.5">Een leeg fotoboek waar je zelf pagina's en foto's aan toevoegt.</div>
                </button>
              </div>
              <button type="button" onClick={() => setWizardStep(3)} disabled={creating}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors mt-3">← Terug</button>
            </div>
          )}
          {wizardStep === 5 && (
            <div>
              <p className="text-sm text-gray-600 mb-4">Hoeveel foto's per pagina?</p>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {PHOTOBOOK_AUTOFILL_CHOICES.map(({ n, layout }) => (
                  <button key={n} type="button" disabled={creating}
                    onClick={() => { setWizardPerPage(n); setWizardStep(6); }}
                    className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl border border-gray-200 hover:border-sky-300 hover:bg-sky-50 transition-colors disabled:opacity-50">
                    <PhotobookLayoutThumb slots={layout.slots} orientation={wizardOrientation} />
                    <span className="text-sm font-medium text-gray-800">{n}</span>
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setWizardStep(4)} disabled={creating}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors">← Terug</button>
            </div>
          )}
          {wizardStep === 6 && (
            <div>
              <p className="text-sm text-gray-600 mb-4">
                Wil je de paginatitels uit je dagboek overnemen? Dan krijgt elke pagina het onderschrift dat je bij die foto schreef, of anders de activiteit of dag waar hij bij hoort.
              </p>
              <div className="space-y-2">
                <button type="button" disabled={creating}
                  onClick={() => handleCreate({ autofill: true, photosPerPage: wizardPerPage, orientation: wizardOrientation, cornerRadius: wizardCorner, backgroundColor: wizardBackground, useJournalTitles: true })}
                  className="w-full text-left p-3 rounded-xl border border-sky-200 bg-sky-50 hover:border-sky-300 transition-colors disabled:opacity-50">
                  <div className="font-medium text-gray-800">Ja, neem ze over</div>
                  <div className="text-xs text-gray-500 mt-0.5">Titels staan er meteen in; je kunt ze per pagina aanpassen of weghalen.</div>
                </button>
                <button type="button" disabled={creating}
                  onClick={() => handleCreate({ autofill: true, photosPerPage: wizardPerPage, orientation: wizardOrientation, cornerRadius: wizardCorner, backgroundColor: wizardBackground, useJournalTitles: false })}
                  className="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors disabled:opacity-50">
                  <div className="font-medium text-gray-800">Nee, laat ze leeg</div>
                  <div className="text-xs text-gray-500 mt-0.5">Pagina's zonder titel, zodat je zelf bepaalt wat erbij komt.</div>
                </button>
              </div>
              <button type="button" onClick={() => setWizardStep(5)} disabled={creating}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors mt-3">← Terug</button>
            </div>
          )}
          {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg mt-4">{error}</div>}
          {creating && <div className="text-sm text-gray-400 mt-4">Fotoboek maken...</div>}
        </Modal>
      )}
      {books.length > 0 && (
        <div className="space-y-2">
          {books.map((b) => (
            <button key={b.id} type="button" onClick={() => setOpenBookId(b.id)}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-white shadow-sm hover:border-sky-200 transition-colors text-left">
              {b.coverThumbUrl
                ? <img src={b.coverThumbUrl} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
                : <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center shrink-0"><Icon name="frame" size={20} className="text-gray-300" /></div>}
              <div className="min-w-0 flex-1">
                <div className="font-medium text-gray-800 truncate">{b.title}</div>
                <div className="text-xs text-gray-400">
                  {b.pageCount} {b.pageCount === 1 ? "pagina" : "pagina's"}
                  {quotes[b.id]?.available && quotes[b.id].total != null && (
                    <span className="text-sky-700 font-medium"> · drukwerk {fmtMoney(quotes[b.id].total, quotes[b.id].currency || "EUR")}</span>
                  )}
                </div>
              </div>
              <Icon name="arrowRight" size={16} className="text-gray-300 shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const PHOTOBOOK_BG_SWATCHES = [
  PALETTE.primarySoft, PALETTE.surfaceSecondary, PALETTE.border,
  PALETTE.textPrimary, PALETTE.primary, PALETTE.info,
];

// Doorzicht en hoekafronding per foto — net als bij professionele
// fotoboek-editors.
//
// cornerRadius is een fractie van de kórtste zijde van de pagina, niet van de
// foto. Dat is het verschil tussen "alle hoeken op deze pagina zijn even rond"
// en wat het eerder was: een grote foto kreeg een grote ronding en een kleine
// foto een kleine, en omdat een percentage in border-radius per as apart telt
// werden de hoeken bij een niet-vierkante foto ook nog eens ovaal. Paginamaat
// als maatstaf geeft één ronding voor de hele pagina, ongeacht formaat of
// verhouding van de foto.
const PHOTOBOOK_OPACITY_PRESETS = [
  { value: 1, label: "100%" },
  { value: 0.75, label: "75%" },
  { value: 0.5, label: "50%" },
];
// Op A4 (kortste zijde 210 mm) komt dit neer op ongeveer 1,7 / 3 / 5 mm —
// ingetogen genoeg om als afwerking te lezen in plaats van als vormgeving.
const PHOTOBOOK_CORNER_PRESETS = [
  { value: 0, label: "Geen" },
  { value: 0.008, label: "Zacht" },
  { value: 0.015, label: "Rond" },
  { value: 0.025, label: "Sterk" },
];
// Container-query-eenheid: 1cqmin is 1% van de kortste zijde van de pagina.
// Daardoor hoeft geen enkele render-plek de paginamaat zelf op te meten, en
// blijft de ronding automatisch kloppen als de canvas van formaat verandert.
function photobookCornerCss(cornerRadius) {
  return `${(cornerRadius ?? 0) * 100}cqmin`;
}
// Witte sluier over een achtergrondfoto, zodat voorgrondtekst/-foto's
// leesbaar blijven op een drukke achtergrond — zelfde idee als de
// opacity-presets, maar dan als vast wit vlak boven de achtergrond.
const PHOTOBOOK_OVERLAY_PRESETS = [
  { value: 0, label: "Geen" },
  { value: 0.25, label: "25%" },
  { value: 0.5, label: "50%" },
  { value: 0.75, label: "75%" },
];

// Kant-en-klare paginaindelingen, zoals "Pagina sjablonen" bij professionele
// fotoboek-editors (Albelli e.d.) — één tik legt de al aanwezige foto's op
// deze pagina in een verzorgde verhouding neer, in plaats van dat je zelf
// vanaf een stapel begint te schuiven. Vrij verslepen blijft daarna gewoon
// mogelijk om het naar smaak bij te stellen.
const PHOTOBOOK_LAYOUTS = [
  { key: "1", label: "1 foto", slots: [
    { x: 0.05, y: 0.05, width: 0.9, height: 0.9 },
  ] },
  { key: "2h", label: "2 naast elkaar", slots: [
    { x: 0.05, y: 0.05, width: 0.44, height: 0.9 },
    { x: 0.51, y: 0.05, width: 0.44, height: 0.9 },
  ] },
  { key: "2v", label: "2 boven-onder", slots: [
    { x: 0.05, y: 0.05, width: 0.9, height: 0.44 },
    { x: 0.05, y: 0.51, width: 0.9, height: 0.44 },
  ] },
  { key: "3", label: "1 groot + 2 klein", slots: [
    { x: 0.05, y: 0.05, width: 0.56, height: 0.9 },
    { x: 0.64, y: 0.05, width: 0.31, height: 0.43 },
    { x: 0.64, y: 0.52, width: 0.31, height: 0.43 },
  ] },
  { key: "4", label: "4 in raster", slots: [
    { x: 0.05, y: 0.05, width: 0.44, height: 0.44 },
    { x: 0.51, y: 0.05, width: 0.44, height: 0.44 },
    { x: 0.05, y: 0.51, width: 0.44, height: 0.44 },
    { x: 0.51, y: 0.51, width: 0.44, height: 0.44 },
  ] },
];

// Klein diagram van de indeling zelf (geen foto-inhoud) — zodat je in één
// oogopslag ziet wat je kiest.
// Zelfde 36x44 vlak, alleen verwisseld voor liggend — zo laat het mini-
// diagram meteen de gekozen paginavorm zien in plaats van altijd staand.
function PhotobookLayoutThumb({ slots, orientation }) {
  return (
    <div className={`relative rounded border border-gray-300 bg-gray-50 overflow-hidden shrink-0 ${orientation === "landscape" ? "w-11 h-9" : "w-9 h-11"}`}>
      {slots.map((s, i) => (
        <div key={i} className="absolute bg-gray-400 rounded-[1px]"
          style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: `${s.width * 100}%`, height: `${s.height * 100}%` }} />
      ))}
    </div>
  );
}

// Kant-en-klare combinaties van indeling + achtergrondkleur — net als de
// "Designvorlagen" bij professionele fotoboek-editors (CEWE e.d.), die
// layout en achtergrond samen als één stijl aanbieden. Zet je daarna nog
// gewoon zelf verder naar smaak; puur een vertrekpunt.
const PHOTOBOOK_DESIGN_PRESETS = [
  { key: "clean", label: "Strak wit", layout: PHOTOBOOK_LAYOUTS[0], background: null },
  { key: "warm", label: "Warm duo", layout: PHOTOBOOK_LAYOUTS[1], background: { type: "color", value: PALETTE.primarySoft } },
  { key: "dark", label: "Donker elegant", layout: PHOTOBOOK_LAYOUTS[3], background: { type: "color", value: PALETTE.textPrimary } },
  { key: "ocean", label: "Oceaan raster", layout: PHOTOBOOK_LAYOUTS[4], background: { type: "color", value: PALETTE.info } },
];
function PhotobookDesignPresetThumb({ layout, background }) {
  return (
    <div className="relative w-9 h-11 rounded border border-gray-300 overflow-hidden shrink-0"
      style={{ background: background ? background.value : PALETTE.background }}>
      {layout.slots.map((s, i) => (
        <div key={i} className="absolute rounded-[1px]" style={{
          left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: `${s.width * 100}%`, height: `${s.height * 100}%`,
          background: background?.type === "color" && contrastRatio(background.value, "#ffffff") < 2.5 ? "rgba(255,255,255,.7)" : "rgba(0,0,0,.35)",
        }} />
      ))}
    </div>
  );
}

// Rooster/magneetpunten voor het verslepen en schalen — dezelfde gedachte
// als "Raster aan/uit" bij professionele fotoboek-editors: makkelijk precies
// tegen de marge/het midden aan leggen, zonder te moeten pixelen.
// Deze lijnen worden ook echt getekend zodra "Raster" aanstaat (zie de overlay
// op de canvas). Dat is de hele truc: waar je op mikt is waar het aan plakt.
// Eerder waren er alleen marges en het midden, en werd er verder naar een fijne
// stap van 0.02 afgerond — onzichtbaar én te fijn om als raster te voelen.
const PHOTOBOOK_SNAP_GUIDES = [0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1];
const PHOTOBOOK_SNAP_THRESHOLD = 0.015;
const PHOTOBOOK_SNAP_STEP = 0.02;
function snapPhotobookValue(v) {
  for (const g of PHOTOBOOK_SNAP_GUIDES) {
    if (Math.abs(v - g) < PHOTOBOOK_SNAP_THRESHOLD) return g;
  }
  return Math.round(v / PHOTOBOOK_SNAP_STEP) * PHOTOBOOK_SNAP_STEP;
}
// Altijd naar de díchtstbijzijnde zichtbare rasterlijn, hoe ver ook — anders
// dan snapPhotobookValue, dat pas binnen een marge vastklikt en daarbuiten op
// een fijner (onzichtbaar) 0.02-raster afrondt. Voor de "foto's op het raster"-
// knop wil je juist dat elke rand op een lijn belandt die de gebruiker ook echt
// ziet, ook als een foto er nu ver naast staat.
function nearestPhotobookGuide(v) {
  let best = PHOTOBOOK_SNAP_GUIDES[0];
  for (const g of PHOTOBOOK_SNAP_GUIDES) {
    if (Math.abs(v - g) < Math.abs(best - v)) best = g;
  }
  return best;
}
// Bij verslepen telt niet alleen de linker-/bovenrand van een foto: je wilt
// 'm net zo goed met de rechter-/onderrand tegen een lijn kunnen leggen.
// Daarom worden beide randen langs het raster gelegd en wint de rand die het
// dichtst bij een lijn zit — anders bleef de overkant altijd net los hangen.
function snapPhotobookStart(start, size) {
  const viaStart = snapPhotobookValue(start);
  const viaEnd = snapPhotobookValue(start + size) - size;
  return Math.abs(viaStart - start) <= Math.abs(viaEnd - start) ? viaStart : viaEnd;
}

// Laat een tekstvak meegroeien met zijn inhoud. Alleen groeien, nooit vanzelf
// krimpen: een leeg vak zou anders tot een streepje ineenschrompelen, en
// witruimte die iemand zelf onder de tekst heeft gelaten hoort te blijven
// staan. Meten gebeurt op de scrollhoogte van het binnenste vlak — dat is de
// hoogte die de tekst écht nodig heeft, inclusief de regels die nu buiten
// beeld vallen.
function usePhotobookAutoGrow({ innerRef, getPageEl, height, onChangeRect, html, enabled }) {
  useEffect(() => {
    if (!enabled) return;
    const el = innerRef.current;
    const page = getPageEl();
    if (!el || !page) return;

    function meet() {
      const pageH = page.getBoundingClientRect().height;
      // De canvas is bij de eerste render nog nul hoog (die krijgt zijn maat
      // pas van de ResizeObserver in de editor). Meten heeft dan geen zin;
      // de observer hieronder roept dit opnieuw aan zodra de maat er wél is.
      if (!pageH) return;
      // Meet het tékort (scrollHeight boven clientHeight), niet de gewenste
      // hoogte zelf. Dat laatste ging mis: het binnenste veld is h-full, dus
      // zijn hoogte volgt de doos, en "gewenst = hoogte + marge" was dan altijd
      // nét groter dan wat er stond — het vak groeide zichzelf tot de hele
      // pagina op. Zodra de tekst past is het tekort nul en gebeurt er niets.
      const tekort = el.scrollHeight - el.clientHeight;
      if (tekort <= 1) return;
      onChangeRect({ height: Math.min(1, (el.getBoundingClientRect().height + tekort) / pageH) });
    }

    meet();
    const observer = new ResizeObserver(meet);
    observer.observe(page);
    return () => observer.disconnect();
  }, [html, height, enabled]);
}

// Waarschuwt als een foto te weinig pixels heeft om scherp afgedrukt te
// worden op het formaat waarin 'm nu op de A4-pagina staat (net als de
// resolutie-check bij professionele fotoboek-editors). Alleen te bepalen
// voor foto's met bekende pixelafmetingen (nativeWidth/nativeHeight) — die
// ontbreken bij foto's die vóór deze functie zijn geüpload.
const PHOTOBOOK_A4_WIDTH_MM = 210, PHOTOBOOK_A4_HEIGHT_MM = 297;
const PHOTOBOOK_MIN_PRINT_DPI = 150;
function isPhotoLowRes(photo, orientation) {
  if (!photo.nativeWidth || !photo.nativeHeight) return false;
  const pageWidthMm = orientation === "landscape" ? PHOTOBOOK_A4_HEIGHT_MM : PHOTOBOOK_A4_WIDTH_MM;
  const pageHeightMm = orientation === "landscape" ? PHOTOBOOK_A4_WIDTH_MM : PHOTOBOOK_A4_HEIGHT_MM;
  const targetWidthIn = (photo.width * pageWidthMm) / 25.4;
  const targetHeightIn = (photo.height * pageHeightMm) / 25.4;
  return photo.nativeWidth < targetWidthIn * PHOTOBOOK_MIN_PRINT_DPI
    || photo.nativeHeight < targetHeightIn * PHOTOBOOK_MIN_PRINT_DPI;
}

// Zwevende panelen (paginainstellingen, foto/tekstvak-opties) zitten soms in
// de weg van wat eronder ligt — dit sleept 'm gewoon een stuk pixels opzij,
// los van de pagina-inhoud (dus geen fracties zoals bij foto's, gewoon een
// px-offset boven op de vaste positie). Niet geklemd op een grens: net als
// bij een blaadje dat je opzij schuift mag het best (bijna) uit beeld — je
// sleept 'm net zo makkelijk weer terug.
function usePhotobookPanelDrag(offset, setOffset) {
  const dragRef = useRef(null);
  function beginPanelDrag(e) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, startOffset: offset };
  }
  function onPanelDrag(e) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    setOffset({ x: d.startOffset.x + (e.clientX - d.startX), y: d.startOffset.y + (e.clientY - d.startY) });
  }
  function endPanelDrag(e) {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  }
  return { beginPanelDrag, onPanelDrag, endPanelDrag };
}

// Vrij verslepen (heel het element) en met de hoekgreep vergroten/verkleinen
// op de A4-canvas — x/y/width/height zijn fracties van de pagina, dus de
// berekening gaat via de pixel-afmetingen van de canvas zelf (getPageEl),
// niet via vaste pixelwaarden. Pointer Events (i.p.v. HTML5 drag-and-drop)
// omdat die zowel met muis als met een vinger op de telefoon werken. Gedeeld
// tussen foto's en tekstvakken op de canvas — alleen wat er ín het vak zit
// verschilt.
function usePhotobookDragResize({ rect, onChangeRect, getPageEl, snap, onSelect }) {
  const dragRef = useRef(null);

  function beginDrag(e, mode) {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      mode, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY,
      startRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  }
  function onDrag(e) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const el = getPageEl();
    if (!el) return;
    const pageRect = el.getBoundingClientRect();
    const fx = (e.clientX - d.startX) / pageRect.width;
    const fy = (e.clientY - d.startY) / pageRect.height;
    if (d.mode === "move") {
      let x = Math.min(1 - d.startRect.width, Math.max(0, d.startRect.x + fx));
      let y = Math.min(1 - d.startRect.height, Math.max(0, d.startRect.y + fy));
      if (snap) {
        x = Math.min(1 - d.startRect.width, Math.max(0, snapPhotobookStart(x, d.startRect.width)));
        y = Math.min(1 - d.startRect.height, Math.max(0, snapPhotobookStart(y, d.startRect.height)));
      }
      onChangeRect({ x, y });
    } else {
      let width = Math.min(1 - d.startRect.x, Math.max(0.05, d.startRect.width + fx));
      let height = Math.min(1 - d.startRect.y, Math.max(0.05, d.startRect.height + fy));
      if (snap) {
        width = Math.max(0.05, snapPhotobookValue(d.startRect.x + width) - d.startRect.x);
        height = Math.max(0.05, snapPhotobookValue(d.startRect.y + height) - d.startRect.y);
      }
      onChangeRect({ width, height });
    }
  }
  function endDrag(e) {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  }
  return { beginDrag, onDrag, endDrag };
}

function PhotobookCanvasPhoto({ photo, selected, onSelect, onChangeRect, getPageEl, snap, duplicatePages, cropActive, onToggleCrop, orientation }) {
  const { beginDrag, onDrag, endDrag } = usePhotobookDragResize({ rect: photo, onChangeRect, getPageEl, snap, onSelect });
  const photoElRef = useRef(null);
  // Bijsnijden gaat via slepen (verschuift het brandpunt) en knijpen
  // (inzoomen) direct op de foto zelf — net zo'n gebaar als in Foto's/
  // Instagram, in plaats van losse pijltjes-/zoomknoppen. cropDragRef houdt
  // alle actieve vingers bij (Map van pointerId->positie): één vinger =
  // verschuiven, twee vingers = knijpen; loslaten van één tijdens knijpen
  // valt terug op verschuiven met de overblijvende vinger, met een nieuwe
  // startpositie zodat de foto niet met een sprong verspringt.
  const cropDragRef = useRef(null);
  function onCropPointerDown(e) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const state = cropDragRef.current || { pointers: new Map() };
    state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (state.pointers.size >= 2) {
      const pts = [...state.pointers.values()].slice(-2);
      state.mode = "pinch";
      state.startDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      state.startZoom = photo.cropZoom ?? 1;
    } else {
      state.mode = "pan";
      state.startCropX = photo.cropX ?? 0.5;
      state.startCropY = photo.cropY ?? 0.5;
      state.startX = e.clientX;
      state.startY = e.clientY;
    }
    cropDragRef.current = state;
  }
  function onCropPointerMove(e) {
    const state = cropDragRef.current;
    if (!state || !state.pointers.has(e.pointerId)) return;
    state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const rect = photoElRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (state.mode === "pinch" && state.pointers.size >= 2) {
      const pts = [...state.pointers.values()].slice(-2);
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const zoom = Math.min(2.5, Math.max(1, state.startZoom * (dist / state.startDist)));
      onChangeRect({ cropZoom: Math.round(zoom * 100) / 100 });
    } else if (state.mode === "pan") {
      // Min-teken: de foto "volgt" je vinger (sleep naar rechts = beeld
      // schuift mee naar rechts, dus het brandpunt schuift naar links).
      const dx = (e.clientX - state.startX) / rect.width;
      const dy = (e.clientY - state.startY) / rect.height;
      onChangeRect({
        cropX: Math.min(1, Math.max(0, state.startCropX - dx)),
        cropY: Math.min(1, Math.max(0, state.startCropY - dy)),
      });
    }
  }
  function onCropPointerUp(e) {
    const state = cropDragRef.current;
    if (!state) return;
    state.pointers.delete(e.pointerId);
    if (state.pointers.size === 0) { cropDragRef.current = null; return; }
    const [[, pt]] = state.pointers;
    state.mode = "pan";
    state.startCropX = photo.cropX ?? 0.5;
    state.startCropY = photo.cropY ?? 0.5;
    state.startX = pt.x;
    state.startY = pt.y;
  }

  return (
    <div
      ref={photoElRef}
      onPointerDown={cropActive ? onCropPointerDown : (e) => beginDrag(e, "move")}
      onPointerMove={cropActive ? onCropPointerMove : onDrag}
      onPointerUp={cropActive ? onCropPointerUp : endDrag}
      onPointerCancel={cropActive ? onCropPointerUp : endDrag}
      className={`absolute select-none touch-none ${cropActive ? "cursor-move ring-2 ring-sky-600 ring-offset-1" : selected ? "cursor-move ring-2 ring-sky-500 ring-offset-1" : "cursor-pointer"}`}
      style={{ left: `${photo.x * 100}%`, top: `${photo.y * 100}%`, width: `${photo.width * 100}%`, height: `${photo.height * 100}%` }}
    >
      {/* Aparte clip-laag (i.p.v. afronding/overflow direct op de foto) omdat
          de vergrote (ingezoomde) foto anders over de hoekgreep/badges heen
          zou uitsteken — en overflow-hidden op de buitenste div zou zelf weer
          de greep afsnijden, die er juist net buiten hoort te steken. */}
      <div className="w-full h-full overflow-hidden" style={{ borderRadius: photobookCornerCss(photo.cornerRadius) }}>
        <img src={photo.thumbUrl || photo.url} alt="" draggable={false} className="w-full h-full object-cover pointer-events-none"
          style={{
            opacity: photo.opacity ?? 1,
            objectPosition: `${(photo.cropX ?? 0.5) * 100}% ${(photo.cropY ?? 0.5) * 100}%`,
            transform: `scale(${photo.cropZoom ?? 1})`,
            transformOrigin: `${(photo.cropX ?? 0.5) * 100}% ${(photo.cropY ?? 0.5) * 100}%`,
          }} />
      </div>
      {/* Alleen een hint tijdens het bewerken — niet in het voorbeeld of de
          uiteindelijke PDF, dus dit leeft puur hier in de editor-canvas. */}
      {duplicatePages?.length > 0 && (
        <div className="absolute top-1 left-1 right-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-medium leading-tight pointer-events-none truncate">
          Ook op pag. {duplicatePages.join(", ")}
        </div>
      )}
      {isPhotoLowRes(photo, orientation) && (
        <div title="Deze foto heeft weinig pixels voor dit formaat en kan er wazig uitzien op papier"
          className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center pointer-events-none shadow">
          <Icon name="alert" size={12} strokeWidth={2.2} />
        </div>
      )}
      {/* Tijdens bijsnijden doet slepen op de foto iets anders (verschuiven/
          zoomen in plaats van het kader vergroten), dus de hoekgreep zou
          verwarrend zijn en verdwijnt zolang cropActive aan staat. */}
      {selected && !cropActive && (
        <div
          onPointerDown={(e) => beginDrag(e, "resize")}
          onPointerMove={onDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="absolute -right-2 -bottom-2 w-6 h-6 rounded-full bg-sky-600 border-2 border-white shadow-md cursor-nwse-resize touch-none flex items-center justify-center"
        >
          <div className="w-2 h-2 border-b-2 border-r-2 border-white" />
        </div>
      )}
      {/* Bijsnijden zit hierachter i.p.v. altijd in het paneel eronder — dat
          hield het paneel onnodig groot voor iets dat je niet elke keer
          gebruikt. onToggleCrop is alleen gezet als deze foto geselecteerd is
          (zie de canvas-render hieronder), dus verschijnt niet op elke foto.
          Binnen de foto (top-1/left-1), niet erbuiten zoals de hoekgreep —
          een foto die tot tegen de paginarand staat zou 'm anders onder de
          overflow-hidden van de canvas laten verdwijnen, onbereikbaar. */}
      {selected && onToggleCrop && (
        // z-20: als een foto precies tegen de paginarand staat (x/y 0) valt
        // dit knopje samen met de vaste "+"/instellingen-knoppen op de
        // canvas zelf — bij een geselecteerde foto mag dit knopje dan winnen.
        <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onToggleCrop(); }}
          title="Bijsnijden"
          className={`absolute top-1 left-1 z-20 w-8 h-8 rounded-full border-2 border-white shadow-md flex items-center justify-center transition-colors touch-none ${cropActive ? "bg-sky-600 text-white" : "bg-white text-gray-500 hover:text-sky-600"}`}>
          <Icon name="crop" size={14} />
        </button>
      )}
    </div>
  );
}

// Achtergrond-presets voor een zwevend tekstvak — een paar duidelijk van
// elkaar te onderscheiden opties, geen vrije kleurenkiezer nodig.
const PHOTOBOOK_TEXTBOX_BACKGROUNDS = [
  { value: "transparent", label: "Geen" },
  { value: "rgba(255,255,255,0.85)", label: "Wit" },
  { value: "rgba(55,52,50,0.75)", label: "Donker" },
];
// Zelfde verslepen/schalen als een foto (usePhotobookDragResize), maar met
// tekst als inhoud i.p.v. een afbeelding. Zodra het vak geselecteerd is, mag
// je er middenin klikken om de cursor te plaatsen — dus dan verhuist het
// verslepen naar een klein apart handvat, anders zou elke tik in de tekst
// het vak verplaatsen in plaats van de cursor te zetten.
function PhotobookCanvasTextBox({ box, selected, onSelect, onChangeRect, onChangeHtml, getPageEl, snap, richTextRef }) {
  const { beginDrag, onDrag, endDrag } = usePhotobookDragResize({ rect: box, onChangeRect, getPageEl, snap, onSelect });
  const innerRef = useRef(null);
  usePhotobookAutoGrow({ innerRef, getPageEl, height: box.height, onChangeRect, html: box.html, enabled: true });

  return (
    <div
      onPointerDown={selected ? undefined : (e) => beginDrag(e, "move")}
      onPointerMove={onDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={`absolute select-none rounded-xl ${selected ? "ring-2 ring-sky-500 ring-offset-1" : "touch-none cursor-pointer"}`}
      style={{
        left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%`,
        background: box.backgroundColor || "transparent",
      }}
    >
      {selected && (
        <div
          onPointerDown={(e) => beginDrag(e, "move")}
          onPointerMove={onDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
          title="Verslepen"
          className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-sky-600 border-2 border-white shadow-md cursor-move touch-none flex items-center justify-center text-white z-10"
        >
          <Icon name="dragHandle" size={12} />
        </div>
      )}
      <div ref={innerRef} className="w-full h-full overflow-auto p-0.5" onPointerDown={(e) => selected && e.stopPropagation()}>
        {selected ? (
          <RichTextEditable ref={richTextRef} value={box.html || ""} onChange={onChangeHtml} align={box.align}
            className="!border-none !ring-0 !p-0 !min-h-0 h-full !bg-transparent text-sm" placeholder="Tekst..." />
        ) : (
          <RichTextView html={box.html} align={box.align} className="text-sm pointer-events-none" />
        )}
      </div>
      {selected && (
        <div
          onPointerDown={(e) => beginDrag(e, "resize")}
          onPointerMove={onDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
          className="absolute -right-2 -bottom-2 w-6 h-6 rounded-full bg-sky-600 border-2 border-white shadow-md cursor-nwse-resize touch-none flex items-center justify-center"
        >
          <div className="w-2 h-2 border-b-2 border-r-2 border-white" />
        </div>
      )}
    </div>
  );
}

// De titel is net als een zwevend tekstvak vrij te verslepen/vergroten —
// x/y/width/height staan rechtstreeks op de pagina (niet in een array,
// er is er maar één per pagina). Een wit vlak eronder (vast, niet te
// kiezen zoals bij een tekstvak) houdt 'm leesbaar op een drukke foto.
function PhotobookCanvasTitle({ page, selected, onSelect, onChangeRect, onChangeHtml, getPageEl, snap, richTextRef }) {
  // x:0.15/width:0.7 (i.p.v. bijna de volle breedte) om dezelfde reden als
  // bij een nieuw tekstvak: zo blijft de titel standaard uit de buurt van de
  // "+"/instellingen-knoppen in de canvas-hoeken. y:0.14 (i.p.v. hoger) om
  // ook verticaal onder die knoppen te blijven — anders ligt de sleepgreep
  // (die er nog -2 boven uitsteekt) er middenin, en vangt de knop de tik weg
  // die eigenlijk voor de tekst bedoeld was (geen toetsenbord dan).
  const rect = { x: page.titleX ?? 0.15, y: page.titleY ?? 0.14, width: page.titleWidth ?? 0.7, height: page.titleHeight ?? 0.1 };
  const { beginDrag, onDrag, endDrag } = usePhotobookDragResize({ rect, onChangeRect, getPageEl, snap, onSelect });
  const innerRef = useRef(null);
  usePhotobookAutoGrow({ innerRef, getPageEl, height: rect.height, onChangeRect, html: page.title, enabled: true });

  // Een lege titel toont geen (leeg wit) vak meer: pas als er echt tekst staat,
  // óf terwijl je 'm aan het bewerken bent (geselecteerd), verschijnt het vak.
  // Zo kun je een titel echt weghalen — leegmaken laat 'm verdwijnen — en pak
  // je 'm terug via "+ Titel". Losse tags zonder tekst tellen als leeg.
  const hasTitle = !!(page.title && page.title.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim());
  if (!selected && !hasTitle) return null;

  return (
    <div
      onPointerDown={selected ? undefined : (e) => beginDrag(e, "move")}
      onPointerMove={onDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      // z-20 zodra geselecteerd: als de titel (bijv. na verslepen) toch onder
      // de vaste "+"/instellingen-knoppen komt te liggen, mag de titel zelf
      // dan winnen — anders vangen die knoppen tikken weg die voor de tekst
      // bedoeld waren.
      className={`absolute select-none rounded-lg ${selected ? "z-20 ring-2 ring-sky-500 ring-offset-1" : "touch-none cursor-pointer"}`}
      style={{
        left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%`,
        background: "rgba(255,255,255,0.85)",
      }}
    >
      {selected && (
        <div
          onPointerDown={(e) => beginDrag(e, "move")}
          onPointerMove={onDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
          title="Verslepen"
          className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-sky-600 border-2 border-white shadow-md cursor-move touch-none flex items-center justify-center text-white z-10"
        >
          <Icon name="dragHandle" size={12} />
        </div>
      )}
      <div ref={innerRef} className="w-full h-full overflow-auto p-0.5 flex items-center" onPointerDown={(e) => selected && e.stopPropagation()}>
        {selected ? (
          <RichTextEditable ref={richTextRef} value={page.title || ""} onChange={onChangeHtml} align={page.titleAlign}
            className="!border-none !ring-0 !p-0 !min-h-0 h-full !bg-transparent font-display text-base w-full" placeholder="Titel..." />
        ) : (
          page.title ? <RichTextView html={page.title} align={page.titleAlign} className="font-display text-base w-full pointer-events-none" /> : null
        )}
      </div>
      {selected && (
        <div
          onPointerDown={(e) => beginDrag(e, "resize")}
          onPointerMove={onDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
          className="absolute -right-2 -bottom-2 w-6 h-6 rounded-full bg-sky-600 border-2 border-white shadow-md cursor-nwse-resize touch-none flex items-center justify-center"
        >
          <div className="w-2 h-2 border-b-2 border-r-2 border-white" />
        </div>
      )}
    </div>
  );
}

function PhotobookEditor({ tripId, bookId, onBack }) {
  const [title, setTitle] = useState("");
  const [orientation, setOrientation] = useState("portrait"); // bij aanmaken gekozen, geldt voor heel het boek
  const [bookCorner, setBookCorner] = useState(0); // idem: de hoekstijl uit de wizard, als startwaarde voor nieuwe foto's
  const [bookBackground, setBookBackground] = useState(null); // idem: de achtergrondkleur uit de wizard, voor pagina's die je later toevoegt
  // Balken opzij kosten breedte, en die is er alleen als het scherm breder is
  // dan hoog. Zonder deze voorwaarde hielden twee kolommen van 144px op een
  // rechtop gehouden telefoon nog geen 150px over voor de pagina zelf.
  const [screenWide, setScreenWide] = useState(() => window.innerWidth > window.innerHeight);
  useEffect(() => {
    const onResize = () => setScreenWide(window.innerWidth > window.innerHeight);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const [pages, setPages] = useState(null); // null = laden
  const [allPhotos, setAllPhotos] = useState([]);
  const [pickerForPage, setPickerForPage] = useState(null); // index van de pagina waar de gekozen foto's bij komen
  const [pickerMode, setPickerMode] = useState("photos"); // "photos" = op de pagina zetten, "background" = als achtergrond
  const [pickerSelected, setPickerSelected] = useState(new Set());
  const [pickerSearch, setPickerSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null); // { page, photo } | null
  const [selectedTextBox, setSelectedTextBox] = useState(null); // { page, box } | null
  const [selectedTitle, setSelectedTitle] = useState(null); // { page } | null
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [pdfProgress, setPdfProgress] = useState(null); // { phase: "generating"|"downloading", percent: number|null } | null
  const [currentPageIndex, setCurrentPageIndex] = useState(0); // welke pagina fullscreen in beeld staat
  // Het boek opent op het overzicht: eerst zien hoe het wordt, dan pas op een
  // pagina inzoomen om te bewerken. Voorheen viel je meteen in pagina 1 en was
  // er geen enkele plek waar het boek als geheel te zien was behalve het
  // aparte voorbeeldscherm, dat je weer moest verlaten om iets te wijzigen.
  const [viewMode, setViewMode] = useState("overzicht"); // "overzicht" | "pagina"
  const [showPagePanel, setShowPagePanel] = useState(false); // zwevend paneel: titel/beschrijving/achtergrond/indeling
  // Het paneel voor een geselecteerde foto/tekstvak kan de canvas eronder
  // (incl. de sleepgreep) aan het zicht onttrekken — bijv. bij een foto die
  // al bijna de hele pagina vult. Een verbergknop laat 'm even wegklappen
  // zonder de selectie te verliezen, zodat verslepen/vergroten vrij blijft.
  const [showSelPanel, setShowSelPanel] = useState(true);
  // Bijsnijden (verschuiven/inzoomen) staat niet meer altijd in het paneel —
  // pas zichtbaar nadat het crop-icoontje op de foto zelf is aangetikt.
  const [cropMode, setCropMode] = useState(false);
  // Zwevende panelen kunnen aan de kant geschoven worden (via het
  // sleepgreepje bovenin) als ze net de canvas eronder in de weg zitten —
  // een pixel-offset boven op de vaste positie, puur voor deze sessie.
  const [pagePanelOffset, setPagePanelOffset] = useState({ x: 0, y: 0 });
  const [selPanelOffset, setSelPanelOffset] = useState({ x: 0, y: 0 });
  const [showAddMenu, setShowAddMenu] = useState(false); // "+"-knop: kiezen tussen foto's en tekstvak toevoegen
  // History van eerdere `pages`-snapshots, voor de "Ongedaan maken"-knop.
  // Elke muterende functie roept pushHistory() aan vóórdat 'ie zelf iets
  // wijzigt, met de op dat moment geldende `pages` (via closure) — zo hoeft
  // er niets omgebouwd te worden naar functionele setState-vorm.
  const [history, setHistory] = useState([]);
  // Steeds maar één pagina tegelijk in beeld (fullscreen), dus geen array
  // meer nodig zoals toen alle pagina's onder elkaar stonden — telkens één
  // canvas/titel/beschrijving-veld gemonteerd.
  const canvasRef = useRef(null); // DOM-node van de A4-canvas, voor pixel->fractie omrekening tijdens verslepen
  const canvasAreaRef = useRef(null); // omringende vlak waarbinnen de canvas moet passen (voor canvasSize hieronder)
  const swipeRef = useRef(null); // beginpunt van een veeg over de lege pagina/marge, voor bladeren tussen pagina's
  const titleRef = useRef(null); // titel-tekstveld van de geselecteerde titel, voor de opmaakknoppen
  const textBoxRef = useRef(null); // tekstveld van het geselecteerde zwevende tekstvak, idem
  const pagePanelDrag = usePhotobookPanelDrag(pagePanelOffset, setPagePanelOffset);
  const selPanelDrag = usePhotobookPanelDrag(selPanelOffset, setSelPanelOffset);
  // De canvas moet altijd de A4-verhouding houden, ongeacht of het beschikbare
  // vlak zelf breed-kort of smal-lang is (bijv. de telefoon gekanteld) — een
  // pure CSS-aanpak (aspect-ratio + max-width/max-height zonder vaste
  // breedte/hoogte) bleek in de praktijk niet betrouwbaar (het vlak werd of
  // 0x0, of rekte juist helemaal uit zonder de verhouding te respecteren).
  // In plaats daarvan hier zelf de grootste maat berekenen die binnen zowel
  // de beschikbare breedte als hoogte past (hetzelfde idee als
  // object-fit:contain, maar dan voor een gewone div) en als expliciete
  // pixelwaarden toepassen; een ResizeObserver houdt dit bij als het vlak
  // van vorm verandert (kantelen, resizen, het paneel openen/sluiten).
  const [canvasSize, setCanvasSize] = useState(null);
  const pagesLoaded = pages !== null; // canvasAreaRef bestaat pas zodra dit true wordt (zie "Laden..."-return hierboven) — zonder deze afhankelijkheid mist het effect die overgang als "orientation" ondertussen niet wijzigt
  useEffect(() => {
    const el = canvasAreaRef.current;
    if (!el) return;
    const targetRatio = orientation === "landscape" ? 297 / 210 : 210 / 297;
    function recompute() {
      // el.clientWidth/Height omvat ook el's eigen padding (p-3); de canvas
      // wordt daarbinnen (in de content-box) gecentreerd, dus die padding
      // moet eraf, anders is de berekende maat te groot en wordt de canvas
      // alsnog scheefgetrokken doordat flexbox 'm terug moet knijpen.
      const cs = getComputedStyle(el);
      const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if (!w || !h) return;
      const areaRatio = w / h;
      const size = areaRatio > targetRatio
        ? { width: Math.round(h * targetRatio), height: h }
        : { width: w, height: Math.round(w / targetRatio) };
      setCanvasSize(size);
    }
    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(el);
    return () => observer.disconnect();
    // viewMode hoort hier écht bij: in het overzicht bestaat canvasAreaRef nog
    // niet, dus zonder deze afhankelijkheid hing de observer zich nergens aan
    // en bleef canvasSize null zodra je daarna op een pagina inzoomde — de
    // canvas viel dan terug op de onbetrouwbare aspect-ratio-noodgreep.
  }, [orientation, pagesLoaded, viewMode]);

  // Blijft binnen de grenzen als de laatste pagina verwijderd wordt, en
  // wisselt van geselecteerd element als er naar een andere pagina genavigeerd
  // wordt (een zwevend paneel voor een pagina die niet meer in beeld is, is
  // verwarrender dan gewoon opnieuw moeten selecteren).
  useEffect(() => {
    if (!pages) return;
    if (currentPageIndex > pages.length - 1) setCurrentPageIndex(Math.max(0, pages.length - 1));
  }, [pages, currentPageIndex]);
  useEffect(() => {
    setSelectedPhoto(null);
    setSelectedTextBox(null);
    setSelectedTitle(null);
    setShowAddMenu(false);
  }, [currentPageIndex]);
  // Een nieuwe selectie toont het paneel weer fris open, en verlaat bijsnij-
  // modus — anders blijft bijv. de zoomrij van de vorige foto zichtbaar op
  // een net geselecteerde andere foto.
  useEffect(() => {
    setShowSelPanel(true);
    setCropMode(false);
    setSelPanelOffset({ x: 0, y: 0 });
  }, [selectedPhoto?.page, selectedPhoto?.photo, selectedTextBox?.page, selectedTextBox?.box, selectedTitle?.page]);
  function toggleCropMode() {
    setCropMode((m) => {
      const next = !m;
      if (next) setShowSelPanel(true);
      return next;
    });
  }

  useEffect(() => {
    api.getPhotobook(bookId).then((b) => { setTitle(b.title); setPages(b.pages); setOrientation(b.orientation || "portrait"); setBookCorner(b.cornerRadius ?? 0); setBookBackground(b.backgroundColor ?? null); });
    api.getPhotos(tripId).then(setAllPhotos).catch(() => {});
  }, [bookId, tripId]);

  // Elke muterende functie hieronder roept dit eerst aan, met de `pages` die
  // op dat moment nog gelden (via closure) — zo kan "Ongedaan maken" terug
  // naar de staat vóór die actie, zonder dat elke aanroeper dit zelf hoeft
  // te doen. Cap op 20 stappen, anders groeit dit onbeperkt binnen één sessie.
  // Een sleep- of knijpgebaar (of gewoon typen) roept dit tientallen keren
  // per seconde aan — zonder de debounce hieronder zou zo'n gebaar in z'n
  // eentje de hele geschiedenis vullen, waardoor "Ongedaan maken" nooit
  // verder terug kan dan een fractie van diezelfde beweging. Binnen 400ms
  // van de vorige push telt het als dezelfde actie en wordt niets nieuws
  // weggeschreven — de eerste push van de reeks (de staat van vóórdat de
  // actie begon) blijft dan gewoon de enige stap terug.
  const lastHistoryPushRef = useRef(0);
  function pushHistory() {
    const now = Date.now();
    if (now - lastHistoryPushRef.current < 400) return;
    lastHistoryPushRef.current = now;
    setHistory((h) => [...h.slice(-19), pages]);
  }
  function undo() {
    if (!history.length) return;
    setPages(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
    setSelectedPhoto(null);
    setSelectedTextBox(null);
    setSelectedTitle(null);
    setDirty(true);
  }
  function updatePage(i, patch) {
    pushHistory();
    setPages((ps) => ps.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
    setDirty(true);
  }
  function movePage(i, dir) {
    pushHistory();
    setPages((ps) => {
      const j = i + dir;
      if (j < 0 || j >= ps.length) return ps;
      const copy = [...ps];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
    setDirty(true);
  }
  function removePage(i) {
    if (!confirm("Pagina verwijderen? Foto's en tekstvakken op deze pagina gaan mee verloren.")) return;
    pushHistory();
    setPages((ps) => ps.filter((_, idx) => idx !== i));
    setDirty(true);
  }
  function addPage() {
    pushHistory();
    setPages((ps) => [...ps, {
      title: null,
      background: bookBackground ? { type: "color", value: bookBackground } : null,
      photos: [],
    }]);
    setDirty(true);
  }
  // Legt de eerste N foto's (N = aantal vakken in de indeling) in de gekozen
  // verhouding neer; extra foto's boven dat aantal blijven ongemoeid staan.
  function applyLayout(pageIndex, layout) {
    pushHistory();
    setPages((ps) => ps.map((p, i) => (i !== pageIndex ? p : {
      ...p, photos: p.photos.map((ph, j) => (j < layout.slots.length ? { ...ph, ...layout.slots[j] } : ph)),
    })));
    setDirty(true);
  }
  // Legt elke foto op de pagina netjes op de rasterlijnen, zónder de indeling
  // om te gooien: elke rand (links/rechts/boven/onder) schuift naar de
  // dichtstbijzijnde rasterlijn, dus een foto blijft op zijn eigen plek staan —
  // alleen recht uitgelijnd. Zo blijft de verdeling van de foto's over de
  // pagina behouden. Hetzelfde snappen als tijdens het verslepen, nu in één keer
  // op alles tegelijk (ook op foto's die scheef of net-naast-het-raster staan).
  function snapPhotosToGrid(pageIndex) {
    pushHistory();
    setPages((ps) => ps.map((p, i) => (i !== pageIndex ? p : {
      ...p,
      photos: p.photos.map((ph) => {
        const x = nearestPhotobookGuide(ph.x);
        const right = nearestPhotobookGuide(ph.x + ph.width);
        const y = nearestPhotobookGuide(ph.y);
        const bottom = nearestPhotobookGuide(ph.y + ph.height);
        return { ...ph, x, y, width: Math.max(0.05, right - x), height: Math.max(0.05, bottom - y) };
      }),
    })));
    setDirty(true);
  }
  // Horizontaal vegen over de lege pagina of de marge eromheen bladert naar de
  // vorige/volgende pagina. Alleen als de veeg op de achtergrond begint (niet
  // op een foto of tekstvak — die hebben hun eigen sleepgedrag), zodat vegen en
  // verslepen elkaar niet in de weg zitten. Verticaal vegen (scrollen) telt niet.
  function onCanvasTouchStart(e) {
    if (e.touches.length !== 1) { swipeRef.current = null; return; }
    const onBackground = e.target === canvasRef.current || e.target === canvasAreaRef.current;
    swipeRef.current = onBackground ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  }
  function onCanvasTouchEnd(e) {
    const s = swipeRef.current;
    swipeRef.current = null;
    if (!s || !e.changedTouches.length) return;
    const dx = e.changedTouches[0].clientX - s.x;
    const dy = e.changedTouches[0].clientY - s.y;
    // Duidelijk horizontaal en ver genoeg, anders is het een tik of een scroll.
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    // Van links naar rechts (vinger beweegt naar rechts) → volgende pagina,
    // zoals gevraagd; de andere kant op → vorige.
    if (dx > 0) setCurrentPageIndex((p) => Math.min(pages.length - 1, p + 1));
    else setCurrentPageIndex((p) => Math.max(0, p - 1));
  }
  function applyDesignPreset(pageIndex, preset) {
    pushHistory();
    setPages((ps) => ps.map((p, i) => (i !== pageIndex ? p : {
      ...p, background: preset.background,
      photos: p.photos.map((ph, j) => (j < preset.layout.slots.length ? { ...ph, ...preset.layout.slots[j] } : ph)),
    })));
    setDirty(true);
  }
  function removePhoto(pageIndex, photoIndex) {
    if (!confirm("Foto van deze pagina verwijderen?")) return;
    pushHistory();
    setPages((ps) => ps.map((p, i) => (i !== pageIndex ? p : { ...p, photos: p.photos.filter((_, j) => j !== photoIndex) })));
    setSelectedPhoto((sel) => (sel && sel.page === pageIndex && sel.photo === photoIndex ? null : sel));
    setDirty(true);
  }
  // Verandert de volgorde in de array, wat ook de z-volgorde op de canvas is
  // (later in de lijst = bovenop) — dus dit is "naar voren/achteren", niet
  // een verticale lijst-positie zoals vóór het vrije verslepen.
  function movePhoto(pageIndex, photoIndex, dir) {
    const page = pages[pageIndex];
    const j = photoIndex + dir;
    if (!page || j < 0 || j >= page.photos.length) return;
    pushHistory();
    setPages((ps) => ps.map((p, i) => {
      if (i !== pageIndex) return p;
      const copy = [...p.photos];
      [copy[photoIndex], copy[j]] = [copy[j], copy[photoIndex]];
      return { ...p, photos: copy };
    }));
    setSelectedPhoto((sel) => (sel && sel.page === pageIndex && sel.photo === photoIndex ? { page: pageIndex, photo: j } : sel));
    setDirty(true);
  }
  function updatePhotoRect(pageIndex, photoIndex, patch) {
    pushHistory();
    setPages((ps) => ps.map((p, i) => (i !== pageIndex ? p : {
      ...p, photos: p.photos.map((ph, j) => (j === photoIndex ? { ...ph, ...patch } : ph)),
    })));
    setDirty(true);
  }
  function addTextBox(pageIndex) {
    pushHistory();
    const box = {
      id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      html: "", x: 0.15, y: 0.4, width: 0.7, height: 0.15, align: "center", backgroundColor: "rgba(255,255,255,0.85)",
    };
    setPages((ps) => ps.map((p, i) => (i !== pageIndex ? p : { ...p, textBoxes: [...(p.textBoxes || []), box] })));
    setSelectedTextBox({ page: pageIndex, box: (pages[pageIndex].textBoxes || []).length });
    setSelectedPhoto(null);
    setSelectedTitle(null);
    setDirty(true);
  }
  function updateTextBoxRect(pageIndex, boxIndex, patch) {
    pushHistory();
    setPages((ps) => ps.map((p, i) => (i !== pageIndex ? p : {
      ...p, textBoxes: (p.textBoxes || []).map((b, j) => (j === boxIndex ? { ...b, ...patch } : b)),
    })));
    setDirty(true);
  }
  function removeTextBox(pageIndex, boxIndex) {
    pushHistory();
    setPages((ps) => ps.map((p, i) => (i !== pageIndex ? p : {
      ...p, textBoxes: (p.textBoxes || []).filter((_, j) => j !== boxIndex),
    })));
    setSelectedTextBox((sel) => (sel && sel.page === pageIndex ? null : sel));
    setDirty(true);
  }
  function setBackgroundColor(pageIndex, color) {
    updatePage(pageIndex, { background: { type: "color", value: color } });
  }
  function setBackgroundNone(pageIndex) {
    updatePage(pageIndex, { background: null });
  }
  function removeBackgroundPhoto(pageIndex) {
    if (!confirm("Achtergrondfoto verwijderen?")) return;
    updatePage(pageIndex, { background: null });
  }
  // De foto verhuist van de gewone foto-rij naar de achtergrond — niet
  // dubbel getoond.
  function useAsBackground(pageIndex, photo) {
    pushHistory();
    setPages((ps) => ps.map((p, i) => (i !== pageIndex ? p : {
      ...p,
      photos: p.photos.filter((ph) => ph.photoId !== photo.photoId),
      // 50% witte sluier als vertrekpunt — een foto direct als achtergrond
      // zetten resulteert anders vaak in onleesbare tekst/foto's erboven,
      // en de gebruiker kan dit zelf nog aanpassen via de Witte-sluier-rij.
      background: { type: "photo", photoId: photo.photoId, url: photo.url, overlay: 0.5 },
    })));
    setSelectedPhoto((sel) => (sel && sel.page === pageIndex ? null : sel));
    setDirty(true);
  }

  // De fotokiezer doet twee dingen: foto's op de pagina zetten (meerdere
  // tegelijk) of één foto als achtergrond kiezen. Dat scheelt een tweede
  // kiezer; alleen wat een tik doet verschilt, zie pickerMode.
  function openPicker(pageIndex, mode = "photos") {
    setPickerForPage(pageIndex);
    setPickerMode(mode);
    setPickerSelected(new Set());
    setPickerSearch("");
  }
  // Foto's rechtstreeks vanaf het toestel toevoegen, zonder eerst via het
  // dagboek te moeten. Ze komen in de reisbibliotheek terecht (zonder dag,
  // want die context is er hier niet) en staan meteen in de kiezer. Zelfde
  // verwerking als elders: verkleinen, EXIF uitlezen, een paar tegelijk.
  const [pickerUploading, setPickerUploading] = useState(false);
  const [pickerProgress, setPickerProgress] = useState({ done: 0, total: 0 });
  async function handlePickerFiles(e) {
    const files = [...e.target.files];
    e.target.value = "";
    if (!files.length) return;
    setPickerUploading(true);
    setPickerProgress({ done: 0, total: files.length });
    const failed = [];
    const uploaded = [];
    await mapWithConcurrency(files, 3, async (file) => {
      try {
        const [image, exif] = await Promise.all([readForUpload(file), readExif(file)]);
        const base64 = image.dataUrl.split(",")[1];
        if ((base64.length * 3) / 4 > MAX_PHOTO_BYTES) { failed.push(`${file.name} (te groot, max 8 MB)`); return; }
        uploaded.push(await api.addPhoto(tripId, {
          image: { data: base64, mediaType: image.mediaType },
          taken_at: exif.taken_at || null, latitude: exif.latitude ?? null, longitude: exif.longitude ?? null,
        }));
      } catch (err) {
        failed.push(`${file.name} (${err.message || "mislukt"})`);
      }
      setPickerProgress((p) => ({ ...p, done: p.done + 1 }));
    });
    try { setAllPhotos(await api.getPhotos(tripId)); } catch {}
    // Meteen aangevinkt, want wie ze net koos wil ze vrijwel zeker gebruiken.
    if (uploaded.length) setPickerSelected((s) => new Set([...s, ...uploaded.map((u) => u.id)]));
    setPickerUploading(false);
    if (failed.length) alert(`${files.length - failed.length} van ${files.length} foto's toegevoegd.\n\nNiet gelukt:\n${failed.join("\n")}`);
  }

  function togglePick(id) {
    setPickerSelected((s) => {
      const copy = new Set(s);
      if (copy.has(id)) copy.delete(id); else copy.add(id);
      return copy;
    });
  }
  function confirmPicker() {
    const chosen = allPhotos.filter((p) => pickerSelected.has(p.id));
    setPages((ps) => ps.map((p, i) => {
      if (i !== pickerForPage) return p;
      const startCount = p.photos.length;
      const added = chosen.map((c, k) => {
        // Trapsgewijs is de terugval voor pagina's waar geen raster voor
        // bestaat (meer dan vier foto's); de gebruiker schuift die zelf goed.
        const cascade = (startCount + k) % 6;
        return {
          photoId: c.id, url: c.url, thumbUrl: c.thumb_url,
          nativeWidth: c.width, nativeHeight: c.height,
          x: 0.08 + cascade * 0.05, y: 0.08 + cascade * 0.05, width: 0.38, height: 0.3,
          cornerRadius: bookCorner,
        };
      });
      // Foto's meteen netjes neerzetten in plaats van los over elkaar heen:
      // past het totaal binnen een bestaand raster, dan krijgt de hele pagina
      // die indeling. Bestaande foto's schuiven dus mee — dat is de bedoeling,
      // anders zou een nieuwe foto boven op een bestaande belanden.
      const all = [...p.photos, ...added];
      const grid = PHOTOBOOK_LAYOUTS.find((l) => l.slots.length === all.length);
      if (!grid) return { ...p, photos: all };
      return { ...p, photos: all.map((ph, k) => ({ ...ph, ...grid.slots[k] })) };
    }));
    setDirty(true);
    setPickerForPage(null);
  }

  async function handleSaveTitle() {
    if (!title.trim()) return;
    await api.updatePhotobook(bookId, { title: title.trim() });
  }

  async function handleSavePages() {
    setSaving(true); setError(null);
    try {
      await api.savePhotobookPages(bookId, pages.map((p) => ({
        title: p.title, titleAlign: p.titleAlign,
        titleX: p.titleX, titleY: p.titleY, titleWidth: p.titleWidth, titleHeight: p.titleHeight,
        background: !p.background ? null
          : p.background.type === "color" ? { type: "color", value: p.background.value }
          : { type: "photo", photo_id: p.background.photoId, overlay: p.background.overlay },
        photos: p.photos.map((ph) => ({
          photo_id: ph.photoId, x: ph.x, y: ph.y, width: ph.width, height: ph.height,
          opacity: ph.opacity, cornerRadius: ph.cornerRadius, cropX: ph.cropX, cropY: ph.cropY, cropZoom: ph.cropZoom,
        })),
        textBoxes: (p.textBoxes || []).map((b) => ({
          html: b.html, x: b.x, y: b.y, width: b.width, height: b.height, align: b.align, backgroundColor: b.backgroundColor,
        })),
      })));
      setDirty(false);
    } catch (err) { setError(err.message || "Opslaan mislukt"); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!confirm("Dit fotoboek verwijderen?")) return;
    await api.deletePhotobook(bookId);
    onBack();
  }

  async function handleDownloadPdf() {
    if (!confirm("Fotoboek als PDF downloaden?")) return;
    setPdfProgress({ phase: "generating", percent: null });
    try {
      const resp = await fetch(`/api/photobooks/${bookId}/pdf`);
      if (!resp.ok) throw new Error("Downloaden mislukt");
      const total = Number(resp.headers.get("Content-Length")) || 0;
      const reader = resp.body.getReader();
      const chunks = [];
      let received = 0;
      setPdfProgress({ phase: "downloading", percent: total ? 0 : null });
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        setPdfProgress({ phase: "downloading", percent: total ? Math.min(100, Math.round((received / total) * 100)) : null });
      }
      const blob = new Blob(chunks, { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title || "Fotoboek"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message || "Downloaden mislukt");
    } finally {
      setPdfProgress(null);
    }
  }

  if (pages === null) return <div className="text-center py-16 text-gray-400">Laden...</div>;

  if (showPreview) {
    return <PhotobookPreview title={title} pages={pages} orientation={orientation} onClose={() => setShowPreview(false)} />;
  }

  // Welke pagina's (1-based) elke foto gebruikt — voor het waarschuwings-
  // label in de canvas ("Ook op pag. X") en het "Al in dit boek"-teken in de
  // kiezer. Dubbel gebruik mag; dit is puur een hint, geen blokkade.
  const photoPageNumbers = new Map();
  pages.forEach((pg, idx) => {
    const pageNum = idx + 1;
    pg.photos.forEach((ph) => {
      if (!photoPageNumbers.has(ph.photoId)) photoPageNumbers.set(ph.photoId, new Set());
      photoPageNumbers.get(ph.photoId).add(pageNum);
    });
    if (pg.background?.type === "photo") {
      if (!photoPageNumbers.has(pg.background.photoId)) photoPageNumbers.set(pg.background.photoId, new Set());
      photoPageNumbers.get(pg.background.photoId).add(pageNum);
    }
  });

  const pickerQuery = pickerSearch.trim().toLowerCase();
  const pickable = !pickerQuery ? allPhotos : allPhotos.filter((p) => {
    const haystack = `${p.label || ""} ${p.caption || ""}`.toLowerCase();
    return haystack.includes(pickerQuery);
  });

  // Op reisdag gegroepeerd in plaats van één lange strook: bij een reis van
  // twee weken is "de foto's van dag 3" anders alleen met scrollen te vinden.
  // Foto's zonder dag sluiten achteraan aan, zodat ze niet verdwijnen.
  // Bewust geen useMemo: dit staat ná de "Laden..."-return hierboven, en een
  // hook achter een vroege return breekt de hook-volgorde (React-fout #310).
  // Groeperen van een handvol foto's is sowieso niet duur genoeg om te cachen.
  const pickableByDay = (() => {
    const groups = new Map();
    for (const p of pickable) {
      const key = p.day_date ? String(p.day_date).slice(0, 10) : "";
      if (!groups.has(key)) groups.set(key, { key, date: key, title: p.day_title || null, photos: [], blokken: new Map() });
      const dag = groups.get(key);
      dag.photos.push(p);
      // Binnen de dag ook per activiteit bij elkaar: foto's van dezelfde
      // bezienswaardigheid horen naast elkaar te staan. Losse foto's van die
      // dag komen in één blok zonder kop, achter de activiteiten aan.
      const actKey = p.activity_id ? `a${p.activity_id}` : "";
      if (!dag.blokken.has(actKey)) dag.blokken.set(actKey, { key: actKey, title: p.activity_title || null, photos: [] });
      dag.blokken.get(actKey).photos.push(p);
    }
    return [...groups.values()]
      .map((d) => ({
        ...d,
        // De volgorde binnen een dag volgt de eerste foto van elk blok, en dat
        // is de opnametijd — zo blijft de dag chronologisch lopen.
        blokken: [...d.blokken.values()].sort((a, b) => (a.key ? 0 : 1) - (b.key ? 0 : 1)),
      }))
      .sort((a, b) => {
        if (!a.date) return 1;
        if (!b.date) return -1;
        return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
      });
  })();

  const page = pages[currentPageIndex] || null;
  const photoSel = selectedPhoto?.page === currentPageIndex && page ? page.photos[selectedPhoto.photo] : null;
  const textBoxSel = selectedTextBox?.page === currentPageIndex && page ? page.textBoxes?.[selectedTextBox.box] : null;
  const titleSel = selectedTitle?.page === currentPageIndex ? page : null;
  const barsAside = orientation === "landscape" && screenWide;

  return (
    // Bij een liggend boek staan de balken links en rechts in plaats van boven
    // en onder. Een liggende pagina is breed en laag, en het scherm eromheen
    // ook: de hoogte is dan de knellende maat, dus horizontale balken kosten
    // precies de ruimte die de pagina het hardst nodig heeft.
    <div className={`fixed inset-0 z-10 flex bg-gray-800 ${barsAside ? "flex-row" : "flex-col"}`}>
      {/* Bovenbalk (liggend: linkerkolom): vast, niet zwevend — titel en
          boek-brede acties horen niet bij een specifieke pagina, dus die
          verdienen geen overlay. */}
      <div className={`shrink-0 flex gap-2 bg-gray-900 ${barsAside ? "flex-col w-36 px-2 py-3 overflow-y-auto" : "items-center px-3 py-2"}`}
        style={barsAside
          ? { paddingLeft: "calc(0.5rem + env(safe-area-inset-left))" }
          : { paddingTop: "calc(0.5rem + env(safe-area-inset-top))" }}>
        <button onClick={onBack} aria-label="Alle fotoboeken" className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors">
          <Icon name="arrowLeft" size={16} />
        </button>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={handleSaveTitle}
          className={`!text-sm !bg-white/10 !border-white/20 !text-white ${barsAside ? "w-full shrink-0" : "flex-1"}`} placeholder="Titel van het fotoboek" />
        <button type="button" onClick={undo} disabled={history.length === 0} title="Ongedaan maken"
          className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors">
          <Icon name="undo" size={16} />
        </button>
        <button type="button" onClick={() => setSnapEnabled((s) => !s)} title="Rasterlijnen tonen en eraan vastklikken tijdens verslepen"
          className={`shrink-0 px-2.5 h-8 rounded-full text-xs font-medium border transition-colors ${snapEnabled ? "border-sky-400 bg-sky-500/20 text-sky-300" : "border-white/20 text-white/50 hover:border-white/40"}`}>
          Raster
        </button>
        {/* Direct naast de raster-schakelaar: alle foto's in één tik netjes op
            de rasterlijnen zetten, zonder de indeling om te gooien. Alleen
            zinvol op een pagina met foto's, dus in paginaweergave en niet leeg. */}
        {viewMode === "pagina" && (
          <button type="button" onClick={() => page && page.photos.length && snapPhotosToGrid(currentPageIndex)}
            disabled={!page || page.photos.length === 0} title="Foto's op het raster uitlijnen"
            className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors">
            <Icon name="alignGrid" size={16} />
          </button>
        )}
        <button type="button" onClick={() => setShowPreview(true)} aria-label="Voorbeeld bekijken"
          className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors">
          <Icon name="eye" size={16} />
        </button>
        <button type="button" onClick={handleDownloadPdf} aria-label="Downloaden als PDF"
          className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors">
          <Icon name="doc" size={16} />
        </button>
        <button type="button" onClick={handleDelete} aria-label="Fotoboek verwijderen" className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-red-400 hover:bg-white/10 transition-colors">
          <Icon name="trash" size={15} />
        </button>
      </div>
      {/* Middenkolom: foutmelding boven de canvas. Apart omhuld zodat de
          buitenste flex precies drie kinderen houdt (balk, midden, balk) en
          liggend/staand alleen een kwestie van richting is. */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
      {error && <div className="shrink-0 bg-red-50 text-red-700 text-sm px-3 py-2">{error}</div>}

      {/* De pagina zelf blijft fullscreen in beeld; opmaak/instellingen liggen
          er als zwevende panelen overheen in plaats van in een scrollende
          lijst erboven/eronder — zo zie je altijd wat je aan het bewerken bent. */}
      {viewMode === "overzicht" ? (
        <div className="flex-1 overflow-y-auto pt-3">
          <PhotobookOverview pages={pages} orientation={orientation}
            onOpenPage={(i) => { setCurrentPageIndex(i); setViewMode("pagina"); }}
            onAddPage={addPage} />
        </div>
      ) : (
      <div ref={canvasAreaRef} onTouchStart={onCanvasTouchStart} onTouchEnd={onCanvasTouchEnd}
        className="flex-1 relative overflow-hidden flex items-center justify-center p-3">
        {!page ? (
          <div className="text-center text-white/60">
            <p className="text-sm mb-3">Nog geen pagina's in dit fotoboek.</p>
            <Button onClick={addPage}>+ Nieuwe pagina</Button>
          </div>
        ) : (
          <>
            <div
              ref={canvasRef}
              onPointerDown={() => { setSelectedPhoto(null); setSelectedTextBox(null); setSelectedTitle(null); }}
              className="relative overflow-hidden shadow-2xl"
              style={canvasSize ? {
                // Uitgerekende pixelmaat (zie canvasSize hierboven) i.p.v.
                // CSS aspect-ratio + max-width/max-height: die laatste bleek
                // in de praktijk niet betrouwbaar de juiste kant (breedte of
                // hoogte) als bottleneck te kiezen zodra het beschikbare vlak
                // zelf van vorm wisselt (bijv. de telefoon kantelen).
                width: `${canvasSize.width}px`, height: `${canvasSize.height}px`,
                // Maakt de pagina de maatstaf voor cqmin, waarmee de hoeken van
                // alle foto's even rond zijn. De maat staat hier al vast in
                // pixels, dus de size-containment die hierbij hoort verandert
                // niets aan de opmaak.
                containerType: "size",
                background: page.background?.type === "color" ? page.background.value
                  : page.background?.type === "photo" ? `url("${page.background.url}") center/cover no-repeat`
                  : PALETTE.background,
              } : {
                // Eerste render, vóórdat de ResizeObserver heeft kunnen meten —
                // dezelfde oude aanpak als noodgreep, maar dan maar heel even.
                aspectRatio: orientation === "landscape" ? "297 / 210" : "210 / 297",
                maxWidth: "100%", maxHeight: "100%",
                containerType: "size",
                background: page.background?.type === "color" ? page.background.value
                  : page.background?.type === "photo" ? `url("${page.background.url}") center/cover no-repeat`
                  : PALETTE.background,
              }}
            >
              {/* Het raster echt laten zien zolang "Raster" aanstaat. Zonder
                  lijnen leek de knop niets te doen: het snappen werkte wel,
                  maar er was niets om op te mikken. De lijnen staan precies op
                  de punten waar een foto aan blijft plakken. */}
              {snapEnabled && (
                <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
                  {PHOTOBOOK_SNAP_GUIDES.map((g) => (
                    <React.Fragment key={g}>
                      <span className="absolute top-0 bottom-0 w-px"
                        style={{ left: `${g * 100}%`, background: g === 0.5 ? "rgba(47,42,40,0.16)" : "rgba(47,42,40,0.07)" }} />
                      <span className="absolute left-0 right-0 h-px"
                        style={{ top: `${g * 100}%`, background: g === 0.5 ? "rgba(47,42,40,0.16)" : "rgba(47,42,40,0.07)" }} />
                    </React.Fragment>
                  ))}
                </div>
              )}
              {page.background?.type === "photo" && page.background.overlay > 0 && (
                <div className="absolute inset-0 bg-white pointer-events-none" style={{ opacity: page.background.overlay }} />
              )}
              {page.photos.map((ph, j) => (
                <PhotobookCanvasPhoto key={`${ph.photoId}-${j}`} photo={ph}
                  selected={selectedPhoto?.page === currentPageIndex && selectedPhoto?.photo === j}
                  onSelect={() => { setSelectedPhoto({ page: currentPageIndex, photo: j }); setSelectedTextBox(null); setSelectedTitle(null); }}
                  onChangeRect={(patch) => updatePhotoRect(currentPageIndex, j, patch)}
                  getPageEl={() => canvasRef.current}
                  snap={snapEnabled}
                  duplicatePages={[...(photoPageNumbers.get(ph.photoId) || [])].filter((n) => n !== currentPageIndex + 1)}
                  cropActive={selectedPhoto?.page === currentPageIndex && selectedPhoto?.photo === j && cropMode}
                  onToggleCrop={selectedPhoto?.page === currentPageIndex && selectedPhoto?.photo === j ? toggleCropMode : null}
                  orientation={orientation} />
              ))}
              {(page.textBoxes || []).map((box, k) => (
                <PhotobookCanvasTextBox key={box.id ?? k} box={box}
                  selected={selectedTextBox?.page === currentPageIndex && selectedTextBox?.box === k}
                  onSelect={() => { setSelectedTextBox({ page: currentPageIndex, box: k }); setSelectedPhoto(null); setSelectedTitle(null); }}
                  onChangeRect={(patch) => updateTextBoxRect(currentPageIndex, k, patch)}
                  onChangeHtml={(html) => updateTextBoxRect(currentPageIndex, k, { html })}
                  getPageEl={() => canvasRef.current}
                  snap={snapEnabled}
                  richTextRef={textBoxRef} />
              ))}
              {page.photos.length === 0 && !page.background && (page.textBoxes || []).length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm pointer-events-none">Nog geen foto's</div>
              )}
              {/* Altijd bovenop de foto's getekend (en met eigen achtergrond),
                  anders verdwijnt de titel achter een foto die er bovenop ligt
                  — bijv. bij één foto per pagina die bijna de hele pagina vult. */}
              <PhotobookCanvasTitle page={page}
                selected={selectedTitle?.page === currentPageIndex}
                onSelect={() => { setSelectedTitle({ page: currentPageIndex }); setSelectedPhoto(null); setSelectedTextBox(null); }}
                onChangeRect={(patch) => updatePage(currentPageIndex, {
                  titleX: patch.x ?? page.titleX, titleY: patch.y ?? page.titleY,
                  titleWidth: patch.width ?? page.titleWidth, titleHeight: patch.height ?? page.titleHeight,
                })}
                onChangeHtml={(html) => updatePage(currentPageIndex, { title: html })}
                getPageEl={() => canvasRef.current}
                snap={snapEnabled}
                richTextRef={titleRef} />

              {/* Deze twee knoppen staan bewust ALS KIND van de canvas (i.p.v.
                  ernaast, relatief aan het hele scherm) zodat ze bij een
                  liggende pagina (waar de canvas gecentreerd en dus smaller
                  dan het scherm kan staan) precies op de hoeken van de
                  pagina zelf blijven staan, niet ergens in de lege ruimte
                  eromheen. */}
              <button type="button" onClick={() => setShowPagePanel((s) => !s)} aria-label="Pagina-instellingen"
                className={`absolute top-3 right-3 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-colors ${showPagePanel ? "bg-sky-600 text-white" : "bg-white text-gray-600 hover:text-sky-600"}`}>
                <Icon name="sliders" size={17} />
              </button>
              <button type="button" onClick={() => setShowAddMenu((s) => !s)} aria-label="Toevoegen"
                className={`absolute top-3 left-3 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-colors ${showAddMenu ? "bg-sky-600 text-white" : "bg-white text-gray-600 hover:text-sky-600"}`}>
                <Icon name="plus" size={19} />
              </button>
              {showAddMenu && (
                <div className="absolute top-16 left-3 z-20 bg-white rounded-xl shadow-2xl p-1.5 space-y-0.5">
                  <button type="button" onClick={() => { setShowAddMenu(false); openPicker(currentPageIndex); }}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 whitespace-nowrap">
                    <Icon name="frame" size={15} className="text-gray-400" />Foto's
                  </button>
                  <button type="button" onClick={() => { setShowAddMenu(false); openPicker(currentPageIndex, "background"); }}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 whitespace-nowrap">
                    <Icon name="camera" size={15} className="text-gray-400" />Achtergrondfoto
                  </button>
                  <button type="button" onClick={() => { setShowAddMenu(false); addTextBox(currentPageIndex); }}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 whitespace-nowrap">
                    <Icon name="alignLeft" size={15} className="text-gray-400" />Tekstvak
                  </button>
                  {/* Titel toevoegen: selecteert het (nu nog lege) titelvak zodat
                      je meteen kunt typen. Een titel weghalen doe je met de
                      prullenbak in het titelpaneel. */}
                  <button type="button" onClick={() => { setShowAddMenu(false); setSelectedTitle({ page: currentPageIndex }); setSelectedPhoto(null); setSelectedTextBox(null); }}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 whitespace-nowrap">
                    <Icon name="titleText" size={15} className="text-gray-400" />Titel
                  </button>
                </div>
              )}
            </div>

            {showPagePanel && (
              <div className="absolute top-16 right-3 left-3 max-h-[75%] overflow-y-auto bg-white rounded-xl shadow-2xl p-3 space-y-3"
                style={{ transform: `translate(${pagePanelOffset.x}px, ${pagePanelOffset.y}px)` }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {/* Sleepgreepje: paneel even aan de kant schuiven als het
                        de canvas eronder in de weg zit — geen aparte modus,
                        gewoon overal op het paneel behalve de invoervelden. */}
                    <button type="button" onPointerDown={pagePanelDrag.beginPanelDrag} onPointerMove={pagePanelDrag.onPanelDrag}
                      onPointerUp={pagePanelDrag.endPanelDrag} onPointerCancel={pagePanelDrag.endPanelDrag}
                      title="Slepen" className="text-gray-300 hover:text-gray-500 cursor-move touch-none">
                      <Icon name="dragHandle" size={14} />
                    </button>
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pagina-instellingen</span>
                  </div>
                  <button type="button" onClick={() => { setShowPagePanel(false); setPagePanelOffset({ x: 0, y: 0 }); }} aria-label="Sluiten" className="text-gray-400 hover:text-gray-700">
                    <Icon name="close" size={16} />
                  </button>
                </div>

                <div>
                  <div className="text-xs text-gray-400 mb-1.5">Achtergrond</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button type="button" onClick={() => setBackgroundNone(currentPageIndex)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${!page.background ? "border-sky-300 bg-sky-50 text-sky-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                      Geen
                    </button>
                    <button type="button" onClick={() => setBackgroundColor(currentPageIndex, page.background?.type === "color" ? page.background.value : PALETTE.primarySoft)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${page.background?.type === "color" ? "border-sky-300 bg-sky-50 text-sky-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                      Kleur
                    </button>
                    {page.background?.type === "color" && (
                      <>
                        <input type="color" value={page.background.value} onChange={(e) => setBackgroundColor(currentPageIndex, e.target.value)}
                          className="w-7 h-7 rounded-full border border-gray-200 p-0 overflow-hidden cursor-pointer" />
                        {PHOTOBOOK_BG_SWATCHES.map((c) => (
                          <button key={c} type="button" onClick={() => setBackgroundColor(currentPageIndex, c)} aria-label={c}
                            className="w-5 h-5 rounded-full border border-gray-200" style={{ background: c }} />
                        ))}
                      </>
                    )}
                  </div>
                  {page.background?.type === "photo" && (
                    <div className="mt-2">
                      <div className="flex items-center gap-2 mb-2">
                        <img src={page.background.url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                        <span className="text-xs text-gray-400 flex-1">Deze foto is de achtergrond</span>
                        <button type="button" onClick={() => removeBackgroundPhoto(currentPageIndex)} title="Achtergrondfoto verwijderen"
                          className="w-7 h-7 rounded-full flex items-center justify-center text-red-500 hover:bg-red-50 transition-colors shrink-0">
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-gray-400 mr-0.5">Witte sluier</span>
                        {PHOTOBOOK_OVERLAY_PRESETS.map((p) => (
                          <button key={p.value} type="button" onClick={() => updatePage(currentPageIndex, { background: { ...page.background, overlay: p.value } })}
                            className={`px-2 h-6 rounded-full text-[11px] border transition-colors ${(page.background.overlay || 0) === p.value ? "border-sky-400 bg-sky-50 text-sky-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Ontwerp-presets: indeling + achtergrond in één tik, als kant-en-
                    klaar vertrekpunt — daarna nog gewoon zelf verder aan te passen. */}
                <div>
                  <div className="text-xs text-gray-400 mb-1.5">Ontwerp-presets</div>
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    {PHOTOBOOK_DESIGN_PRESETS.map((preset) => (
                      <button key={preset.key} type="button" onClick={() => applyDesignPreset(currentPageIndex, preset)} title={preset.label}
                        disabled={page.photos.length === 0}
                        className="disabled:opacity-30 hover:ring-2 hover:ring-sky-300 rounded transition-shadow shrink-0">
                        <PhotobookDesignPresetThumb layout={preset.layout} background={preset.background} />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Indeling: één tik legt de al aanwezige foto's op deze pagina
                    in een verzorgde verhouding neer — daarna nog steeds vrij te
                    verslepen/schalen. */}
                <div>
                  <div className="text-xs text-gray-400 mb-1.5">Indeling</div>
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    {PHOTOBOOK_LAYOUTS.map((layout) => (
                      <button key={layout.key} type="button" onClick={() => applyLayout(currentPageIndex, layout)} title={layout.label}
                        disabled={page.photos.length === 0}
                        className="disabled:opacity-30 hover:ring-2 hover:ring-sky-300 rounded transition-shadow shrink-0">
                        <PhotobookLayoutThumb slots={layout.slots} orientation={orientation} />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => openPicker(currentPageIndex)}
                    className="flex-1 text-center text-xs font-medium text-sky-600 hover:text-sky-700 py-1.5 border border-dashed border-sky-200 rounded-lg transition-colors">
                    + Foto's toevoegen
                  </button>
                  <button type="button" onClick={() => addTextBox(currentPageIndex)}
                    className="flex-1 text-center text-xs font-medium text-sky-600 hover:text-sky-700 py-1.5 border border-dashed border-sky-200 rounded-lg transition-colors">
                    + Tekstvak toevoegen
                  </button>
                </div>
              </div>
            )}

            {/* Verbergknop voor het zwevende foto/tekstvak-paneel — een grote
                geselecteerde foto kan de canvas (incl. sleepgreep) er onder
                helemaal aan het zicht onttrekken, dus even wegklappen moet
                kunnen zonder de selectie te verliezen. */}
            {(photoSel || textBoxSel || titleSel) && (
              <button type="button" onClick={() => setShowSelPanel((s) => !s)} title={showSelPanel ? "Opties verbergen" : "Opties tonen"}
                className="absolute bottom-3 right-3 z-10 w-9 h-9 rounded-full bg-white shadow-lg flex items-center justify-center text-gray-500 hover:text-sky-600 transition-colors">
                <Icon name="chevronDown" size={15} style={{ transform: showSelPanel ? "none" : "rotate(180deg)" }} />
              </button>
            )}

            {/* Zwevend paneel voor de geselecteerde foto — bijschrift,
                z-volgorde, achtergrond-knop, hoeken en verwijderen. Bijsnijden
                (verschuiven/inzoomen) zit niet hier maar achter het
                crop-icoontje op de foto zelf, zie PhotobookCanvasPhoto. */}
            {photoSel && showSelPanel && (
              <div className="absolute bottom-14 left-3 right-3 max-h-[55%] overflow-y-auto bg-white rounded-xl shadow-2xl p-2.5 space-y-1.5"
                style={{ transform: `translate(${selPanelOffset.x}px, ${selPanelOffset.y}px)` }}>
                <div className="flex items-center gap-2">
                  {/* Sleepgreepje: dit paneel opzij schuiven zonder de
                      selectie kwijt te raken — handig als het net de foto
                      of de sleepgreep eronder aan het zicht onttrekt. */}
                  <button type="button" onPointerDown={selPanelDrag.beginPanelDrag} onPointerMove={selPanelDrag.onPanelDrag}
                    onPointerUp={selPanelDrag.endPanelDrag} onPointerCancel={selPanelDrag.endPanelDrag}
                    title="Slepen" className="text-gray-300 hover:text-gray-500 cursor-move touch-none shrink-0 self-stretch flex items-center">
                    <Icon name="dragHandle" size={14} />
                  </button>
                  {/* Tijdens bijsnijden alleen het sleepgreepje en een label
                      — volgorde/achtergrond/verwijderen leiden alleen maar af
                      terwijl je met de foto zelf bezig bent. */}
                  {cropMode ? (
                    <span className="text-xs font-semibold text-gray-500">Bijsnijden</span>
                  ) : (
                    <>
                      <img src={photoSel.thumbUrl || photoSel.url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                      <div className="flex-1" />
                      <div className="flex items-center gap-1 shrink-0">
                        <button type="button" onClick={() => movePhoto(currentPageIndex, selectedPhoto.photo, -1)} disabled={selectedPhoto.photo === 0} title="Naar achteren"
                          className="w-7 h-7 rounded-full flex items-center justify-center text-sky-600 hover:bg-sky-100 disabled:opacity-30 transition-colors">
                          <Icon name="arrowLeft" size={13} />
                        </button>
                        <button type="button" onClick={() => movePhoto(currentPageIndex, selectedPhoto.photo, 1)} disabled={selectedPhoto.photo === page.photos.length - 1} title="Naar voren"
                          className="w-7 h-7 rounded-full flex items-center justify-center text-sky-600 hover:bg-sky-100 disabled:opacity-30 transition-colors">
                          <Icon name="arrowRight" size={13} />
                        </button>
                        <button type="button" onClick={() => useAsBackground(currentPageIndex, photoSel)} title="Als achtergrond gebruiken"
                          className="w-7 h-7 rounded-full flex items-center justify-center text-sky-600 hover:bg-sky-100 transition-colors">
                          <Icon name="frame" size={13} />
                        </button>
                        <button type="button" onClick={() => removePhoto(currentPageIndex, selectedPhoto.photo)} title="Verwijderen"
                          className="w-7 h-7 rounded-full flex items-center justify-center text-red-500 hover:bg-red-50 transition-colors">
                          <Icon name="trash" size={13} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
                {!cropMode && (
                  <div className="flex items-center gap-3 flex-wrap px-0.5">
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-gray-400 mr-0.5">Hoeken</span>
                      {PHOTOBOOK_CORNER_PRESETS.map((p) => (
                        <button key={p.value} type="button" onClick={() => updatePhotoRect(currentPageIndex, selectedPhoto.photo, { cornerRadius: p.value })}
                          className={`px-2 h-6 rounded-full text-[11px] border transition-colors ${(photoSel.cornerRadius ?? 0) === p.value ? "border-sky-400 bg-sky-50 text-sky-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {cropMode && (() => {
                  const cur = photoSel;
                  const zoomPct = Math.round((cur.cropZoom ?? 1) * 100);
                  return (
                    <div className="space-y-1.5 px-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-500 tnum">{zoomPct}%</span>
                        {(cur.cropX !== undefined && (cur.cropX !== 0.5 || cur.cropY !== 0.5 || (cur.cropZoom ?? 1) !== 1)) && (
                          <button type="button" onClick={() => updatePhotoRect(currentPageIndex, selectedPhoto.photo, { cropX: 0.5, cropY: 0.5, cropZoom: 1 })} title="Bijsnijden herstellen"
                            className="text-[11px] text-sky-600 hover:text-sky-700">Herstel</button>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Zwevend paneel voor het geselecteerde tekstvak. */}
            {textBoxSel && showSelPanel && (
              <div className="absolute bottom-14 left-3 right-3 max-h-[55%] overflow-y-auto bg-white rounded-xl shadow-2xl p-2.5 space-y-1.5"
                style={{ transform: `translate(${selPanelOffset.x}px, ${selPanelOffset.y}px)` }}>
                <div className="flex items-center justify-between">
                  <button type="button" onPointerDown={selPanelDrag.beginPanelDrag} onPointerMove={selPanelDrag.onPanelDrag}
                    onPointerUp={selPanelDrag.endPanelDrag} onPointerCancel={selPanelDrag.endPanelDrag}
                    title="Slepen" className="text-gray-300 hover:text-gray-500 cursor-move touch-none shrink-0 pr-1.5">
                    <Icon name="dragHandle" size={14} />
                  </button>
                  <RichTextToolbar getEl={() => textBoxRef.current} onChange={(v) => updateTextBoxRect(currentPageIndex, selectedTextBox.box, { html: v })}
                    align={textBoxSel.align} onAlignChange={(a) => updateTextBoxRect(currentPageIndex, selectedTextBox.box, { align: a })} />
                  <button type="button" onClick={() => removeTextBox(currentPageIndex, selectedTextBox.box)} title="Tekstvak verwijderen"
                    className="w-7 h-7 rounded-full flex items-center justify-center text-red-500 hover:bg-red-50 transition-colors shrink-0">
                    <Icon name="trash" size={13} />
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-gray-400 mr-0.5">Achtergrond</span>
                  {PHOTOBOOK_TEXTBOX_BACKGROUNDS.map((b) => (
                    <button key={b.value} type="button" onClick={() => updateTextBoxRect(currentPageIndex, selectedTextBox.box, { backgroundColor: b.value })}
                      className={`px-2 h-6 rounded-full text-[11px] border transition-colors ${(textBoxSel.backgroundColor || "transparent") === b.value ? "border-sky-400 bg-sky-100 text-sky-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Zwevend paneel voor de geselecteerde titel — alleen opmaak,
                geen achtergrondkeuze/verwijderknop: de titel zelf is geen
                los element om weg te halen, alleen de tekst kan leeg zijn. */}
            {titleSel && showSelPanel && (
              <div className="absolute bottom-14 left-3 right-3 max-h-[55%] overflow-y-auto bg-white rounded-xl shadow-2xl p-2.5 space-y-1.5"
                style={{ transform: `translate(${selPanelOffset.x}px, ${selPanelOffset.y}px)` }}>
                <div className="flex items-center gap-1.5">
                  <button type="button" onPointerDown={selPanelDrag.beginPanelDrag} onPointerMove={selPanelDrag.onPanelDrag}
                    onPointerUp={selPanelDrag.endPanelDrag} onPointerCancel={selPanelDrag.endPanelDrag}
                    title="Slepen" className="text-gray-300 hover:text-gray-500 cursor-move touch-none shrink-0">
                    <Icon name="dragHandle" size={14} />
                  </button>
                  <RichTextToolbar getEl={() => titleRef.current} onChange={(v) => updatePage(currentPageIndex, { title: v })}
                    align={titleSel.titleAlign} onAlignChange={(a) => updatePage(currentPageIndex, { titleAlign: a })} />
                  {/* Titel weghalen: leegt de tekst en deselecteert, waarna het
                      titelvak verdwijnt (zie PhotobookCanvasTitle). Terug te
                      halen via "+ Titel". */}
                  <button type="button" onClick={() => { updatePage(currentPageIndex, { title: null }); setSelectedTitle(null); }}
                    title="Titel verwijderen"
                    className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-red-500 hover:bg-red-50 transition-colors">
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      )}

      </div>

      {/* Onderbalk (liggend: rechterkolom): paginanavigatie en boek-brede
          acties, ook vast (niet zwevend) zodat 'm nooit per ongeluk de canvas
          overlapt. */}
      <div className={`shrink-0 flex gap-2 bg-gray-900 ${barsAside ? "flex-col w-36 px-2 py-3 overflow-y-auto" : "items-center px-3 py-2"}`}
        style={barsAside
          ? { paddingRight: "calc(0.5rem + env(safe-area-inset-right))" }
          : { paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}>
        {/* In een kolom wijzen vorige/volgende omhoog en omlaag in plaats van
            naar links en rechts — anders staan de pijlen dwars op de richting
            waarin de knoppen zelf staan. */}
        {viewMode === "pagina" ? (
          <>
            {/* Uitzoomen naar het hele boek. Dit is de tegenhanger van een tik
                op een pagina in het overzicht, en staat daarom vooraan — het is
                de weg terug, niet zomaar een van de acties. */}
            <button type="button" onClick={() => setViewMode("overzicht")} title="Terug naar het overzicht"
              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors self-center">
              <Icon name="grid" size={15} />
            </button>
            <button type="button" onClick={() => setCurrentPageIndex((p) => Math.max(0, p - 1))} disabled={currentPageIndex === 0}
              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors self-center">
              <Icon name="arrowUp" size={14} style={{ transform: barsAside ? "none" : "rotate(-90deg)" }} />
            </button>
            <span className="text-white/70 text-xs tnum text-center min-w-[4.5rem] shrink-0">
              {pages.length === 0 ? "Geen pagina's" : `Pagina ${currentPageIndex + 1} / ${pages.length}`}
            </span>
            <button type="button" onClick={() => setCurrentPageIndex((p) => Math.min(pages.length - 1, p + 1))} disabled={currentPageIndex >= pages.length - 1}
              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors self-center">
              <Icon name="arrowUp" size={14} style={{ transform: barsAside ? "rotate(180deg)" : "rotate(90deg)" }} />
            </button>
            <div className={`bg-white/15 shrink-0 ${barsAside ? "h-px w-full my-0.5" : "w-px h-6 mx-0.5"}`} />
            <button type="button" onClick={addPage} title="Nieuwe pagina"
              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors self-center">
              <Icon name="plus" size={16} />
            </button>
            {page && (
              <button type="button" onClick={() => removePage(currentPageIndex)} title="Pagina verwijderen"
                className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-red-400 hover:bg-white/10 transition-colors self-center">
                <Icon name="trash" size={14} />
              </button>
            )}
          </>
        ) : (
          <span className="text-white/70 text-xs tnum shrink-0 self-center px-1">
            {pages.length === 0 ? "Geen pagina's" : `${pages.length} pagina's`}
          </span>
        )}
        <div className="flex-1" />
        <Button onClick={handleSavePages} disabled={saving || !dirty} className={barsAside ? "w-full shrink-0" : ""}>{saving ? "Opslaan..." : "Opslaan"}</Button>
      </div>

      {pickerForPage != null && (
        <Modal title={pickerMode === "background" ? "Achtergrondfoto kiezen" : "Foto's toevoegen"} onClose={() => setPickerForPage(null)}>
          <>
              <div className="flex items-center gap-2 mb-3">
                <div className="relative flex-1 min-w-0">
                  <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
                  <Input value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)}
                    placeholder="Zoeken..." className="!pl-9" />
                </div>
                {/* Foto's die nog niet in de reis zitten hoeven nu niet meer
                    eerst via het dagboek toegevoegd te worden. */}
                <label className={`rp-press shrink-0 inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-sky-100 text-gray-800 text-sm font-semibold cursor-pointer hover:bg-sky-200 transition-colors ${pickerUploading ? "opacity-50 pointer-events-none" : ""}`}>
                  <Icon name="plus" size={16} />
                  {pickerUploading ? "Bezig..." : "Apparaat"}
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handlePickerFiles} disabled={pickerUploading} />
                </label>
              </div>
              {pickerUploading && <UploadProgress done={pickerProgress.done} total={pickerProgress.total} className="mb-3" />}
              {allPhotos.length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-6">Deze reis heeft nog geen foto's. Voeg er hierboven een toe vanaf je apparaat.</div>
              ) : pickable.length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-6">Geen foto's gevonden.</div>
              ) : (
                pickableByDay.map((groep) => (
                <div key={groep.key} className="mb-4">
                  {/* Kopje per reisdag; foto's zonder dag sluiten achteraan aan. */}
                  <div className="text-[13px] font-semibold text-gray-500 mb-1.5 sticky top-0 bg-white py-1">
                    {groep.date
                      ? `${fmtShortDate(groep.date)}${groep.title ? ` · ${groep.title}` : ""}`
                      : "Zonder dag"}
                    <span className="text-gray-300 font-medium"> · {groep.photos.length}</span>
                  </div>
                {groep.blokken.map((blok) => (
                <div key={blok.key} className="mb-2">
                  {/* Alleen een kopje als de dag echt meerdere blokken heeft;
                      bij één blok zou het de dagkop hierboven herhalen. */}
                  {blok.title && groep.blokken.length > 1 && (
                    <div className="text-[13px] font-medium text-gray-400 mb-1 truncate">{blok.title}</div>
                  )}
                <div className="grid grid-cols-3 gap-2">
                  {blok.photos.map((p) => {
                    const picked = pickerSelected.has(p.id);
                    const alreadyIn = photoPageNumbers.has(p.id);
                    return (
                      <div key={p.id} className="relative">
                        <button type="button"
                          onClick={() => {
                            if (pickerMode === "background") {
                              useAsBackground(pickerForPage, { photoId: p.id, url: p.url });
                              setPickerForPage(null);
                            } else togglePick(p.id);
                          }}
                          className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-colors w-full ${picked ? "border-sky-500" : "border-gray-100"}`}>
                          <img src={p.thumb_url || p.url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                          {alreadyIn && !picked && (
                            <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/50 text-white text-[10px] font-medium">
                              In boek
                            </div>
                          )}
                          {picked && (
                            <div className="absolute inset-0 bg-sky-600/20 flex items-center justify-center">
                              <div className="w-6 h-6 rounded-full bg-sky-600 flex items-center justify-center">
                                <Icon name="check" size={13} className="text-white" />
                              </div>
                            </div>
                          )}
                        </button>
                        {/* In achtergrondmodus doet een tik op de tegel dit al,
                            dus dan is dit knopje overbodig. */}
                        {pickerMode !== "background" && (
                          <button type="button" title="Als achtergrond gebruiken"
                            onClick={() => { useAsBackground(pickerForPage, { photoId: p.id, url: p.url }); setPickerForPage(null); }}
                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-sky-600 transition-colors">
                            <Icon name="camera" size={12} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                </div>
                ))}
                </div>
                ))
              )}
              {/* Achtergrond kiezen is één tik op een tegel; dan hoort er geen
                  bevestigknop onder te staan die niets meer te doen heeft. */}
              {pickerMode !== "background" && (
                <div className="sticky bottom-0 -mx-6 px-6 pt-2 pb-1 bg-white">
                  <Button onClick={confirmPicker} disabled={pickerSelected.size === 0}>
                    Toevoegen{pickerSelected.size > 0 ? ` (${pickerSelected.size})` : ""}
                  </Button>
                </div>
              )}
          </>
        </Modal>
      )}

      {pdfProgress && (
        <Modal title="Fotoboek downloaden" onClose={() => {}}>
          <p className="text-sm text-gray-500 mb-4">
            {pdfProgress.phase === "generating" ? "Bezig met samenstellen..." : "Downloaden..."}
          </p>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            {pdfProgress.percent == null ? (
              <div className="h-full w-1/3 rounded-full bg-sky-500 rp-pdf-indeterminate" />
            ) : (
              <div className="h-full rounded-full bg-sky-500 transition-[width] duration-200" style={{ width: `${pdfProgress.percent}%` }} />
            )}
          </div>
          {pdfProgress.percent != null && (
            <p className="text-xs text-gray-400 mt-2 text-right tnum">{pdfProgress.percent}%</p>
          )}
        </Modal>
      )}
    </div>
  );
}

// Eén pagina zoals hij wordt: achtergrond, foto's, tekstvakken, titel. Dit is
// de enige plek waar dat opgebouwd wordt — het overzicht, het voorbeeld en
// straks een miniatuur tekenen allemaal hetzelfde, zodat ze niet uit elkaar
// kunnen lopen. Alles staat in fracties van de pagina, dus de component is
// maatloos: hij vult wat de ouder hem geeft.
function PhotobookPageView({ page, orientation, className = "", titleClassName = "font-display text-base text-gray-800", textClassName = "text-sm" }) {
  return (
    <div className={`overflow-hidden relative ${className}`}
      style={{
        aspectRatio: orientation === "landscape" ? "297 / 210" : "210 / 297",
        containerType: "size",
        background: page.background?.type === "color" ? page.background.value
          : page.background?.type === "photo" ? `url("${page.background.url}") center/cover no-repeat`
          : PALETTE.background,
      }}>
      {page.background?.type === "photo" && page.background.overlay > 0 && (
        <div className="absolute inset-0 bg-white pointer-events-none" style={{ opacity: page.background.overlay }} />
      )}
      {page.photos.map((ph, j) => (
        <div key={j} className="absolute overflow-hidden"
          style={{ left: `${ph.x * 100}%`, top: `${ph.y * 100}%`, width: `${ph.width * 100}%`, height: `${ph.height * 100}%` }}>
          <img src={ph.thumbUrl || ph.url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover"
            style={{
              opacity: ph.opacity ?? 1,
              borderRadius: photobookCornerCss(ph.cornerRadius),
              objectPosition: `${(ph.cropX ?? 0.5) * 100}% ${(ph.cropY ?? 0.5) * 100}%`,
              transform: `scale(${ph.cropZoom ?? 1})`,
              transformOrigin: `${(ph.cropX ?? 0.5) * 100}% ${(ph.cropY ?? 0.5) * 100}%`,
            }} />
        </div>
      ))}
      {(page.textBoxes || []).map((box, k) => (
        <div key={box.id ?? k} className="absolute overflow-hidden rounded-xl p-0.5"
          style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%`, background: box.backgroundColor || "transparent" }}>
          <RichTextView html={box.html} align={box.align} className={textClassName} />
        </div>
      ))}
      {page.title && (
        <div className="absolute rounded-lg p-0.5 bg-white/85"
          style={{
            left: `${(page.titleX ?? 0.15) * 100}%`, top: `${(page.titleY ?? 0.14) * 100}%`,
            width: `${(page.titleWidth ?? 0.7) * 100}%`, height: `${(page.titleHeight ?? 0.1) * 100}%`,
          }}>
          <RichTextView html={page.title} align={page.titleAlign} className={titleClassName} />
        </div>
      )}
    </div>
  );
}

function PhotobookPreview({ title, pages, orientation, onClose }) {
  return (
    <div className="fixed inset-0 z-[70] bg-gray-900 overflow-y-auto">
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3" style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}>
        <span className="text-white text-sm font-medium truncate">{title}</span>
        <button onClick={onClose} aria-label="Voorbeeld sluiten"
          className="shrink-0 w-9 h-9 rounded-full bg-white/15 flex items-center justify-center text-white hover:bg-white/25 transition-colors">
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="px-4 pb-10 space-y-4" style={{ paddingBottom: "calc(2.5rem + env(safe-area-inset-bottom))" }}>
        {pages.map((page, i) => (
          <div key={i} className="relative">
            <PhotobookPageView page={page} orientation={orientation} className="shadow-2xl" />
            {page.photos.length === 0 && !page.title && (page.textBoxes || []).length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">Lege pagina</div>
            )}
            <div className="absolute bottom-3 right-4 text-xs px-2 py-0.5 rounded-full bg-black/40 text-white tnum">{i + 1} / {pages.length}</div>
          </div>
        ))}
        {pages.length === 0 && <div className="text-center text-white/50 py-20">Nog geen pagina's.</div>}
      </div>
    </div>
  );
}

// Het boek zoals het wordt: de kaft alleen, daarna steeds twee pagina's naast
// elkaar zoals ze straks opengeslagen tegenover elkaar liggen. Een tik op een
// pagina zoomt in naar de detail-editor — dat is hoe je hier vandaan komt, dus
// de hele pagina is de knop, niet een klein pictogrammetje in een hoek.
function photobookSpreads(pages) {
  if (!pages.length) return [];
  // Pagina 1 is de kaft en staat alleen; daarna vormen 2-3, 4-5, ... telkens
  // een opengeslagen paar. Zo klopt wat je hier ziet met het gedrukte boek.
  const spreads = [{ key: "kaft", label: "Kaft", items: [{ page: pages[0], index: 0 }] }];
  for (let i = 1; i < pages.length; i += 2) {
    const items = [{ page: pages[i], index: i }];
    if (pages[i + 1]) items.push({ page: pages[i + 1], index: i + 1 });
    spreads.push({ key: `spread-${i}`, label: null, items });
  }
  return spreads;
}

function PhotobookOverview({ pages, orientation, onOpenPage, onAddPage }) {
  const spreads = photobookSpreads(pages);
  return (
    <div className="px-4 pb-6 space-y-6">
      {spreads.map((spread) => (
        // De kaft is één pagina breed, een opengeslagen paar twee — vandaar de
        // halve breedte voor de kaft. Binnen die omhulling verdelen de pagina's
        // zich met flex-1, zodat het nummerregeltje eronder exact dezelfde
        // verdeling volgt en elk nummer onder zijn eigen pagina blijft staan.
        <div key={spread.key} className="mx-auto" style={{ width: spread.items.length === 1 ? "50%" : "100%" }}>
          <div className="flex gap-0.5">
            {spread.items.map(({ page, index }) => (
              <button key={index} type="button" onClick={() => onOpenPage(index)}
                title={`Pagina ${index + 1} bewerken`}
                className="rp-press relative block flex-1 min-w-0 shadow-2xl hover:ring-2 hover:ring-sky-400 transition-shadow">
                <PhotobookPageView page={page} orientation={orientation}
                  titleClassName="font-display text-[9px] text-gray-800"
                  textClassName="text-[7px]" />
                {page.photos.length === 0 && !page.title && (page.textBoxes || []).length === 0 && (
                  <span className="absolute inset-0 flex items-center justify-center text-gray-400 text-xs">Leeg</span>
                )}
              </button>
            ))}
          </div>
          <div className="flex gap-0.5 mt-1.5">
            {spread.items.map(({ index }, i) => (
              <div key={index} className="flex-1 min-w-0 text-[11px] text-white/50 tnum"
                style={{ textAlign: spread.items.length === 1 ? "center" : i === 0 ? "left" : "right" }}>
                {spread.label && i === 0 ? spread.label : index + 1}
              </div>
            ))}
          </div>
        </div>
      ))}
      {onAddPage && (
        <button type="button" onClick={onAddPage}
          className="rp-press w-full rounded-2xl border-2 border-dashed border-white/20 py-6 text-sm font-medium text-white/50 hover:border-white/40 hover:text-white/80 transition-colors">
          + Nieuwe pagina
        </button>
      )}
      {pages.length === 0 && <div className="text-center text-white/50 py-16">Nog geen pagina's.</div>}
    </div>
  );
}

const PACKING_CATEGORIES = [
  { key: "📄 Documenten", label: "Documenten", icon: "doc" },
  { key: "👕 Kleding", label: "Kleding", icon: "shirt" },
  { key: "🔌 Elektronica", label: "Elektronica", icon: "plug" },
  { key: "🧴 Toilettas", label: "Toilettas", icon: "bottle" },
  { key: "💊 Medicijnen", label: "Medicijnen", icon: "pill" },
  { key: "🎒 Overig", label: "Overig", icon: "suitcase" },
];
const PACKING_SUGGESTIONS = {
  "📄 Documenten": ["Paspoort", "Vliegtickets", "Reisverzekering", "Rijbewijs", "Hotelvouchers", "Visabewijzen"],
  "👕 Kleding": ["T-shirts", "Broeken", "Ondergoed", "Sokken", "Trui/vest", "Regenjas", "Zwemkleding", "Pyjama", "Schoenen", "Slippers"],
  "🔌 Elektronica": ["Telefoon oplader", "Reisstekker adapter", "Powerbank", "Oordopjes", "Camera", "Laptop"],
  "🧴 Toilettas": ["Tandenborstel", "Tandpasta", "Shampoo", "Douchegel", "Zonnebrandcrème", "Deodorant", "Scheerspullen"],
  "💊 Medicijnen": ["Paracetamol", "Reizigersdiarree tabletten", "Pleisters", "Antihistamine", "Persoonlijke medicatie"],
  "🎒 Overig": ["Reiskussen", "Slaapmasker", "Hangslot", "Paraplu", "Waterfles", "Snacks voor onderweg"],
};

function PackingTab({ tripId, readOnly }) {
  const [items, setItems] = useState([]);
  const [newItem, setNewItem] = useState("");
  const [newCategory, setNewCategory] = useState(PACKING_CATEGORIES[0].key);
  const [openCategory, setOpenCategory] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = React.useCallback(() => {
    api.getPackingItems(tripId).then(data => { setItems(data); setLoading(false); });
  }, [tripId]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!newItem.trim()) return;
    await api.addPackingItem(tripId, { category: newCategory, item: newItem.trim() });
    setNewItem("");
    load();
  }

  async function handleToggle(item) {
    await api.updatePackingItem(item.id, { checked: !item.checked });
    setItems(prev => prev.map(p => p.id === item.id ? { ...p, checked: !p.checked } : p));
  }

  async function handleDelete(id) {
    await api.deletePackingItem(id);
    setItems(prev => prev.filter(p => p.id !== id));
  }

  async function handleSuggest(cat, suggestion) {
    if (items.some(p => p.category === cat && p.item === suggestion)) return;
    await api.addPackingItem(tripId, { category: cat, item: suggestion });
    load();
  }

  async function handleUncheckAll() {
    await Promise.all(items.filter(p => p.checked).map(p => api.updatePackingItem(p.id, { checked: false })));
    load();
  }

  const grouped = PACKING_CATEGORIES.reduce((acc, cat) => {
    acc[cat.key] = items.filter(p => p.category === cat.key);
    return acc;
  }, {});
  const checkedCount = items.filter(p => p.checked).length;

  if (loading) return <div className="text-center py-12 text-gray-400">Laden...</div>;

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      {items.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">{checkedCount} / {items.length} ingepakt</span>
            {checkedCount > 0 && !readOnly && (
              <button onClick={handleUncheckAll} className="text-xs text-gray-400 hover:text-gray-600">Alles uitvinken</button>
            )}
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${items.length ? (checkedCount / items.length) * 100 : 0}%` }} />
          </div>
        </div>
      )}

      {/* Add item */}
      {!readOnly && (
        <form onSubmit={handleAdd} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex gap-2">
          <select value={newCategory} onChange={e => setNewCategory(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-400 shrink-0">
            {PACKING_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <input value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="Item toevoegen..."
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-400 min-w-0" />
          <button type="submit" className="bg-sky-300 text-gray-800 rounded-xl px-4 h-11 text-sm font-semibold hover:bg-sky-200 transition-colors shrink-0">+</button>
        </form>
      )}

      {/* Categories */}
      {PACKING_CATEGORIES.map(cat => {
        const catItems = grouped[cat.key] || [];
        const catChecked = catItems.filter(p => p.checked).length;
        const isOpen = openCategory === cat.key;
        const suggestions = (PACKING_SUGGESTIONS[cat.key] || []).filter(s => !catItems.some(p => p.item === s));
        return (
          <div key={cat.key} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <button onClick={() => setOpenCategory(isOpen ? null : cat.key)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-2.5">
                <Icon name={cat.icon} size={17} className="text-sky-700" />
                <span className="font-medium text-gray-800 text-sm">{cat.label}</span>
                {catItems.length > 0 && (
                  <span className="text-xs text-gray-400 tnum">{catChecked}/{catItems.length}</span>
                )}
              </div>
              <Icon name="arrowRight" size={15} className={`text-gray-400 transition-transform ${isOpen ? "rotate-90" : ""}`} />
            </button>

            {isOpen && (
              <div className="border-t border-gray-50 px-4 pb-3">
                {catItems.length === 0 && (
                  <p className="text-xs text-gray-400 italic py-2">Nog geen items in deze categorie</p>
                )}
                <div className="divide-y divide-gray-50">
                  {catItems.map(item => (
                    <div key={item.id} className="flex items-center gap-3 py-2 group">
                      <input type="checkbox" checked={item.checked} disabled={readOnly} onChange={() => handleToggle(item)}
                        className="w-4 h-4 rounded accent-sky-600 cursor-pointer shrink-0" />
                      <span className={`flex-1 text-sm ${item.checked ? "line-through text-gray-400" : "text-gray-800"}`}>{item.item}</span>
                      {!readOnly && (
                        <button onClick={() => handleDelete(item.id)}
                          className="text-gray-300 hover:text-red-500 active:text-red-600 p-1 opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Verwijderen"><Icon name="trash" size={15} /></button>
                      )}
                    </div>
                  ))}
                </div>
                {!readOnly && suggestions.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-50">
                    <p className="text-xs text-gray-400 mb-1.5">Suggesties:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.slice(0, 6).map(s => (
                        <button key={s} onClick={() => handleSuggest(cat.key, s)}
                          className="text-xs px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:bg-sky-50 hover:border-sky-300 hover:text-sky-700 transition-colors inline-flex items-center gap-1">
                          <Icon name="plus" size={12} /> {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {items.length === 0 && (
        <div className="text-center py-10 text-gray-400">
          <Icon name="suitcase" size={38} strokeWidth={1.2} className="mb-3 text-gray-300" />
          <div className="text-sm">Nog niets op de paklijst</div>
          <div className="text-xs mt-1">Voeg items toe of kies suggesties per categorie</div>
        </div>
      )}
    </div>
  );
}

// Bewerken/verwijderen zijn destructief-aanpalend genoeg dat ze niet als grote
// knoppen naast elkaar hoeven te staan — een klein "meer"-icoontje met een
// uitklapmenu houdt ze uit het zicht tot iemand er echt naar zoekt.
function TripActionsMenu({ onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={wrapRef}>
      {/* touchAction: net als de dubbeltik-fix in de fotoviewer eerder — zonder
          dit kan een browser op een echt touchscreen de tik laten wachten op
          een eventuele tweede tik (zoom-ambiguïteit), iets wat een synthetische
          muisklik in tests nooit blootlegt. Ook iets groter (w-9/h-9 i.p.v.
          w-8/h-8) voor een ruimer tikgebied. */}
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Meer opties"
        style={{ touchAction: "manipulation" }}
        className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 text-gray-500 transition-colors">
        <Icon name="more" size={18} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-50 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden py-1" style={{ minWidth: 170 }}>
          <button type="button" onClick={() => { setOpen(false); onEdit(); }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
            <Icon name="pen" size={15} />Bewerken
          </button>
          <button type="button" onClick={() => { setOpen(false); onDelete(); }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors text-left">
            <Icon name="trash" size={15} />Verwijderen
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- Fotoquiz ----------
// Tekent de QR puur client-side (qrcode-generator via CDN, net als Leaflet/
// exif-js) — er hoeft niets naar een externe QR-dienst verstuurd te worden
// voor iets dat toch al gewoon een link is.
function QrCode({ value, size = 180 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    if (!value || typeof window.qrcode !== "function") { ref.current.innerHTML = ""; return; }
    try {
      const qr = window.qrcode(0, "M");
      qr.addData(value);
      qr.make();
      ref.current.innerHTML = qr.createSvgTag({ scalable: true });
      const svg = ref.current.querySelector("svg");
      if (svg) { svg.style.width = "100%"; svg.style.height = "100%"; }
    } catch { ref.current.innerHTML = ""; }
  }, [value]);
  return <div ref={ref} style={{ width: size, height: size }} className="mx-auto" />;
}

// Neemt het hele scherm over — koptekst, tabbalk en onderbalk verdwijnen
// achter deze laag — zodat de quiz als een echt spelmoment voelt in plaats
// van nog een tabblad tussen de rest van de reisplanning.
// Niet quiz-specifiek ondanks de naam — generieke volledig-scherm-overlay,
// ook hergebruikt door het fotoboek.
function QuizFullscreen({ onClose, children, label = "Sluiten" }) {
  const scrollRef = useRef(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  function handleScroll(e) {
    setShowScrollTop(e.target.scrollTop > 400);
  }
  function scrollToTop() {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="fixed inset-0 z-[60] bg-gray-50 overflow-y-auto">
      <div className="sticky top-0 z-10 flex justify-end p-3" style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}>
        <button onClick={onClose} aria-label={label}
          className="w-9 h-9 rounded-full bg-white shadow-md flex items-center justify-center text-gray-500 hover:text-gray-700">
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="px-4 pb-10" style={{ paddingBottom: "calc(2.5rem + env(safe-area-inset-bottom))" }}>{children}</div>
      {/* Vooral handig in het fotoboek, waar een pagina met veel foto's flink
          kan doorscrollen — "fixed" i.p.v. "sticky" omdat dit element zelf
          buiten de doorschuivende inhoud staat, direct in de scrollende
          container. */}
      {showScrollTop && (
        <button onClick={scrollToTop} aria-label="Naar boven"
          className="fixed z-20 w-11 h-11 rounded-full bg-white shadow-lg border border-gray-100 flex items-center justify-center text-gray-500 hover:text-sky-600 transition-colors"
          style={{ right: "1rem", bottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}>
          <Icon name="arrowUp" size={18} />
        </button>
      )}
    </div>
  );
}

// Fisher-Yates, niet `.sort(() => Math.random() - 0.5)` — die laatste schudt
// niet uniform (zie de vergelijkbare fix in generateQuizQuestions op de
// server) en zou hier de foto's in de rol systematisch in dezelfde volgorde
// laten eindigen.
function shuffleClient(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Kleine, gesynthetiseerde geluidseffecten voor de quiz — geen audiobestanden
// nodig (die passen niet bij een app zonder buildstap), gewoon een paar korte
// toontjes via de Web Audio API. Eén gedeelde AudioContext, lazy aangemaakt
// en pas bij een echte gebruikersactie (klik) — Safari/iOS negeert geluid dat
// zonder gebaar van de gebruiker start, dus de allereerste aanroep gebeurt
// altijd vanuit een click-handler (start/antwoord-knop).
let quizAudioCtx = null;
function quizAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!quizAudioCtx) quizAudioCtx = new Ctx();
  if (quizAudioCtx.state === "suspended") quizAudioCtx.resume().catch(() => {});
  return quizAudioCtx;
}
function playTone(freq, startOffset, duration, { type = "sine", gain = 0.15 } = {}) {
  const ctx = quizAudio();
  if (!ctx) return;
  const t0 = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}
// Voor de dramatische "riser" bij de intro: een doorlopende frequentiesweep
// in plaats van een vast toonhoogte, net als de spanningsopbouw in echte
// spelshowmuziek (Weekend Miljonairs, Rad van Fortuin).
function playSweep(freqStart, freqEnd, startOffset, duration, { type = "sawtooth", gain = 0.12 } = {}) {
  const ctx = quizAudio();
  if (!ctx) return;
  const t0 = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, t0);
  osc.frequency.linearRampToValueAtTime(freqEnd, t0 + duration);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + duration * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration + 0.05);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.08);
}
function playWheelLand() {
  playTone(110, 0, 0.15, { type: "sine", gain: 0.16 }); // korte lage "thump" voor extra impact
  playTone(880, 0.03, 0.12, { type: "triangle" });
  playTone(1175, 0.12, 0.24, { type: "triangle" });
}
function playTick() { playTone(1300, 0, 0.05, { type: "square", gain: 0.07 }); }
// Het klikkende geluid van een rad-van-fortuin-wieltje: één klikje per
// passerende foto, getimed op exact dezelfde cubic-bezier-vertraging als de
// visuele rol (zie inverseEase in PhotoWheel) — dus de klikjes versnellen
// niet lineair maar volgen precies hoe de rol zelf ook vertraagt.
function playWheelClick(offset = 0) { playTone(1600, offset, 0.03, { type: "square", gain: 0.08 }); }
// Dezelfde cubic-bezier(0,0,0.2,1) als de CSS-transition van de rol zelf —
// hiermee wordt uitgerekend op welk tijdstip elke volgende foto de kijkkant
// bereikt, zodat de klikjes precies de visuele vertraging volgen in plaats
// van een simpel, onrealistisch gelijkmatig tempo.
function easeDecelerateAt(x) {
  function bez(t, p1, p2) { const mt = 1 - t; return 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t; }
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (bez(mid, 0, 0.2) < x) lo = mid; else hi = mid;
  }
  return bez((lo + hi) / 2, 0, 1);
}
function wheelClickTimes(tileCount, totalMs) {
  const times = [];
  for (let i = 1; i < tileCount; i++) {
    const targetY = i / tileCount;
    let lo = 0, hi = 1;
    for (let k = 0; k < 24; k++) {
      const mid = (lo + hi) / 2;
      if (easeDecelerateAt(mid) < targetY) lo = mid; else hi = mid;
    }
    times.push(((lo + hi) / 2) * (totalMs / 1000));
  }
  return times;
}
function playCorrect() {
  [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => playTone(f, i * 0.08, 0.16, { type: "triangle", gain: 0.14 }));
}
function playWrong() {
  playSweep(320, 110, 0, 0.5, { type: "sawtooth", gain: 0.14 }); // "womp womp" — dalende glide i.p.v. één vaste zoemtoon
}
function playWinnerFanfare() {
  [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => playTone(f, i * 0.12, 0.2, { type: "triangle", gain: 0.13 }));
  // Slotakkoord: drie tonen tegelijk voor wat meer "voluit" op het eind.
  [1046.5, 1318.5, 1568].forEach((f) => playTone(f, 0.6, 0.7, { type: "triangle", gain: 0.11 }));
}
// Dramatisch spelshow-intromuziekje: een oplopende spanningssweep (de
// "riser" die je in echte spelshows vlak vóór de start hoort), gevolgd door
// een stevige aanslag en een fanfare-achtige oplopende reeks — in plaats van
// het simpele setje pieptonen van hiervoor.
function playGameShowIntro() {
  playSweep(90, 700, 0, 0.55, { type: "sawtooth", gain: 0.13 });
  playTone(80, 0.55, 0.18, { type: "sine", gain: 0.2 }); // stevige lage "hit"
  [523.25, 659.25, 783.99].forEach((f) => playTone(f, 0.58, 0.22, { type: "square", gain: 0.13 }));
  [
    { f: 659.25, t: 0.78, d: 0.09 },
    { f: 783.99, t: 0.88, d: 0.09 },
    { f: 1046.5, t: 0.98, d: 0.09 },
    { f: 1318.5, t: 1.08, d: 0.5 },
  ].forEach(({ f, t, d }) => playTone(f, t, d, { type: "square", gain: 0.13 }));
}
// Sting voor de verdubbelaar-tussenpagina: een korte oplopende sweep gevolgd
// door een heldere hit, om het "dit is bijzonder" gevoel te onderstrepen.
function playDoublerSting() {
  playSweep(200, 900, 0, 0.4, { type: "square", gain: 0.15 });
  playTone(1046.5, 0.4, 0.3, { type: "triangle", gain: 0.16 });
}

// Een slot-achtige foto-rol: een rij foto's uit de reis schuift voorbij en
// komt vertragend tot stilstand op de foto waar de vraag over gaat, als korte
// spanningsopbouw vóór de multiple-choice opties verschijnen. De rolrichting
// is altijd hetzelfde (naar links), alleen de duur van de vertraging geeft
// het "tot stilstand komen"-gevoel — geen fysica, gewoon een CSS-easing.
const WHEEL_SPIN_MS = 4300;

function PhotoWheel({ pool, target, onDone }) {
  const containerRef = useRef(null);
  const trackRef = useRef(null);
  const [tileSize, setTileSize] = useState(0);

  // Zo breed als de vraagkaart eronder (max-w-md, responsief) in plaats van
  // een vast aantal pixels — anders oogt de rol een stuk kleiner dan de foto
  // die er meteen op volgt.
  React.useLayoutEffect(() => {
    if (containerRef.current) setTileSize(containerRef.current.clientWidth);
  }, []);

  // Op `target.photo_id` in plaats van op `target` zelf: elke /state-poll (om
  // de 1,5s) levert een nieuw objectliteral voor dezelfde vraag, en zolang
  // hetzelfde fotonummer bedoeld wordt mag dat de rol niet laten herstarten.
  const sequence = React.useMemo(() => {
    const filler = shuffleClient(pool.filter((p) => p.id !== target.photo_id && (p.thumb_url || p.url))).slice(0, 13);
    while (filler.length < 9) filler.push(target);
    return [...filler, target];
  }, [pool, target.photo_id]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el || !tileSize) return;
    let done = false;
    el.style.transition = "none";
    el.style.transform = "translateX(0px)";
    void el.offsetHeight; // force reflow, anders negeert de browser de reset vóór de animatie
    const raf = requestAnimationFrame(() => {
      // Lang genoeg om als een echte rol te voelen: eerst duidelijk
      // ronddraaiend, dan een merkbaar lange, uitdovende staart voordat hij
      // stilstaat op de juiste foto.
      el.style.transition = `transform ${WHEEL_SPIN_MS}ms cubic-bezier(0,0,0.2,1)`;
      el.style.transform = `translateX(-${(sequence.length - 1) * tileSize}px)`;
    });
    wheelClickTimes(sequence.length, WHEEL_SPIN_MS).forEach((t) => playWheelClick(t));
    const timer = setTimeout(() => { if (!done) { done = true; onDone(); } }, WHEEL_SPIN_MS + 50);
    return () => { done = true; cancelAnimationFrame(raf); clearTimeout(timer); };
  }, [sequence, tileSize]);

  return (
    <div ref={containerRef} className="relative overflow-hidden rounded-2xl border-4 border-sky-400 shadow-lg mx-auto w-full max-w-[380px] aspect-square">
      <div ref={trackRef} className="flex h-full" style={{ willChange: "transform" }}>
        {sequence.map((p, i) => (
          <img key={i} src={p.thumb_url || p.url} alt="" className="object-cover shrink-0 h-full" style={{ width: tileSize || "100%" }} />
        ))}
      </div>
    </div>
  );
}

// Openingsscherm dat één keer per sessie te zien is, zodra de quiz écht
// begint (lobby → actief) en vóór de eerste vraag — puur decoratief, niet
// gekoppeld aan een specifieke reis of vraag.
const QUIZ_OPENING_IMAGE = "/quiz-cover-1.jpg";
const OPENING_SCREEN_MS = 6500;

function QuizOpeningScreen() {
  return (
    <div className="max-w-sm mx-auto">
      <div className="rounded-2xl overflow-hidden shadow-lg">
        <img src={QUIZ_OPENING_IMAGE} alt="" className="w-full object-cover" />
      </div>
    </div>
  );
}

const DOUBLER_SCREEN_MS = 3000;

// Tussenpagina vlak vóór de verdubbelaar-vraag — even iets groots en
// opvallends vóór de vraag zelf verschijnt, zodat niemand die dubbele punten
// mist.
function QuizDoublerScreen() {
  return (
    <div className="max-w-sm mx-auto text-center py-14">
      <div className="text-6xl mb-4 leading-none">⚡</div>
      <h2 className="font-display text-4xl font-bold text-amber-500 mb-2">Verdubbelaar!</h2>
      <p className="text-sm text-gray-500">Deze vraag levert dubbele punten op</p>
    </div>
  );
}

const SCORE_SPIN_MS = 3000;

// Telt op van de vorige naar de nieuwe stand in plaats van 'm meteen te
// tonen — dezelfde "eerst draaien, dan landen"-gedachte als de foto-rol,
// maar dan voor de score zelf. Ease-out: snel op gang, rustig uitlopend.
function AnimatedScore({ from, to, active, duration = SCORE_SPIN_MS }) {
  const [display, setDisplay] = useState(active ? from : to);
  useEffect(() => {
    if (!active) { setDisplay(to); return; }
    let raf;
    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, from, to, duration]);
  return <span className="tnum font-semibold text-gray-700">{display}</span>;
}

// Slingers bij het eindscherm van de quiz. Feestelijk mag, maar dan wel in de
// tinten van de app zelf in plaats van zeven vreemde primairkleuren.
const STREAMER_COLORS = [
  PALETTE.primary, PALETTE.coral, PALETTE.accent,
  PALETTE.success, PALETTE.info, PALETTE.primaryHover, PALETTE.coralDeep,
];

// Slingers voor het eindscherm van de fotoquiz — vallen één keer naar
// beneden (zie .rp-streamer in index.html) en blijven daarna hangen, geen
// oneindige loop. Willekeurige posities/timing worden één keer bepaald bij
// het monteren, niet bij elke re-render (anders "regent" het bij elke poll
// opnieuw).
function PartyStreamers({ count = 60 }) {
  const pieces = React.useMemo(() => Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.6,
    duration: 2.6 + Math.random() * 1.6,
    color: STREAMER_COLORS[i % STREAMER_COLORS.length],
    rotate: Math.round(Math.random() * 360),
  })), [count]);
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 70 }}>
      {pieces.map((p) => (
        <div key={p.id} className="rp-streamer" style={{
          left: `${p.left}%`,
          backgroundColor: p.color,
          animationDelay: `${p.delay}s`,
          animationDuration: `${p.duration}s`,
          transform: `rotate(${p.rotate}deg)`,
        }} />
      ))}
    </div>
  );
}

// Een Kahoot-achtige fotoquiz: één sessie, gedeeld via QR-code, met tussenstand
// na elke vraag en een winnaar aan het eind. De voortgang komt volledig uit
// GET .../state (zie computeQuizPhase in server.js) — deze component pollt
// alleen, er wordt hier niets aan lokale timers of host-besturing gedaan.
function PhotoQuizTab({ trip }) {
  const [session, setSession] = useState(undefined); // undefined = laden, null = geen sessie
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [live, setLive] = useState(null);
  const [myPick, setMyPick] = useState(null);
  const [questionSeconds, setQuestionSeconds] = useState(15);
  const [questionCount, setQuestionCount] = useState(5);
  const [photoPool, setPhotoPool] = useState([]);
  const [revealedIndex, setRevealedIndex] = useState(-1);
  const [openingScreenActive, setOpeningScreenActive] = useState(false);
  const openingScreenShownRef = useRef(false);
  const openingScreenTimerRef = useRef(null);
  const [doublerScreenActive, setDoublerScreenActive] = useState(false);
  const doublerScreenShownRef = useRef(false);
  const doublerScreenTimerRef = useRef(null);
  const [scoreSpinActive, setScoreSpinActive] = useState(false);
  const scoreSpinTimerRef = useRef(null);
  const scoreSpinBaselineRef = useRef(new Map()); // id -> score vóór deze onthulling
  const lastRevealScoresRef = useRef(null); // id -> score ná de vórige onthulling (null = nog geen enkele gehad)
  const revealedStandingsIndexRef = useRef(-1);
  const [showNewQuizForm, setShowNewQuizForm] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState(null);
  const lastTickRef = useRef(null);
  const doneSoundPlayedRef = useRef(false);
  const introPlayedRef = useRef(false);

  const refreshSession = useCallback(async () => {
    try { const data = await api.getQuizSession(trip.id); setSession(data.session || null); }
    catch { setSession(null); }
  }, [trip.id]);

  useEffect(() => { refreshSession(); }, [refreshSession]);

  async function toggleStats() {
    if (showStats) { setShowStats(false); return; }
    setShowStats(true);
    setStats(null);
    try { setStats(await api.getQuizStats(trip.id)); }
    catch { setStats([]); }
  }

  // Vulling voor de foto-rol (zie PhotoWheel) — gewoon de fotobibliotheek van
  // de reis, niet gekoppeld aan quizvragen, dus geen risico dat een nog niet
  // gestelde vraag hierdoor wordt verklapt.
  useEffect(() => {
    api.getPhotos(trip.id).then((photos) => setPhotoPool(photos || [])).catch(() => {});
  }, [trip.id]);

  useEffect(() => {
    if (!session || !session.isParticipant) { setLive(null); return; }
    let cancelled = false;
    async function poll() {
      try {
        const data = await api.getQuizState(session.id);
        if (!cancelled) setLive(data);
      } catch { /* volgende poll probeert het opnieuw */ }
    }
    poll();
    const timer = setInterval(poll, 1500);
    return () => { cancelled = true; clearInterval(timer); };
  }, [session]);

  useEffect(() => { setMyPick(null); }, [live?.currentIndex]);

  // Korte tik in de laatste 3 seconden van het antwoordvenster — alleen
  // tijdens het echte kiezen (niet terwijl de foto-rol nog draait; de
  // blur-variant heeft geen rad, dus daar mag de tik altijd), en hooguit één
  // keer per seconde-waarde (anders zou elke 1,5s-poll 'm opnieuw afvuren
  // zolang de weergegeven seconde niet is veranderd).
  useEffect(() => {
    if (live?.phase !== "question") return;
    const stillSpinning = live.question?.mode !== "blur" && revealedIndex !== live.currentIndex;
    if (stillSpinning) return;
    const s = live.remainingSeconds;
    if (s > 0 && s <= 3 && lastTickRef.current !== s) { lastTickRef.current = s; playTick(); }
  }, [live?.phase, live?.remainingSeconds, live?.currentIndex, live?.question?.mode, revealedIndex]);

  // Fanfare zodra de eindstand in beeld komt — precies één keer, niet bij
  // elke poll zolang de quiz al "done" is.
  useEffect(() => {
    if (live?.phase === "done" && !doneSoundPlayedRef.current) {
      doneSoundPlayedRef.current = true;
      playWinnerFanfare();
    }
  }, [live?.phase]);

  // Spelshow-intromuziekje zodra de quiz écht begint — voor iedereen die op
  // dat moment aan het pollen is (niet alleen de gastheer die op "start"
  // klikte), en precies één keer per sessie.
  useEffect(() => {
    if (live && live.phase !== "lobby" && !introPlayedRef.current) {
      introPlayedRef.current = true;
      playGameShowIntro();
    }
  }, [live?.phase]);

  // Openingsscherm: net als het intromuziekje hierboven precies één keer
  // getriggerd zodra de quiz de lobby uit is, en toont zichzelf even (los van
  // de eigenlijke serverfase) vóór de eerste vraag in beeld komt.
  //
  // Belangrijk: geen `return () => clearTimeout(timer)` hier — dat zou de
  // timer bij elke volgende fase-wisseling annuleren (het effect draait
  // opnieuw zodra live.phase verandert, en React ruimt dan eerst de vorige
  // cleanup op), waardoor het scherm nooit meer automatisch verdwijnt als er
  // binnen de weergaveduur alweer een nieuwe fase intreedt. De timer leeft in
  // een ref en wordt alleen bij het unmounten van de tab opgeruimd.
  useEffect(() => {
    if (live && live.phase !== "lobby" && !openingScreenShownRef.current) {
      openingScreenShownRef.current = true;
      setOpeningScreenActive(true);
      openingScreenTimerRef.current = setTimeout(() => setOpeningScreenActive(false), OPENING_SCREEN_MS);
    }
  }, [live?.phase]);
  useEffect(() => () => clearTimeout(openingScreenTimerRef.current), []);

  // Tussenpagina vlak vóór de verdubbelaar-vraag — precies één keer, zodra
  // die vraag voor het eerst in beeld komt (niet bij elke poll erna). Zelfde
  // reden als hierboven: de timer leeft in een ref, geen cleanup-per-render.
  useEffect(() => {
    if (live?.phase === "question" && live.question?.doubler && !doublerScreenShownRef.current) {
      doublerScreenShownRef.current = true;
      setDoublerScreenActive(true);
      playDoublerSting();
      doublerScreenTimerRef.current = setTimeout(() => setDoublerScreenActive(false), DOUBLER_SCREEN_MS);
    }
  }, [live?.phase, live?.currentIndex, live?.question?.doubler]);
  useEffect(() => () => clearTimeout(doublerScreenTimerRef.current), []);

  // Tussenstand-onthulling: eerst de oude stand tonen, dan de score per
  // deelnemer laten oplopen naar de nieuwe stand, precies één keer per ronde
  // (niet bij elke poll terwijl de tussenstand al in beeld staat). Alleen bij
  // een echte tussenstand (elke 3e vraag) of de eindstand — de korte "dit was
  // het goede antwoord"-pauze na de andere vragen toont sowieso geen
  // ranglijst, dus daar hoeft ook niets te spinnen.
  useEffect(() => {
    const isRealStandings = live?.phase === "done" || (live?.phase === "standings" && live?.showsLeaderboard);
    if (isRealStandings && revealedStandingsIndexRef.current !== live.currentIndex) {
      revealedStandingsIndexRef.current = live.currentIndex;
      const participants = live.participants || [];
      scoreSpinBaselineRef.current = lastRevealScoresRef.current
        || new Map(participants.map((p) => [p.id ?? p.name, 0]));
      setScoreSpinActive(true);
      scoreSpinTimerRef.current = setTimeout(() => {
        setScoreSpinActive(false);
        lastRevealScoresRef.current = new Map(participants.map((p) => [p.id ?? p.name, p.score]));
      }, SCORE_SPIN_MS);
    }
  }, [live?.phase, live?.currentIndex, live?.showsLeaderboard]);
  useEffect(() => () => clearTimeout(scoreSpinTimerRef.current), []);

  async function createSession() {
    setCreating(true); setError(null);
    try {
      const data = await api.createQuizSession(trip.id, { questionSeconds, questionCount });
      setSession(data.session);
      setLive(null);
      setRevealedIndex(-1);
      setShowNewQuizForm(false);
      doneSoundPlayedRef.current = false;
      introPlayedRef.current = false;
      clearTimeout(openingScreenTimerRef.current);
      openingScreenShownRef.current = false;
      setOpeningScreenActive(false);
      clearTimeout(doublerScreenTimerRef.current);
      doublerScreenShownRef.current = false;
      setDoublerScreenActive(false);
      clearTimeout(scoreSpinTimerRef.current);
      setScoreSpinActive(false);
      scoreSpinBaselineRef.current = new Map();
      lastRevealScoresRef.current = null;
      revealedStandingsIndexRef.current = -1;
    } catch (err) { setError(err.message || "Kon geen quiz starten"); }
    finally { setCreating(false); }
  }

  async function startSession() {
    quizAudio(); // klik van de gastheer — beste kans om geluid alvast te ontgrendelen
    setStarting(true);
    try { await api.startQuizSession(trip.id, session.id); await refreshSession(); }
    catch (err) { alert(err.message || "Kon quiz niet starten"); }
    finally { setStarting(false); }
  }

  async function stopSession() {
    if (!confirm("Quiz stoppen voor iedereen?")) return;
    setStopping(true);
    try { await api.stopQuizSession(trip.id, session.id); await refreshSession(); }
    catch (err) { alert(err.message || "Kon quiz niet stoppen"); }
    finally { setStopping(false); }
  }

  // navigator.clipboard.writeText() geeft geen enkele terugkoppeling als hij
  // stilzwijgend weigert (geen HTTPS-context, geen clipboard-permissie in een
  // ingesloten webview, iOS-eigenaardigheden) — de knop leek dan "niets te
  // doen". Nu met een echte fallback via een verborgen textarea + execCommand,
  // en zichtbare feedback zodra het (via welke weg dan ook) echt is gelukt.
  async function copyJoinLink() {
    try {
      await navigator.clipboard.writeText(session.joinLink);
    } catch {
      try {
        const el = document.createElement("textarea");
        el.value = session.joinLink;
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.focus();
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      } catch {
        alert("Kopiëren is niet gelukt. Tik op de link hierboven om 'm handmatig te selecteren.");
        return;
      }
    }
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  async function pick(choice) {
    if (myPick || !live || live.phase !== "question") return;
    quizAudio(); // ontgrendel de AudioContext binnen dit klik-gebaar (iOS staat geluid niet toe zonder)
    setMyPick({ index: live.currentIndex, choice, pending: true });
    try {
      const res = await api.answerQuizQuestion(session.id, live.currentIndex, choice);
      setMyPick({ index: live.currentIndex, choice, correct: res.correct, points: res.points });
      if (res.correct) playCorrect(); else playWrong();
    } catch (err) {
      setMyPick(null);
      alert(err.message || "Kon antwoord niet versturen");
    }
  }

  if (session === undefined) {
    return <div className="text-center py-16 text-gray-400">Laden...</div>;
  }

  // Gedeeld tussen het allereerste scherm (nog nooit een sessie gehad) én
  // "Nieuwe quiz starten" ná afloop — dat laatste opende voorheen meteen een
  // nieuwe sessie met de oude waarden, zonder ooit deze instellingen nog eens
  // te tonen. Zodra er ooit een sessie is geweest blijft `session` immers
  // altijd de laatst gemaakte sessie (nooit meer null), dus dit was de enige
  // andere plek waar aantal vragen / tijd per vraag nog aanpasbaar konden zijn.
  function renderQuizSettings(buttonLabel) {
    return (
      <>
        <div className="flex items-center justify-center gap-4 mb-5 text-sm">
          {/* Een <select> in plaats van een los getal om in te typen: op de
              telefoon (waar dit toch altijd wordt bediend) opent dit het
              systeemeigen wieltje om uit te kiezen — geen tikfoutjes met een
              cijfertoetsenbord meer mogelijk. */}
          <label className="flex items-center gap-2 text-gray-500">
            Aantal vragen
            <Select value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} className="!w-20 !py-1.5 text-center tnum">
              {Array.from({ length: 14 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </label>
          <label className="flex items-center gap-2 text-gray-500">
            Seconden per vraag
            <Select value={questionSeconds} onChange={(e) => setQuestionSeconds(Number(e.target.value))} className="!w-20 !py-1.5 text-center tnum">
              {[5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60].map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </label>
        </div>
        <Button onClick={createSession} disabled={creating}>{creating ? "Quiz wordt gemaakt..." : buttonLabel}</Button>
      </>
    );
  }

  // Alleen potjes die echt zijn afgerond tellen mee (zie de server-route) —
  // dus bij een reis die nog nooit een quiz heeft uitgespeeld is deze lijst
  // gewoon leeg.
  function renderStats() {
    if (stats === null) return <div className="text-sm text-gray-400 py-4 text-center">Laden...</div>;
    if (!stats.length) return <div className="text-sm text-gray-400 py-4 text-center">Nog geen afgeronde potjes.</div>;
    return (
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm divide-y divide-gray-50 overflow-hidden text-left">
        <div className="flex items-center justify-between px-4 py-2 text-xs text-gray-400">
          <span>Speler</span>
          <span className="flex gap-4"><span className="w-16 text-right">Totaal</span><span className="w-14 text-right">Potjes</span><span className="w-16 text-right">Gem.</span></span>
        </div>
        {stats.map((s) => (
          <div key={s.userId} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="font-medium text-gray-700">{s.name}</span>
            <span className="flex gap-4 tnum">
              <span className="w-16 text-right font-semibold text-gray-700">{s.totalScore}</span>
              <span className="w-14 text-right text-gray-400">{s.gamesPlayed}</span>
              <span className="w-16 text-right text-gray-400">{s.avgScore}</span>
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-center py-14 max-w-sm mx-auto">
        <Icon name="sparkle" size={38} strokeWidth={1.2} className="mx-auto mb-3 text-sky-400" />
        <h3 className="font-display text-[21px] text-gray-800 mb-2">Fotoquiz</h3>
        <p className="text-sm text-gray-500 leading-relaxed mb-5">
          Foto's uit deze reis, elk met vier antwoorden. Start een sessie en laat anderen meespelen via een QR-code — met tussenstand en een winnaar aan het eind.
        </p>
        {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg mb-4">{error}</div>}
        {renderQuizSettings("Start een fotoquiz")}
        <div className="mt-5">
          <button type="button" onClick={toggleStats} className="text-xs text-gray-400 hover:text-sky-600 transition-colors">
            {showStats ? "Verberg topscores" : "Topscores bekijken"}
          </button>
          {showStats && <div className="mt-3">{renderStats()}</div>}
        </div>
      </div>
    );
  }

  const phase = live?.phase || (session.status === "lobby" ? "lobby" : session.status === "done" ? "done" : null);
  const participants = live?.participants || [];
  const totalQuestions = live?.totalQuestions || session.totalQuestions;

  // Alleen de gastheer kan de quiz voor iedereen beëindigen, en alleen zolang
  // hij nog loopt — eenmaal "done" is er niets meer te stoppen.
  const stopControl = session.isHost && phase !== "done" && (
    <div className="max-w-md mx-auto mb-3 text-right">
      <button type="button" onClick={stopSession} disabled={stopping}
        className="text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50">
        {stopping ? "Bezig..." : "Quiz stoppen"}
      </button>
    </div>
  );

  // Neemt voorrang op de eigenlijke fase, ongeacht of de server intussen al
  // bij de eerste vraag is — dit is puur een lokale, eenmalige vertraging
  // vóór de eerste vraag verschijnt.
  if (openingScreenActive) {
    return (
      <>
      {stopControl}
      <QuizOpeningScreen />
      </>
    );
  }

  if (phase === "lobby") {
    const count = participants.length || session.participantCount || 0;
    return (
      <>
      {stopControl}
      <div className="text-center py-10 max-w-sm mx-auto">
        <Icon name="sparkle" size={38} strokeWidth={1.2} className="mx-auto mb-3 text-sky-400" />
        <h3 className="font-display text-[21px] text-gray-800 mb-1">Wachten op spelers</h3>
        <p className="text-sm text-gray-500 mb-5">{count} deelnemer{count === 1 ? "" : "s"} klaar om te spelen</p>
        {session.isHost ? (
          <>
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm mb-4">
              <QrCode value={session.joinLink} />
              <p className="text-xs text-gray-400 mt-3 leading-relaxed">Scan om mee te doen op je eigen scherm.</p>
              <div className="flex gap-2 mt-2">
                <input readOnly value={session.joinLink} onClick={(e) => e.target.select()}
                  className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 bg-gray-50 focus:outline-none" />
                <Button variant="secondary" onClick={copyJoinLink} className="!text-xs !px-3 !py-1.5 shrink-0">
                  {linkCopied ? <><Icon name="check" size={13} className="mr-1" />Gekopieerd</> : "Kopiëren"}
                </Button>
              </div>
            </div>
            {participants.length > 0 && (
              <div className="flex flex-wrap gap-1.5 justify-center mb-5">
                {participants.map((p, i) => (
                  <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-sky-50 text-sky-700 font-medium">{p.name}</span>
                ))}
              </div>
            )}
            <Button onClick={startSession} disabled={starting}>{starting ? "Starten..." : "Start de quiz"}</Button>
          </>
        ) : (
          <div className="text-sm text-gray-400">Wacht tot de gastheer de quiz start...</div>
        )}
      </div>
      </>
    );
  }

  if (phase === "question" && live?.question) {
    const q = live.question;
    const isTextMode = q.type === "text";
    const isBlurMode = q.mode === "blur";

    if (doublerScreenActive) {
      return (
        <>
        {stopControl}
        <QuizDoublerScreen />
        </>
      );
    }

    // Vóór elke nieuwe vraag draait de foto-rol één keer tot stilstand op
    // deze foto — alleen bij de allereerste keer dat dit vraagnummer in beeld
    // komt, niet bij elke poll erna (anders zou hij bij elke verversing
    // opnieuw beginnen te draaien). De blur-variant en de tekstvraag (die
    // geen foto heeft) slaan het rad helemaal over: daar mag je vanaf het
    // begin al antwoorden.
    if (!isTextMode && !isBlurMode && revealedIndex !== live.currentIndex) {
      return (
        <>
        {stopControl}
        <div className="max-w-md mx-auto text-center">
          <div className="text-sm text-gray-500 mb-1">Vraag <span className="tnum font-semibold text-gray-700">{live.currentIndex + 1}</span> / {totalQuestions}</div>
          {q.doubler && <div className="inline-block mb-2 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">⚡ Dubbele punten!</div>}
          <div className="text-xs text-gray-400 mb-4">Waar hoort deze foto bij?</div>
          <PhotoWheel pool={photoPool} target={q} onDone={() => { playWheelLand(); setRevealedIndex(live.currentIndex); }} />
        </div>
        </>
      );
    }

    const answered = myPick || live.myAnswer;
    const resolved = answered && !answered.pending;

    // Loopt lineair van flink onscherp naar volledig scherp over de eerste
    // 75% van het antwoordvenster — als fractie van de ingestelde vraagduur,
    // dus ongeacht of een sessie 5 of 60 seconden per vraag heeft staan.
    const blurPx = (() => {
      if (!isBlurMode || !live.questionSeconds) return 0;
      const elapsedFraction = (live.questionSeconds - live.remainingSeconds) / live.questionSeconds;
      return Math.max(0, 18 * (1 - elapsedFraction / 0.75));
    })();
    return (
      <>
      {stopControl}
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-1 text-sm text-gray-500">
          <span>Vraag <span className="tnum font-semibold text-gray-700">{live.currentIndex + 1}</span> / {totalQuestions}</span>
          <span className="tnum font-bold text-2xl text-sky-600 leading-none">{live.remainingSeconds}s</span>
        </div>
        {q.doubler && <div className="mb-3"><span className="inline-block px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">⚡ Dubbele punten!</span></div>}
        <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-white">
          {isTextMode ? (
            <div className="px-5 pt-6 pb-2 text-center">
              <Icon name="bulb" size={30} strokeWidth={1.3} className="mx-auto mb-3 text-sky-400" />
              <div className="font-display text-lg text-gray-800 leading-snug">{q.question}</div>
            </div>
          ) : (
            <img src={q.thumb_url || q.url} alt=""
              className="w-full aspect-square object-cover"
              style={isBlurMode ? { filter: `blur(${blurPx}px)`, transition: "filter 1.5s linear" } : undefined} />
          )}
          <div className="p-4">
            {!isTextMode && <div className="text-sm font-semibold text-gray-800 mb-3">Waar hoort deze foto bij?</div>}
            <div className="space-y-2">
              {q.options.map((opt) => {
                const isPicked = answered && answered.choice === opt;
                const cls = !answered
                  ? "border-gray-200 hover:border-sky-300 hover:bg-sky-50 text-gray-700"
                  : isPicked
                    ? resolved
                      ? answered.correct ? "border-green-300 bg-green-50 text-green-700" : "border-red-300 bg-red-50 text-red-700"
                      : "border-sky-300 bg-sky-50 text-sky-700"
                    : "border-gray-100 text-gray-400";
                return (
                  <button key={opt} type="button" onClick={() => pick(opt)} disabled={!!answered}
                    className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${cls}`}>
                    {opt}
                    {resolved && isPicked && answered.correct && <Icon name="check" size={14} className="ml-1.5 inline text-green-600" />}
                  </button>
                );
              })}
            </div>
            <div className="text-xs text-gray-400 mt-3 text-center">
              {!answered
                ? (q.doubler ? "Kies snel — dubbele punten deze ronde!" : "Kies snel — hoe sneller, hoe meer punten")
                : resolved
                  ? answered.correct ? `Goed! +${answered.points} punten` : "Helaas, geen punten"
                  : "Antwoord verstuurd..."}
            </div>
          </div>
        </div>
      </div>
      </>
    );
  }

  // Korte "dit was het goede antwoord"-pauze ná elke vraag die geen
  // tussenstand-ronde is — alleen het antwoord, geen ranglijst (die komt
  // alleen elke 3e vraag, zie showsLeaderboard vanuit de server).
  if (phase === "standings" && live && live.showsLeaderboard === false) {
    const q = live.question;
    const myAnswer = (myPick && myPick.index === live.currentIndex) ? myPick : live.myAnswer;
    return (
      <>
      {stopControl}
      <div className="max-w-md mx-auto">
        <div className="text-sm text-gray-500 mb-3 text-center">Vraag <span className="tnum font-semibold text-gray-700">{live.currentIndex + 1}</span> / {totalQuestions}</div>
        <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-white">
          {q?.type === "text" ? (
            <div className="px-5 pt-6 pb-2 text-center">
              <Icon name="bulb" size={30} strokeWidth={1.3} className="mx-auto mb-3 text-sky-400" />
              <div className="font-display text-lg text-gray-800 leading-snug">{q.question}</div>
            </div>
          ) : q ? (
            <img src={q.thumb_url || q.url} alt="" className="w-full aspect-square object-cover" />
          ) : null}
          <div className="p-4">
            {q?.options && (
              <div className="space-y-2 mb-3">
                {q.options.map((opt) => {
                  const isCorrect = opt === q.correct;
                  const isMine = myAnswer && myAnswer.choice === opt;
                  const cls = isCorrect
                    ? "border-green-300 bg-green-50 text-green-700"
                    : isMine ? "border-red-300 bg-red-50 text-red-700" : "border-gray-100 text-gray-400";
                  return (
                    <div key={opt} className={`px-4 py-2.5 rounded-xl border text-sm font-medium ${cls}`}>
                      {opt}
                      {isCorrect && <Icon name="check" size={14} className="ml-1.5 inline text-green-600" />}
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-gray-400 text-center">
              {q?.correct && <>Juiste antwoord: <span className="font-semibold text-gray-600">{q.correct}</span></>}
              {live.remainingSeconds != null && <> · volgende vraag over {live.remainingSeconds}s</>}
            </p>
          </div>
        </div>
      </div>
      </>
    );
  }

  if (phase === "standings" || phase === "done") {
    const sorted = [...participants].sort((a, b) => b.score - a.score);
    const top = sorted.length ? sorted[0].score : 0;
    const winners = sorted.filter((p) => p.score === top && top > 0);
    const isFinal = phase === "done";
    return (
      <>
      {stopControl}
      {isFinal && <PartyStreamers />}
      <div className="max-w-md mx-auto text-center">
        {isFinal ? (
          <>
            <Icon name="sparkle" size={38} strokeWidth={1.2} className="mx-auto mb-3 text-sky-400" />
            <h3 className="font-display text-[21px] text-gray-800 mb-1">
              {winners.length > 1 ? "Gedeelde winst!" : winners.length === 1 ? `${winners[0].name} wint!` : "Quiz afgelopen"}
            </h3>
            <p className="text-sm text-gray-500 mb-5">Eindstand van de fotoquiz</p>
          </>
        ) : (
          <>
            <div className="text-sm text-gray-500 mb-1">Tussenstand</div>
            {live?.question?.correct && (
              <p className="text-xs text-gray-400 mb-4">
                Juiste antwoord: <span className="font-semibold text-gray-600">{live.question.correct}</span>
                {live.remainingSeconds != null && <> · volgende vraag over {live.remainingSeconds}s</>}
              </p>
            )}
          </>
        )}
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm divide-y divide-gray-50 overflow-hidden">
          {/* Bouwt van onder (laatste plek) naar boven (koploper) op — vandaar
              de delay op basis van afstand tot de laatste rij, niet de eigen
              positie. */}
          {sorted.map((p, i) => (
            <div key={i} className={`rp-standings-row flex items-center justify-between px-4 py-2.5 text-sm ${p.isMe ? "bg-sky-50" : ""}`}
              style={{ animationDelay: `${(sorted.length - 1 - i) * 0.3}s` }}>
              <span className="flex items-center gap-2 font-medium text-gray-700">
                <span className="tnum text-gray-400 w-4">{i + 1}</span>
                {isFinal && i === 0 && p.score > 0 && <Icon name="sparkle" size={13} className="text-sky-500" />}
                {p.name}{p.isMe && <span className="text-xs text-gray-400"> (jij)</span>}
              </span>
              <AnimatedScore from={scoreSpinBaselineRef.current.get(p.id ?? p.name) ?? p.score} to={p.score} active={scoreSpinActive} />
            </div>
          ))}
        </div>
        {isFinal && session.isHost && (
          <div className="mt-5">
            {showNewQuizForm
              ? renderQuizSettings("Start nieuwe quiz")
              : <Button onClick={() => setShowNewQuizForm(true)}>Nieuwe quiz starten</Button>}
          </div>
        )}
        {isFinal && (
          <div className="mt-5">
            <button type="button" onClick={toggleStats} className="text-xs text-gray-400 hover:text-sky-600 transition-colors">
              {showStats ? "Verberg topscores" : "Topscores bekijken"}
            </button>
            {showStats && <div className="mt-3">{renderStats()}</div>}
          </div>
        )}
      </div>
      </>
    );
  }

  return <div className="text-center py-16 text-gray-400">Laden...</div>;
}

// ---------- Trip detail ----------
function TripDetail({ tripId, initialTab, onBack, onChanged, currentUserId }) {
  const [trip, setTrip] = useState(null);
  const [days, setDays] = useState([]);
  const [accommodations, setAccommodations] = useState([]);
  const [transports, setTransports] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [tab, setTab] = useState(initialTab || "days");
  const [editing, setEditing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sharing, setSharing] = useState(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [previewViewer, setPreviewViewer] = useState(false);
  // Budgetbalk op planning is standaard ingeklapt (klein) — de uitsplitsing per
  // categorie komt pas als je 'm openklapt.
  const [budgetExpanded, setBudgetExpanded] = useState(false);

  useEffect(() => {
    if (!showMoreMenu) return;
    const h = (e) => e.key === "Escape" && setShowMoreMenu(false);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [showMoreMenu]);

  const load = useCallback(async () => {
    try {
      const [t, d, a, tr, ex] = await Promise.all([
        api.getTrip(tripId),
        api.getDays(tripId),
        api.getAccommodations(tripId),
        api.getTransports(tripId),
        api.getExpenses(tripId),
      ]);
      setTrip(t); setDays(d); setAccommodations(a); setTransports(tr); setExpenses(ex);
      setLoadError(null);
    } catch (err) {
      // Without this the screen sat on "Laden..." forever — the back button is
      // inside the guarded return, so there was no way out but a reload.
      setLoadError(err.message || "Reis kon niet worden geladen");
    }
  }, [tripId]);

  useEffect(() => { load(); }, [load]);
  // Don't carry the guest preview over into another trip.
  useEffect(() => { setPreviewViewer(false); }, [tripId]);


  // Records how long this trip is actually open, which the share stats report.
  // Skipped while the tab is hidden so a forgotten background tab does not read
  // as hours of attention.
  useEffect(() => {
    if (_guestMode) return;
    const beat = () => {
      if (document.visibilityState === "visible") api.pingTrip(tripId).catch(() => {});
    };
    beat();
    const timer = setInterval(beat, 60000);
    document.addEventListener("visibilitychange", beat);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", beat); };
  }, [tripId]);

  async function handleDelete() {
    if (!confirm(`"${trip.name}" definitief verwijderen?`)) return;
    try {
      await api.deleteTrip(tripId);
      onBack(); onChanged();
    } catch (err) { alert(err.message); }
  }

  // Vanuit "Wie heeft de reis bekeken" naar de betreffende dag in het
  // dagboek — de tab moet eerst wisselen en monteren voordat het element er
  // is, vandaar de korte vertraging.
  function jumpToDay(dayId) {
    setSharing(null);
    setTab("journal");
    setTimeout(() => {
      document.getElementById(`journal-day-${dayId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  if (loadError && !trip) {
    return (
      <div className="text-center py-16">
        <Icon name="alert" size={40} strokeWidth={1.3} className="mx-auto mb-3 text-gray-300" />
        <div className="font-medium text-gray-700">Reis kon niet worden geladen</div>
        <div className="text-sm text-gray-400 mt-1 mb-5">{loadError}</div>
        <div className="flex gap-2 justify-center">
          <Button onClick={load}>Opnieuw proberen</Button>
          <Button variant="secondary" onClick={onBack}>← Alle reizen</Button>
        </div>
      </div>
    );
  }
  if (!trip) return <div className="text-center py-16 text-gray-400">Laden...</div>;

  const accent = trip.cover_color || PALETTE.primary;
  const readOnly = trip.role === "viewer" || previewViewer;
  const isOwnerActions = trip.is_owner && !previewViewer;

  // What a shared viewer actually receives: no budget, no per-item costs, no
  // expense list, and no items marked private. Mirrors stripCosts() and the
  // is_private filter on the server.
  const viewTrip = previewViewer ? { ...trip, budget: null, role: "viewer" } : trip;
  const viewDays = previewViewer
    ? days.map((d) => ({ ...d, activities: (d.activities || []).filter((a) => !a.is_private).map((a) => ({ ...a, cost: null })) }))
    : days;
  const viewTransports = previewViewer ? transports.filter((t) => !t.is_private).map((t) => ({ ...t, cost: null })) : transports;
  const viewAccommodations = previewViewer ? accommodations.filter((a) => !a.is_private).map((a) => ({ ...a, cost: null })) : accommodations;
  const viewExpenses = previewViewer ? [] : expenses;

  const tabs = [
    { key: "days", label: "Dagplanning", icon: "route", primary: true },
    ...(currentUserId ? [{ key: "journal", label: "Dagboek", icon: "book" }] : []),
    { key: "photos", label: "Foto's", icon: "camera" },
    { key: "accommodation", label: "Verblijf", icon: "bed" },
    { key: "transport", label: "Vervoer", icon: "plane" },
    { key: "packing", label: "Paklijst", icon: "suitcase" },
    { key: "map", label: "Kaart", icon: "map" },
    { key: "quiz", label: "Fotoquiz", icon: "sparkle" },
    { key: "photobook", label: "Fotoboek", icon: "frame" },
  ];

  // De onderste balk hoort te gaan over wat je onderweg het vaakst doet. De
  // fotoquiz stond daar met een vaste plek terwijl je die hooguit één avond per
  // reis speelt; de kaart — "waar is dit, waar ben ik" — zat juist weggestopt
  // achter "Meer". Die twee zijn omgewisseld.
  const bottomNavItems = [
    { key: "days", icon: "route", label: "Planning" },
    ...(currentUserId ? [{ key: "journal", icon: "book", label: "Dagboek" }] : []),
    { key: "map", icon: "map", label: "Kaart" },
  ];
  // Alleen bereikbaar via "Meer". Zeven losse regels lazen als één lange lijst;
  // met kopjes valt in één oogopslag te zien waar iets bij hoort. Bewust géén
  // samenvoeging van Foto's/Fotoboek/Fotoquiz tot één bestemming met subtabs:
  // dat maakt er twee tikken van in plaats van één, en dat is meer frictie, niet
  // minder. Ze horen bij elkaar, dus staan ze onder één kopje.
  const moreMenuGroups = [
    { titel: "Onderweg", items: [
      { key: "photos", icon: "camera", label: "Foto's" },
      { key: "packing", icon: "suitcase", label: "Paklijst" },
      ...(readOnly ? [] : [{ key: "budget", icon: "wallet", label: "Budget" }]),
    ] },
    { titel: "Boekingen", items: [
      { key: "accommodation", icon: "bed", label: "Verblijf" },
      { key: "transport", icon: "plane", label: "Vervoer" },
    ] },
    { titel: "Achteraf", items: [
      { key: "photobook", icon: "frame", label: "Fotoboek" },
      { key: "quiz", icon: "sparkle", label: "Fotoquiz" },
    ] },
  ];
  const moreMenuItems = moreMenuGroups.flatMap((g) => g.items);
  const isMoreActive = moreMenuItems.some((item) => item.key === tab);

  // Hero: de bestemming is waar je heen gaat en hoort dus het grootst; de
  // reisnaam blijft er als klein regeltje boven staan. "Kyoto, Japan" wordt
  // gesplitst op de laatste komma, zodat het land eronder komt — staat er geen
  // komma in, dan is de hele tekst de plaats en blijft het land weg.
  const heroOnPhoto = !!trip.cover_image;
  const heroInk = heroOnPhoto ? "#FFFFFF" : textOn(accent);
  const heroDest = trip.destination || "";
  const heroComma = heroDest.lastIndexOf(",");
  const heroCity = heroComma > 0 ? heroDest.slice(0, heroComma).trim() : heroDest;
  const heroCountry = heroComma > 0 ? heroDest.slice(heroComma + 1).trim() : null;
  const heroDuration = tripDuration(trip.start_date, trip.end_date);
  const heroShowBudget = viewTrip.budget && tab !== "journal" && tab !== "photos";
  const heroShowActions = isOwnerActions && tab !== "journal" && tab !== "photos";
  // Op de twee werk-tabs (planning en dagboek) is de grote fto-hero te fors — daar
  // volstaat een slanke balk van één regel met de reisnaam, zonder omslagfoto.
  const heroCompact = tab === "days" || tab === "journal";
  const heroCompactInk = textOn(accent);

  return (
    <div className="pb-2">
      {previewViewer && (
        // In preview the tab bar and bottom nav disappear (that is what a
        // viewer gets), so this banner is the only way back — hence sticky.
        <div className="sticky z-30 mb-4 rounded-xl bg-white border border-gray-200 px-3 py-2.5 flex items-center gap-3 shadow-sm"
          style={{ top: "calc(3rem + env(safe-area-inset-top) + 0.5rem)" }}>
          <Icon name="eye" size={17} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-gray-800">Gastweergave</div>
            <div className="text-xs text-gray-500">Zo ziet iemand met een alleen-lezen link deze reis. Kosten en budget zijn verborgen.</div>
          </div>
          <button onClick={() => { setPreviewViewer(false); if (tab === "budget") setTab("days"); }}
            className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full bg-sky-300 text-gray-800 hover:bg-sky-200 transition-colors">
            Sluiten
          </button>
        </div>
      )}
      {/* Back button — only on desktop, except for read-only viewers who have no bottom nav */}
      <button onClick={onBack} className={`${readOnly ? "inline-flex" : "hidden sm:inline-flex"} mb-4 items-center gap-1 text-sm font-medium hover:opacity-70 transition-opacity`} style={{ color: legibleOn(accent) }}>
        ← Alle reizen
      </button>

      {/* Op planning en dagboek: een slanke balk van één regel met de reisnaam,
          zonder omslagfoto — de grote hero neemt daar te veel ruimte in weg van
          de dagen/verhalen zelf. De datums staan er muted achteraan; op smal
          krimpt de naam (truncate) en blijven de datums heel. */}
      {heroCompact ? (
        <div className="mb-6 rp-rise">
          <div className="rounded-2xl shadow-sm px-5 h-14 flex items-center gap-3" style={{ background: accent, color: heroCompactInk }}>
            {/* De reisnaam krijgt de volle regel; datums stonden hier eerst ook,
                maar die duwden een langere naam in een afgekapt "Zomer i…". */}
            <h2 className="font-display text-[19px] font-semibold truncate flex-1 min-w-0">{trip.name}</h2>
            {trip.is_owner === false && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/90 text-gray-700 shrink-0">{readOnly ? "Alleen-lezen" : "Gedeeld"}</span>
            )}
            {isOwnerActions && tab === "days" && (
              <div className="shrink-0"><TripActionsMenu onEdit={() => setEditing(true)} onDelete={handleDelete} /></div>
            )}
          </div>
          {trip.notes && <div className="text-[15px] text-gray-500 leading-relaxed mt-2 px-1">{trip.notes}</div>}
        </div>
      ) : (
      <div className="rounded-3xl overflow-hidden shadow-md mb-8 rp-rise">
        <div className="relative flex flex-col justify-end" style={{ height: 220 }}>
          {heroOnPhoto
            ? <img src={trip.cover_image} alt={heroDest || trip.name} className="absolute inset-0 w-full h-full object-cover" />
            : <div className="absolute inset-0" style={{ background: `linear-gradient(150deg, ${accent}, ${accent}cc)` }} />}
          {heroOnPhoto && <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />}

          <div className="relative px-6 pb-6" style={{ color: heroInk }}>
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="text-[13px] font-medium" style={{ opacity: 0.85 }}>{trip.name}</span>
              {trip.is_owner === false && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/90 text-gray-700">{readOnly ? "Alleen-lezen" : "Gedeeld"}</span>
              )}
              {!readOnly && tab !== "journal" && (
                <button onClick={() => setTab("days")} className="sm:hidden text-[13px] font-medium hover:opacity-100 transition-opacity" style={{ opacity: 0.75 }}>
                  · Dagplanning
                </button>
              )}
            </div>
            <h2 className="font-display text-[32px] font-semibold leading-tight">{heroCity || trip.name}</h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5 text-[13px] font-medium" style={{ opacity: 0.85 }}>
              {heroCountry && <span>{heroCountry}</span>}
              {trip.start_date && (
                <span className="flex items-center gap-1.5">
                  <Icon name="calendar" size={13} /><span className="tnum">{fmt(trip.start_date)} — {fmt(trip.end_date)}</span>
                </span>
              )}
              {heroDuration && <span>{heroDuration}</span>}
              {heroShowBudget && (
                <span className="flex items-center gap-1.5">
                  <Icon name="wallet" size={13} /><span className="tnum">{fmtMoney(viewTrip.budget, trip.currency)}</span>
                </span>
              )}
            </div>
          </div>
        </div>
        {(trip.notes || heroShowActions) && (
          <div className="bg-white px-6 py-4 flex items-center gap-4">
            {trip.notes && <div className="text-[15px] text-gray-500 leading-relaxed min-w-0 flex-1">{trip.notes}</div>}
            {heroShowActions && <div className="shrink-0 ml-auto"><TripActionsMenu onEdit={() => setEditing(true)} onDelete={handleDelete} /></div>}
          </div>
        )}
      </div>
      )}

      {/* Desktop tabs — op mobiel navigeert de onderste balk al, en "· Dagplanning"
          naast de reisnaam hierboven is de subtiele snelkoppeling daar terug. */}
      {!readOnly && (
        <div className="hidden sm:block">
          <Tabs tabs={tabs} active={tab} onChange={setTab} accentColor={accent} />
        </div>
      )}

      {/* Budget balk */}
      {viewTrip.budget && tab !== "journal" && tab !== "photos" && (() => {
        const transportTotal = viewTransports.reduce((s, t) => s + Number(t.cost || 0), 0);
        const accommodationTotal = viewAccommodations.reduce((s, a) => s + Number(a.cost || 0), 0);
        const activityTotal = viewDays.reduce((s, d) => s + (d.activities || []).reduce((s2, a) => s2 + Number(a.cost || 0), 0), 0);
        const expenseTotal = viewExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
        const total = Number(viewTrip.budget);
        const spent = transportTotal + accommodationTotal + activityTotal + expenseTotal;
        const pct = (v) => Math.min((v / total) * 100, 100);
        const tPct = pct(transportTotal);
        const aPct = pct(accommodationTotal);
        const acPct = pct(activityTotal);
        const ePct = pct(expenseTotal);
        const overBudget = spent > total;
        // Compacte balk: label + bedrag + een dunne balk op één regel, plus een
        // chevron die de uitsplitsing per categorie in-/uitklapt. Het bedrag-deel
        // blijft een knop naar het volledige budgetscherm; de chevron klapt alleen
        // open, dus die twee bijten elkaar niet.
        return (
          <div className="w-full mb-8 bg-white rounded-2xl shadow-sm px-5 py-3.5">
            <div className="flex items-center gap-3">
              <button onClick={() => setTab("budget")} className="rp-press flex-1 min-w-0 text-left">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-semibold text-gray-400 uppercase tracking-[0.1em]">Budget</span>
                  <span className="text-[15px] font-semibold text-gray-800 tnum">
                    {fmtMoney(spent, trip.currency)}
                    <span className="text-[13px] font-medium text-gray-400"> / {fmtMoney(total, trip.currency)}</span>
                  </span>
                </div>
                {/* Dunne, afgeronde balk met een haardun wit naadje tussen de vakken. */}
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden flex gap-px mt-2">
                  <div style={{ width: `${tPct}%`, background: PALETTE.coralDeep }} className="h-full transition-all" title={`Vervoer: ${fmtMoney(transportTotal, trip.currency)}`} />
                  <div style={{ width: `${aPct}%`, background: PALETTE.coral }} className="h-full transition-all" title={`Verblijf: ${fmtMoney(accommodationTotal, trip.currency)}`} />
                  <div style={{ width: `${acPct}%`, background: PALETTE.success }} className="h-full transition-all" title={`Activiteiten: ${fmtMoney(activityTotal, trip.currency)}`} />
                  <div style={{ width: `${ePct}%`, background: PALETTE.info }} className="h-full transition-all" title={`Overig: ${fmtMoney(expenseTotal, trip.currency)}`} />
                </div>
              </button>
              <button onClick={() => setBudgetExpanded((v) => !v)} aria-label={budgetExpanded ? "Uitsplitsing inklappen" : "Uitsplitsing tonen"}
                className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors self-center">
                <Icon name="chevronDown" size={16} style={{ transform: budgetExpanded ? "rotate(180deg)" : "none" }} />
              </button>
            </div>
            {overBudget && <div className="text-[13px] font-medium text-red-600 mt-2">Boven budget</div>}
            {budgetExpanded && (
              <div className="flex gap-x-5 gap-y-2 mt-3 flex-wrap">
                {[
                  [transportTotal, PALETTE.coralDeep, "Vervoer"],
                  [accommodationTotal, PALETTE.coral, "Verblijf"],
                  [activityTotal, PALETTE.success, "Activiteiten"],
                  [expenseTotal, PALETTE.info, "Overig"],
                ].filter(([v]) => v > 0).map(([value, color, label]) => (
                  <span key={label} className="text-[13px] font-medium text-gray-500 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ background: color }} />
                    {label} <span className="tnum text-gray-400">{fmtMoney(value, trip.currency)}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {readOnly ? (
        <>
          {/* Alleen-lezen bezoekers krijgen geen volledige tabbalk, maar wel
              dagboek, kaart en de fotoquiz — die wijzigt niets aan de reis,
              dus past prima bij alleen-lezen toegang. */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-4 w-fit flex-wrap">
            <button onClick={() => setTab("journal")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-1.5 ${tab === "journal" || tab === "days" ? "bg-white shadow" : "text-gray-500 hover:text-gray-700"}`}
              style={tab === "journal" || tab === "days" ? { color: legibleOn(accent) } : {}}>
              <Icon name="book" size={15} />Dagboek
            </button>
            <button onClick={() => setTab("map")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-1.5 ${tab === "map" ? "bg-white shadow" : "text-gray-500 hover:text-gray-700"}`}
              style={tab === "map" ? { color: legibleOn(accent) } : {}}>
              <Icon name="map" size={15} />Kaart
            </button>
            <button onClick={() => setTab("quiz")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-1.5 ${tab === "quiz" ? "bg-white shadow" : "text-gray-500 hover:text-gray-700"}`}
              style={tab === "quiz" ? { color: legibleOn(accent) } : {}}>
              <Icon name="sparkle" size={15} />Fotoquiz
            </button>
          </div>
          {tab === "map"
            ? <TripMapTab trip={trip} accommodations={accommodations} transports={transports} days={days} />
            : <JournalTab trip={viewTrip} days={viewDays} transports={viewTransports} accommodations={viewAccommodations} readOnly={readOnly} currentUserId={currentUserId} onRefresh={load} onPreviewViewer={() => setPreviewViewer(true)} onShare={isOwnerActions ? () => setSharing("viewer") : null} onGoToPlanning={() => setTab("days")} />}
        </>
      ) : (
        <>
          {tab === "days" && <DayPlanningTab trip={viewTrip} days={viewDays} transports={viewTransports} accommodations={viewAccommodations} onRefresh={load} readOnly={readOnly} currentUserId={currentUserId} onShareEditor={isOwnerActions ? () => setSharing("editor") : null} onEditTrip={isOwnerActions ? () => setEditing(true) : null} />}
          {tab === "journal" && <JournalTab trip={viewTrip} days={viewDays} transports={viewTransports} accommodations={viewAccommodations} readOnly={readOnly} currentUserId={currentUserId} onRefresh={load} onPreviewViewer={() => setPreviewViewer(true)} onShare={isOwnerActions ? () => setSharing("viewer") : null} />}
          {tab === "photos" && <PhotoGalleryTab trip={viewTrip} days={viewDays} transports={viewTransports} accommodations={viewAccommodations} readOnly={readOnly} currentUserId={currentUserId} />}
          {tab === "accommodation" && <AccommodationTab trip={viewTrip} accommodations={viewAccommodations} onRefresh={load} readOnly={readOnly} currentUserId={currentUserId} />}
          {tab === "transport" && <TransportTab trip={viewTrip} transports={viewTransports} onRefresh={load} readOnly={readOnly} currentUserId={currentUserId} />}
          {tab === "budget" && !readOnly && <BudgetTab trip={viewTrip} expenses={viewExpenses} transports={viewTransports} accommodations={viewAccommodations} days={viewDays} onRefresh={load} />}
          {tab === "map" && <TripMapTab trip={trip} accommodations={accommodations} transports={transports} days={days} />}
          {tab === "packing" && <PackingTab tripId={trip.id} readOnly={readOnly} />}
        </>
      )}

      {/* De fotoquiz rendert los van de rest, full screen, voor iedereen met
          toegang tot de reis — ook alleen-lezen bezoekers kunnen 'm hosten
          (een nieuwe sessie aanmaken/starten/stoppen), niet alleen
          eigenaar/editor. Wie een sessie aanmaakt wordt daar zelf gastheer
          van, ongeacht wie de reis bezit. */}
      {tab === "quiz" && (
        <QuizFullscreen onClose={() => setTab(readOnly ? "journal" : "days")} label="Fotoquiz sluiten">
          <PhotoQuizTab trip={viewTrip} />
        </QuizFullscreen>
      )}

      {/* Zelfde reden als de fotoquiz hierboven: los van de readOnly-splitsing
          zodat ook alleen-lezen reisleden (niet alleen eigenaar/editor) samen
          een fotoboek kunnen samenstellen. Ook hier volledig scherm, net als
          de fotoquiz — geeft de pagina's/foto's meer ruimte dan tussen de
          normale tabs. */}
      {tab === "photobook" && (
        <QuizFullscreen onClose={() => setTab(readOnly ? "journal" : "days")} label="Fotoboek sluiten">
          <PhotobookTab trip={viewTrip} />
        </QuizFullscreen>
      )}

      {/* "Meer" dropdown — Verblijf, Vervoer, Paklijst live only here on mobile */}
      {!readOnly && showMoreMenu && (
        <>
          <div className="sm:hidden fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
          <div className="sm:hidden fixed z-50 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden py-1"
            style={{ right: 12, bottom: "calc(68px + env(safe-area-inset-bottom) + 10px)", minWidth: 180 }}>
            <button onClick={() => { setShowMoreMenu(false); onBack(); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-gray-50 transition-colors text-left text-gray-700 border-b border-gray-100">
              <Icon name="arrowLeft" size={17} />
              Terug
            </button>
            {moreMenuGroups.map((groep) => (
              <React.Fragment key={groep.titel}>
                <div className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400">{groep.titel}</div>
                {groep.items.map((item) => (
                  <button key={item.key} onClick={() => { setTab(item.key); setShowMoreMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 h-11 text-sm font-medium hover:bg-gray-50 transition-colors text-left"
                    style={{ color: tab === item.key ? legibleOn(accent) : PALETTE.textSecondary }}>
                    <Icon name={item.icon} size={17} />
                    {item.label}
                  </button>
                ))}
              </React.Fragment>
            ))}
          </div>
        </>
      )}

      {/* Mobile bottom nav — dichter bij iOS dan bij Material: geen gekleurde
          streep of vlak, maar een zacht perzik pilletje achter het icoon van
          het actieve tabblad. De tekst wint aan gewicht in plaats van aan kleur. */}
      {!readOnly && (
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-md border-t border-gray-200" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex">
          {bottomNavItems.map((item) => (
            <button key={item.key} onClick={() => setTab(item.key)}
              className={`rp-press flex-1 flex flex-col items-center justify-center gap-1.5 pt-3 pb-2 transition-colors min-w-0 ${tab === item.key ? "text-sky-700" : "text-gray-300 hover:text-gray-500"}`}
              style={{ minHeight: 72 }}>
              <span className={`flex items-center justify-center h-8 px-4 rounded-full transition-colors ${tab === item.key ? "bg-sky-100" : ""}`}>
                <Icon name={item.icon} size={20} />
              </span>
              <span className={`text-[11px] leading-none ${tab === item.key ? "font-semibold" : "font-medium"}`}>{item.label}</span>
            </button>
          ))}
          <button onClick={() => setShowMoreMenu((v) => !v)}
            className={`rp-press flex-1 flex flex-col items-center justify-center gap-1.5 pt-3 pb-2 transition-colors min-w-0 ${isMoreActive || showMoreMenu ? "text-sky-700" : "text-gray-300 hover:text-gray-500"}`}
            style={{ minHeight: 72 }}>
            <span className={`flex items-center justify-center h-8 px-4 rounded-full transition-colors ${isMoreActive || showMoreMenu ? "bg-sky-100" : ""}`}>
              <Icon name="more" size={20} />
            </span>
            <span className={`text-[11px] leading-none ${isMoreActive ? "font-semibold" : "font-medium"}`}>Meer</span>
          </button>
        </div>
      </div>
      )}

      {editing && <TripForm initial={trip} onSaved={() => { setEditing(false); load(); onChanged(); }} onClose={() => setEditing(false)} />}
      {importing && <ImportModal tripId={tripId} onImported={load} onClose={() => setImporting(false)} />}
      {sharing && (
        <ShareModal tripId={tripId} role={sharing} onClose={() => setSharing(null)}
          days={days} transports={transports} accommodations={accommodations} onJumpToDay={jumpToDay} />
      )}
    </div>
  );
}

// ---------- Admin view ----------
function fmtBytes(n) {
  if (n == null) return "onbekend";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}u`;
  if (h > 0) return `${h}u ${m}m`;
  return `${m}m`;
}

function StatTile({ label, value, tone }) {
  const toneClass = tone === "critical" ? "text-red-600" : tone === "good" ? "text-green-600" : "text-gray-900";
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
      <div className={`text-lg font-bold tnum ${toneClass}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
    </div>
  );
}

// Gestapelde staaf per minuut: totale hoogte = aantal requests, het rode
// topsegment (indien aanwezig) = daarvan het aantal serverfouten (5xx) —
// laat in één oogopslag zowel volume als foutmomenten zien, zonder een
// tweede as nodig te hebben. <title> geeft een simpele hover-tooltip per
// staaf (browsereigen, geen aparte tooltip-component nodig voor dit
// interne beheerscherm).
function CockpitBarChart({ timeline }) {
  const max = Math.max(1, ...timeline.map((t) => t.count));
  const w = 600, h = 90, gap = 1;
  const barWidth = Math.max(0.5, w / timeline.length - gap);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-24">
      {timeline.map((t, i) => {
        const x = i * (barWidth + gap);
        const errorH = t.count ? (t.errorCount / max) * h : 0;
        const normalH = t.count ? ((t.count - t.errorCount) / max) * h : 0;
        const time = new Date(t.t).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
        return (
          <g key={i}>
            <title>{`${time} — ${t.count} requests, ${t.errorCount} fouten, ${t.avgDuration}ms gem.`}</title>
            <rect x={x} y={h - normalH - errorH} width={barWidth} height={normalH} fill={PALETTE.textPrimary} fillOpacity="0.65" />
            {errorH > 0 && <rect x={x} y={h - errorH} width={barWidth} height={errorH} fill="#EF4444" />}
          </g>
        );
      })}
    </svg>
  );
}

// Eén reeks (gemiddelde responstijd), dus geen legenda nodig — de titel van
// de kaart erboven noemt de metriek al.
function CockpitSparkline({ timeline }) {
  const max = Math.max(1, ...timeline.map((t) => t.avgDuration));
  const w = 600, h = 60;
  const points = timeline.map((t, i) => {
    const x = timeline.length > 1 ? (i / (timeline.length - 1)) * w : 0;
    const y = h - (t.avgDuration / max) * h;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-16">
      <polyline points={points} fill="none" stroke={PALETTE.coralDeep} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Operationele cockpit: alleen wat dit ene serverproces sinds het opstarten
// heeft gezien (in-memory, zie METRICS_* op de server) — geen historie over
// een herstart heen, en geen aparte tijdreeksdatabase nodig voor een simpel
// beheerscherm.
function CockpitPanel() {
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    api.getCockpitMetrics().then(setMetrics).catch((err) => setError(err.message || "Laden mislukt"));
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load]);

  if (error) return <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>;
  if (!metrics) return <div className="text-center py-16 text-gray-400">Laden...</div>;

  const errorRate = metrics.requestsInWindow ? Math.round((metrics.errorsInWindow / metrics.requestsInWindow) * 1000) / 10 : 0;
  const dbActive = metrics.dbPool.total - metrics.dbPool.idle;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Uptime" value={formatUptime(metrics.uptimeSeconds)} />
        <StatTile label={`Requests (${metrics.windowMinutes} min)`} value={metrics.requestsInWindow} />
        <StatTile label="Foutpercentage" value={`${errorRate}%`} tone={errorRate > 1 ? "critical" : "good"} />
        <StatTile label="Gem. responstijd" value={`${metrics.avgDurationWindow} ms`} />
        <StatTile label="p95 responstijd" value={`${metrics.p95DurationWindow} ms`} />
        <StatTile label="Geheugen (RSS)" value={`${metrics.memory.rssMb} MB`} />
        <StatTile label="DB-pool" value={`${dbActive}/${metrics.dbPool.total} actief`} tone={metrics.dbPool.waiting > 0 ? "critical" : undefined} />
        <StatTile label="Totaal sinds start" value={`${metrics.totalRequests} req`} />
        <StatTile label="Database-grootte" value={metrics.databaseBytes != null ? fmtBytes(metrics.databaseBytes) : "—"} />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
          <div className="text-sm font-semibold text-gray-700">Requests per minuut (laatste uur)</div>
          <div className="flex items-center gap-3 text-xs text-gray-500 shrink-0">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: PALETTE.textPrimary, opacity: 0.65 }} />Normaal</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block bg-red-500" />Fout</span>
          </div>
        </div>
        <CockpitBarChart timeline={metrics.timeline} />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="text-sm font-semibold text-gray-700 mb-2">Gemiddelde responstijd per minuut</div>
        <CockpitSparkline timeline={metrics.timeline} />
      </div>

      {metrics.byRoute.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 overflow-x-auto">
          <div className="text-sm font-semibold text-gray-700 mb-2">Per route (sinds opstarten)</div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-400">
                <th className="pb-1.5 font-medium">Route</th>
                <th className="pb-1.5 font-medium text-right">Aantal</th>
                <th className="pb-1.5 font-medium text-right">Fouten</th>
                <th className="pb-1.5 font-medium text-right">Gem.</th>
                <th className="pb-1.5 font-medium text-right">Max</th>
              </tr>
            </thead>
            <tbody>
              {metrics.byRoute.map((r) => (
                <tr key={r.route} className="border-t border-gray-50">
                  <td className="py-1.5 text-gray-700 font-mono text-[11px] whitespace-nowrap">{r.route}</td>
                  <td className="py-1.5 text-right tnum text-gray-600">{r.count}</td>
                  <td className={`py-1.5 text-right tnum ${r.errorCount > 0 ? "text-red-600 font-semibold" : "text-gray-300"}`}>{r.errorCount}</td>
                  <td className="py-1.5 text-right tnum text-gray-600 whitespace-nowrap">{r.avgDuration} ms</td>
                  <td className="py-1.5 text-right tnum text-gray-400 whitespace-nowrap">{r.maxDuration} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {metrics.slowest.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 overflow-x-auto">
          <div className="text-sm font-semibold text-gray-700 mb-2">Traagste/foutieve requests (laatste uur)</div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-400">
                <th className="pb-1.5 font-medium whitespace-nowrap">Tijd</th>
                <th className="pb-1.5 font-medium">Route</th>
                <th className="pb-1.5 font-medium text-right">Status</th>
                <th className="pb-1.5 font-medium text-right">Duur</th>
              </tr>
            </thead>
            <tbody>
              {metrics.slowest.map((s, i) => (
                <tr key={i} className="border-t border-gray-50">
                  <td className="py-1.5 text-gray-400 tnum whitespace-nowrap">{new Date(s.t).toLocaleTimeString("nl-NL")}</td>
                  <td className="py-1.5 text-gray-700 font-mono text-[11px] whitespace-nowrap">{s.method} {s.route}</td>
                  <td className={`py-1.5 text-right tnum whitespace-nowrap ${s.status >= 500 ? "text-red-600 font-semibold" : "text-gray-500"}`}>{s.status}</td>
                  <td className="py-1.5 text-right tnum text-gray-600 whitespace-nowrap">{Math.round(s.durationMs)} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AdminView({ onBack, currentUserId }) {
  const [trips, setTrips] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("trips");
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [backfillResult, setBackfillResult] = useState(null);
  const [storage, setStorage] = useState(null);
  const [shrinkBusy, setShrinkBusy] = useState(false);
  const [shrinkResult, setShrinkResult] = useState(null);

  async function handleBackfillGps() {
    setBackfillBusy(true);
    setBackfillResult(null);
    try {
      const r = await api.backfillPhotoGps();
      setBackfillResult({ ok: true, text: `${r.updated} van ${r.checked} foto's zonder locatie kregen alsnog GPS.` });
    } catch (err) {
      setBackfillResult({ ok: false, text: err.message || "Nabewerking mislukt" });
    } finally {
      setBackfillBusy(false);
    }
  }

  async function handleShrinkPhotos() {
    setShrinkBusy(true);
    setShrinkResult(null);
    // In batches: bij een paar honderd foto's duurt één herschrijf-slag per
    // foto lang genoeg dat één groot verzoek Railway's eigen proxy-timeout kan
    // raken — de browser meldt dat dan als een kale "Load failed", niet als
    // een bruikbare foutmelding. Zo blijft elk verzoek klein, en zie je de
    // voortgang terwijl het loopt in plaats van pas (of nooit) aan het eind.
    let afterId = 0, totalChecked = 0, totalResized = 0, bytesBefore = 0, bytesAfter = 0;
    try {
      for (;;) {
        const r = await api.shrinkPhotos(afterId);
        totalChecked += r.checked;
        totalResized += r.resized;
        bytesBefore += r.bytesBefore;
        bytesAfter += r.bytesAfter;
        afterId = r.lastId;
        setShrinkResult({
          ok: true,
          text: totalResized > 0
            ? `Bezig... ${totalResized} van ${totalChecked} gecontroleerde foto's verkleind, ${fmtBytes(bytesBefore - bytesAfter)} bespaard tot nu toe.`
            : `Bezig... ${totalChecked} foto's gecontroleerd, nog niets te verkleinen.`,
        });
        if (!r.hasMore) break;
      }
      setShrinkResult({
        ok: true,
        text: totalResized > 0
          ? `Klaar: ${totalResized} van ${totalChecked} foto's verkleind, ${fmtBytes(bytesBefore - bytesAfter)} bespaard (was ${fmtBytes(bytesBefore)}, nu ${fmtBytes(bytesAfter)}).`
          : `Klaar — niets te verkleinen, alle ${totalChecked} foto's waren al klein genoeg.`,
      });
      api.getStorageInfo().then(setStorage).catch(() => {});
    } catch (err) {
      setShrinkResult({ ok: false, text: (err.message || "Verkleinen mislukt") + ` (tot hier: ${totalResized} van ${totalChecked} verkleind)` });
    } finally {
      setShrinkBusy(false);
    }
  }

  const reload = () => {
    Promise.all([api.getAdminTrips(), api.getAdminUsers()])
      .then(([t, u]) => { setTrips(t); setUsers(u); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);
  useEffect(() => { api.getStorageInfo().then(setStorage).catch(() => {}); }, []);

  async function handleAssign(tripId, userId) {
    await api.assignTrip(tripId, userId || null);
    reload();
  }

  async function handleDeleteTrip(trip) {
    if (!confirm(`"${trip.name}" definitief verwijderen? Dit verwijdert ook alle dagen, foto's, dagboek en het dagboek van iedereen die meekeek.`)) return;
    try { await api.deleteAdminTrip(trip.id); reload(); }
    catch (err) { alert(err.message || "Verwijderen mislukt"); }
  }

  async function handleDeleteUser(u) {
    if (!confirm(`${u.name || u.email} definitief verwijderen? Reizen die deze gebruiker bezat blijven bestaan maar raken ontkoppeld (net als bij "Niet gekoppeld").`)) return;
    try { await api.deleteAdminUser(u.id); reload(); }
    catch (err) { alert(err.message || "Verwijderen mislukt"); }
  }

  const byUser = trips.reduce((acc, t) => {
    const key = t.user_id || "unassigned";
    if (!acc[key]) acc[key] = { key: String(key), name: t.user_name, email: t.user_email, avatar: t.user_avatar, trips: [] };
    acc[key].trips.push(t);
    return acc;
  }, {});

  const groups = [
    ...(byUser["unassigned"] ? [{ key: "unassigned", name: "Niet gekoppeld", email: null, avatar: null, trips: byUser["unassigned"].trips }] : []),
    ...Object.entries(byUser).filter(([k]) => k !== "unassigned").map(([, v]) => v),
  ];

  const LOGIN_METHOD = (u) => {
    const methods = [];
    if (u.google_id) methods.push("Google");
    if (u.apple_id) methods.push("Apple");
    if (u.has_password) methods.push("E-mail");
    return methods.join(" · ") || "—";
  };

  return (
    <div>
      <button onClick={onBack} className="text-sky-600 hover:text-sky-800 mb-4 inline-flex items-center gap-1 text-sm">← Mijn reizen</button>

      <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
        <h2 className="text-xl font-bold text-gray-800">Beheer</h2>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          <button onClick={() => setTab("trips")}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === "trips" ? "bg-white shadow-sm text-gray-800 font-semibold" : "text-gray-500 hover:text-gray-700"}`}>
            <Icon name="plane" size={15} className="mr-1.5" />Reizen ({trips.length})
          </button>
          <button onClick={() => setTab("users")}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === "users" ? "bg-white shadow-sm text-gray-800 font-semibold" : "text-gray-500 hover:text-gray-700"}`}>
            <Icon name="users" size={15} className="mr-1.5" />Gebruikers ({users.length})
          </button>
          <button onClick={() => setTab("cockpit")}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === "cockpit" ? "bg-white shadow-sm text-gray-800 font-semibold" : "text-gray-500 hover:text-gray-700"}`}>
            <Icon name="clock" size={15} className="mr-1.5" />Cockpit
          </button>
        </div>
      </div>

      {storage && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6">
          <div className="text-sm font-semibold text-gray-700 mb-2">Opslag</div>
          <div className="flex gap-5 flex-wrap text-sm">
            <div>
              <div className="text-lg font-bold text-gray-900 tnum">{fmtBytes(storage.photosBytes + storage.thumbsBytes)}</div>
              <div className="text-xs text-gray-400">{storage.photoCount} foto{storage.photoCount === 1 ? "" : "'s"}</div>
            </div>
            {storage.databaseBytes != null && (
              <div>
                <div className="text-lg font-bold text-gray-900 tnum">{fmtBytes(storage.databaseBytes)}</div>
                <div className="text-xs text-gray-400">totale databasegrootte</div>
              </div>
            )}
          </div>
          <div className="text-xs text-gray-400 mt-2 max-w-md">
            Foto's staan als data in de database zelf. Loopt dit vol ("Niet gelukt: ... No space left on
            device" bij uploaden), dan helpt alleen oude foto's verwijderen of de Postgres-schijf op Railway
            groter maken — dit scherm ververst niet vanzelf, herlaad de pagina om een nieuw cijfer te zien.
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold text-gray-700">Locatie nalopen bij bestaande foto's</div>
            <div className="text-xs text-gray-400 mt-0.5 max-w-md">
              Zoekt in alle foto's zonder locatie of er alsnog GPS uit de opgeslagen bytes te halen is. Werkt
              alleen als die bytes nog de originele Exif hebben — een HEIC-foto die al is omgezet naar JPEG is
              die kwijt en blijft zonder locatie.
            </div>
          </div>
          <Button variant="secondary" onClick={handleBackfillGps} disabled={backfillBusy} className="shrink-0">
            {backfillBusy ? "Bezig..." : "Nalopen"}
          </Button>
        </div>
        {backfillResult && (
          <div className={`text-xs mt-2 ${backfillResult.ok ? "text-green-600" : "text-red-500"}`}>{backfillResult.text}</div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold text-gray-700">Bestaande foto's verkleinen</div>
            <div className="text-xs text-gray-400 mt-0.5 max-w-md">
              Herschrijft elke foto die groter is dan de nieuwe 2000px-grens naar dat formaat — hetzelfde wat
              nieuwe uploads nu al krijgen, met terugwerkende kracht. Kan even duren bij veel foto's.
            </div>
          </div>
          <Button variant="secondary" onClick={handleShrinkPhotos} disabled={shrinkBusy} className="shrink-0">
            {shrinkBusy ? "Bezig..." : "Verkleinen"}
          </Button>
        </div>
        {shrinkResult && (
          <div className={`text-xs mt-2 ${shrinkResult.ok ? "text-green-600" : "text-red-500"}`}>{shrinkResult.text}</div>
        )}
      </div>

      {loading ? <div className="text-center py-16 text-gray-400">Laden...</div> : tab === "trips" ? (
        <div className="space-y-8">
          {groups.map((group) => (
            <div key={group.key}>
              <div className="flex items-center gap-2 mb-3">
                {group.avatar && <img src={group.avatar} className="w-7 h-7 rounded-full" />}
                <span className="font-semibold text-gray-700">{group.name || group.email || "Niet gekoppeld"}</span>
                <span className="text-xs text-gray-400">{group.trips.length} rei{group.trips.length !== 1 ? "zen" : "s"}</span>
              </div>
              <div className="space-y-2">
                {group.trips.map((t) => (
                  <div key={t.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-4">
                    {t.cover_image
                      ? <img src={t.cover_image} className="w-14 h-14 rounded-lg object-cover shrink-0" />
                      : <div className="w-14 h-14 rounded-lg shrink-0" style={{ background: t.cover_color || PALETTE.primary }} />}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-800">{t.name}</div>
                      {t.destination && <div className="text-sm text-gray-500 flex items-center gap-1"><Icon name="pin" size={13} />{t.destination}</div>}
                      {t.start_date && <div className="text-xs text-gray-400">{fmt(t.start_date)}</div>}
                    </div>
                    {/* Zonder een breedtegrens hier kan de <Select> (die zelf
                        w-full is) net zo breed worden als de langste
                        gebruikersnaam — bij genoeg gebruikers duwt dat de
                        verwijderknop erna uit beeld op een smal scherm. */}
                    <div className="shrink-0 w-32 sm:w-40">
                      <Select value={t.user_id || ""} onChange={(e) => handleAssign(t.id, e.target.value || null)} className="!w-full text-xs">
                        <option value="">— Niet gekoppeld —</option>
                        {users.map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                      </Select>
                    </div>
                    <button type="button" onClick={() => handleDeleteTrip(t)} aria-label="Reis verwijderen"
                      className="shrink-0 text-gray-300 hover:text-red-500 transition-colors p-1">
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : tab === "users" ? (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-4">
              {u.avatar
                ? <img src={u.avatar} className="w-10 h-10 rounded-full shrink-0" />
                : <div className="w-10 h-10 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-sm shrink-0">
                    {(u.name || u.email || "?")[0].toUpperCase()}
                  </div>}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-800">{u.name || "—"}</span>
                  {u.is_admin && <span className="text-xs bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full font-medium">Admin</span>}
                </div>
                <div className="text-sm text-gray-500">{u.email}</div>
                <div className="flex gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
                  <span className="flex items-center gap-1"><Icon name="key" size={12} />{LOGIN_METHOD(u)}</span>
                  {u.last_login_at && <span>Laatst: {fmt(u.last_login_at)}</span>}
                  <span>Lid sinds: {fmt(u.created_at)}</span>
                </div>
                <div className="flex gap-3 mt-1 text-xs flex-wrap">
                  <span className="font-medium text-gray-600 flex items-center gap-1"><Icon name="unlock" size={12} /><span className="tnum">{u.login_count}</span> x ingelogd</span>
                  {Number(u.logins_24h) > 0
                    ? <span className="font-semibold text-green-600">● {u.logins_24h}x afgelopen 24u</span>
                    : <span className="text-gray-300">● niet actief vandaag</span>}
                </div>
              </div>
              <div className="text-xs text-gray-400 shrink-0 text-right">
                {(byUser[u.id]?.trips.length || 0)} rei{(byUser[u.id]?.trips.length || 0) !== 1 ? "zen" : "s"}
              </div>
              {u.id !== currentUserId && (
                <button type="button" onClick={() => handleDeleteUser(u)} aria-label="Gebruiker verwijderen"
                  className="shrink-0 text-gray-300 hover:text-red-500 transition-colors p-1">
                  <Icon name="trash" size={16} />
                </button>
              )}
            </div>
          ))}
          {users.length === 0 && <div className="text-center py-12 text-gray-400">Geen gebruikers gevonden</div>}
        </div>
      ) : (
        <CockpitPanel />
      )}
    </div>
  );
}

// Kan de app niet vanaf de server op iemands beginscherm zetten — dat is en
// blijft een handeling die de gebruiker zelf moet doen. Wat wél kan: op
// Android/Chrome het native installatiedialoogje met één tik aanbieden
// (beforeinstallprompt), en op iPhone (waar die browser-API niet bestaat)
// gewoon duidelijk uitleggen hoe het moet. Voor wie de app al heeft
// toegevoegd — of het bannertje al wegtikte — blijft dit onzichtbaar.
function InstallPrompt() {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem("rp_install_dismissed") === "1"; } catch { return false; }
  });
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed] = useState(() =>
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true
  );

  useEffect(() => {
    function onBeforeInstall(e) { e.preventDefault(); setDeferredPrompt(e); }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", () => setDeferredPrompt(null));
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  function dismiss() {
    try { localStorage.setItem("rp_install_dismissed", "1"); } catch {}
    setDismissed(true);
  }

  async function install() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }

  if (installed || dismissed || !(deferredPrompt || IS_IOS)) return null;

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-8 pt-3">
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
        <Icon name="plane" size={19} className="text-sky-700 shrink-0" />
        <div className="flex-1 min-w-0 text-sm">
          <div className="font-semibold text-gray-800">Zet Reisplanner op je beginscherm</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {deferredPrompt
              ? "Snel erbij, net als een echte app."
              : 'Tik op het deel-icoon onderin Safari, en kies "Zet op beginscherm".'}
          </div>
        </div>
        {deferredPrompt && <Button onClick={install} className="!text-xs !px-3 !py-1.5 shrink-0">Installeren</Button>}
        <button onClick={dismiss} className="text-gray-300 hover:text-gray-500 shrink-0" aria-label="Sluiten">
          <Icon name="close" size={16} />
        </button>
      </div>
    </div>
  );
}

// ---------- Korte melding met ongedaan maken ----------
// Verwijderen ging via confirm(): een kale systeemdialoog die je bij elke
// handeling onderbreekt, er niet uitziet als de app, en je nog steeds niets
// oplevert als je per ongeluk "OK" tikt — er was nergens ongedaan maken. Dat is
// riskant op een gedeelde reis waar meerdere gezinsleden in werken.
//
// Nu andersom: de handeling gebeurt meteen (geen tik extra) en er verschijnt
// een paar tellen een balkje waarmee je het terugdraait. Bewust géén React-
// context: meldingen komen uit tabbladen door de hele boom, en een losse
// abonneelijst scheelt elk van die componenten een provider-prop.
const toastLuisteraars = new Set();
let toastTeller = 0;
function toonMelding(bericht, actie) {
  const melding = { id: ++toastTeller, bericht, actie };
  toastLuisteraars.forEach((fn) => fn(melding));
}

function ToastHost() {
  const [melding, setMelding] = useState(null);
  useEffect(() => {
    const fn = (m) => setMelding(m);
    toastLuisteraars.add(fn);
    return () => toastLuisteraars.delete(fn);
  }, []);
  useEffect(() => {
    if (!melding) return;
    // Lang genoeg om het te lezen en te reageren, kort genoeg om niet in de weg
    // te blijven zitten.
    const t = setTimeout(() => setMelding(null), 7000);
    return () => clearTimeout(t);
  }, [melding]);
  if (!melding) return null;
  return (
    // Centreren met left/right + mx-auto, niet met -translate-x-1/2: rp-rise
    // animeert transform en eindigt (fill-mode both) op "transform: none", wat
    // een translate-klasse overschrijft. De melding kwam daardoor half buiten
    // beeld te staan.
    <div role="status" aria-live="polite"
      className="rp-rise fixed left-3 right-3 z-50 mx-auto max-w-md"
      style={{ bottom: "calc(72px + env(safe-area-inset-bottom) + 16px)" }}>
      {/* Eén regel: de naam wordt afgekapt in plaats van over vier regels te
          breken. Geen sluitknop — het balkje verdwijnt vanzelf, en die knop
          kostte alleen maar breedte die de tekst nodig heeft. */}
      <div className="flex items-center gap-2 rounded-2xl pl-4 pr-2 py-2 shadow-lg"
        style={{ background: PALETTE.textPrimary, color: "#FFFFFF" }}>
        <span className="flex-1 min-w-0 truncate text-[15px]">{melding.bericht}</span>
        {melding.actie && (
          <button type="button"
            onClick={async () => { setMelding(null); try { await melding.actie.run(); } catch (err) { toonMelding(err.message || "Terugzetten mislukt"); } }}
            className="rp-press shrink-0 text-[15px] font-semibold px-3 h-11 rounded-xl hover:bg-white/15 transition-colors">
            {melding.actie.label}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- App ----------
function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState({ name: "list" });
  const [showTripForm, setShowTripForm] = useState(false);
  const [showAccount, setShowAccount] = useState(false);

  const loadUser = useCallback(async () => {
    try {
      const r = await fetch("/auth/me");
      setUser(r.ok ? await r.json() : null);
    } catch { setUser(null); }
    finally { setAuthLoading(false); }
  }, []);
  useEffect(() => { loadUser(); }, [loadUser]);

  const loadTrips = useCallback(async () => {
    setLoading(true);
    try { setTrips(sortTripsByDeparture(await api.getTrips())); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    setGuestMode(!user);
    loadTrips();
    const params = new URLSearchParams(location.search);
    const tripId = params.get("trip");
    if (tripId) {
      setView({ name: "detail", id: tripId, tab: params.get("tab") || null });
      window.history.replaceState({}, "", "/");
    }
  }, [user, authLoading, loadTrips]);

  async function handleLogout() {
    await fetch("/auth/logout", { method: "POST" });
    // De service worker bewaart je reisgegevens zodat ze onderweg zonder bereik
    // beschikbaar zijn. Bij uitloggen moeten die weg: anders blijft op een
    // gedeeld of geleend toestel na het uitloggen alsnog je reis te zien.
    try {
      const namen = await caches.keys();
      await Promise.all(namen.filter((n) => n.startsWith("rp-data-")).map((n) => caches.delete(n)));
    } catch {}
    window.location.href = "/login";
  }

  if (authLoading) return (
    <div className="min-h-screen flex items-center justify-center text-gray-400">Laden...</div>
  );

  const tripStats = trips.length > 0 ? `${trips.length} rei${trips.length === 1 ? "s" : "zen"}` : null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky compact header */}
      {/* De kop draagt de app niet meer: hij staat op de achtergrondkleur, de
          iconen zijn monochroom en het perzik komt alleen terug als klein
          merkteken naast de naam. Zo wordt de inhoud eronder het zwaartepunt.
          Een haarrand in plaats van een schaduw houdt het rustig bij scrollen. */}
      <header className="sticky top-0 z-40 bg-gray-50/90 backdrop-blur-md border-b border-gray-200" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <button onClick={() => setView({ name: "list" })} className="flex items-center gap-2.5 leading-none min-w-0 group">
            <span className="w-8 h-8 rounded-lg bg-sky-300 text-gray-800 flex items-center justify-center shrink-0">
              <Icon name="plane" size={16} />
            </span>
            <span className="truncate font-display text-[19px] font-semibold text-gray-800">Reisplanner</span>
          </button>
          <div className="flex items-center gap-2 shrink-0">
            {user ? (
              <>
                {user.is_admin && view.name !== "admin" && (
                  <button onClick={() => setView({ name: "admin" })} title="Beheer"
                    className="text-gray-500 hover:text-gray-800 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                    <Icon name="eye" size={16} />
                  </button>
                )}
                {/* "Uitloggen" stond hier op elk scherm met een vaste plek in de
                    kopbalk — dure ruimte voor iets wat je bijna nooit doet, pal
                    naast het account-knopje waar het thuishoort. Het staat nu in
                    dat scherm zelf. Het knopje is meteen op aanraakmaat gebracht
                    (was 36px, onder het minimum van 44). */}
                <button onClick={() => setShowAccount(true)} title="Account" aria-label="Account"
                  className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
                  {user.avatar
                    ? <img src={user.avatar} alt={user.name} className="w-9 h-9 rounded-full ring-2 ring-gray-200" />
                    : <div className="w-9 h-9 rounded-full bg-sky-100 text-gray-800 flex items-center justify-center font-semibold text-sm">{(user.given_name || user.name || "?")[0].toUpperCase()}</div>
                  }
                </button>
              </>
            ) : (
              <>
                <a href="/login" className="text-gray-800 text-xs font-semibold px-4 py-2 rounded-lg bg-sky-300 hover:bg-sky-200 transition-colors">Inloggen</a>

              </>
            )}
          </div>
        </div>
      </header>

      <InstallPrompt />
      <AutoPushPrompt user={user} />

      <main className="max-w-5xl mx-auto px-3 sm:px-8 pb-28 pt-4">
        {view.name === "list" ? (
          <>
            {/* Greeting / guest notice */}
            <div className="mb-5 px-1">
              {user ? (
                <>
                  <div className="font-display text-2xl font-semibold text-gray-800">{greeting(user.given_name || user.name)}</div>
                  {tripStats && <div className="text-sm text-gray-500 mt-0.5">{tripStats}</div>}
                </>
              ) : (
                <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-start gap-3">
                  <Icon name="user" size={19} className="text-gray-500" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-800 text-sm">Je gebruikt de app als gast</div>
                    <div className="text-xs text-gray-500 mt-0.5">Je reizen worden alleen op dit apparaat bewaard. <a href="/login" className="underline font-medium">Log in met Google of Apple</a> om ze overal beschikbaar te hebben.</div>
                  </div>
                </div>
              )}
            </div>
            {loading ? (
              <div className="text-center py-16 text-gray-400">Laden...</div>
            ) : trips.length === 0 ? (
              <div className="text-center py-24 text-gray-400">
                <Icon name="globe" size={48} strokeWidth={1.1} className="mx-auto mb-4 text-gray-300" />
                <div className="text-xl font-semibold text-gray-600 mb-2">Nog geen reizen</div>
                <div className="mb-6 text-sm">Maak je eerste reis aan om te beginnen</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {trips.map((t) => (
                  <TripCard key={t.id} trip={t} onClick={() => setView({ name: "detail", id: t.id })} />
                ))}
              </div>
            )}
            {/* FAB */}
            <button
              onClick={() => setShowTripForm(true)}
              className="fixed bottom-6 right-4 z-50 flex items-center gap-2 px-6 py-4 rounded-xl font-semibold text-base transition-colors hover:brightness-95"
              style={{ background: PALETTE.primary, color: PALETTE.textPrimary, boxShadow: "0 8px 24px rgba(233,171,155,0.45)", paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
            >
              + Nieuwe reis
            </button>
          </>
        ) : view.name === "admin" ? (
          <AdminView onBack={() => setView({ name: "list" })} currentUserId={user?.id} />
        ) : (
          <TripDetail tripId={view.id} initialTab={view.tab} onBack={() => setView({ name: "list" })} onChanged={loadTrips} currentUserId={user?.id} />
        )}
      </main>

      {/* Eén plek voor de "verwijderd — ongedaan maken"-balkjes, altijd
          gemonteerd zodat elk tabblad ze kan tonen. */}
      <ToastHost />

      {showAccount && user && (
        <AccountModal user={user} onClose={() => setShowAccount(false)} onChanged={loadUser} onLogout={handleLogout} />
      )}
      {showTripForm && (
        <TripForm
          onSaved={(trip) => { setShowTripForm(false); loadTrips(); setView({ name: "detail", id: trip.id }); }}
          onClose={() => setShowTripForm(false)}
        />
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary><App /></ErrorBoundary>
);
