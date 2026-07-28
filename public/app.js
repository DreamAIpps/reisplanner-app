const { useState, useEffect, useCallback, useRef } = React;

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
          <button onClick={() => window.location.reload()} className="bg-sky-600 text-white rounded-xl px-6 py-2 text-sm font-medium hover:bg-sky-700 hover:text-gray-900">Pagina herladen</button>
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
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17" /><path d="M12 3.5c2.3 2.4 3.5 5.3 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.3-3.5-8.5S9.7 5.9 12 3.5z" /></>,
  more: <><circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" /></>,

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
  check: <><path d="m5 12.8 4.4 4.2L19 6.5" /></>,
  chat: <><path d="M20 12.5c0 3.9-3.6 6.9-8 6.9a9.4 9.4 0 0 1-2.7-.4L4 21l1.2-3.4A6.6 6.6 0 0 1 4 12.5C4 8.6 7.6 5.6 12 5.6s8 3 8 6.9z" /></>,
  thumb: <><path d="M7 10.5 11 3a2.4 2.4 0 0 1 2.4 2.4V9.5h4.3a2 2 0 0 1 2 2.4l-1.3 6.2a2.4 2.4 0 0 1-2.3 1.9H7" /><rect x="3" y="10.5" width="4" height="9.5" rx="1.4" /></>,
  eye: <><path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></>,
  rotate: <><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20.5 4v4.4h-4.4" /></>,
  clipboard: <><rect x="5" y="4.5" width="14" height="16" rx="2.5" /><path d="M9 4.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4.5v1.2H9z" /><path d="M9 11h6" /><path d="M9 15h4" /></>,
  arrowRight: <><path d="M4 12h15.5" /><path d="m14 6.5 5.5 5.5-5.5 5.5" /></>,
  arrowLeft: <><path d="M20 12H4.5" /><path d="m10 6.5-5.5 5.5 5.5 5.5" /></>,
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

  // paklijst
  doc: <><path d="M6 3.5h7L18.5 9v11.5H6z" /><path d="M13 3.5V9h5.5" /><path d="M9 13h6" /><path d="M9 16.5h4" /></>,
  shirt: <><path d="M9 3.5 4.5 6l1.9 3.7 2.1-1.1v11.9h7V8.6l2.1 1.1L19.5 6 15 3.5a3.1 3.1 0 0 1-6 0z" /></>,
  plug: <><path d="M9.5 3.5v4.3" /><path d="M14.5 3.5v4.3" /><path d="M5.8 7.8h12.4v2.9a6.2 6.2 0 0 1-12.4 0z" /><path d="M12 16.9v3.6" /></>,
  bottle: <><path d="M9.6 3.5h4.8v2.8H9.6z" /><path d="M9.9 6.3 8.4 9a3.2 3.2 0 0 0-.4 1.5v8a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-8a3.2 3.2 0 0 0-.4-1.5l-1.5-2.7" /><path d="M8 13.2h8" /></>,
  pill: <><rect x="2.8" y="8.5" width="18.4" height="7" rx="3.5" transform="rotate(-45 12 12)" /><path d="m9.2 9.2 5.6 5.6" /></>,

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
const COVER_COLORS = ["#FF7A00","#8A4B12","#6B3A2A","#4A5D3A","#4A2F42","#3D2E22","#6B3145","#5A4632"];

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
    d.trips = [...(d.trips || []), t]; _gw(d); return Promise.resolve(t);
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
  suggestPhoto() { return Promise.reject(new Error("Log in om automatisch foto's te zoeken")); },
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
  getAdminTrips: () => _guestMode ? guestApi.getAdminTrips() : apiFetch("/api/admin/trips"),
  getAdminUsers: () => _guestMode ? guestApi.getAdminUsers() : apiFetch("/api/admin/users"),
  assignTrip: (tripId, userId) => _guestMode ? guestApi.assignTrip() : apiFetch(`/api/admin/trips/${tripId}/assign`, { method: "PATCH", body: JSON.stringify({ user_id: userId }) }),
  backfillPhotoGps: () => apiFetch("/api/admin/backfill-photo-gps", { method: "POST", body: "{}" }),
  getStorageInfo: () => apiFetch("/api/admin/storage"),
  shrinkPhotos: (afterId) => apiFetch("/api/admin/shrink-photos", { method: "POST", body: JSON.stringify({ afterId: afterId || 0 }) }),
  suggestPhoto: (destination) => apiFetch(`/api/photo-suggest?destination=${encodeURIComponent(destination)}`),
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
function greeting(name) {
  const h = new Date().getHours();
  const first = name ? name.split(" ")[0] : "";
  const prefix = h < 12 ? "Goedemorgen" : h < 18 ? "Goedemiddag" : "Goedenavond";
  return first ? `${prefix}, ${first}` : prefix;
}

// ---------- UI Components ----------
function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-display text-[21px] text-gray-800">{title}</h2>
          <button onClick={onClose} aria-label="Sluiten" className="text-gray-400 hover:text-gray-700"><Icon name="close" size={18} /></button>
        </div>
        <div className="overflow-y-auto px-6 py-5 flex-1">{children}</div>
      </div>
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

function Input({ className = "", ...props }) {
  return <input className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent ${className}`} {...props} />;
}

function Textarea({ className = "", ...props }) {
  return <textarea className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent resize-none ${className}`} {...props} />;
}

