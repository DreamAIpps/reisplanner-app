const { useState, useEffect, useCallback, useRef } = React;

// ---------- Error boundary ----------
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-gray-50">
        <div className="bg-white rounded-2xl shadow p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">😕</div>
          <h2 className="text-lg font-bold text-gray-800 mb-2">Er ging iets mis</h2>
          <p className="text-sm text-gray-500 mb-4">{this.state.error.message}</p>
          <button onClick={() => window.location.reload()} className="bg-sky-600 text-white rounded-xl px-6 py-2 text-sm font-medium hover:bg-sky-700">Pagina herladen</button>
        </div>
      </div>
    );
    return this.props.children;
  }
}

// ---------- Constants ----------
const TRANSPORT_TYPES = ["Vliegtuig", "Trein", "Bus", "Huurauto", "Taxi", "Boot", "Anders"];
const EXPENSE_CATEGORIES = ["Vluchten", "Accommodatie", "Vervoer", "Eten & Drinken", "Activiteiten", "Winkelen", "Overig"];
const ACTIVITY_CATEGORIES = ["Bezienswaardigheid", "Restaurant", "Museum", "Natuur", "Sport", "Shopping", "Anders"];
const COVER_COLORS = ["#0369a1","#7c3aed","#b45309","#065f46","#9f1239","#1e40af","#92400e","#134e4a"];

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
function _gw(d) { try { localStorage.setItem(_GK, JSON.stringify(d)); } catch {} }
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
  updatePhoto(id, data) {
    const d = _gr(); let found;
    d.photos = (d.photos || []).map(p => p.id === id ? (found = { ...p, day_id: data.day_id || null, activity_id: data.activity_id || null, transport_id: data.transport_id || null, accommodation_id: data.accommodation_id || null }) : p);
    _gw(d); return Promise.resolve(found);
  },
  getJournal(tripId) {
    return Promise.resolve((_gr().journal_entries || []).filter(e => e.trip_id === tripId));
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
  importEmail() { return Promise.reject(new Error("Log in om e-mailimport te gebruiken")); },
  createInvite() { return Promise.reject(new Error("Log in om reizen te delen")); },
  getAdminTrips() { return Promise.resolve([]); },
  getAdminUsers() { return Promise.resolve([]); },
  assignTrip() { return Promise.resolve(null); },
  suggestPhoto: (destination) => apiFetch(`/api/photo-suggest?destination=${encodeURIComponent(destination)}`),
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
  importEmail: (tripId, text) => _guestMode ? guestApi.importEmail() : apiFetch(`/api/trips/${tripId}/import`, { method: "POST", body: JSON.stringify({ text }) }),
  createInvite: (tripId, role) => _guestMode ? guestApi.createInvite() : apiFetch(`/api/trips/${tripId}/invite`, { method: "POST", body: JSON.stringify({ role }) }),
  getShareStats: (tripId) => _guestMode ? Promise.resolve({ members: [], total_views: 0, views_24h: 0 }) : apiFetch(`/api/trips/${tripId}/share-stats`),
  getAdminTrips: () => _guestMode ? guestApi.getAdminTrips() : apiFetch("/api/admin/trips"),
  getAdminUsers: () => _guestMode ? guestApi.getAdminUsers() : apiFetch("/api/admin/users"),
  assignTrip: (tripId, userId) => _guestMode ? guestApi.assignTrip() : apiFetch(`/api/admin/trips/${tripId}/assign`, { method: "PATCH", body: JSON.stringify({ user_id: userId }) }),
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
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function greeting(name) {
  const h = new Date().getHours();
  const first = name ? name.split(" ")[0] : "";
  const prefix = h < 12 ? "Goedemorgen" : h < 18 ? "Goedemiddag" : "Goedenavond";
  return first ? `${prefix}, ${first} 👋` : prefix;
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
          <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
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
  const base = "inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer";
  const styles = {
    primary: "bg-sky-600 text-white hover:bg-sky-700",
    secondary: "bg-gray-100 text-gray-700 hover:bg-gray-200",
    danger: "bg-red-50 text-red-600 hover:bg-red-100",
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
          className="w-full py-3 px-4 rounded-xl text-base font-bold transition-all shadow-sm whitespace-nowrap"
          style={active === t.key
            ? { background: accentColor || "#0369a1", color: "#fff", boxShadow: `0 4px 14px ${accentColor}55` }
            : { background: "#f1f5f9", color: "#374151" }}
        >
          {t.icon} {t.label}
        </button>
      ))}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {secondary.map((t) => (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`shrink-0 py-2 px-3 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${active === t.key ? "bg-white shadow" : "text-gray-500 hover:text-gray-700"}`}
            style={active === t.key ? { color: accentColor || "#0369a1" } : {}}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- Trip form ----------
const EMPTY_TRIP = { name: "", destination: "", start_date: "", end_date: "", budget: "", currency: "EUR", notes: "", cover_color: "#0369a1", cover_image: "" };

function TripForm({ initial, onSaved, onClose }) {
  const [form, setForm] = useState(initial ? { ...EMPTY_TRIP, ...initial, start_date: initial.start_date ? initial.start_date.slice(0,10) : "", end_date: initial.end_date ? initial.end_date.slice(0,10) : "", cover_image: initial.cover_image || "" } : { ...EMPTY_TRIP });
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
        <div className="grid grid-cols-2 gap-4">
          <Field label="Vertrekdatum"><Input type="date" value={form.start_date} onChange={set("start_date")} /></Field>
          <Field label="Terugkomstdatum"><Input type="date" value={form.end_date} onChange={set("end_date")} /></Field>
        </div>
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
                {photoLoading ? "..." : "🔍 Zoeken"}
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
  const accent = trip.cover_color || "#0369a1";

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
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-white/95 text-sky-700 shadow">
              {until === 0 ? "Vandaag! 🎉" : until === 1 ? "Morgen ✈️" : `${until} dagen`}
            </span>
          )}
          {trip.is_owner === false && <span className="text-xs font-medium px-2 py-1 rounded-full bg-purple-500/80 text-white backdrop-blur-sm ml-auto">{trip.role === "viewer" ? "👀 Alleen-lezen" : "Gedeeld"}</span>}
        </div>
        {/* Title */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 className="font-bold text-white text-lg leading-tight drop-shadow-sm">{trip.name}</h3>
          {trip.destination && <div className="text-sm text-white/80 mt-0.5">📍 {trip.destination}</div>}
        </div>
      </div>

      <div className="px-4 py-3">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <div className="font-medium">{trip.start_date ? `${fmt(trip.start_date)}${dur ? ` · ${dur}` : ""}` : "Datum onbekend"}</div>
          <div className="flex gap-3 items-center">
            {trip.activity_count > 0 && <span>🗓 {trip.activity_count}</span>}
            {trip.budget && <span>💰 {fmtMoney(trip.budget, trip.currency)}</span>}
          </div>
        </div>
        {until !== null && until > 0 && (
          <div className="mt-2 text-xs font-semibold rounded-lg px-2 py-1.5 text-center" style={{ background: accent + "18", color: accent }}>
            Nog {until} dag{until === 1 ? "" : "en"} tot vertrek ✈️
          </div>
        )}
        {until === 0 && (
          <div className="mt-2 text-xs font-semibold text-green-700 bg-green-50 rounded-lg px-2 py-1.5 text-center">
            Vandaag vertrek! 🎉
          </div>
        )}
        {until !== null && until < 0 && trip.end_date && new Date(trip.end_date) >= new Date() && (
          <div className="mt-2 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-lg px-2 py-1.5 text-center">
            Onderweg — dag {Math.abs(until) + 1} 🌍
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Activity form ----------
function ActivityForm({ dayId, tripId, initial, onSaved, onClose, onImport, onDelete, photos, onPhotosChange, journalEntries, onJournalChange, currentUserId, readOnly }) {
  const [form, setForm] = useState(initial || { time: "", title: "", location: "", notes: "", category: "Bezienswaardigheid", cost: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true); setError(null);
    try {
      const saved = initial?.id
        ? await api.updateActivity(initial.id, form)
        : await api.addActivity(dayId, { ...form, trip_id: tripId });
      onSaved(saved);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }
  return (
    <Modal title={initial?.id ? "Activiteit bewerken" : "Activiteit toevoegen"} onClose={onClose}>
      {!initial && onImport && (
        <>
          <button type="button" onClick={onImport}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold text-sm shadow transition-all active:scale-95 mb-3">
            📧 Importeren uit bevestiging
          </button>
          <div className="relative my-3">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
            <div className="relative text-center"><span className="bg-white px-3 text-xs text-gray-400">of handmatig invullen</span></div>
          </div>
        </>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
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
        {initial?.id && (
          <Field label="Dagboek">
            <JournalEntryBox entries={journalEntries || []} currentUserId={currentUserId} placeholder={`Vertel over ${form.title || "deze activiteit"}...`}
              onSave={(text) => api.saveJournalEntry(tripId, { activity_id: initial.id, body: text }).then(onJournalChange)}
              onDelete={(id) => api.deleteJournalEntry(id).then(onJournalChange)}
              photos={(photos || []).filter((p) => p.activity_id === initial.id)}
              photoCandidates={(photos || []).filter((p) => p.activity_id !== initial.id)}
              tripId={tripId} dayId={dayId} activityId={initial.id} onPhotosChange={onPhotosChange} readOnly={readOnly} />
          </Field>
        )}
        <div className="flex justify-between items-center pt-2">
          {onDelete && !readOnly ? (
            <button type="button" onClick={onDelete}
              className="text-sm text-red-500 hover:text-red-700 px-2 py-1">
              🗑 Verwijderen
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
function AccommodationForm({ tripId, initial, onSaved, onClose, onImport, journalEntries, onJournalChange, currentUserId, photos, onPhotosChange, readOnly }) {
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
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold text-sm shadow transition-all active:scale-95 mb-3">
            📧 Importeren uit bevestiging
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
              photoCandidates={(photos || []).filter((p) => p.accommodation_id !== initial.id)}
              tripId={tripId} accommodationId={initial.id} onPhotosChange={onPhotosChange} readOnly={readOnly} />
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
function TransportForm({ tripId, initial, onSaved, onClose, onImport, journalEntries, onJournalChange, currentUserId, photos, onPhotosChange, readOnly }) {
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
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold text-sm shadow transition-all active:scale-95 mb-3">
            📧 Importeren uit bevestiging
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
              photoCandidates={(photos || []).filter((p) => p.transport_id !== initial.id)}
              tripId={tripId} transportId={initial.id} onPhotosChange={onPhotosChange} readOnly={readOnly} />
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

function PhotoStrip({ photos, tripId, dayId, activityId, transportId, accommodationId, onChange, readOnly }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [viewingIndex, setViewingIndex] = useState(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const touchStart = useRef(null);
  const viewing = viewingIndex != null ? photos[viewingIndex] : null;

  function showNext() { setViewingIndex((i) => (i + 1) % photos.length); }
  function showPrev() { setViewingIndex((i) => (i - 1 + photos.length) % photos.length); }

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
  function handleTouchEnd(e) {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    const wasHorizontal = touchStart.current.locked === "x";
    touchStart.current = null;
    if (wasHorizontal && Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy)) {
      // Completed swipe: cut straight to the new photo — stay "dragging" this
      // tick so the transition is suppressed and nothing animates backwards.
      if (dx < 0) showNext(); else showPrev();
      setDragX(0);
    } else {
      // Cancelled: ease back to center.
      setDragging(false);
      setDragX(0);
    }
  }

  useEffect(() => {
    if (viewingIndex == null) return;
    function handleKey(e) {
      if (e.key === "ArrowRight") showNext();
      else if (e.key === "ArrowLeft") showPrev();
      else if (e.key === "Escape") setViewingIndex(null);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [viewingIndex, photos.length]);

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
    try {
      for (const file of files) {
        if (file.size > MAX_PHOTO_BYTES) { alert(`"${file.name}" is te groot (max 8 MB)`); continue; }
        const [dataUrl, exif] = await Promise.all([readAsDataUrl(file), readExif(file)]);
        const base64 = dataUrl.split(",")[1];
        await api.addPhoto(tripId, {
          day_id: dayId || null, activity_id: activityId || null, transport_id: transportId || null, accommodation_id: accommodationId || null,
          image: { data: base64, mediaType: file.type },
          taken_at: exif.taken_at || null, latitude: exif.latitude ?? null, longitude: exif.longitude ?? null,
        });
      }
      onChange();
    } catch (err) { alert(err.message || "Uploaden mislukt"); }
    finally { setUploading(false); }
  }

  async function handleDelete(id) {
    if (!confirm("Foto verwijderen?")) return;
    await api.deletePhoto(id);
    onChange();
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1" onClick={(e) => e.stopPropagation()}>
      {photos.map((p, i) => (
        <div key={p.id} className="relative shrink-0 group">
          <img src={p.url} alt="" onClick={() => setViewingIndex(i)}
            className="w-24 h-24 rounded-lg object-cover cursor-pointer border border-gray-100" />
          {p.latitude != null && p.longitude != null && (
            <span className="absolute bottom-0.5 left-0.5 text-xs leading-none bg-black/50 text-white rounded px-1 py-0.5">📍</span>
          )}
          {!readOnly && (
            <button type="button" onClick={() => handleDelete(p.id)}
              className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-white shadow text-red-500 text-sm leading-none opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity flex items-center justify-center">
              ×
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()}
          className="shrink-0 w-24 h-24 rounded-lg border-2 border-dashed border-gray-200 hover:border-gray-300 flex items-center justify-center text-gray-400 hover:text-gray-500 text-2xl transition-colors">
          {uploading ? "…" : "＋"}
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
      {viewing && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.8)" }} onClick={() => setViewingIndex(null)}>
          <div className="max-w-full max-h-full flex flex-col items-center gap-2 relative"
            onClick={(e) => e.stopPropagation()} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
            {photos.length > 1 && (
              <>
                <button type="button" onClick={showPrev}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 text-white text-xl flex items-center justify-center hover:bg-black/70 transition-colors z-10">
                  ‹
                </button>
                <button type="button" onClick={showNext}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 text-white text-xl flex items-center justify-center hover:bg-black/70 transition-colors z-10">
                  ›
                </button>
              </>
            )}
            <img src={viewing.url} alt="" className="max-w-full max-h-[75vh] rounded-lg select-none" draggable={false}
              style={{ transform: `translateX(${dragX}px)`, transition: dragging ? "none" : "transform 200ms ease-out", touchAction: "pan-y" }} />
            {photos.length > 1 && (
              <div className="text-white/70 text-xs">{viewingIndex + 1} / {photos.length}</div>
            )}
            {viewing.taken_at && (
              <div className="flex items-center gap-3 text-white text-xs bg-black/40 rounded-lg px-3 py-1.5">
                <span>🕐 {fmtDatetime(viewing.taken_at)}</span>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ---------- Link an existing trip photo to an activity/transport/accommodation ----------
function ExistingPhotoPicker({ candidates, onAssign }) {
  const [open, setOpen] = useState(false);
  const [assigning, setAssigning] = useState(null);
  if (!candidates.length) return null;

  async function handlePick(photo) {
    setAssigning(photo.id);
    try { await onAssign(photo); setOpen(false); }
    finally { setAssigning(null); }
  }

  return (
    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="text-xs font-medium text-sky-600 hover:text-sky-700 transition-colors">
        {open ? "Sluiten" : "+ Bestaande foto koppelen"}
      </button>
      {open && (
        <div className="flex gap-2 overflow-x-auto pt-2 pb-1">
          {candidates.map((p) => (
            <button key={p.id} type="button" disabled={assigning === p.id} onClick={() => handlePick(p)}
              className="shrink-0 w-24 h-24 rounded-lg overflow-hidden border border-gray-100 hover:ring-2 hover:ring-sky-400 transition-all disabled:opacity-50">
              <img src={p.url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
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
            {processing ? "Foto's verwerken..." : "📷 Klik om foto's te kiezen"}
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
                  <div className="w-20 h-20 rounded-lg bg-red-50 flex items-center justify-center text-red-400 text-xl shrink-0">⚠</div>
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
                <button type="button" onClick={() => removeItem(it.key)} className="text-gray-300 hover:text-red-400 text-sm p-1 shrink-0">🗑</button>
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
const CATEGORY_ICONS = { Bezienswaardigheid: "🏛", Restaurant: "🍽", Museum: "🖼", Natuur: "🌿", Sport: "⚽", Shopping: "🛍", Anders: "📌" };
const CATEGORY_COLORS = { Bezienswaardigheid: "#7c3aed", Restaurant: "#b45309", Museum: "#0369a1", Natuur: "#065f46", Sport: "#9f1239", Shopping: "#1e40af", Anders: "#374151" };
const DAY_NAMES = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const MONTH_NAMES = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function DayPlanningTab({ trip, days, transports, accommodations, onRefresh, readOnly, currentUserId }) {
  const [showActivityForm, setShowActivityForm] = useState(null);
  const [editingActivity, setEditingActivity] = useState(null);
  const [editingTransport, setEditingTransport] = useState(null);
  const [importing, setImporting] = useState(false);
  const [editingAccommodation, setEditingAccommodation] = useState(null);
  const [addingDay, setAddingDay] = useState(false);
  const [newDayDate, setNewDayDate] = useState("");
  const [locationPhotos, setLocationPhotos] = useState({});
  const [tripPhotos, setTripPhotos] = useState([]);
  const [tripJournal, setTripJournal] = useState([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [tipsLocation, setTipsLocation] = useState(null);
  const fetchedRef = useRef(new Set());
  const accent = trip.cover_color || "#0369a1";

  const loadPhotos = useCallback(async () => {
    try { setTripPhotos(await api.getPhotos(trip.id)); } catch {}
  }, [trip.id]);
  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  const loadJournal = useCallback(async () => {
    try { setTripJournal(await api.getJournal(trip.id)); } catch {}
  }, [trip.id]);
  useEffect(() => { loadJournal(); }, [loadJournal]);

  useEffect(() => {
    const locs = new Set();
    days.forEach((day) => (day.activities || []).forEach((a) => { if (a.location) locs.add(a.location); }));
    [...locs].slice(0, 10).forEach(async (loc) => {
      if (fetchedRef.current.has(loc)) return;
      fetchedRef.current.add(loc);
      try {
        const d = await api.suggestPhoto(loc);
        setLocationPhotos((p) => ({ ...p, [loc]: d.thumb }));
      } catch {}
    });
  }, [days]);

  async function handleDeleteActivity(id) {
    if (!confirm("Activiteit verwijderen?")) return;
    await api.deleteActivity(id); onRefresh();
  }
  async function handleAddDay(e) {
    e.preventDefault();
    if (!newDayDate) return;
    await api.addDay(trip.id, { date: newDayDate });
    setAddingDay(false); setNewDayDate(""); onRefresh();
  }
  async function handleDeleteDay(id) {
    if (!confirm("Dag verwijderen (inclusief activiteiten)?")) return;
    await api.deleteDay(id); onRefresh();
  }

  const isoDate = (dt) => dt ? String(dt).slice(0, 10) : null;
  const todayDay = days.find((d) => isoDate(d.date) === todayIso());

  function scrollToToday() {
    if (!todayDay) return;
    document.getElementById(`day-${todayDay.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6 gap-2 flex-wrap">
        <h3 className="font-semibold text-gray-700">Dagplanning</h3>
        <div className="flex gap-2">
          {todayDay && <Button onClick={scrollToToday} variant="secondary">📍 Vandaag</Button>}
          {!readOnly && <Button onClick={() => setBulkUploading(true)} variant="secondary">📷 Foto's uploaden</Button>}
          {!readOnly && <Button onClick={() => setAddingDay(true)} variant="secondary">+ Dag toevoegen</Button>}
        </div>
      </div>

      {addingDay && (
        <form onSubmit={handleAddDay} className="rounded-xl p-4 mb-6 flex gap-3 items-end border" style={{ background: accent + "10", borderColor: accent + "33" }}>
          <Field label="Datum">
            <Input type="date" value={newDayDate} onChange={(e) => setNewDayDate(e.target.value)} required />
          </Field>
          <Button type="submit">Toevoegen</Button>
          <Button type="button" variant="secondary" onClick={() => setAddingDay(false)}>Annuleren</Button>
        </form>
      )}

      {days.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-3">🗓</div>
          <div className="font-medium">Nog geen dagen gepland</div>
          <div className="text-sm mt-1">Voeg een dag toe om te beginnen</div>
        </div>
      )}

      {tripPhotos.some((p) => !p.day_id && !p.activity_id && !p.transport_id && !p.accommodation_id) && (
        <div className="mb-6">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Overige foto's (geen dag gekoppeld)</h4>
          <PhotoStrip photos={tripPhotos.filter((p) => !p.day_id && !p.activity_id && !p.transport_id && !p.accommodation_id)} tripId={trip.id} onChange={loadPhotos} readOnly={readOnly} />
        </div>
      )}

      {/* Timeline */}
      <div className="relative">
        {days.length > 1 && (
          <div className="absolute top-6 bottom-6 w-0.5 rounded-full" style={{ left: "2.6rem", background: `linear-gradient(to bottom, ${accent}, ${accent}33)` }} />
        )}

        <div className="space-y-2">
          {days.map((day, dayIndex) => {
            const dayStr = day.date ? day.date.slice(0, 10) : null;
            const dayTransports = transports.filter((t) => isoDate(t.departure_time) === dayStr || isoDate(t.arrival_time) === dayStr);
            const dayAccommodations = accommodations.filter((a) => isoDate(a.check_in) === dayStr || isoDate(a.check_out) === dayStr);

            const d = day.date ? new Date(day.date) : null;
            const dayNum = d ? d.getDate() : "?";
            const dayName = d ? DAY_NAMES[d.getDay()] : "";
            const monthName = d ? MONTH_NAMES[d.getMonth()] : "";
            const totalItems = dayTransports.length + dayAccommodations.length + day.activities.length;
            const nightAccommodation = dayStr ? accommodations.find(a => {
              if (!a.check_in || !a.check_out) return false;
              return isoDate(a.check_in) <= dayStr && isoDate(a.check_out) > dayStr;
            }) : null;

            const isToday = dayStr === todayIso();

            return (
              <div key={day.id} id={`day-${day.id}`} className="relative flex gap-4 pb-6" style={{ scrollMarginTop: "5rem" }}>
                {/* Day node */}
                <div className="flex flex-col items-center shrink-0 z-10" style={{ width: "5.2rem" }}>
                  <div className="w-12 h-12 rounded-2xl flex flex-col items-center justify-center text-white shadow-md font-bold"
                    style={{ background: accent, boxShadow: isToday ? `0 0 0 3px white, 0 0 0 5px ${accent}` : undefined }}>
                    <span className="text-[10px] leading-none opacity-75 uppercase tracking-wide">{dayName}</span>
                    <span className="text-lg leading-none font-extrabold">{dayNum}</span>
                    <span className="text-[10px] leading-none opacity-75">{monthName}</span>
                  </div>
                  {dayIndex === 0 && days.length > 1 && (
                    <span className="text-[10px] text-gray-400 mt-1 font-medium">Dag 1</span>
                  )}
                </div>

                {/* Day content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2 pt-1.5">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        {isToday && (
                          <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded text-white" style={{ background: accent }}>
                            Vandaag
                          </span>
                        )}
                        {day.title && <span className="font-semibold text-gray-700 text-sm">{day.title}</span>}
                        {totalItems === 0 && <span className="text-xs text-gray-400 italic">Leeg</span>}
                      </div>
                      {nightAccommodation && (
                        <span className="text-xs text-amber-700 flex items-center gap-1">
                          <span>🏨</span>
                          <span className="truncate max-w-[180px]">{nightAccommodation.address || nightAccommodation.name}</span>
                        </span>
                      )}
                    </div>
                    {!readOnly && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => setShowActivityForm({ dayId: day.id })}
                          className="text-xs font-medium px-2.5 py-1 rounded-lg hover:opacity-80 transition-opacity text-white"
                          style={{ background: accent }}>
                          + Activiteit
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
                          className="flex items-center gap-2 rounded-xl px-3 py-2.5 border cursor-pointer hover:shadow-md transition-shadow"
                          style={{ background: "#eff6ff", borderColor: "#bfdbfe" }}>
                          <div className="text-xl shrink-0">{TRANSPORT_ICONS[t.type] || "🚀"}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold uppercase tracking-wide shrink-0" style={{ color: "#1d4ed8" }}>
                                {isArrival ? "Aankomst" : "Vertrek"}
                              </span>
                              {time && <span className="text-xs font-mono font-semibold" style={{ color: "#3b82f6" }}>
                                {new Date(time).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}
                              </span>}
                              {t.booking_ref && <span className="font-mono bg-blue-100 text-blue-600 px-1 py-0.5 rounded text-xs hidden sm:inline">#{t.booking_ref}</span>}
                              {t.cost && <span className="font-medium text-blue-700 text-xs ml-auto shrink-0">{fmtMoney(t.cost, trip.currency)}</span>}
                            </div>
                            <div className="text-sm font-medium text-gray-700 truncate">{t.from_location} → {t.to_location}</div>
                            {t.booking_ref && <div className="text-xs text-gray-400 font-mono sm:hidden">#{t.booking_ref}</div>}
                            {t.baggage_allowance && <div className="text-xs text-blue-600 truncate">🧳 {t.baggage_allowance}</div>}
                          </div>
                          {t.to_location && (
                            <button onClick={(e) => { e.stopPropagation(); setTipsLocation(t.to_location); }}
                              className="shrink-0 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                              title="Lokale tips">
                              <span className="hidden sm:flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 whitespace-nowrap">💡 Lokale tips</span>
                              <span className="sm:hidden flex items-center justify-center w-8 h-8 text-base">💡</span>
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
                          className="rounded-xl border cursor-pointer hover:shadow-md transition-shadow"
                          style={{ background: "#fffbeb", borderColor: "#fde68a" }}>
                          <div className="flex items-center gap-2 px-3 py-2.5">
                            <div className="text-xl shrink-0">🏨</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold uppercase tracking-wide shrink-0" style={{ color: "#b45309" }}>
                                  {isCheckIn && isCheckOut ? "Check-in & uit" : isCheckIn ? "Check-in" : "Check-out"}
                                </span>
                                {a.cost && <span className="text-xs font-medium text-amber-700 ml-auto shrink-0">{fmtMoney(a.cost, trip.currency)}</span>}
                              </div>
                              <div className="text-sm font-medium text-gray-800 truncate">{a.name}</div>
                              {a.address && <div className="text-xs text-gray-400 truncate">📍 {a.address}</div>}
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); setTipsLocation(a.address || a.name); }}
                              className="shrink-0 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
                              title="Lokale tips">
                              <span className="hidden sm:flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 whitespace-nowrap">🗺 Lokale tips</span>
                              <span className="sm:hidden flex items-center justify-center w-8 h-8 text-base">🗺</span>
                            </button>
                          </div>
                          <div className="px-3 pb-2.5" onClick={(e) => e.stopPropagation()}>
                            <HotelAiTip accommodationId={a.id} />
                          </div>
                        </div>
                      );
                    })}

                    {/* Activity cards */}
                    {day.activities.map((act) => {
                      const actPhotos = tripPhotos.filter((p) => p.activity_id === act.id);
                      const photo = actPhotos[0]?.url || (act.location ? locationPhotos[act.location] : null);
                      const catColor = CATEGORY_COLORS[act.category] || "#374151";
                      return (
                        <div key={act.id}
                          onClick={() => setEditingActivity(act)}
                          className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden group hover:shadow-md transition-shadow cursor-pointer">
                          {photo && (
                            <div className="h-32 overflow-hidden relative">
                              <img src={photo} alt={act.location} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                              {act.location && (
                                <div className="absolute bottom-2 left-3 text-white text-xs font-medium drop-shadow">📍 {act.location}</div>
                              )}
                              {actPhotos.length > 0 && (
                                <div className="absolute top-2 right-2 bg-black/50 text-white text-xs font-medium px-1.5 py-0.5 rounded-md flex items-center gap-1">
                                  📷 {actPhotos.length}
                                </div>
                              )}
                            </div>
                          )}
                          <div className="flex items-start gap-3 px-4 py-3">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0 mt-0.5"
                              style={{ background: catColor + "18" }}>
                              {CATEGORY_ICONS[act.category] || "📌"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                {act.time && (
                                  <span className="text-xs font-mono font-semibold text-white px-2 py-0.5 rounded-md" style={{ background: catColor }}>
                                    {act.time}
                                  </span>
                                )}
                                <span className="font-semibold text-gray-800 text-sm">{act.title}</span>
                              </div>
                              {!photo && act.location && <div className="text-xs text-gray-400 mt-0.5">📍 {act.location}</div>}
                              {act.notes && <div className="text-xs text-gray-500 mt-1 leading-relaxed">{act.notes}</div>}
                              {act.cost && <div className="text-xs font-semibold mt-1" style={{ color: catColor }}>{fmtMoney(act.cost, trip.currency)}</div>}
                            </div>
                            {!readOnly && (
                              <div className="flex gap-1 shrink-0">
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteActivity(act.id); }} className="text-gray-300 hover:text-red-400 active:text-red-500 text-sm p-1">🗑</button>
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

                    {/* Day photos (not linked to a specific activity) */}
                    <div onClick={(e) => e.stopPropagation()}>
                      <PhotoStrip
                        photos={tripPhotos.filter((p) => p.day_id === day.id && !p.activity_id)}
                        tripId={trip.id} dayId={day.id} onChange={loadPhotos} readOnly={readOnly} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {bulkUploading && (
        <BulkPhotoUpload tripId={trip.id} days={days}
          onClose={() => setBulkUploading(false)}
          onUploaded={loadPhotos} />
      )}
      {showActivityForm && (
        <ActivityForm dayId={showActivityForm.dayId} tripId={trip.id}
          onSaved={() => { setShowActivityForm(null); onRefresh(); }}
          onClose={() => setShowActivityForm(null)}
          onImport={() => { setShowActivityForm(null); setImporting(true); }} />
      )}
      {editingActivity && (
        <ActivityForm dayId={editingActivity.day_id} tripId={trip.id} initial={editingActivity}
          photos={tripPhotos} onPhotosChange={loadPhotos}
          journalEntries={tripJournal.filter((e) => e.activity_id === editingActivity.id)} onJournalChange={loadJournal} currentUserId={currentUserId}
          onSaved={() => { setEditingActivity(null); onRefresh(); }}
          onClose={() => setEditingActivity(null)}
          onDelete={async () => { if (!confirm("Activiteit verwijderen?")) return; await api.deleteActivity(editingActivity.id); setEditingActivity(null); onRefresh(); }} />
      )}
      {editingTransport && (
        <TransportForm tripId={trip.id} initial={editingTransport}
          onSaved={() => { setEditingTransport(null); onRefresh(); }}
          onClose={() => setEditingTransport(null)} />
      )}
      {editingAccommodation && (
        <AccommodationForm tripId={trip.id} initial={editingAccommodation}
          onSaved={() => { setEditingAccommodation(null); onRefresh(); }}
          onClose={() => setEditingAccommodation(null)} />
      )}
      {importing && <ImportModal tripId={trip.id} onImported={() => { setImporting(false); onRefresh(); }} onClose={() => setImporting(false)} />}
      {tipsLocation && (
        <TipsModal tripId={trip.id} trip={trip} location={tipsLocation} onClose={() => setTipsLocation(null)} />
      )}
    </div>
  );
}

// ---------- Journal (dagboek) ----------
function JournalEntryBox({ entries, currentUserId, placeholder, onSave, onDelete, photos, photoCandidates, tripId, dayId, activityId, transportId, accommodationId, onPhotosChange, readOnly }) {
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

  function handleAssignExisting(photo) {
    return api.updatePhoto(photo.id, {
      day_id: dayId || null, activity_id: activityId || null, transport_id: transportId || null, accommodation_id: accommodationId || null,
    }).then(onPhotosChange);
  }

  return (
    <div className="space-y-2">
      {othersEntries.map((e) => (
        <div key={e.id} className="bg-gray-50 rounded-lg px-3 py-2">
          <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{e.body}</p>
          {e.author && <div className="text-xs text-gray-400 mt-1">— {e.author}</div>}
        </div>
      ))}

      {editing ? (
        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
          <Textarea rows={4} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} />
          <div className="flex items-center gap-2">
            <Button onClick={handleSave} disabled={saving || !text.trim()}>{saving ? "Opslaan..." : "Opslaan"}</Button>
            <Button variant="secondary" onClick={() => { setText(myEntry?.body || ""); setEditing(false); }}>Annuleren</Button>
            {myEntry && <button type="button" onClick={handleDelete} className="ml-auto text-xs text-red-500 hover:text-red-700">🗑 Verwijderen</button>}
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
                ✏️ Bewerken
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

      {tripId != null && (photos?.length > 0 || !readOnly) && (
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          <PhotoStrip photos={photos || []} tripId={tripId} dayId={dayId} activityId={activityId} transportId={transportId} accommodationId={accommodationId} onChange={onPhotosChange} readOnly={readOnly} />
          {!readOnly && <ExistingPhotoPicker candidates={photoCandidates || []} onAssign={handleAssignExisting} />}
        </div>
      )}
    </div>
  );
}

function JournalTab({ trip, days, transports, accommodations, readOnly, currentUserId }) {
  const [entries, setEntries] = useState([]);
  const [tripPhotos, setTripPhotos] = useState([]);
  const accent = trip.cover_color || "#0369a1";

  const loadEntries = useCallback(async () => {
    try { setEntries(await api.getJournal(trip.id)); } catch {}
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

  const todayDay = days.find((d) => isoDate(d.date) === todayIso());
  function scrollToToday() {
    if (!todayDay) return;
    document.getElementById(`journal-day-${todayDay.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (days.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <div className="text-5xl mb-3">📖</div>
        <div className="font-medium">Nog geen dagen gepland</div>
        <div className="text-sm mt-1">Voeg dagen toe op de Dagplanning-tab om je dagboek te beginnen</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-2 flex-wrap">
        <h3 className="font-semibold text-gray-700">Dagboek</h3>
        {todayDay && <Button onClick={scrollToToday} variant="secondary">📍 Vandaag</Button>}
      </div>
      <div className="space-y-4">
        {days.map((day) => {
          const dayStr = day.date ? day.date.slice(0, 10) : null;
          const dayTransports = transports.filter((t) => isoDate(t.departure_time) === dayStr || isoDate(t.arrival_time) === dayStr);
          const dayAccommodations = accommodations.filter((a) => isoDate(a.check_in) === dayStr || isoDate(a.check_out) === dayStr);
          const dayEntries = entries.filter((e) => e.day_id === day.id);
          const d = day.date ? new Date(day.date) : null;
          const dayNum = d ? d.getDate() : "?";
          const dayName = d ? DAY_NAMES[d.getDay()] : "";
          const monthName = d ? MONTH_NAMES[d.getMonth()] : "";
          const hasSubItems = day.activities.length > 0 || dayTransports.length > 0 || dayAccommodations.length > 0;
          const isToday = dayStr === todayIso();

          return (
            <div key={day.id} id={`journal-day-${day.id}`} className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white" style={{ scrollMarginTop: "5rem" }}>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50" style={{ background: accent + "0d" }}>
                <div className="w-10 h-10 rounded-xl flex flex-col items-center justify-center text-white shadow-sm font-bold shrink-0"
                  style={{ background: accent, boxShadow: isToday ? `0 0 0 2px white, 0 0 0 4px ${accent}` : undefined }}>
                  <span className="text-[9px] leading-none opacity-75 uppercase">{dayName}</span>
                  <span className="text-sm leading-none font-extrabold">{dayNum}</span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {isToday && (
                      <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded text-white shrink-0" style={{ background: accent }}>
                        Vandaag
                      </span>
                    )}
                    <div className="font-semibold text-gray-700 text-sm truncate">{day.title || `${dayName} ${dayNum} ${monthName}`}</div>
                  </div>
                  {day.title && <div className="text-xs text-gray-400">{dayName} {dayNum} {monthName}</div>}
                </div>
              </div>

              <div className="p-4 space-y-4">
                <JournalEntryBox entries={dayEntries} currentUserId={currentUserId} placeholder="Hoe was deze dag?"
                  onSave={(text) => saveEntry({ day_id: day.id }, text)}
                  onDelete={deleteEntry}
                  photos={tripPhotos.filter((p) => p.day_id === day.id && !p.activity_id && !p.transport_id && !p.accommodation_id)}
                  photoCandidates={tripPhotos.filter((p) => !(p.day_id === day.id && !p.activity_id && !p.transport_id && !p.accommodation_id))}
                  tripId={trip.id} dayId={day.id} onPhotosChange={loadPhotos} readOnly={readOnly} />

                {hasSubItems && (
                  <div className="pt-3 space-y-3 border-t border-gray-50">
                    {dayTransports.map((t) => {
                      const tEntries = entries.filter((e) => e.transport_id === t.id);
                      return (
                        <div key={"t" + t.id} className="pl-3 border-l-2" style={{ borderColor: "#bfdbfe" }}>
                          <div className="text-xs font-semibold text-blue-700 mb-1">{TRANSPORT_ICONS[t.type] || "🚀"} {t.from_location} → {t.to_location}</div>
                          <JournalEntryBox entries={tEntries} currentUserId={currentUserId} placeholder="Vertel over deze reis..."
                            onSave={(text) => saveEntry({ transport_id: t.id }, text)}
                            onDelete={deleteEntry}
                            photos={tripPhotos.filter((p) => p.transport_id === t.id)}
                            photoCandidates={tripPhotos.filter((p) => p.transport_id !== t.id)}
                            tripId={trip.id} transportId={t.id} onPhotosChange={loadPhotos} readOnly={readOnly} />
                        </div>
                      );
                    })}
                    {dayAccommodations.map((a) => {
                      const aEntries = entries.filter((e) => e.accommodation_id === a.id);
                      return (
                        <div key={"a" + a.id} className="pl-3 border-l-2" style={{ borderColor: "#fde68a" }}>
                          <div className="text-xs font-semibold text-amber-700 mb-1">🏨 {a.name}</div>
                          <JournalEntryBox entries={aEntries} currentUserId={currentUserId} placeholder="Vertel over dit verblijf..."
                            onSave={(text) => saveEntry({ accommodation_id: a.id }, text)}
                            onDelete={deleteEntry}
                            photos={tripPhotos.filter((p) => p.accommodation_id === a.id)}
                            photoCandidates={tripPhotos.filter((p) => p.accommodation_id !== a.id)}
                            tripId={trip.id} accommodationId={a.id} onPhotosChange={loadPhotos} readOnly={readOnly} />
                        </div>
                      );
                    })}
                    {day.activities.map((act) => {
                      const actEntries = entries.filter((e) => e.activity_id === act.id);
                      const catColor = CATEGORY_COLORS[act.category] || "#374151";
                      return (
                        <div key={"act" + act.id} className="pl-3 border-l-2" style={{ borderColor: catColor + "55" }}>
                          <div className="text-xs font-semibold mb-1" style={{ color: catColor }}>{CATEGORY_ICONS[act.category] || "📌"} {act.title}</div>
                          <JournalEntryBox entries={actEntries} currentUserId={currentUserId} placeholder={`Vertel over ${act.title}...`}
                            onSave={(text) => saveEntry({ activity_id: act.id }, text)}
                            onDelete={deleteEntry}
                            photos={tripPhotos.filter((p) => p.activity_id === act.id)}
                            photoCandidates={tripPhotos.filter((p) => p.activity_id !== act.id)}
                            tripId={trip.id} dayId={day.id} activityId={act.id} onPhotosChange={loadPhotos} readOnly={readOnly} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
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
    try { setJournal(await api.getJournal(trip.id)); } catch {}
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
        <h3 className="font-semibold text-gray-700">Accommodaties</h3>
        {!readOnly && <Button onClick={() => setShowForm(true)} variant="secondary">+ Verblijf toevoegen</Button>}
      </div>

      {accommodations.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-2">🏨</div>
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
                <div className="text-2xl">🏨</div>
                <div className="flex-1">
                  <div className="font-semibold text-gray-800">{acc.name}</div>
                  {acc.address && <div className="text-sm text-gray-500">📍 {acc.address}</div>}
                  <div className="flex gap-4 mt-1 text-sm text-gray-500 flex-wrap">
                    {acc.check_in && <span>Check-in: {fmt(acc.check_in)}</span>}
                    {acc.check_out && <span>Check-out: {fmt(acc.check_out)}</span>}
                    {acc.booking_ref && <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">#{acc.booking_ref}</span>}
                  </div>
                  {acc.cost && (
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-sky-700 font-medium text-sm">{fmtMoney(acc.cost, trip.currency)}</span>
                      {perNight && nights && (
                        <span className="text-xs text-gray-400">· {nights} {nights === 1 ? "nacht" : "nachten"} · <span className="text-gray-500 font-medium">{fmtMoney(perNight, trip.currency)}/nacht</span></span>
                      )}
                    </div>
                  )}
                  {acc.notes && <div className="text-sm text-gray-500 mt-1">{acc.notes}</div>}
                </div>
                <div className={readOnly ? "flex gap-1" : "opacity-0 group-hover:opacity-100 flex gap-1"}>
                  <button onClick={() => setEditing(acc)} className="text-gray-400 hover:text-sky-600">{readOnly ? "👁" : "✏️"}</button>
                  {!readOnly && <button onClick={() => handleDelete(acc.id)} className="text-gray-400 hover:text-red-500">🗑</button>}
                </div>
              </div>
              <div className="mt-2 ml-10">
                <HotelAiTip accommodationId={acc.id} />
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
          photos={tripPhotos} onPhotosChange={loadPhotos} readOnly={readOnly}
          onSaved={() => { setEditing(null); onRefresh(); }} onClose={() => setEditing(null)} />
      )}
      {importing && <ImportModal tripId={trip.id} onImported={() => { setImporting(false); onRefresh(); }} onClose={() => setImporting(false)} />}
    </div>
  );
}

// ---------- Transport tab ----------
const TRANSPORT_ICONS = { Vliegtuig: "✈️", Trein: "🚆", Bus: "🚌", Huurauto: "🚗", Taxi: "🚕", Boot: "⛴️", Anders: "🚀" };

function TransportTab({ trip, transports, onRefresh, readOnly, currentUserId }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState(false);
  const [journal, setJournal] = useState([]);
  const [tripPhotos, setTripPhotos] = useState([]);

  const loadJournal = useCallback(async () => {
    try { setJournal(await api.getJournal(trip.id)); } catch {}
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
        <h3 className="font-semibold text-gray-700">Vervoer</h3>
        {!readOnly && <Button onClick={() => setShowForm(true)} variant="secondary">+ Vervoer toevoegen</Button>}
      </div>

      {transports.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-2">✈️</div>
          <div>Nog geen vervoer toegevoegd</div>
        </div>
      ) : (
        <div className="space-y-3">
          {transports.map((t) => (
            <div key={t.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 group">
              <div className="flex items-start gap-3">
                <div className="text-2xl">{TRANSPORT_ICONS[t.type] || "🚀"}</div>
                <div className="flex-1">
                  <div className="font-semibold text-gray-800">{t.type}: {t.from_location} → {t.to_location}</div>
                  <div className="flex gap-4 mt-1 text-sm text-gray-500 flex-wrap">
                    {t.departure_time && <span>Vertrek: {fmtDatetime(t.departure_time)}</span>}
                    {t.arrival_time && <span>Aankomst: {fmtDatetime(t.arrival_time)}</span>}
                    {t.booking_ref && <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">#{t.booking_ref}</span>}
                    {t.cost && <span className="text-sky-700 font-medium">{fmtMoney(t.cost)}</span>}
                  </div>
                  {t.baggage_allowance && <div className="text-sm text-blue-600 mt-1">🧳 {t.baggage_allowance}</div>}
                  {t.notes && <div className="text-sm text-gray-500 mt-1">{t.notes}</div>}
                </div>
                <div className={readOnly ? "flex gap-1" : "opacity-0 group-hover:opacity-100 flex gap-1"}>
                  <button onClick={() => setEditing(t)} className="text-gray-400 hover:text-sky-600">{readOnly ? "👁" : "✏️"}</button>
                  {!readOnly && <button onClick={() => handleDelete(t.id)} className="text-gray-400 hover:text-red-500">🗑</button>}
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
          photos={tripPhotos} onPhotosChange={loadPhotos} readOnly={readOnly}
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
        <h3 className="font-semibold text-gray-700">Budget & uitgaven</h3>
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
            <div className={`text-lg font-bold ${pct > 90 ? "text-red-500" : pct > 70 ? "text-yellow-500" : "text-green-600"}`}>
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
          <div className="text-4xl mb-2">💰</div>
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
                  <button onClick={() => setEditing(exp)} className="text-gray-400 hover:text-sky-600 text-xs">✏️</button>
                  <button onClick={() => handleDelete(exp.id)} className="text-gray-400 hover:text-red-500 text-xs">🗑</button>
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
            <span className="font-semibold text-gray-700 text-sm">✈️ Vervoer</span>
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
            <span className="font-semibold text-gray-700 text-sm">🏨 Verblijf</span>
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
            <span className="font-semibold text-gray-700 text-sm">🗓 Activiteiten</span>
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
  { category: "Lokaal vervoer", icon: "🚇" },
  { category: "Taxi & apps", icon: "🚕" },
  { category: "Restaurants", icon: "🍽" },
  { category: "Activiteiten", icon: "🎯" },
  { category: "Met kinderen", icon: "👨‍👩‍👧" },
  { category: "Evenementen & agenda", icon: "🎉" },
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
                    <span className="w-1.5 h-1.5 rounded-full mt-2 shrink-0" style={{ background: accentColor }} />
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

// ---------- Hotel AI Tip ----------
function HotelAiTip({ accommodationId }) {
  const [tip, setTip] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const cacheKey = `hotel_ai_tip_${accommodationId}`;

  function load() {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) { const { data, ts } = JSON.parse(cached); if (Date.now() - ts < 24*60*60*1000) { setTip(data); return; } }
    } catch {}
    setLoading(true);
    apiFetch(`/api/accommodations/${accommodationId}/ai-tip`)
      .then((d) => { setTip(d); try { localStorage.setItem(cacheKey, JSON.stringify({ data: d, ts: Date.now() })); } catch {} })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  function handleClick(e) {
    e.stopPropagation();
    if (!open) { setOpen(true); if (!tip) load(); }
    else setOpen(false);
  }

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <button onClick={handleClick}
        className="text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors shrink-0 whitespace-nowrap"
        style={{ background: open ? "#fef3c7" : "#fef9c3", color: "#b45309" }}>
        🏨 Hotel tips {open ? "▴" : "▾"}
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm">
          {loading ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-3 bg-amber-200 rounded w-3/4" />
              <div className="h-3 bg-amber-100 rounded w-full" />
            </div>
          ) : tip ? (
            <div className="space-y-2">
              {tip.location_tip && (
                <div className="text-gray-700 leading-relaxed text-sm">
                  📍 {tip.location_tip}
                  {tip.location_url && <a href={tip.location_url} target="_blank" rel="noopener noreferrer" className="ml-1.5 text-sky-600 underline text-xs whitespace-nowrap">↗ bekijk</a>}
                </div>
              )}
              {tip.alternatives?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-amber-700 mt-2 mb-1">Vergelijkbare hotels:</div>
                  {tip.alternatives.map((alt, i) => (
                    <div key={i} className="text-gray-600 text-xs leading-relaxed mb-1">
                      • <span className="font-medium">{alt.name}</span> — {alt.reason}
                      {alt.url && <a href={alt.url} target="_blank" rel="noopener noreferrer" className="ml-1.5 text-sky-600 underline whitespace-nowrap">↗ boeken</a>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-gray-400">Tip kon niet worden geladen.</div>
          )}
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
            <div className="text-xs font-bold uppercase tracking-wide text-sky-700 mb-1">Wist je dat?</div>
            <div className="text-sm text-gray-700 leading-relaxed">{didYouKnow}</div>
          </div>
        ) : null}
        <div className="text-xs text-gray-400 text-center pb-1">Klik op een categorie om tips te laden</div>
        {TIP_CATEGORIES.map(({ category, icon }) => (
          <TipAccordion key={category} tripId={tripId} category={category} icon={icon}
            accentColor="#0369a1" location={location} cacheKeyPrefix={cacheKeyPrefix} />
        ))}
      </div>
    </Modal>
  );
}

// ---------- Tips tab ----------
function TipsTab({ trip }) {
  const [didYouKnow, setDidYouKnow] = useState(null);
  const [dykLoading, setDykLoading] = useState(true);
  const accent = trip.cover_color || "#0369a1";
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
      <div className="text-4xl mb-3">💡</div>
      <div className="font-medium">Geen bestemming ingesteld</div>
      <div className="text-sm mt-1">Voeg een bestemming toe aan je reis voor AI-tips</div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-700">Tips voor {trip.destination}</h3>
        <span className="text-xs text-gray-400">✨ Gegenereerd door Claude</span>
      </div>

      {dykLoading ? (
        <div className="rounded-xl p-4 mb-4 border animate-pulse" style={{ background: accent + "10", borderColor: accent + "30" }}>
          <div className="h-3 w-20 rounded mb-2" style={{ background: accent + "40" }} />
          <div className="h-4 w-full rounded" style={{ background: accent + "20" }} />
        </div>
      ) : didYouKnow ? (
        <div className="rounded-xl p-4 mb-4 border" style={{ background: accent + "10", borderColor: accent + "30" }}>
          <div className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: accent }}>Wist je dat?</div>
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

// ---------- Kaart tab ----------
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
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
      }).addTo(map);

      const bounds = [];

      // Draw transport lines first (below markers)
      transportPairs.forEach((pair) => {
        const fromGeo = coordMap[pair.from];
        const toGeo = coordMap[pair.to];
        if (!fromGeo || !toGeo) return;
        const isAir = (pair.type || "").toLowerCase().includes("vlieg") || (pair.type || "").toLowerCase().includes("fly") || (pair.type || "").toLowerCase().includes("air") || !pair.type;
        if (isAir) {
          // Great-circle arc approximation
          const steps = 40;
          const latlngs = [];
          for (let s = 0; s <= steps; s++) {
            const t2 = s / steps;
            const lat = fromGeo.lat + (toGeo.lat - fromGeo.lat) * t2;
            const lon = fromGeo.lon + (toGeo.lon - fromGeo.lon) * t2;
            // Bulge perpendicular to route (northward arc)
            const bulge = Math.sin(Math.PI * t2) * (Math.abs(toGeo.lat - fromGeo.lat) + Math.abs(toGeo.lon - fromGeo.lon)) * 0.08;
            latlngs.push([lat + bulge, lon]);
          }
          L.polyline(latlngs, { color: "#0369a1", weight: 2.5, opacity: 0.7, dashArray: "8 5" }).addTo(map);
        } else {
          L.polyline([[fromGeo.lat, fromGeo.lon], [toGeo.lat, toGeo.lon]], { color: "#059669", weight: 2, opacity: 0.6 }).addTo(map);
        }
      });

      // Add markers
      const iconSvg = (emoji, color) => L.divIcon({
        className: "leaflet-reisplanner-icon",
        html: `<div style="background:${color};border:2.5px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);width:34px;height:34px;box-shadow:0 2px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center"><span style="transform:rotate(45deg);font-size:15px;line-height:1;display:block">${emoji}</span></div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 34],
        popupAnchor: [0, -36],
      });

      const typeConfig = {
        hotel: { emoji: "🏨", color: "#b45309" },
        activity: { emoji: "🎯", color: "#0369a1" },
        transport: { emoji: "✈️", color: "#6d28d9" },
      };

      // Deduplicate markers by query
      const seen = new Set();
      validItems.forEach((item) => {
        if (seen.has(item.query)) return;
        seen.add(item.query);
        const geo = coordMap[item.query];
        const cfg = typeConfig[item.type] || typeConfig.activity;
        const marker = L.marker([geo.lat, geo.lon], { icon: iconSvg(cfg.emoji, cfg.color) }).addTo(map);
        const popup = `<div style="font-family:system-ui;min-width:140px">
          <div style="font-weight:600;font-size:13px;color:#1f2937">${item.label}</div>
          ${item.sublabel && item.sublabel !== item.label ? `<div style="font-size:11px;color:#6b7280;margin-top:2px">${item.sublabel}</div>` : ""}
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
      <div className="text-4xl mb-3">🗺</div>
      <div className="font-medium">Geen locaties om te tonen</div>
      <div className="text-sm mt-1">Voeg hotels, activiteiten of vervoer toe met locatiegegevens</div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-700">Reiskaart</h3>
        <div className="flex gap-3 text-xs text-gray-500">
          <span>🏨 Hotel</span>
          <span>🎯 Activiteit</span>
          <span>✈️ Vervoer</span>
        </div>
      </div>
      <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm relative" style={{ height: 480 }}>
        {status === "loading" && (
          <div className="absolute inset-0 bg-white/90 z-[1000] flex flex-col items-center justify-center gap-3">
            <div className="text-3xl animate-pulse">🗺</div>
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
              <div className="text-3xl mb-2">😕</div>
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

// ---------- Import modal ----------
function ImportModal({ tripId, onImported, onClose }) {
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
              <li key={c.id} className="text-sm bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-gray-700">
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
    <Modal title="Bevestiging importeren" onClose={onClose} wide>
      {!result ? (
        <form onSubmit={handleAnalyze} className="space-y-4">
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            <button type="button" onClick={() => setMode("text")}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${mode === "text" ? "bg-white shadow text-sky-700" : "text-gray-500 hover:text-gray-700"}`}>
              📋 Tekst plakken
            </button>
            <button type="button" onClick={() => setMode("image")}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${mode === "image" ? "bg-white shadow text-sky-700" : "text-gray-500 hover:text-gray-700"}`}>
              📷 Foto uploaden
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
                  <div className="text-4xl mb-2">📷</div>
                  <div className="text-sm font-medium text-gray-600">Klik om een foto of screenshot te kiezen</div>
                  <div className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP — max 10 MB</div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>Annuleren</Button>
            <Button type="submit" disabled={loading || (mode === "text" ? !text.trim() : !imageData)}>
              {loading ? "Toevoegen..." : "✨ Toevoegen"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-5">
          {totalFound === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <div className="text-4xl mb-2">🤔</div>
              <div>Niets gevonden in deze tekst.</div>
              <div className="text-sm mt-1">Probeer het met een andere bevestiging.</div>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500">{totalFound} item{totalFound !== 1 ? "s" : ""} gevonden. Voeg toe aan je reis:</p>

              {result.transports.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-700 mb-2">✈️ Vervoer ({result.transports.length})</h3>
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
                          ? <span className="text-green-600 text-sm shrink-0">✓ Toegevoegd</span>
                          : <Button variant="secondary" onClick={() => saveTransport(t, i)} disabled={saving}>Toevoegen</Button>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.accommodations.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-700 mb-2">🏨 Verblijf ({result.accommodations.length})</h3>
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
                          {a.address && <div className="text-xs text-gray-500 mt-1">📍 {a.address}</div>}
                          {a.notes && <div className="text-xs text-gray-500 mt-1">{a.notes}</div>}
                        </div>
                        {saved.accommodations.includes(i)
                          ? <span className="text-green-600 text-sm shrink-0">✓ Toegevoegd</span>
                          : <Button variant="secondary" onClick={() => saveAccommodation(a, i)} disabled={saving}>Toevoegen</Button>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.activities.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-700 mb-2">🗓 Activiteiten ({result.activities.length})</h3>
                  <div className="space-y-2">
                    {result.activities.map((act, i) => (
                      <div key={i} className={`bg-gray-50 rounded-xl p-4 ${saved.activities.includes(i) ? "opacity-50" : ""}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="font-medium text-gray-800">{act.title}</div>
                            <div className="text-sm text-gray-500 mt-0.5 flex gap-3 flex-wrap">
                              {act.date && <span>📅 {fmt(act.date)}</span>}
                              {act.time && <span>🕐 {act.time}</span>}
                              {act.location && <span>📍 {act.location}</span>}
                              {act.cost != null && <span>{fmtMoney(act.cost)}</span>}
                            </div>
                            {act.notes && <div className="text-xs text-gray-500 mt-1">{act.notes}</div>}
                          </div>
                          {saved.activities.includes(i)
                            ? <span className="text-green-600 text-sm shrink-0">✓ Toegevoegd</span>
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
function ShareModal({ tripId, onClose }) {
  const [role, setRole] = useState("viewer");
  const [link, setLink] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState(null);

  function generateLink(r) {
    setRole(r); setLink(null); setLoading(true);
    api.createInvite(tripId, r)
      .then((d) => setLink(d.link))
      .finally(() => setLoading(false));
  }

  useEffect(() => { generateLink("viewer"); }, [tripId]);

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
    <Modal title="Reis delen" onClose={onClose} wide>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Type toegang</label>
          <div className="flex gap-2">
            <button type="button" onClick={() => generateLink("viewer")}
              className="flex-1 rounded-xl border-2 px-3 py-2.5 text-left transition-colors"
              style={role === "viewer" ? { borderColor: "#0369a1", background: "#0369a10d" } : { borderColor: "#e5e7eb" }}>
              <div className="text-sm font-semibold text-gray-800">👀 Alleen-lezen</div>
              <div className="text-xs text-gray-500 mt-0.5">Voor familie & vrienden — geen budget/kosten zichtbaar, kan niets wijzigen</div>
            </button>
            <button type="button" onClick={() => generateLink("editor")}
              className="flex-1 rounded-xl border-2 px-3 py-2.5 text-left transition-colors"
              style={role === "editor" ? { borderColor: "#0369a1", background: "#0369a10d" } : { borderColor: "#e5e7eb" }}>
              <div className="text-sm font-semibold text-gray-800">✏️ Bewerker</div>
              <div className="text-xs text-gray-500 mt-0.5">Voor medereizigers — volledige toegang, kan alles zien en aanpassen</div>
            </button>
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
                {copied ? "✓ Gekopieerd" : "Kopiëren"}
              </Button>
            </div>
            <a
              href={`mailto:?subject=${encodeURIComponent("Uitnodiging: bekijk onze reis")}&body=${encodeURIComponent(`Hoi!\n\nIk wil deze reis met je delen via Reisplanner.\n\nKlik op de link hieronder om toegang te krijgen:\n${link}\n\nTot snel!`)}`}
              className="flex items-center justify-center gap-2 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              ✉️ Verstuur via Mail
            </a>
          </>
        )}
        <p className="text-xs text-gray-400">De link blijft geldig totdat je hem verwijdert.</p>

        {stats && (stats.members.length > 0) && (
          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Wie heeft de reis bekeken</label>
              <div className="flex gap-3 text-xs text-gray-500">
                <span><b className="text-gray-700">{stats.total_views}</b> keer bekeken</span>
                <span><b className="text-gray-700">{stats.views_24h}</b> in 24u</span>
              </div>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {stats.members.map((m) => (
                <div key={m.id} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg bg-gray-50">
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
                      {m.role === "viewer" ? "👀 Alleen-lezen" : "✏️ Bewerker"}
                      {m.view_count > 0 && ` · ${m.view_count}x bekeken`}
                      {m.last_viewed_at && ` · laatst ${fmtDatetime(m.last_viewed_at)}`}
                    </div>
                  </div>
                </div>
              ))}
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
      if (act) return { icon: CATEGORY_ICONS[act.category] || "📌", text: act.title };
    }
    return { icon: "📌", text: "Activiteit" };
  }
  if (photo.transport_id) {
    const t = transports.find((t) => t.id === photo.transport_id);
    return { icon: TRANSPORT_ICONS[t?.type] || "🚀", text: t ? `${t.from_location} → ${t.to_location}` : "Vervoer" };
  }
  if (photo.accommodation_id) {
    const a = accommodations.find((a) => a.id === photo.accommodation_id);
    return { icon: "🏨", text: a ? a.name : "Verblijf" };
  }
  if (photo.day_id) {
    const day = days.find((d) => d.id === photo.day_id);
    return { icon: "📅", text: day ? dayOptionLabel(day) : "Dag" };
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

function PhotoGalleryTab({ trip, days, transports, accommodations, readOnly }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewingIndex, setViewingIndex] = useState(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const touchStart = useRef(null);

  const loadPhotos = useCallback(async () => {
    try { setPhotos(await api.getPhotos(trip.id)); } catch {} finally { setLoading(false); }
  }, [trip.id]);
  useEffect(() => { loadPhotos(); }, [loadPhotos]);

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

  const todayGroup = dayGroups.find((g) => isoDate(g.day.date) === todayIso());
  const todayPhoto = todayGroup && photos.find((p) => {
    if (p.day_id === todayGroup.day.id) return true;
    if (p.activity_id && (todayGroup.day.activities || []).some((a) => a.id === p.activity_id)) return true;
    if (p.transport_id && todayGroup.transports.some((t) => t.id === p.transport_id)) return true;
    if (p.accommodation_id && todayGroup.accommodations.some((a) => a.id === p.accommodation_id)) return true;
    if (isoDate(p.taken_at) === todayIso()) return true;
    return false;
  });
  function scrollToToday() {
    if (!todayPhoto) return;
    document.getElementById(`gallery-photo-${todayPhoto.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const viewing = viewingIndex != null ? photos[viewingIndex] : null;
  function showNext() { setViewingIndex((i) => (i + 1) % photos.length); }
  function showPrev() { setViewingIndex((i) => (i - 1 + photos.length) % photos.length); }

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
      setDragging(false);
      setDragX(0);
    }
  }

  useEffect(() => {
    if (viewingIndex == null) return;
    function handleKey(e) {
      if (e.key === "ArrowRight") showNext();
      else if (e.key === "ArrowLeft") showPrev();
      else if (e.key === "Escape") setViewingIndex(null);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [viewingIndex, photos.length]);

  async function handleAssign(photo, value) {
    const payload = { day_id: null, activity_id: null, transport_id: null, accommodation_id: null };
    if (value) {
      const [type, idStr] = value.split(":");
      const id = Number(idStr);
      if (type === "day") payload.day_id = id;
      else if (type === "activity") {
        payload.activity_id = id;
        const day = days.find((d) => (d.activities || []).some((a) => a.id === id));
        if (day) payload.day_id = day.id;
      } else if (type === "transport") payload.transport_id = id;
      else if (type === "accommodation") payload.accommodation_id = id;
    }
    const updated = await api.updatePhoto(photo.id, payload);
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
        <h3 className="font-semibold text-gray-700">Foto's{photos.length > 0 ? ` (${photos.length})` : ""}</h3>
        {todayPhoto && <Button onClick={scrollToToday} variant="secondary">📍 Vandaag</Button>}
      </div>

      {photos.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-3">📷</div>
          <div className="font-medium">Nog geen foto's</div>
          <div className="text-sm mt-1">Upload foto's via een dag, activiteit, vervoer of verblijf</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {photos.map((p, i) => {
            const assignment = photoAssignmentInfo(p, days, transports, accommodations);
            return (
              <button key={p.id} id={`gallery-photo-${p.id}`} onClick={() => setViewingIndex(i)}
                className="relative aspect-square rounded-lg overflow-hidden border border-gray-100 group"
                style={{ scrollMarginTop: "5rem", boxShadow: p.id === todayPhoto?.id ? "0 0 0 3px #0369a1" : undefined }}>
                <img src={p.url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                {assignment ? (
                  <div className="absolute bottom-1.5 left-1.5 right-1.5 text-white text-xs font-medium truncate flex items-center gap-1">
                    <span className="shrink-0">{assignment.icon}</span><span className="truncate">{assignment.text}</span>
                  </div>
                ) : (
                  <div className="absolute bottom-1.5 left-1.5 right-1.5 text-amber-200 text-xs font-semibold">Niet toegewezen</div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {viewing && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 overflow-y-auto" style={{ background: "rgba(0,0,0,0.85)" }} onClick={() => setViewingIndex(null)}>
          <div className="max-w-full flex flex-col items-center gap-3 relative py-8"
            onClick={(e) => e.stopPropagation()} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
            {photos.length > 1 && (
              <>
                <button type="button" onClick={showPrev}
                  className="absolute left-2 top-40 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 text-white text-xl flex items-center justify-center hover:bg-black/70 transition-colors z-10">
                  ‹
                </button>
                <button type="button" onClick={showNext}
                  className="absolute right-2 top-40 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 text-white text-xl flex items-center justify-center hover:bg-black/70 transition-colors z-10">
                  ›
                </button>
              </>
            )}
            <img src={viewing.url} alt="" className="max-w-full max-h-[50vh] rounded-lg select-none" draggable={false}
              style={{ transform: `translateX(${dragX}px)`, transition: dragging ? "none" : "transform 200ms ease-out", touchAction: "pan-y" }} />
            {photos.length > 1 && <div className="text-white/70 text-xs">{viewingIndex + 1} / {photos.length}</div>}
            {viewing.taken_at && (
              <div className="flex items-center gap-3 text-white text-xs bg-black/40 rounded-lg px-3 py-1.5">
                <span>🕐 {fmtDatetime(viewing.taken_at)}</span>
              </div>
            )}
            {readOnly ? (
              (() => {
                const info = photoAssignmentInfo(viewing, days, transports, accommodations);
                return info ? (
                  <div className="bg-white rounded-xl px-3 py-2 text-sm text-gray-600 flex items-center gap-1.5">
                    <span>{info.icon}</span><span>{info.text}</span>
                  </div>
                ) : null;
              })()
            ) : (
              <div className="bg-white rounded-xl p-3 w-full max-w-sm space-y-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Toegewezen aan</label>
                <Select value={photoTargetValue(viewing)} onChange={(e) => handleAssign(viewing, e.target.value)}>
                  <option value="">— Niet toegewezen —</option>
                  {dayGroups.map(({ day, transports: dayT, accommodations: dayA }) => (
                    <optgroup key={day.id} label={dayOptionLabel(day)}>
                      <option value={`day:${day.id}`}>Hele dag</option>
                      {dayT.map((t) => (
                        <option key={"t" + t.id} value={`transport:${t.id}`}>{TRANSPORT_ICONS[t.type] || "🚀"} {t.from_location} → {t.to_location}</option>
                      ))}
                      {dayA.map((a) => (
                        <option key={"a" + a.id} value={`accommodation:${a.id}`}>🏨 {a.name}</option>
                      ))}
                      {(day.activities || []).map((act) => (
                        <option key={act.id} value={`activity:${act.id}`}>{CATEGORY_ICONS[act.category] || "📌"} {act.title}</option>
                      ))}
                    </optgroup>
                  ))}
                  {(otherTransports.length > 0 || otherAccommodations.length > 0) && (
                    <optgroup label="Overig (geen datum gekoppeld)">
                      {otherTransports.map((t) => (
                        <option key={"t" + t.id} value={`transport:${t.id}`}>{TRANSPORT_ICONS[t.type] || "🚀"} {t.from_location} → {t.to_location}</option>
                      ))}
                      {otherAccommodations.map((a) => (
                        <option key={"a" + a.id} value={`accommodation:${a.id}`}>🏨 {a.name}</option>
                      ))}
                    </optgroup>
                  )}
                </Select>
                <button type="button" onClick={() => handleDelete(viewing)} className="text-xs text-red-500 hover:text-red-700 font-medium">
                  🗑 Foto verwijderen
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ---------- Packing tab ----------
const PACKING_CATEGORIES = ["📄 Documenten", "👕 Kleding", "🔌 Elektronica", "🧴 Toilettas", "💊 Medicijnen", "🎒 Overig"];
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
  const [newCategory, setNewCategory] = useState(PACKING_CATEGORIES[0]);
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
    acc[cat] = items.filter(p => p.category === cat);
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
            {PACKING_CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <input value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="Item toevoegen..."
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-400 min-w-0" />
          <button type="submit" className="bg-sky-600 text-white rounded-lg px-3 py-2 text-sm font-medium hover:bg-sky-700 shrink-0">+</button>
        </form>
      )}

      {/* Categories */}
      {PACKING_CATEGORIES.map(cat => {
        const catItems = grouped[cat] || [];
        const catChecked = catItems.filter(p => p.checked).length;
        const isOpen = openCategory === cat;
        const suggestions = (PACKING_SUGGESTIONS[cat] || []).filter(s => !catItems.some(p => p.item === s));
        return (
          <div key={cat} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <button onClick={() => setOpenCategory(isOpen ? null : cat)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-800 text-sm">{cat}</span>
                {catItems.length > 0 && (
                  <span className="text-xs text-gray-400">{catChecked}/{catItems.length}</span>
                )}
              </div>
              <span className="text-gray-400 text-xs">{isOpen ? "▲" : "▼"}</span>
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
                          className="text-gray-300 hover:text-red-400 active:text-red-500 text-sm p-1 opacity-0 group-hover:opacity-100 transition-opacity">🗑</button>
                      )}
                    </div>
                  ))}
                </div>
                {!readOnly && suggestions.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-50">
                    <p className="text-xs text-gray-400 mb-1.5">Suggesties:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.slice(0, 6).map(s => (
                        <button key={s} onClick={() => handleSuggest(cat, s)}
                          className="text-xs px-2 py-1 rounded-full border border-gray-200 text-gray-600 hover:bg-sky-50 hover:border-sky-300 hover:text-sky-700 transition-colors">
                          + {s}
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
          <div className="text-4xl mb-2">🎒</div>
          <div className="text-sm">Nog niets op de paklijst</div>
          <div className="text-xs mt-1">Voeg items toe of kies suggesties per categorie</div>
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
  const [sharing, setSharing] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  useEffect(() => {
    if (!showMoreMenu) return;
    const h = (e) => e.key === "Escape" && setShowMoreMenu(false);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [showMoreMenu]);

  const load = useCallback(async () => {
    const [t, d, a, tr, ex] = await Promise.all([
      api.getTrip(tripId),
      api.getDays(tripId),
      api.getAccommodations(tripId),
      api.getTransports(tripId),
      api.getExpenses(tripId),
    ]);
    setTrip(t); setDays(d); setAccommodations(a); setTransports(tr); setExpenses(ex);
  }, [tripId]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete() {
    if (!confirm(`"${trip.name}" definitief verwijderen?`)) return;
    await api.deleteTrip(tripId);
    onBack(); onChanged();
  }

  if (!trip) return <div className="text-center py-16 text-gray-400">Laden...</div>;

  const accent = trip.cover_color || "#0369a1";
  const readOnly = trip.role === "viewer";

  const tabs = [
    { key: "days", label: "Dagplanning", icon: "🗓", primary: true },
    ...(currentUserId ? [{ key: "journal", label: "Dagboek", icon: "📖" }] : []),
    { key: "photos", label: "Foto's", icon: "📷" },
    { key: "accommodation", label: "Verblijf", icon: "🏨" },
    { key: "transport", label: "Vervoer", icon: "✈️" },
    { key: "packing", label: "Paklijst", icon: "🎒" },
  ];

  // Bottom nav tabs for mobile
  const bottomNavItems = [
    { key: "days", icon: "🗓", label: "Planning" },
    ...(currentUserId ? [{ key: "journal", icon: "📖", label: "Dagboek" }] : []),
    { key: "photos", icon: "📷", label: "Foto's" },
    ...(readOnly ? [] : [{ key: "budget", icon: "💰", label: "Budget" }]),
  ];
  // Reachable only via the "Meer" dropdown on mobile
  const moreMenuItems = [
    { key: "accommodation", icon: "🏨", label: "Verblijf" },
    { key: "transport", icon: "✈️", label: "Vervoer" },
    { key: "packing", icon: "🎒", label: "Paklijst" },
  ];
  const isMoreActive = moreMenuItems.some((item) => item.key === tab);

  return (
    <div className="pb-2">
      {/* Back button — only on desktop */}
      <button onClick={onBack} className="hidden sm:inline-flex mb-4 items-center gap-1 text-sm font-medium hover:opacity-70 transition-opacity" style={{ color: accent }}>
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
                  {trip.is_owner === false && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-500/70 text-white backdrop-blur-sm">{readOnly ? "👀 Alleen-lezen" : "Gedeeld"}</span>}
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-white drop-shadow-md">{trip.name}</h2>
                {trip.destination && <div className="text-white/85 mt-0.5 text-sm">📍 {trip.destination}</div>}
                <div className="flex gap-4 mt-1.5 text-sm text-white/70 flex-wrap">
                  {trip.start_date && <span>📅 {fmt(trip.start_date)} — {fmt(trip.end_date)}{tripDuration(trip.start_date, trip.end_date) ? ` (${tripDuration(trip.start_date, trip.end_date)})` : ""}</span>}
                  {trip.budget && <span>💰 {fmtMoney(trip.budget, trip.currency)}</span>}
                </div>
                {trip.notes && <div className="text-white/60 text-xs mt-1.5">{trip.notes}</div>}
              </div>
            </div>
            <div className="bg-white px-3 py-2.5 border-t border-gray-100">
              {!readOnly && tab !== "journal" && (
                <button onClick={() => setImporting(true)} className="w-full mb-2 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm transition-all active:scale-95" style={{ background: accent }}>
                  📧 Planning toevoegen
                </button>
              )}
              <div className="flex gap-2 overflow-x-auto">
                {trip.is_owner && <Button variant="secondary" onClick={() => setSharing(true)} className="shrink-0 !text-xs !px-3 !py-1.5">🔗 Delen</Button>}
                {trip.is_owner && <Button variant="secondary" onClick={() => setEditing(true)} className="shrink-0 !text-xs !px-3 !py-1.5">✏️ Bewerken</Button>}
                {trip.is_owner && <Button variant="danger" onClick={handleDelete} className="shrink-0 !text-xs !px-3 !py-1.5">🗑 Verwijderen</Button>}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="relative h-28 w-full flex items-end px-6 pb-4" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }}>
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-black/25" />
              <div className="relative flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {trip.is_owner === false && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-400/60 text-white">{readOnly ? "👀 Alleen-lezen" : "Gedeeld"}</span>}
                </div>
                <h2 className="text-2xl font-bold text-white drop-shadow">{trip.name}</h2>
                {trip.destination && <div className="text-white/80 text-sm mt-0.5">📍 {trip.destination}</div>}
              </div>
            </div>
            <div className="bg-white px-4 py-3">
              <div className="text-sm text-gray-500 flex gap-4 flex-wrap mb-3">
                {trip.start_date && <span>📅 {fmt(trip.start_date)} — {fmt(trip.end_date)}{tripDuration(trip.start_date, trip.end_date) ? ` (${tripDuration(trip.start_date, trip.end_date)})` : ""}</span>}
                {trip.budget && <span>💰 {fmtMoney(trip.budget, trip.currency)}</span>}
              </div>
              {!readOnly && tab !== "journal" && (
                <button onClick={() => setImporting(true)} className="w-full mb-3 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-base font-semibold text-white shadow transition-all hover:opacity-90 active:scale-95" style={{ background: accent }}>
                  📧 Planning toevoegen
                </button>
              )}
              <div className="flex gap-2 overflow-x-auto pb-1">
                {trip.is_owner && <Button variant="secondary" onClick={() => setSharing(true)} className="shrink-0">🔗 Delen</Button>}
                {trip.is_owner && <Button variant="secondary" onClick={() => setEditing(true)} className="shrink-0">✏️ Bewerken</Button>}
                {trip.is_owner && <Button variant="danger" onClick={handleDelete} className="shrink-0">🗑 Verwijderen</Button>}
              </div>
              {trip.notes && <div className="text-sm text-gray-500 mt-2">{trip.notes}</div>}
            </div>
          </>
        )}
      </div>

      {/* Desktop tabs / mobile: alleen de grote Dagplanning knop */}
      <div className="hidden sm:block">
        <Tabs tabs={tabs} active={tab} onChange={setTab} accentColor={accent} />
      </div>
      <div className="sm:hidden mb-4">
        <button onClick={() => setTab("days")}
          className="w-full py-3.5 px-4 rounded-xl text-base font-bold transition-all shadow-sm"
          style={tab === "days"
            ? { background: accent, color: "#fff", boxShadow: `0 4px 14px ${accent}55` }
            : { background: "#f1f5f9", color: "#374151" }}>
          🗓 Dagplanning
        </button>
      </div>

      {/* Budget balk */}
      {trip.budget && (() => {
        const transportTotal = transports.reduce((s, t) => s + Number(t.cost || 0), 0);
        const accommodationTotal = accommodations.reduce((s, a) => s + Number(a.cost || 0), 0);
        const activityTotal = days.reduce((s, d) => s + (d.activities || []).reduce((s2, a) => s2 + Number(a.cost || 0), 0), 0);
        const expenseTotal = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
        const total = Number(trip.budget);
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
              <div style={{ width: `${tPct}%`, background: "#0369a1" }} className="h-full transition-all" title={`Vervoer: ${fmtMoney(transportTotal, trip.currency)}`} />
              <div style={{ width: `${aPct}%`, background: "#b45309" }} className="h-full transition-all" title={`Verblijf: ${fmtMoney(accommodationTotal, trip.currency)}`} />
              <div style={{ width: `${acPct}%`, background: "#059669" }} className="h-full transition-all" title={`Activiteiten: ${fmtMoney(activityTotal, trip.currency)}`} />
              <div style={{ width: `${ePct}%`, background: "#7c3aed" }} className="h-full transition-all" title={`Overig: ${fmtMoney(expenseTotal, trip.currency)}`} />
            </div>
            <div className="flex gap-3 mt-2 flex-wrap">
              {transportTotal > 0 && <span className="text-xs text-gray-500 flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{background:"#0369a1"}} />Vervoer {fmtMoney(transportTotal, trip.currency)}</span>}
              {accommodationTotal > 0 && <span className="text-xs text-gray-500 flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{background:"#b45309"}} />Verblijf {fmtMoney(accommodationTotal, trip.currency)}</span>}
              {activityTotal > 0 && <span className="text-xs text-gray-500 flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{background:"#059669"}} />Activiteiten {fmtMoney(activityTotal, trip.currency)}</span>}
              {expenseTotal > 0 && <span className="text-xs text-gray-500 flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{background:"#7c3aed"}} />Overig {fmtMoney(expenseTotal, trip.currency)}</span>}
            </div>
          </button>
        );
      })()}

      {tab === "days" && <DayPlanningTab trip={trip} days={days} transports={transports} accommodations={accommodations} onRefresh={load} readOnly={readOnly} currentUserId={currentUserId} />}
      {tab === "journal" && <JournalTab trip={trip} days={days} transports={transports} accommodations={accommodations} readOnly={readOnly} currentUserId={currentUserId} />}
      {tab === "photos" && <PhotoGalleryTab trip={trip} days={days} transports={transports} accommodations={accommodations} readOnly={readOnly} />}
      {tab === "accommodation" && <AccommodationTab trip={trip} accommodations={accommodations} onRefresh={load} readOnly={readOnly} currentUserId={currentUserId} />}
      {tab === "transport" && <TransportTab trip={trip} transports={transports} onRefresh={load} readOnly={readOnly} currentUserId={currentUserId} />}
      {tab === "budget" && !readOnly && <BudgetTab trip={trip} expenses={expenses} transports={transports} accommodations={accommodations} days={days} onRefresh={load} />}
      {tab === "map" && <MapTab trip={trip} accommodations={accommodations} transports={transports} days={days} />}
      {tab === "packing" && <PackingTab tripId={trip.id} readOnly={readOnly} />}

      {/* "Meer" dropdown — Verblijf, Vervoer, Paklijst live only here on mobile */}
      {showMoreMenu && (
        <>
          <div className="sm:hidden fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
          <div className="sm:hidden fixed z-50 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden py-1"
            style={{ right: 12, bottom: "calc(68px + env(safe-area-inset-bottom) + 10px)", minWidth: 180 }}>
            <button onClick={() => { setShowMoreMenu(false); onBack(); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-gray-50 transition-colors text-left text-gray-700 border-b border-gray-100">
              <span className="text-lg leading-none">←</span>
              Terug
            </button>
            {moreMenuItems.map((item) => (
              <button key={item.key} onClick={() => { setTab(item.key); setShowMoreMenu(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-gray-50 transition-colors text-left"
                style={{ color: tab === item.key ? accent : "#374151" }}>
                <span className="text-lg leading-none">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Mobile bottom nav */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-lg" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex">
          {bottomNavItems.map((item) => (
            <button key={item.key} onClick={() => setTab(item.key)}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors min-w-0"
              style={{ color: tab === item.key ? accent : "#9ca3af", minHeight: 68 }}>
              <span className="text-2xl leading-none">{item.icon}</span>
              <span className="text-sm font-medium leading-none mt-0.5">{item.label}</span>
              {tab === item.key && <span className="absolute bottom-0 w-8 h-0.5 rounded-full" style={{ background: accent }} />}
            </button>
          ))}
          <button onClick={() => setShowMoreMenu((v) => !v)}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors min-w-0 relative"
            style={{ color: isMoreActive || showMoreMenu ? accent : "#9ca3af", minHeight: 68 }}>
            <span className="text-2xl leading-none">⋯</span>
            <span className="text-sm font-medium leading-none mt-0.5">Meer</span>
            {isMoreActive && <span className="absolute bottom-0 w-8 h-0.5 rounded-full" style={{ background: accent }} />}
          </button>
        </div>
      </div>

      {editing && <TripForm initial={trip} onSaved={() => { setEditing(false); load(); onChanged(); }} onClose={() => setEditing(false)} />}
      {importing && <ImportModal tripId={tripId} onImported={load} onClose={() => setImporting(false)} />}
      {sharing && <ShareModal tripId={tripId} onClose={() => setSharing(false)} />}
    </div>
  );
}

// ---------- Admin view ----------
function AdminView({ onBack }) {
  const [trips, setTrips] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("trips");

  const reload = () => {
    Promise.all([api.getAdminTrips(), api.getAdminUsers()])
      .then(([t, u]) => { setTrips(t); setUsers(u); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);

  async function handleAssign(tripId, userId) {
    await api.assignTrip(tripId, userId || null);
    reload();
  }

  const byUser = trips.reduce((acc, t) => {
    const key = t.user_id || "unassigned";
    if (!acc[key]) acc[key] = { name: t.user_name, email: t.user_email, avatar: t.user_avatar, trips: [] };
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

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800">Beheer</h2>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          <button onClick={() => setTab("trips")}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === "trips" ? "bg-white shadow text-sky-700" : "text-gray-500 hover:text-gray-700"}`}>
            ✈️ Reizen ({trips.length})
          </button>
          <button onClick={() => setTab("users")}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === "users" ? "bg-white shadow text-sky-700" : "text-gray-500 hover:text-gray-700"}`}>
            👥 Gebruikers ({users.length})
          </button>
        </div>
      </div>

      {loading ? <div className="text-center py-16 text-gray-400">Laden...</div> : tab === "trips" ? (
        <div className="space-y-8">
          {groups.map((group) => (
            <div key={group.email || "unassigned"}>
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
                      : <div className="w-14 h-14 rounded-lg shrink-0" style={{ background: t.cover_color || "#0369a1" }} />}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-800">{t.name}</div>
                      {t.destination && <div className="text-sm text-gray-500">📍 {t.destination}</div>}
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
                : <div className="w-10 h-10 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-sm shrink-0">
                    {(u.name || u.email || "?")[0].toUpperCase()}
                  </div>}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-800">{u.name || "—"}</span>
                  {u.is_admin && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">Admin</span>}
                </div>
                <div className="text-sm text-gray-500">{u.email}</div>
                <div className="flex gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
                  <span>🔑 {LOGIN_METHOD(u)}</span>
                  {u.last_login_at && <span>Laatst: {fmt(u.last_login_at)}</span>}
                  <span>Lid sinds: {fmt(u.created_at)}</span>
                </div>
                <div className="flex gap-3 mt-1 text-xs flex-wrap">
                  <span className="font-medium text-gray-600">🔓 {u.login_count} x ingelogd</span>
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

// ---------- App ----------
function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState({ name: "list" });
  const [showTripForm, setShowTripForm] = useState(false);

  useEffect(() => {
    fetch("/auth/me")
      .then((r) => r.ok ? r.json() : null)
      .then((u) => { setUser(u); setAuthLoading(false); })
      .catch(() => { setUser(null); setAuthLoading(false); });
  }, []);

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
      <header className="sticky top-0 z-40 bg-sky-800 text-white shadow-md" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <button onClick={() => setView({ name: "list" })} className="flex items-center gap-2 font-bold text-lg leading-none min-w-0">
            ✈️ <span className="truncate">Reisplanner</span>
          </button>
          <div className="flex items-center gap-2 shrink-0">
            {user ? (
              <>
                {user.is_admin && view.name !== "admin" && (
                  <button onClick={() => setView({ name: "admin" })} className="text-sky-300 hover:text-white text-xs px-2 py-1.5 rounded-lg hover:bg-sky-700 transition-colors">
                    👁
                  </button>
                )}
                <button onClick={handleLogout} className="text-sky-200 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-sky-600 hover:bg-sky-700 transition-colors">
                  Uitloggen
                </button>
                {user.avatar
                  ? <img src={user.avatar} alt={user.name} className="w-9 h-9 rounded-full ring-2 ring-sky-400 shrink-0" />
                  : <div className="w-9 h-9 rounded-full bg-sky-600 flex items-center justify-center font-bold text-sm shrink-0">{(user.given_name || user.name || "?")[0].toUpperCase()}</div>
                }
              </>
            ) : (
              <>
                <a href="/login" className="text-sky-200 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-sky-600 hover:bg-sky-700 transition-colors">Inloggen</a>
                <a href="/login?tab=register" className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-sky-500 text-white hover:bg-sky-400 transition-colors whitespace-nowrap">Account aanmaken</a>
              </>
            )}
          </div>
        </div>
      </header>

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
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
                  <span className="text-xl shrink-0">👤</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-amber-800 text-sm">Je gebruikt de app als gast</div>
                    <div className="text-xs text-amber-700 mt-0.5">Je reizen worden alleen op dit apparaat bewaard. <a href="/login" className="underline font-medium">Log in</a> of <a href="/login?tab=register" className="underline font-medium">maak een account</a> om ze overal beschikbaar te hebben.</div>
                  </div>
                </div>
              )}
            </div>
            {loading ? (
              <div className="text-center py-16 text-gray-400">Laden...</div>
            ) : trips.length === 0 ? (
              <div className="text-center py-24 text-gray-400">
                <div className="text-6xl mb-4">🗺️</div>
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
              style={{ background: "linear-gradient(135deg,#0369a1,#0ea5e9)", boxShadow: "0 8px 24px rgba(3,105,161,0.45)", paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
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