function Select({ className = "", children, ...props }) {
  return <select className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white ${className}`} {...props}>{children}</select>;
}

function Button({ variant = "primary", className = "", children, ...props }) {
  const base = "inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer";
  const styles = {
    primary: "bg-sky-700 text-white hover:bg-sky-800",
    secondary: "bg-white border border-gray-200 text-gray-700 hover:border-gray-300 hover:text-gray-900",
    danger: "bg-white border border-red-200 text-red-600 hover:bg-red-50",
  };
  return <button className={`${base} ${styles[variant]} ${className}`} {...props}>{children}</button>;
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
          className="w-full py-3 px-4 rounded-xl text-base font-semibold transition-all whitespace-nowrap flex items-center justify-center gap-2"
          style={active === t.key
            ? { background: accentColor || "#FF7A00", color: "#fff" }
            : { background: "#F4F2EF", color: "#463D38" }}
        >
          <Icon name={t.icon} size={17} /> {t.label}
        </button>
      ))}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {secondary.map((t) => (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`shrink-0 py-2 px-3 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${active === t.key ? "bg-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            style={active === t.key ? { color: legibleOn(accentColor || "#FF7A00") } : {}}
          >
            <Icon name={t.icon} size={15} /> {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- Trip form ----------
const EMPTY_TRIP = { name: "", destination: "", start_date: "", end_date: "", budget: "", currency: "EUR", notes: "", cover_color: "#FF7A00", cover_image: "", timezone: "" };

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
                    isEdge ? "bg-sky-700 text-white font-semibold"
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoAuthor, setPhotoAuthor] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSuggestPhoto() {
    if (!form.destination) return;
    setPhotoLoading(true); setPhotoAuthor(null);
    try {
      const data = await api.suggestPhoto(form.destination);
      setForm((f) => ({ ...f, cover_image: data.url }));
      setPhotoAuthor({ name: data.author, link: data.author_link });
    } catch (err) { alert("Kon geen foto vinden: " + err.message); }
    finally { setPhotoLoading(false); }
  }

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
        <Field label="Tijdzone van de bestemming">
          <Select value={form.timezone} onChange={set("timezone")}>
            <option value="">— Automatisch (toestel van elke kijker) —</option>
            {TIMEZONE_OPTIONS.map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>)}
          </Select>
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
            <div className="flex gap-2">
              <Input value={form.cover_image} onChange={set("cover_image")} placeholder="Foto-URL, of zoek automatisch →" />
              <Button type="button" variant="secondary" onClick={handleSuggestPhoto} disabled={photoLoading || !form.destination} className="shrink-0">
                {photoLoading ? "..." : <><Icon name="search" size={14} className="mr-1.5" />Zoeken</>}
              </Button>
            </div>
            {form.cover_image && (
              <div className="relative rounded-lg overflow-hidden h-32">
                <img src={form.cover_image} alt="preview" className="w-full h-full object-cover" />
                <button type="button" onClick={() => { setForm((f) => ({ ...f, cover_image: "" })); setPhotoAuthor(null); }}
                  className="absolute top-1 right-1 bg-black/50 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-black/70">×</button>
                {photoAuthor && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/40 text-white text-xs px-2 py-1">
                    Foto door <a href={photoAuthor.link + "?utm_source=reisplanner&utm_medium=referral"} target="_blank" rel="noreferrer" className="underline">{photoAuthor.name}</a> via Unsplash
                  </div>
                )}
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
  const accent = trip.cover_color || "#FF7A00";

  return (
    <div onClick={onClick} className="bg-white rounded-2xl shadow-sm active:scale-98 transition-all duration-150 cursor-pointer overflow-hidden border border-gray-100 group" style={{ WebkitTapHighlightColor: "transparent" }}>
      {/* Cover */}
      <div className="relative overflow-hidden" style={{ height: 190 }}>
        {trip.cover_image
          ? <img src={trip.cover_image} alt={trip.destination || trip.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          : <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}bb)` }} />
        }
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        {/* Badges top */}
        <div className="absolute top-3 left-3 right-3 flex justify-between items-start">
          {until !== null && until >= 0 && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-white/95 shadow" style={{ color: "#B85800" }}>
              {until === 0 ? "Vandaag!" : until === 1 ? "Morgen" : `${until} dagen`}
            </span>
          )}
          {trip.is_owner === false && <span className="text-xs font-medium px-2 py-1 rounded-full bg-black/30 text-white backdrop-blur-sm ml-auto">{trip.role === "viewer" ? "Alleen-lezen" : "Gedeeld"}</span>}
        </div>
        {/* Title */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 className="font-bold text-white text-lg leading-tight drop-shadow-sm">{trip.name}</h3>
          {trip.destination && <div className="text-sm text-white/80 mt-0.5 flex items-center gap-1"><Icon name="pin" size={13} />{trip.destination}</div>}
        </div>
      </div>

      <div className="px-4 py-3">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <div className="font-medium">{trip.start_date ? `${fmt(trip.start_date)}${dur ? ` · ${dur}` : ""}` : "Datum onbekend"}</div>
          <div className="flex gap-3 items-center">
            {trip.activity_count > 0 && <span className="flex items-center gap-1"><Icon name="route" size={13} /><span className="tnum">{trip.activity_count}</span></span>}
            {trip.budget && <span className="flex items-center gap-1"><Icon name="wallet" size={13} /><span className="tnum">{fmtMoney(trip.budget, trip.currency)}</span></span>}
          </div>
        </div>
        {until !== null && until > 0 && (
          <div className="mt-2 text-xs font-semibold rounded-lg px-2 py-1.5 text-center" style={{ background: accent + "18", color: legibleOn(accent) }}>
            Nog {until} dag{until === 1 ? "" : "en"} tot vertrek
          </div>
        )}
        {until === 0 && (
          <div className="mt-2 text-xs font-semibold text-green-700 bg-green-50 rounded-lg px-2 py-1.5 text-center">
            Vandaag vertrek!
          </div>
        )}
        {until !== null && until < 0 && trip.end_date && new Date(trip.end_date) >= new Date() && (
          <div className="mt-2 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-lg px-2 py-1.5 text-center">
            Onderweg — dag {Math.abs(until) + 1}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Activity form ----------
function ActivityForm({ dayId, tripId, tripTimezone, initial, days, onSaved, onClose, onImport, onDelete, photos, onPhotosChange, journalEntries, onJournalChange, currentUserId, readOnly, showPhotos = false, stayOpenAfterCreate = false, onCreated }) {
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
      };
    }
    // The day whose "+ Activiteit" button was pressed is an explicit choice and
    // always wins. Today is only the default when no day was specified at all
    // (and only if today actually falls inside the trip).
    const todayDay = (days || []).find((d) => d.date && String(d.date).slice(0, 10) === todayIso(tripTimezone));
    return { time: "", title: "", location: "", notes: "", category: "Bezienswaardigheid", cost: "", day_id: dayId ?? todayDay?.id ?? "" };
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
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 hover:text-gray-900 text-white font-semibold text-sm shadow transition-all active:scale-95 mb-3">
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
  const [form, setForm] = useState(initial ? { ...initial, check_in: initial.check_in ? String(initial.check_in).slice(0,10) : "", check_out: initial.check_out ? String(initial.check_out).slice(0,10) : "" } : { name: "", check_in: "", check_out: "", address: "", booking_ref: "", cost: "", notes: "" });
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
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 hover:text-gray-900 text-white font-semibold text-sm shadow transition-all active:scale-95 mb-3">
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
  const [form, setForm] = useState(initial ? {
    ...initial,
    departure_time: initial.departure_time ? new Date(initial.departure_time).toISOString().slice(0,16) : "",
    arrival_time: initial.arrival_time ? new Date(initial.arrival_time).toISOString().slice(0,16) : "",
    cost: initial.cost ?? "",
    booking_ref: initial.booking_ref ?? "",
    notes: initial.notes ?? "",
  } : { type: "Vliegtuig", from_location: "", to_location: "", departure_time: "", arrival_time: "", booking_ref: "", cost: "", notes: "", baggage_allowance: "" });
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
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 hover:text-gray-900 text-white font-semibold text-sm shadow transition-all active:scale-95 mb-3">
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
  const [form, setForm] = useState(initial ? { ...initial, date: initial.date?.slice(0,10)||"" } : { date: new Date().toISOString().slice(0,10), category: "Overig", description: "", amount: "", paid_by: "" });
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

// Fullscreen photo viewer, shared by the dagboek strips and the Foto's grid.
// The image fills the screen; everything else floats over it, so tapping a
// photo gives you the photo rather than a boxed preview with panels under it.
function PhotoLightbox({ photos, index, onClose, onIndexChange, assign, onDelete, onRotate, onCaption }) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotated, setRotated] = useState(0);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionText, setCaptionText] = useState("");
  const [savingCaption, setSavingCaption] = useState(false);
  const touchStart = useRef(null);

  const safeIndex = photos.length ? Math.min(index, photos.length - 1) : null;
  const viewing = safeIndex == null ? null : photos[safeIndex];

  const showNext = useCallback(() => onIndexChange((i) => (Math.min(i, photos.length - 1) + 1) % photos.length), [photos.length, onIndexChange]);
  const showPrev = useCallback(() => onIndexChange((i) => (Math.min(i, photos.length - 1) - 1 + photos.length) % photos.length), [photos.length, onIndexChange]);

  useEffect(() => { if (!photos.length) onClose(); }, [photos.length, onClose]);

  useEffect(() => {
    function handleKey(e) {
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
      setDragX(0);
    } else {
      setDragging(false); setDragX(0);
    }
  }

  if (!viewing) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[200] bg-black select-none" style={{ height: "100dvh" }}
      onClick={onClose} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd} onTouchCancel={handleTouchCancel}>

      <img src={`${viewing.url}${rotated ? (viewing.url.includes("?") ? "&" : "?") + "r=" + rotated : ""}`} alt="" draggable={false}
        className="absolute inset-0 w-full h-full object-contain"
        style={{ transform: `translateX(${dragX}px)`, transition: dragging ? "none" : "transform 200ms ease-out", touchAction: "pan-y" }} />

      {/* Top chrome */}
      <div className="absolute top-0 left-0 right-0 flex items-center gap-2 px-3 pb-3 bg-gradient-to-b from-black/70 to-transparent"
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

      {(viewing.caption || onCaption) && !showAssign && (
        <div className="absolute left-0 right-0 bottom-0 px-4 bg-gradient-to-t from-black/70 to-transparent"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)", paddingTop: "2rem" }}
          onClick={(e) => e.stopPropagation()}>
          {editingCaption ? (
            <div className="space-y-2 max-w-lg mx-auto">
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
            <p className="text-white text-sm text-center max-w-lg mx-auto leading-relaxed whitespace-pre-wrap">
              {viewing.caption}
              {onCaption && (
                <button type="button" onClick={() => { setCaptionText(viewing.caption || ""); setEditingCaption(true); }}
                  className="ml-2 text-white/60 hover:text-white" aria-label="Bewerken"><Icon name="pen" size={14} /></button>
              )}
            </p>
          ) : onCaption ? (
            <div className="text-center">
              <button type="button" onClick={() => { setCaptionText(""); setEditingCaption(true); }}
                className="text-white/70 hover:text-white text-xs">+ Tekst toevoegen</button>
            </div>
          ) : null}
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

function PhotoStrip({ photos, tripId, dayId, activityId, transportId, accommodationId, onChange, readOnly, days, transports, accommodations, large, comments, slotLikes, currentUserId, isOwner, onCommentsChange }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [viewingIndex, setViewingIndex] = useState(null);
  const canAssign = !readOnly && !!days;
  const { dayGroups, otherTransports, otherAccommodations } = canAssign
    ? computeDayGroups(days, transports || [], accommodations || [])
    : { dayGroups: [], otherTransports: [], otherAccommodations: [] };

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Kon foto niet lezen"));
      reader.readAsDataURL(file);
    });
  }

  async function handleFiles(e) {
    const files = [...e.target.files];
    e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    // Each file stands alone: one failure used to abort the whole batch AND skip
    // the refresh, so already-uploaded photos stayed invisible and the rest were
    // never attempted.
    const failed = [];
    for (const file of files) {
      if (file.size > MAX_PHOTO_BYTES) { failed.push(`${file.name} (te groot, max 8 MB)`); continue; }
      try {
        const [dataUrl, exif] = await Promise.all([readAsDataUrl(file), readExif(file)]);
        const base64 = dataUrl.split(",")[1];
        await api.addPhoto(tripId, {
          day_id: dayId || null, activity_id: activityId || null, transport_id: transportId || null, accommodation_id: accommodationId || null,
          image: { data: base64, mediaType: file.type },
          taken_at: exif.taken_at || null, latitude: exif.latitude ?? null, longitude: exif.longitude ?? null,
        });
      } catch (err) {
        failed.push(`${file.name} (${err.message || "mislukt"})`);
      }
    }
    setUploading(false);
    onChange();
    if (failed.length) {
      alert(`${files.length - failed.length} van ${files.length} foto's geüpload.\n\nNiet gelukt:\n${failed.join("\n")}`);
    }
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

  const thumbClass = large ? "w-[70vw] h-[70vw] max-w-80 max-h-80 sm:w-72 sm:h-72" : "w-24 h-24";

  return (
    <div className={`flex ${large ? "gap-4" : "gap-2"} overflow-x-auto pb-1`} onClick={(e) => e.stopPropagation()}>
      {photos.map((p, i) => (
        <div key={p.id} className="relative shrink-0 group">
          <img src={p.thumb_url || p.url} alt={p.caption || ""} loading="lazy" decoding="async" onClick={() => setViewingIndex(i)}
            className={`${thumbClass} ${large ? "rounded-2xl" : "rounded-lg"} object-cover cursor-pointer border border-gray-100`} />
          {large && (
            <PhotoCaption photo={p} readOnly={readOnly} onChanged={onChange} maxWidth="70vw" />
          )}
          {large && comments && (
            <div className="mt-1.5" style={{ maxWidth: "70vw" }} onClick={(e) => e.stopPropagation()}>
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
      {!readOnly && (
        // In the dagboek this is a small labelled button, not a tile: photos
        // there are ~70vw, and a matching dashed square dominated the entry —
        // especially before any photo had been added. The compact grid keeps
        // its square tile, where it lines up with the thumbnails.
        large ? (
          <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()}
            className="shrink-0 self-center inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-gray-200 bg-white text-xs font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-colors disabled:opacity-50">
            <span className="text-base leading-none">＋</span>
            {uploading ? "Uploaden..." : "Foto"}
          </button>
        ) : (
          <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()}
            className="shrink-0 w-24 h-24 rounded-lg border-2 border-dashed border-gray-200 hover:border-gray-300 flex items-center justify-center text-gray-400 hover:text-gray-500 text-2xl transition-colors">
            {uploading ? "…" : "＋"}
          </button>
        )
      )}
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
      {viewingIndex != null && (
        <PhotoLightbox photos={photos} index={viewingIndex}
          onClose={() => setViewingIndex(null)} onIndexChange={setViewingIndex}
          assign={canAssign ? { dayGroups, otherTransports, otherAccommodations, onChange: handleAssign } : null}
          onDelete={readOnly ? null : (p) => handleDelete(p.id)}
          onRotate={readOnly ? null : async (p) => { await api.rotatePhoto(p.id); await onChange(); }}
          onCaption={readOnly ? null : async (p, text) => { await api.setPhotoCaption(p.id, text); await onChange(); }} />
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

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Kon foto niet lezen"));
      reader.readAsDataURL(file);
    });
  }

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
    const newItems = [];
    for (const file of files) {
      const key = `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`;
      if (file.size > MAX_PHOTO_BYTES) { newItems.push({ key, name: file.name, error: "Te groot (max 8 MB)" }); continue; }
      try {
        const [dataUrl, exif] = await Promise.all([readAsDataUrl(file), readExif(file)]);
        newItems.push({ key, name: file.name, dataUrl, mediaType: file.type, exif, dayId: matchDay(exif.taken_at) });
      } catch {
        newItems.push({ key, name: file.name, error: "Kon foto niet lezen" });
      }
    }
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
    for (const it of uploadable) {
      const base64 = it.dataUrl.split(",")[1];
      try {
        await api.addPhoto(tripId, {
          day_id: it.dayId || null, activity_id: null,
          image: { data: base64, mediaType: it.mediaType },
          taken_at: it.exif.taken_at || null, latitude: it.exif.latitude ?? null, longitude: it.exif.longitude ?? null,
        });
      } catch {}
      setProgress((p) => p + 1);
    }
    setUploading(false);
    onUploaded();
    onClose();
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
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={uploading}>Annuleren</Button>
            <Button type="button" onClick={handleUploadAll} disabled={uploading || !uploadable.length}>
              {uploading ? `Uploaden... ${progress}/${uploadable.length}` : `Uploaden (${uploadable.length})`}
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
const DAY_NAMES = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const MONTH_NAMES = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function DayPlanningTab({ trip, days, transports, accommodations, onRefresh, readOnly, currentUserId, onShareEditor }) {
  const [showActivityForm, setShowActivityForm] = useState(null);
  const [editingActivity, setEditingActivity] = useState(null);
  const [editingTransport, setEditingTransport] = useState(null);
  const [addingTransport, setAddingTransport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editingAccommodation, setEditingAccommodation] = useState(null);
  const [addingAccommodation, setAddingAccommodation] = useState(false);
  const [locationPhotos, setLocationPhotos] = useState({});
  const [tripJournal, setTripJournal] = useState([]);
  const [tipsLocation, setTipsLocation] = useState(null);
  const fetchedRef = useRef(new Set());
  const accent = trip.cover_color || "#FF7A00";

  const loadJournal = useCallback(async () => {
    try { setTripJournal(asList((await api.getJournal(trip.id)).entries)); } catch {}
  }, [trip.id]);
  useEffect(() => { loadJournal(); }, [loadJournal]);

  useEffect(() => {
    if (_guestMode) return; // /api/photo-suggest requires a session
    const locs = new Set();
    days.forEach((day) => (day.activities || []).forEach((a) => { if (a.location) locs.add(a.location); }));
    [...locs].slice(0, 10).forEach(async (loc) => {
      if (fetchedRef.current.has(loc)) return;
      fetchedRef.current.add(loc);
      // Cached in localStorage, not just a ref: the ref died on every tab switch,
      // so returning to Dagplanning re-issued up to 10 Unsplash calls. Their demo
      // tier allows 50/hour, so a handful of visits silently exhausted the quota
      // and the card images stopped appearing for everyone.
      const cacheKey = `locphoto:${loc}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) { setLocationPhotos((p) => ({ ...p, [loc]: cached })); return; }
      try {
        const d = await api.suggestPhoto(loc);
        if (d?.thumb) {
          try { localStorage.setItem(cacheKey, d.thumb); } catch {}
          setLocationPhotos((p) => ({ ...p, [loc]: d.thumb }));
        }
      } catch {}
    });
  }, [days]);

  async function handleDeleteActivity(id) {
    if (!confirm("Activiteit verwijderen?")) return;
    await api.deleteActivity(id); onRefresh();
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

  return (
    <div>
      <div className="flex justify-between items-center mb-6 gap-2 flex-wrap">
        <h3 className="font-display text-[21px] text-gray-800">Dagplanning</h3>
        <div className="flex gap-2 flex-wrap w-full sm:w-auto sm:justify-end">
          {todayDay && <Button onClick={scrollToToday} variant="secondary"><Icon name="pin" size={14} className="mr-1.5" />Vandaag</Button>}
          {/* Quick-add while on the trip: opens the form pre-set to today.
              The per-day "+ Activiteit" buttons keep using their own day. */}
          {!readOnly && todayDay && <Button onClick={() => setShowActivityForm({ dayId: todayDay.id })}>+ Activiteit vandaag</Button>}
          {!readOnly && <Button onClick={() => setAddingTransport(true)} variant="secondary">+ Vervoer/vlucht toevoegen</Button>}
          {!readOnly && <Button onClick={() => setAddingAccommodation(true)} variant="secondary">+ Verblijf toevoegen</Button>}
          {!readOnly && <Button onClick={() => setImporting(true)}><Icon name="mail" size={14} className="mr-1.5" />Reisbevestiging uploaden</Button>}
          {onShareEditor && !readOnly && (
            <Button onClick={onShareEditor} variant="secondary"><Icon name="share" size={14} className="mr-1.5" />Reis delen met reisgenoot</Button>
          )}
        </div>
      </div>

      {days.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Icon name="calendar" size={40} strokeWidth={1.2} className="mx-auto mb-3 text-gray-300" />
          <div className="font-medium">Nog geen dagen gepland</div>
          <div className="text-sm mt-1">Stel een vertrek- en terugkomstdatum in bij de reis om te beginnen</div>
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

            const isToday = dayStr === todayIso(trip.timezone);

            return (
              <div key={day.id} id={`day-${day.id}`} className="relative flex gap-3" style={{ scrollMarginTop: "5rem" }}>
                {/* Dagmarkering: het dagnummer draagt de dag. Vandaag krijgt het
                    heldere oranje — de enige plek waar die kleur mag opduiken. */}
                <div className="shrink-0 text-right pt-1" style={{ width: "3.4rem" }}>
                  <div className={`font-display text-[33px] leading-none tnum ${isToday ? "text-sky-400" : "text-gray-800"}`}>{dayNum}</div>
                  <div className={`text-[10px] uppercase tracking-[0.12em] font-semibold mt-1 whitespace-nowrap ${isToday ? "text-sky-400" : "text-gray-400"}`}>
                    {dayName} {monthName}
                  </div>
                  {dayIndex === 0 && days.length > 1 && (
                    <div className="text-[10px] text-gray-300 mt-1">Dag 1</div>
                  )}
                </div>

                {/* Day content */}
                <div className={`flex-1 min-w-0 border-l-2 border-gray-200 pl-4 ${dayIndex === days.length - 1 ? "pb-2" : "pb-6"}`}>
                  <div className="flex items-center justify-between flex-wrap gap-y-1 mb-2 pt-1">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        {isToday && (
                          <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-sky-400">Vandaag</span>
                        )}
                        {day.title && <span className="font-display text-gray-800 text-[17px]">{day.title}</span>}
                        {totalItems === 0 && <span className="text-xs text-gray-400 italic">Leeg</span>}
                      </div>
                      {nightAccommodation && (
                        <span className="text-xs text-gray-500 flex items-center gap-1.5">
                          <Icon name="bed" size={13} className="text-gray-400" />
                          <span className="truncate max-w-[180px]">{nightAccommodation.address || nightAccommodation.name}</span>
                        </span>
                      )}
                    </div>
                    {!readOnly && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => setShowActivityForm({ dayId: day.id })}
                          className="text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:border-sky-300 hover:text-sky-700 transition-colors inline-flex items-center gap-1">
                          <Icon name="plus" size={13} />Activiteit
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    {/* Transport cards */}
                    {dayTransports.map((t) => {
                      const isArrival = isoDate(t.arrival_time) === dayStr && isoDate(t.departure_time) !== dayStr;
                      const time = isArrival ? t.arrival_time : t.departure_time;
                      return (
                        <div key={t.id + (isArrival ? "-a" : "-d")}
                          onClick={() => setEditingTransport(t)}
                          className="flex items-center gap-3 rounded-xl px-3 py-2.5 bg-white border border-gray-200 cursor-pointer hover:border-gray-300 hover:shadow-sm transition-all">
                          <span className="text-xs text-gray-500 tnum shrink-0 w-11 text-right">
                            {time ? new Date(time).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) : "—"}
                          </span>
                          <div className="flex-1 min-w-0">
                            {/* Een route mag over twee regels; "Parijs CDG → Sha…" zegt niets. */}
                            <div className="text-sm font-semibold text-gray-800 leading-snug">{t.from_location} → {t.to_location}</div>
                            <div className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
                              <Icon name={transportIcon(t.type)} size={13} className="text-gray-400" />
                              <span>{isArrival ? "Aankomst" : "Vertrek"}</span>
                              {t.booking_ref && <span className="tnum text-gray-400 hidden sm:inline">#{t.booking_ref}</span>}
                              {t.cost && <span className="tnum ml-auto pl-2 shrink-0">{fmtMoney(t.cost, trip.currency)}</span>}
                            </div>
                            {t.baggage_allowance && <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><Icon name="suitcase" size={12} className="text-gray-400" /><span className="truncate">{t.baggage_allowance}</span></div>}
                          </div>
                          {t.to_location && (
                            <button onClick={(e) => { e.stopPropagation(); setTipsLocation(t.to_location); }}
                              className="shrink-0 rounded-lg border border-gray-200 text-gray-500 hover:text-sky-700 hover:border-sky-300 transition-colors"
                              title="Lokale tips">
                              <span className="hidden sm:flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 whitespace-nowrap"><Icon name="bulb" size={13} />Lokale tips</span>
                              <span className="sm:hidden flex items-center justify-center w-8 h-8"><Icon name="bulb" size={16} /></span>
                            </button>
                          )}
                        </div>
                      );
                    })}

                    {/* Accommodation cards */}
                    {dayAccommodations.map((a) => {
                      const isCheckIn = isoDate(a.check_in) === dayStr;
                      const isCheckOut = isoDate(a.check_out) === dayStr;
                      return (
                        <div key={a.id}
                          onClick={() => setEditingAccommodation(a)}
                          className="rounded-xl bg-white border border-gray-200 cursor-pointer hover:border-gray-300 hover:shadow-sm transition-all">
                          <div className="flex items-center gap-3 px-3 py-2.5">
                            <span className="text-xs text-gray-500 tnum shrink-0 w-11 text-right">—</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-gray-800 truncate">{a.name}</div>
                              <div className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
                                <Icon name="bed" size={13} className="text-gray-400" />
                                <span>{isCheckIn && isCheckOut ? "Check-in & uit" : isCheckIn ? "Check-in" : "Check-out"}</span>
                                {a.cost && <span className="tnum ml-auto pl-2 shrink-0">{fmtMoney(a.cost, trip.currency)}</span>}
                              </div>
                              {a.address && <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5"><Icon name="pin" size={12} /><span className="truncate">{a.address}</span></div>}
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); setTipsLocation(a.address || a.name); }}
                              className="shrink-0 rounded-lg border border-gray-200 text-gray-500 hover:text-sky-700 hover:border-sky-300 transition-colors"
                              title="Lokale tips">
                              <span className="hidden sm:flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 whitespace-nowrap"><Icon name="map" size={13} />Lokale tips</span>
                              <span className="sm:hidden flex items-center justify-center w-8 h-8"><Icon name="map" size={16} /></span>
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {/* Activity cards */}
                    {day.activities.map((act) => {
                      const photo = act.location ? locationPhotos[act.location] : null;
                      return (
                        <div key={act.id}
                          onClick={() => setEditingActivity(act)}
                          className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden group hover:shadow-md transition-shadow cursor-pointer">
                          {photo && (
                            <div className="h-32 overflow-hidden relative">
                              <img src={photo} alt={act.location} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                              {act.location && (
                                <div className="absolute bottom-2 left-3 text-white text-xs font-medium drop-shadow flex items-center gap-1"><Icon name="pin" size={12} />{act.location}</div>
                              )}
                            </div>
                          )}
                          <div className="flex items-start gap-3 px-3 py-2.5">
                            <span className="text-xs text-gray-500 tnum shrink-0 w-11 text-right pt-0.5">{act.time || "—"}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-gray-800">{act.title}</div>
                              <div className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
                                <Icon name={categoryIcon(act.category)} size={13} className="text-gray-400" />
                                <span className="truncate">{act.category || "Activiteit"}</span>
                                {act.cost && <span className="tnum ml-auto pl-2 shrink-0">{fmtMoney(act.cost, trip.currency)}</span>}
                              </div>
                              {!photo && act.location && <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1"><Icon name="pin" size={12} /><span className="truncate">{act.location}</span></div>}
                              {act.notes && <div className="text-xs text-gray-500 mt-1 leading-relaxed">{act.notes}</div>}
                            </div>
                            {!readOnly && (
                              <div className="flex gap-1 shrink-0">
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteActivity(act.id); }} className="text-gray-300 hover:text-red-500 active:text-red-600 p-1" aria-label="Verwijderen"><Icon name="trash" size={15} /></button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {totalItems === 0 && !readOnly && (
                      <button onClick={() => setShowActivityForm({ dayId: day.id })}
                        className="w-full border-2 border-dashed border-gray-200 rounded-xl py-4 text-sm text-gray-400 hover:border-gray-300 hover:text-gray-500 transition-colors">
                        + Activiteit toevoegen
                      </button>
                    )}

                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showActivityForm && (
        <ActivityForm dayId={showActivityForm.dayId} tripId={trip.id} tripTimezone={trip.timezone} days={days}
          onSaved={() => { setShowActivityForm(null); onRefresh(); }}
          onClose={() => setShowActivityForm(null)}
          onImport={() => { setShowActivityForm(null); setImporting(true); }} />
      )}
      {editingActivity && (
        <ActivityForm dayId={editingActivity.day_id} tripId={trip.id} tripTimezone={trip.timezone} initial={editingActivity} days={days}
          journalEntries={tripJournal.filter((e) => e.activity_id === editingActivity.id)} onJournalChange={loadJournal} currentUserId={currentUserId}
          onSaved={() => { setEditingActivity(null); onRefresh(); }}
          onClose={() => setEditingActivity(null)}
          onDelete={async () => { if (!confirm("Activiteit verwijderen?")) return; await api.deleteActivity(editingActivity.id); setEditingActivity(null); onRefresh(); }} />
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

function AccountModal({ user, onClose, onChanged }) {
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
            : <div className="w-12 h-12 rounded-full bg-sky-600 text-white flex items-center justify-center font-bold">{(user.given_name || user.name || "?")[0].toUpperCase()}</div>}
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

        <div className="flex justify-end pt-1">
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
        liked ? "bg-sky-50 border-sky-300 text-[#B85800]" : "bg-white border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300"
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
              <span className="text-[10px] font-bold uppercase tracking-[0.1em] px-2 py-0.5 rounded-full bg-sky-400 text-white">Nieuw</span>
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

function JournalTab({ trip, days, transports, accommodations, readOnly, currentUserId, onRefresh, onPreviewViewer, onShare }) {
  const [entries, setEntries] = useState([]);
  const [comments, setComments] = useState([]);
  const [slotLikes, setSlotLikes] = useState({});
  const [tripPhotos, setTripPhotos] = useState([]);
  const [addingActivity, setAddingActivity] = useState(null);
  const [entriesLoaded, setEntriesLoaded] = useState(false);
  const didAutoScroll = useRef(false);
  const accent = trip.cover_color || "#FF7A00";

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
  const firstNew = entries.find((e) => e.is_new) || comments.find((c) => c.is_new);
  function scrollToFirstNew() {
    if (!firstNew) return;
    const dayId = firstNew.day_id
      || days.find((d) => (d.activities || []).some((a) => a.id === firstNew.activity_id))?.id;
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
        <div className="text-sm mt-1">Voeg dagen toe op de Dagplanning-tab om je dagboek te beginnen</div>
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
              className="text-xs font-semibold px-3 py-1.5 rounded-full bg-sky-400 text-white hover:bg-sky-500 transition-colors inline-flex items-center gap-1.5">
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
      <JournalOverviewMap days={days} photos={tripPhotos} />
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
          const hasSubItems = day.activities.length > 0 || dayTransports.length > 0 || dayAccommodations.length > 0;
          // Where you sleep that night — the same rule the planning tab uses, so
          // the dagboek reads with the same sense of place.
          const nightAccommodation = dayStr ? accommodations.find((a) => {
            if (!a.check_in || !a.check_out) return false;
            return isoDate(a.check_in) <= dayStr && isoDate(a.check_out) > dayStr;
          }) : null;
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
                  {nightAccommodation && (
                    <span className="text-xs text-gray-500 flex items-center gap-1.5 min-w-0 mt-0.5">
                      <Icon name="bed" size={12} className="text-gray-400" />
                      <span className="truncate max-w-[180px]">{nightAccommodation.address || nightAccommodation.name}</span>
                    </span>
                  )}
                </div>
                {!readOnly && (
                  <button onClick={() => setAddingActivity({ dayId: day.id })}
                    className="ml-auto shrink-0 text-xs font-semibold px-3 py-2 rounded-full border border-gray-200 text-gray-600 hover:border-sky-300 hover:text-sky-700 active:scale-95 transition-all inline-flex items-center gap-1">
                    <Icon name="plus" size={13} />Activiteit
                  </button>
                )}
              </div>

              <div className="p-4 space-y-4">
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
                    {dayTransports.map((t) => {
                      const tEntries = entries.filter((e) => e.transport_id === t.id);
                      return (
                        <div key={"t" + t.id} className="pl-3 border-l border-gray-200">
                          <div className="text-sm font-bold text-gray-600 mb-1.5 flex items-center gap-1.5">
                            <Icon name={transportIcon(t.type)} size={13} className="text-gray-400" />{t.from_location} → {t.to_location}
                          </div>
                          <JournalEntryBox entries={tEntries} currentUserId={currentUserId} isOwner={trip.is_owner} placeholder="Vertel over deze reis..."
                            onSave={(text) => saveEntry({ transport_id: t.id }, text)}
                            onDelete={deleteEntry} onCommentsChange={loadEntries}
                            photos={tripPhotos.filter((p) => p.transport_id === t.id)}
                            tripId={trip.id} transportId={t.id} onPhotosChange={loadPhotos} readOnly={readOnly}
                            reactions={reactionsFor({ transport_id: t.id })}
                            comments={comments} slotLikes={slotLikes}
                            days={days} transports={transports} accommodations={accommodations} />
                        </div>
                      );
                    })}
                    {dayAccommodations.map((a) => {
                      const aEntries = entries.filter((e) => e.accommodation_id === a.id);
                      return (
                        <div key={"a" + a.id} className="pl-3 border-l border-gray-200">
                          <div className="text-sm font-bold text-gray-600 mb-1.5 flex items-center gap-1.5">
                            <Icon name="bed" size={13} className="text-gray-400" />{a.name}
                          </div>
                          <JournalEntryBox entries={aEntries} currentUserId={currentUserId} isOwner={trip.is_owner} placeholder="Vertel over dit verblijf..."
                            onSave={(text) => saveEntry({ accommodation_id: a.id }, text)}
                            onDelete={deleteEntry} onCommentsChange={loadEntries}
                            photos={tripPhotos.filter((p) => p.accommodation_id === a.id)}
                            tripId={trip.id} accommodationId={a.id} onPhotosChange={loadPhotos} readOnly={readOnly}
                            reactions={reactionsFor({ accommodation_id: a.id })}
                            comments={comments} slotLikes={slotLikes}
                            days={days} transports={transports} accommodations={accommodations} />
                        </div>
                      );
                    })}
                    {day.activities.map((act) => {
                      const actEntries = entries.filter((e) => e.activity_id === act.id);
                      return (
                        <div key={"act" + act.id} id={`journal-activity-${act.id}`} className="pl-3 border-l border-gray-200" style={{ scrollMarginTop: "5rem" }}>
                          <div className="text-sm font-bold text-gray-600 mb-1.5 flex items-center gap-1.5">
                            <Icon name={categoryIcon(act.category)} size={13} className="text-gray-400" />{act.title}
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

  async function handleDelete(id) {
    if (!confirm("Verblijf verwijderen?")) return;
    await api.deleteAccommodation(id);
    onRefresh();
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
                      <span className="font-medium text-sm" style={{ color: "#B85800" }}>{fmtMoney(acc.cost, trip.currency)}</span>
                      {perNight && nights && (
                        <span className="text-xs text-gray-400">· {nights} {nights === 1 ? "nacht" : "nachten"} · <span className="text-gray-500 font-medium">{fmtMoney(perNight, trip.currency)}/nacht</span></span>
                      )}
                    </div>
                  )}
                  {acc.notes && <div className="text-sm text-gray-500 mt-1">{acc.notes}</div>}
                </div>
                <div className={readOnly ? "flex gap-1" : "opacity-0 group-hover:opacity-100 flex gap-1"}>
                  <button onClick={() => setEditing(acc)} className="text-gray-400 hover:text-sky-600"><Icon name={readOnly ? "eye" : "pen"} size={16} /></button>
                  {!readOnly && <button onClick={() => handleDelete(acc.id)} className="text-gray-400 hover:text-red-500" aria-label="Verwijderen"><Icon name="trash" size={16} /></button>}
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

  async function handleDelete(id) {
    if (!confirm("Vervoer verwijderen?")) return;
    await api.deleteTransport(id);
    onRefresh();
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
                    {t.cost && <span className="font-medium" style={{ color: "#B85800" }}>{fmtMoney(t.cost)}</span>}
                  </div>
                  {t.baggage_allowance && <div className="text-sm text-gray-500 mt-1 flex items-center gap-1.5"><Icon name="suitcase" size={14} />{t.baggage_allowance}</div>}
                  {t.notes && <div className="text-sm text-gray-500 mt-1">{t.notes}</div>}
                </div>
                <div className={readOnly ? "flex gap-1" : "opacity-0 group-hover:opacity-100 flex gap-1"}>
                  <button onClick={() => setEditing(t)} className="text-gray-400 hover:text-sky-600"><Icon name={readOnly ? "eye" : "pen"} size={16} /></button>
                  {!readOnly && <button onClick={() => handleDelete(t.id)} className="text-gray-400 hover:text-red-500" aria-label="Verwijderen"><Icon name="trash" size={16} /></button>}
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

  async function handleDelete(id) {
    if (!confirm("Uitgave verwijderen?")) return;
    await api.deleteExpense(id);
    onRefresh();
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
                  <button onClick={() => handleDelete(exp.id)} className="text-gray-400 hover:text-red-500" aria-label="Verwijderen"><Icon name="trash" size={14} /></button>
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
            <div className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: "#B85800" }}>Wist je dat?</div>
            <div className="text-sm text-gray-700 leading-relaxed">{didYouKnow}</div>
          </div>
        ) : null}
        <div className="text-xs text-gray-400 text-center pb-1">Klik op een categorie om tips te laden</div>
        {TIP_CATEGORIES.map(({ category, icon }) => (
          <TipAccordion key={category} tripId={tripId} category={category} icon={icon}
            accentColor="#FF7A00" location={location} cacheKeyPrefix={cacheKeyPrefix} />
        ))}
      </div>
    </Modal>
  );
}

// ---------- Tips tab ----------
function TipsTab({ trip }) {
  const [didYouKnow, setDidYouKnow] = useState(null);
  const [dykLoading, setDykLoading] = useState(true);
  const accent = trip.cover_color || "#FF7A00";
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

async function geocode(query) {
  const key = `geocode_${query}`;
  try {
    const c = localStorage.getItem(key);
    if (c) return JSON.parse(c);
  } catch {}
  await new Promise((r) => setTimeout(r, 1100)); // Nominatim rate limit: 1/sec
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
  const res = await fetch(url, { headers: { "Accept-Language": "nl", "User-Agent": "ReisplannerApp/1.0" } });
  const data = await res.json();
  const result = data[0] ? { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), display: data[0].display_name } : null;
  if (result) { try { localStorage.setItem(key, JSON.stringify(result)); } catch {} }
  return result;
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
        if (t.origin && t.destination) {
          const fromQ = t.origin;
          const toQ = t.destination;
          transportPairs.push({ from: fromQ, to: toQ, type: t.transport_type });
          if (!items.find((i) => i.query === fromQ)) items.push({ label: t.origin, sublabel: "", type: "transport", query: fromQ });
          if (!items.find((i) => i.query === toQ)) items.push({ label: t.destination, sublabel: "", type: "transport", query: toQ });
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
          L.polyline(arcLatLngs(fromGeo, toGeo), { color: "#6B3145", weight: 2.5, opacity: 0.7, dashArray: "8 5" }).addTo(map);
        } else {
          L.polyline([[fromGeo.lat, fromGeo.lon], [toGeo.lat, toGeo.lon]], { color: "#2E6B4E", weight: 2, opacity: 0.6 }).addTo(map);
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
        hotel: { paths: '<path d="M3 18v-8"/><path d="M3 13h18v5"/><path d="M21 18v-4.5a2.5 2.5 0 0 0-2.5-2.5H10v2.5"/><circle cx="6.9" cy="11" r="1.9"/>', color: "#FF7A00" },
        activity: { paths: '<path d="M6 21V4"/><path d="M6 5h10.5l-1.8 3.6 1.8 3.6H6"/>', color: "#2E6B4E" },
        transport: { paths: '<path d="M3 13.5 21 7l-4.5 12-3.2-5.1z"/><path d="M13.3 13.9 21 7"/>', color: "#6B3145" },
      };

      // Deduplicate markers by query
      const seen = new Set();
      validItems.forEach((item) => {
        if (seen.has(item.query)) return;
        seen.add(item.query);
        const geo = coordMap[item.query];
        const cfg = typeConfig[item.type] || typeConfig.activity;
        const marker = L.marker([geo.lat, geo.lon], { icon: iconSvg(cfg.paths, cfg.color) }).addTo(map);
        const popup = `<div style="font-family:system-ui;min-width:140px">
          <div style="font-weight:600;font-size:13px;color:#241D19">${item.label}</div>
          ${item.sublabel && item.sublabel !== item.label ? `<div style="font-size:11px;color:#7B6E67;margin-top:2px">${item.sublabel}</div>` : ""}
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
    transports.some((t) => t.origin && t.destination) ||
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
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "#FF7A00" }} />Verblijf</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "#2E6B4E" }} />Activiteit</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "#6B3145" }} />Vervoer</span>
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
          { color: "#FF7A00", weight: 2.5, opacity: 0.75 }).addTo(map);
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
            html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#FF7A00;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(36,29,25,.35);color:#fff;display:flex;align-items:center;justify-content:center;font-size:${size < 30 ? 10 : 12}px;font-weight:700;font-variant-numeric:tabular-nums">${nr || ""}</div>`,
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
            html: `<div style="width:14px;height:14px;border-radius:50%;background:#FF7A00;border:2px solid #fff;box-shadow:0 1px 4px rgba(36,29,25,.4)"></div>`,
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
          const timeSuffix = pl.time ? ` · ${pl.time}` : "";
          marker.bindTooltip(`<span style="font-weight:600">${shortLabel}</span>${timeSuffix}`, {
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
            html: `<div style="width:18px;height:18px;border-radius:50%;background:#463D38;border:2px solid #fff;box-shadow:0 1px 4px rgba(36,29,25,.4);display:flex;align-items:center;justify-content:center">
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

// De kaart waar het dagboek nu mee opent: één stip per dag — de eerst
// bezochte plek van die dag — genummerd op het dagnummer en verbonden met
// speelse boogjes, dezelfde vluchtroute-boog als op de planningskaart, in
// plaats van rechte lijnen. Een tik op een dagnummer springt direct naar dat
// dagkaartje verderop in het dagboek, zodat de kaart een navigatiemiddel is,
// niet alleen een plaatje.
function JournalOverviewMap({ days, photos }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

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

  useEffect(() => {
    if (!mapRef.current || dayMarkers.length === 0) return;
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
        L.polyline(arcLatLngs(dayMarkers[i - 1], dayMarkers[i]), { color: "#FF7A00", weight: 2.5, opacity: 0.75 }).addTo(map);
      }

      dayMarkers.forEach((pl) => {
        const marker = L.marker([pl.lat, pl.lon], {
          icon: L.divIcon({
            className: "leaflet-reisplanner-icon",
            html: `<div style="width:30px;height:30px;border-radius:50%;background:#FF7A00;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(36,29,25,.35);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;cursor:pointer">${pl.dayNumber}</div>`,
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

      const bounds = dayMarkers.map((p) => [p.lat, p.lon]);
      if (bounds.length === 1) map.setView(bounds[0], 13);
      else map.fitBounds(bounds, { padding: [36, 36] });
    })();

    return () => { cancelled = true; };
  }, [dayMarkers]);

  useEffect(() => () => {
    if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
  }, []);

  if (dayMarkers.length === 0) return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 text-center py-8 px-4 mb-6 text-sm text-gray-400">
      Zodra je foto's met locatie uploadt, verschijnt hier de kaart van je reis.
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
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${mode === key ? "bg-white shadow-sm text-[#B85800]" : "text-gray-500 hover:text-gray-700"}`}>
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
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${mode === "text" ? "bg-white shadow text-[#B85800]" : "text-gray-500 hover:text-gray-700"}`}>
              <Icon name="clipboard" size={15} className="mr-1.5" />Tekst plakken
            </button>
            <button type="button" onClick={() => setMode("image")}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${mode === "image" ? "bg-white shadow text-[#B85800]" : "text-gray-500 hover:text-gray-700"}`}>
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

function ShareModal({ tripId, onClose, role = "viewer" }) {
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
                            {m.recent.map((a, i) => (
                              <div key={i} className="text-xs text-gray-500 flex gap-2">
                                <Icon name={a.kind === "comment" ? "chat" : "thumb"} size={13} className="mt-0.5 text-gray-400" />
                                <span className="flex-1 min-w-0 truncate">
                                  {a.kind === "comment" ? a.detail : "gaf een duimpje"}
                                </span>
                                <span className="shrink-0 text-gray-300">{fmtDatetime(a.at)}</span>
                              </div>
                            ))}
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

function PhotoGalleryTab({ trip, days, transports, accommodations, readOnly }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewingIndex, setViewingIndex] = useState(null);
  const [bulkUploading, setBulkUploading] = useState(false);

  const loadPhotos = useCallback(async () => {
    try { setPhotos(await api.getPhotos(trip.id)); } catch {} finally { setLoading(false); }
  }, [trip.id]);
  useEffect(() => { loadPhotos(); }, [loadPhotos]);

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
                style={{ scrollMarginTop: "5rem", boxShadow: p.id === todayPhoto?.id ? "0 0 0 3px #E4571A" : undefined }}>
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
          onCaption={readOnly ? null : async (p, text) => { await api.setPhotoCaption(p.id, text); await loadPhotos(); }} />
      )}
    </div>
  );
}

// ---------- Packing tab ----------
// De sleutel staat als tekst in de database (packing_items.category), dus die
// blijft ongewijzigd — inclusief de emoji, anders raken bestaande paklijsten hun
// categorie kwijt. Alleen wat de gebruiker ziet is vervangen door label + icoon.
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
          <button type="submit" className="bg-sky-600 text-white rounded-lg px-3 py-2 text-sm font-medium hover:bg-sky-700 hover:text-gray-900 shrink-0">+</button>
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
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Meer opties"
        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors">
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

// ---------- Trip detail ----------
function TripDetail({ tripId, onBack, onChanged, currentUserId }) {
  const [trip, setTrip] = useState(null);
  const [days, setDays] = useState([]);
  const [accommodations, setAccommodations] = useState([]);
  const [transports, setTransports] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [tab, setTab] = useState("days");
  const [editing, setEditing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sharing, setSharing] = useState(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [previewViewer, setPreviewViewer] = useState(false);

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
    await api.deleteTrip(tripId);
    onBack(); onChanged();
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

  const accent = trip.cover_color || "#FF7A00";
  const readOnly = trip.role === "viewer" || previewViewer;
  const isOwnerActions = trip.is_owner && !previewViewer;

  // What a shared viewer actually receives: no budget, no per-item costs, no
  // expense list. Mirrors stripCosts() on the server.
  const viewTrip = previewViewer ? { ...trip, budget: null, role: "viewer" } : trip;
  const viewDays = previewViewer
    ? days.map((d) => ({ ...d, activities: (d.activities || []).map((a) => ({ ...a, cost: null })) }))
    : days;
  const viewTransports = previewViewer ? transports.map((t) => ({ ...t, cost: null })) : transports;
  const viewAccommodations = previewViewer ? accommodations.map((a) => ({ ...a, cost: null })) : accommodations;
  const viewExpenses = previewViewer ? [] : expenses;

  const tabs = [
    { key: "days", label: "Dagplanning", icon: "route", primary: true },
    ...(currentUserId ? [{ key: "journal", label: "Dagboek", icon: "book" }] : []),
    { key: "photos", label: "Foto's", icon: "camera" },
    { key: "accommodation", label: "Verblijf", icon: "bed" },
    { key: "transport", label: "Vervoer", icon: "plane" },
    { key: "packing", label: "Paklijst", icon: "suitcase" },
    { key: "map", label: "Kaart", icon: "map" },
  ];

  // Bottom nav tabs for mobile
  const bottomNavItems = [
    { key: "days", icon: "route", label: "Planning" },
    ...(currentUserId ? [{ key: "journal", icon: "book", label: "Dagboek" }] : []),
    { key: "photos", icon: "camera", label: "Foto's" },
  ];
  // Reachable only via the "Meer" dropdown on mobile
  const moreMenuItems = [
    { key: "accommodation", icon: "bed", label: "Verblijf" },
    { key: "transport", icon: "plane", label: "Vervoer" },
    { key: "packing", icon: "suitcase", label: "Paklijst" },
    { key: "map", icon: "map", label: "Kaart" },
    ...(readOnly ? [] : [{ key: "budget", icon: "wallet", label: "Budget" }]),
  ];
  const isMoreActive = moreMenuItems.some((item) => item.key === tab);

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
            className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full bg-sky-700 text-white hover:bg-sky-800 transition-colors">
            Sluiten
          </button>
        </div>
      )}
      {/* Back button — only on desktop, except for read-only viewers who have no bottom nav */}
      <button onClick={onBack} className={`${readOnly ? "inline-flex" : "hidden sm:inline-flex"} mb-4 items-center gap-1 text-sm font-medium hover:opacity-70 transition-opacity`} style={{ color: legibleOn(accent) }}>
        ← Alle reizen
      </button>

      {/* Header */}
      <div className="rounded-2xl shadow-md overflow-hidden mb-6" style={{ border: `1px solid ${accent}22` }}>
        {trip.cover_image ? (
          <>
            <div className="relative h-48 sm:h-64 w-full overflow-hidden">
              <img src={trip.cover_image} alt={trip.destination || trip.name} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5">
                <div className="flex items-start gap-2 mb-1">
                  {trip.is_owner === false && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-black/30 text-white backdrop-blur-sm">{readOnly ? "Alleen-lezen" : "Gedeeld"}</span>}
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-white drop-shadow-md">
                  {trip.name}
                  {!readOnly && tab !== "journal" && (
                    <button onClick={() => setTab("days")} className="sm:hidden ml-2 align-middle text-sm font-medium text-white/70 hover:text-white transition-colors">
                      · Dagplanning
                    </button>
                  )}
                </h2>
                {trip.destination && <div className="text-white/85 mt-0.5 text-sm flex items-center gap-1"><Icon name="pin" size={13} />{trip.destination}</div>}
                <div className="flex gap-4 mt-1.5 text-sm text-white/70 flex-wrap">
                  {trip.start_date && <span className="flex items-center gap-1"><Icon name="calendar" size={13} /><span className="tnum">{fmt(trip.start_date)} — {fmt(trip.end_date)}</span>{tripDuration(trip.start_date, trip.end_date) ? ` (${tripDuration(trip.start_date, trip.end_date)})` : ""}</span>}
                  {viewTrip.budget && tab !== "journal" && tab !== "photos" && <span className="flex items-center gap-1"><Icon name="wallet" size={13} /><span className="tnum">{fmtMoney(viewTrip.budget, trip.currency)}</span></span>}
                </div>
                {trip.notes && <div className="text-white/60 text-xs mt-1.5">{trip.notes}</div>}
              </div>
            </div>
            {isOwnerActions && tab !== "journal" && tab !== "photos" && (
              <div className="bg-white px-3 py-1.5 border-t border-gray-100 flex justify-end">
                <TripActionsMenu onEdit={() => setEditing(true)} onDelete={handleDelete} />
              </div>
            )}
          </>
        ) : (
          <>
            <div className="relative h-28 w-full flex items-end px-6 pb-4" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }}>
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-black/25" />
              <div className="relative flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {trip.is_owner === false && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-black/25 text-white">{readOnly ? "Alleen-lezen" : "Gedeeld"}</span>}
                </div>
                <h2 className="text-2xl font-bold drop-shadow text-white">
                  {trip.name}
                  {!readOnly && tab !== "journal" && (
                    <button onClick={() => setTab("days")} className="sm:hidden ml-2 align-middle text-sm font-medium text-white/70 hover:text-white transition-colors">
                      · Dagplanning
                    </button>
                  )}
                </h2>
                {trip.destination && <div className="text-sm mt-0.5 flex items-center gap-1 text-white/80"><Icon name="pin" size={13} />{trip.destination}</div>}
              </div>
            </div>
            <div className="bg-white px-4 py-3">
              <div className="text-sm text-gray-500 flex gap-4 flex-wrap items-center justify-between">
                <div className="flex gap-4 flex-wrap">
                  {trip.start_date && <span className="flex items-center gap-1"><Icon name="calendar" size={13} /><span className="tnum">{fmt(trip.start_date)} — {fmt(trip.end_date)}</span>{tripDuration(trip.start_date, trip.end_date) ? ` (${tripDuration(trip.start_date, trip.end_date)})` : ""}</span>}
                  {viewTrip.budget && tab !== "journal" && tab !== "photos" && <span className="flex items-center gap-1"><Icon name="wallet" size={13} /><span className="tnum">{fmtMoney(viewTrip.budget, trip.currency)}</span></span>}
                </div>
                {isOwnerActions && tab !== "journal" && tab !== "photos" && <TripActionsMenu onEdit={() => setEditing(true)} onDelete={handleDelete} />}
              </div>
              {trip.notes && <div className="text-sm text-gray-500 mt-2">{trip.notes}</div>}
            </div>
          </>
        )}
      </div>

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
        return (
          <button onClick={() => setTab("budget")} className="w-full mb-5 bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 text-left hover:shadow-md transition-shadow">
            <div className="flex justify-between items-baseline mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Budget</span>
              <span className={`text-xs font-semibold ${overBudget ? "text-red-500" : "text-gray-600"}`}>
                {fmtMoney(spent, trip.currency)} <span className="text-gray-400 font-normal">/ {fmtMoney(total, trip.currency)}</span>
              </span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex">
              <div style={{ width: `${tPct}%`, background: "#FF7A00" }} className="h-full transition-all" title={`Vervoer: ${fmtMoney(transportTotal, trip.currency)}`} />
              <div style={{ width: `${aPct}%`, background: "#C9702A" }} className="h-full transition-all" title={`Verblijf: ${fmtMoney(accommodationTotal, trip.currency)}`} />
              <div style={{ width: `${acPct}%`, background: "#2E6B4E" }} className="h-full transition-all" title={`Activiteiten: ${fmtMoney(activityTotal, trip.currency)}`} />
              <div style={{ width: `${ePct}%`, background: "#6B3145" }} className="h-full transition-all" title={`Overig: ${fmtMoney(expenseTotal, trip.currency)}`} />
            </div>
            <div className="flex gap-3 mt-2 flex-wrap">
              {transportTotal > 0 && <span className="text-xs text-gray-500 flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{background:"#FF7A00"}} />Vervoer {fmtMoney(transportTotal, trip.currency)}</span>}
              {accommodationTotal > 0 && <span className="text-xs text-gray-500 flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{background:"#C9702A"}} />Verblijf {fmtMoney(accommodationTotal, trip.currency)}</span>}
              {activityTotal > 0 && <span className="text-xs text-gray-500 flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{background:"#2E6B4E"}} />Activiteiten {fmtMoney(activityTotal, trip.currency)}</span>}
              {expenseTotal > 0 && <span className="text-xs text-gray-500 flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{background:"#6B3145"}} />Overig {fmtMoney(expenseTotal, trip.currency)}</span>}
            </div>
          </button>
        );
      })()}

      {readOnly ? (
        <>
          {/* Alleen-lezen bezoekers krijgen geen volledige tabbalk, maar wel
              deze twee: het dagboek dat ze kwamen lezen, en de kaart erbij —
              die stond hiervoor voor hen onbereikbaar achter een tabblad dat
              ze nooit te zien kregen. */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-4 w-fit">
            <button onClick={() => setTab("journal")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-1.5 ${tab === "map" ? "text-gray-500 hover:text-gray-700" : "bg-white shadow"}`}
              style={tab === "map" ? {} : { color: legibleOn(accent) }}>
              <Icon name="book" size={15} />Dagboek
            </button>
            <button onClick={() => setTab("map")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-1.5 ${tab === "map" ? "bg-white shadow" : "text-gray-500 hover:text-gray-700"}`}
              style={tab === "map" ? { color: legibleOn(accent) } : {}}>
              <Icon name="map" size={15} />Kaart
            </button>
          </div>
          {tab === "map"
            ? <TripMapTab trip={trip} accommodations={accommodations} transports={transports} days={days} />
            : <JournalTab trip={viewTrip} days={viewDays} transports={viewTransports} accommodations={viewAccommodations} readOnly={readOnly} currentUserId={currentUserId} onRefresh={load} onPreviewViewer={() => setPreviewViewer(true)} onShare={isOwnerActions ? () => setSharing("viewer") : null} />}
        </>
      ) : (
        <>
          {tab === "days" && <DayPlanningTab trip={viewTrip} days={viewDays} transports={viewTransports} accommodations={viewAccommodations} onRefresh={load} readOnly={readOnly} currentUserId={currentUserId} onShareEditor={isOwnerActions ? () => setSharing("editor") : null} />}
          {tab === "journal" && <JournalTab trip={viewTrip} days={viewDays} transports={viewTransports} accommodations={viewAccommodations} readOnly={readOnly} currentUserId={currentUserId} onRefresh={load} onPreviewViewer={() => setPreviewViewer(true)} onShare={isOwnerActions ? () => setSharing("viewer") : null} />}
          {tab === "photos" && <PhotoGalleryTab trip={viewTrip} days={viewDays} transports={viewTransports} accommodations={viewAccommodations} readOnly={readOnly} />}
          {tab === "accommodation" && <AccommodationTab trip={viewTrip} accommodations={viewAccommodations} onRefresh={load} readOnly={readOnly} currentUserId={currentUserId} />}
          {tab === "transport" && <TransportTab trip={viewTrip} transports={viewTransports} onRefresh={load} readOnly={readOnly} currentUserId={currentUserId} />}
          {tab === "budget" && !readOnly && <BudgetTab trip={viewTrip} expenses={viewExpenses} transports={viewTransports} accommodations={viewAccommodations} days={viewDays} onRefresh={load} />}
          {tab === "map" && <TripMapTab trip={trip} accommodations={accommodations} transports={transports} days={days} />}
          {tab === "packing" && <PackingTab tripId={trip.id} readOnly={readOnly} />}
        </>
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
            {moreMenuItems.map((item) => (
              <button key={item.key} onClick={() => { setTab(item.key); setShowMoreMenu(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-gray-50 transition-colors text-left"
                style={{ color: tab === item.key ? legibleOn(accent) : "#463D38" }}>
                <Icon name={item.icon} size={17} />
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Mobile bottom nav */}
      {!readOnly && (
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-lg" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex">
          {bottomNavItems.map((item) => (
            <button key={item.key} onClick={() => setTab(item.key)}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors min-w-0"
              style={{ color: tab === item.key ? legibleOn(accent) : "#A99C93", minHeight: 68 }}>
              <Icon name={item.icon} size={21} />
              <span className="text-[11px] font-medium leading-none mt-1">{item.label}</span>
              {tab === item.key && <span className="absolute bottom-0 w-8 h-0.5 rounded-full" style={{ background: legibleOn(accent) }} />}
            </button>
          ))}
          <button onClick={() => setShowMoreMenu((v) => !v)}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors min-w-0 relative"
            style={{ color: isMoreActive || showMoreMenu ? legibleOn(accent) : "#A99C93", minHeight: 68 }}>
            <Icon name="more" size={21} />
            <span className="text-[11px] font-medium leading-none mt-1">Meer</span>
            {isMoreActive && <span className="absolute bottom-0 w-8 h-0.5 rounded-full" style={{ background: legibleOn(accent) }} />}
          </button>
        </div>
      </div>
      )}

      {editing && <TripForm initial={trip} onSaved={() => { setEditing(false); load(); onChanged(); }} onClose={() => setEditing(false)} />}
      {importing && <ImportModal tripId={tripId} onImported={load} onClose={() => setImporting(false)} />}
      {sharing && <ShareModal tripId={tripId} role={sharing} onClose={() => setSharing(null)} />}
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

function AdminView({ onBack }) {
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
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === "trips" ? "bg-white shadow text-[#B85800]" : "text-gray-500 hover:text-gray-700"}`}>
            <Icon name="plane" size={15} className="mr-1.5" />Reizen ({trips.length})
          </button>
          <button onClick={() => setTab("users")}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === "users" ? "bg-white shadow text-[#B85800]" : "text-gray-500 hover:text-gray-700"}`}>
            <Icon name="users" size={15} className="mr-1.5" />Gebruikers ({users.length})
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
                      : <div className="w-14 h-14 rounded-lg shrink-0" style={{ background: t.cover_color || "#FF7A00" }} />}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-800">{t.name}</div>
                      {t.destination && <div className="text-sm text-gray-500 flex items-center gap-1"><Icon name="pin" size={13} />{t.destination}</div>}
                      {t.start_date && <div className="text-xs text-gray-400">{fmt(t.start_date)}</div>}
                    </div>
                    <div className="shrink-0">
                      <Select value={t.user_id || ""} onChange={(e) => handleAssign(t.id, e.target.value || null)} className="text-xs">
                        <option value="">— Niet gekoppeld —</option>
                        {users.map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-4">
              {u.avatar
                ? <img src={u.avatar} className="w-10 h-10 rounded-full shrink-0" />
                : <div className="w-10 h-10 rounded-full bg-sky-100 text-[#B85800] flex items-center justify-center font-bold text-sm shrink-0">
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
            </div>
          ))}
          {users.length === 0 && <div className="text-center py-12 text-gray-400">Geen gebruikers gevonden</div>}
        </div>
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
    try { setTrips(await api.getTrips()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    setGuestMode(!user);
    loadTrips();
    const params = new URLSearchParams(location.search);
    const tripId = params.get("trip");
    if (tripId) {
      setView({ name: "detail", id: tripId });
      window.history.replaceState({}, "", "/");
    }
  }, [user, authLoading, loadTrips]);

  async function handleLogout() {
    await fetch("/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  if (authLoading) return (
    <div className="min-h-screen flex items-center justify-center text-gray-400">Laden...</div>
  );

  const tripStats = trips.length > 0 ? `${trips.length} rei${trips.length === 1 ? "s" : "zen"}` : null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky compact header */}
      <header className="sticky top-0 z-40 bg-sky-700 text-white shadow-md" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="max-w-5xl mx-auto px-4 h-12 flex items-center justify-between gap-3">
          <button onClick={() => setView({ name: "list" })} className="flex items-center gap-2.5 leading-none min-w-0">
            <Icon name="plane" size={17} /><span className="truncate font-display text-[19px]">Reisplanner</span>
          </button>
          <div className="flex items-center gap-2 shrink-0">
            {user ? (
              <>
                {user.is_admin && view.name !== "admin" && (
                  <button onClick={() => setView({ name: "admin" })} title="Beheer"
                    className="text-white hover:text-gray-900 px-2 py-1.5 rounded-lg hover:bg-black/15 transition-colors">
                    <Icon name="eye" size={16} />
                  </button>
                )}
                <button onClick={handleLogout} className="text-white hover:text-gray-900 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-white/40 hover:bg-black/15 transition-colors">
                  Uitloggen
                </button>
                <button onClick={() => setShowAccount(true)} title="Account" className="shrink-0">
                  {user.avatar
                    ? <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full ring-2 ring-white/70" />
                    : <div className="w-8 h-8 rounded-full bg-sky-600 flex items-center justify-center font-bold text-sm">{(user.given_name || user.name || "?")[0].toUpperCase()}</div>
                  }
                </button>
              </>
            ) : (
              <>
                <a href="/login" className="text-white hover:text-gray-900 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-white/40 hover:bg-black/15 transition-colors">Inloggen</a>

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
                  <div className="text-2xl font-bold text-gray-800">{greeting(user.given_name || user.name)}</div>
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
              className="fixed bottom-6 right-4 z-50 flex items-center gap-2 px-5 py-4 rounded-2xl text-white font-bold text-base shadow-xl active:scale-95 transition-all"
              style={{ background: "linear-gradient(135deg,#FF7A00,#E8630A)", boxShadow: "0 8px 24px rgba(255,122,0,0.4)", paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
            >
              + Nieuwe reis
            </button>
          </>
        ) : view.name === "admin" ? (
          <AdminView onBack={() => setView({ name: "list" })} />
        ) : (
          <TripDetail tripId={view.id} onBack={() => setView({ name: "list" })} onChanged={loadTrips} currentUserId={user?.id} />
        )}
      </main>

      {showAccount && user && (
        <AccountModal user={user} onClose={() => setShowAccount(false)} onChanged={loadUser} />
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
