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

const api = {
  getTrips: () => apiFetch("/api/trips"),
  getTrip: (id) => apiFetch(`/api/trips/${id}`),
  createTrip: (d) => apiFetch("/api/trips", { method: "POST", body: JSON.stringify(d) }),
  updateTrip: (id, d) => apiFetch(`/api/trips/${id}`, { method: "PUT", body: JSON.stringify(d) }),
  deleteTrip: (id) => apiFetch(`/api/trips/${id}`, { method: "DELETE" }),
  getDays: (tripId) => apiFetch(`/api/trips/${tripId}/days`),
  addDay: (tripId, d) => apiFetch(`/api/trips/${tripId}/days`, { method: "POST", body: JSON.stringify(d) }),
  updateDay: (id, d) => apiFetch(`/api/days/${id}`, { method: "PUT", body: JSON.stringify(d) }),
  deleteDay: (id) => apiFetch(`/api/days/${id}`, { method: "DELETE" }),
  addActivity: (dayId, d) => apiFetch(`/api/days/${dayId}/activities`, { method: "POST", body: JSON.stringify(d) }),
  updateActivity: (id, d) => apiFetch(`/api/activities/${id}`, { method: "PUT", body: JSON.stringify(d) }),
  deleteActivity: (id) => apiFetch(`/api/activities/${id}`, { method: "DELETE" }),
  getAccommodations: (tripId) => apiFetch(`/api/trips/${tripId}/accommodations`),
  addAccommodation: (tripId, d) => apiFetch(`/api/trips/${tripId}/accommodations`, { method: "POST", body: JSON.stringify(d) }),
  updateAccommodation: (id, d) => apiFetch(`/api/accommodations/${id}`, { method: "PUT", body: JSON.stringify(d) }),
  deleteAccommodation: (id) => apiFetch(`/api/accommodations/${id}`, { method: "DELETE" }),
  getTransports: (tripId) => apiFetch(`/api/trips/${tripId}/transports`),
  addTransport: (tripId, d) => apiFetch(`/api/trips/${tripId}/transports`, { method: "POST", body: JSON.stringify(d) }),
  updateTransport: (id, d) => apiFetch(`/api/transports/${id}`, { method: "PUT", body: JSON.stringify(d) }),
  deleteTransport: (id) => apiFetch(`/api/transports/${id}`, { method: "DELETE" }),
  getExpenses: (tripId) => apiFetch(`/api/trips/${tripId}/expenses`),
  addExpense: (tripId, d) => apiFetch(`/api/trips/${tripId}/expenses`, { method: "POST", body: JSON.stringify(d) }),
  updateExpense: (id, d) => apiFetch(`/api/expenses/${id}`, { method: "PUT", body: JSON.stringify(d) }),
  deleteExpense: (id) => apiFetch(`/api/expenses/${id}`, { method: "DELETE" }),
  importEmail: (tripId, text) => apiFetch(`/api/trips/${tripId}/import`, { method: "POST", body: JSON.stringify({ text }) }),
  createInvite: (tripId) => apiFetch(`/api/trips/${tripId}/invite`, { method: "POST" }),
  getAdminTrips: () => apiFetch("/api/admin/trips"),
  getAdminUsers: () => apiFetch("/api/admin/users"),
  assignTrip: (tripId, userId) => apiFetch(`/api/admin/trips/${tripId}/assign`, { method: "PATCH", body: JSON.stringify({ user_id: userId }) }),
  suggestPhoto: (destination) => apiFetch(`/api/photo-suggest?destination=${encodeURIComponent(destination)}`),
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
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(n);
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
  return (
    <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 overflow-x-auto">
      {tabs.map((t) => (
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
    <div onClick={onClick} className="bg-white rounded-2xl shadow-sm hover:shadow-lg transition-all duration-200 cursor-pointer overflow-hidden border border-gray-100 group">
      {trip.cover_image ? (
        <div className="h-44 w-full bg-gray-100 overflow-hidden relative">
          <img src={trip.cover_image} alt={trip.destination || trip.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
          <div className="absolute top-2 right-2 flex gap-1">
            {trip.is_owner === false && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-500/80 text-white backdrop-blur-sm">Gedeeld</span>}
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-3">
            <h3 className="font-bold text-white text-base leading-tight drop-shadow">{trip.name}</h3>
            {trip.destination && <div className="text-xs text-white/80 mt-0.5">📍 {trip.destination}</div>}
          </div>
        </div>
      ) : (
        <div className="h-20 w-full relative flex items-end px-4 pb-3" style={{ background: accent }}>
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-black/20" />
          <div className="relative flex items-start justify-between w-full gap-2">
            <h3 className="font-bold text-white text-base leading-tight drop-shadow">{trip.name}</h3>
            <div className="flex gap-1 shrink-0">
              {trip.is_owner === false && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/20 text-white">Gedeeld</span>}
            </div>
          </div>
        </div>
      )}

      <div className="p-4">
        {!trip.cover_image && trip.destination && <div className="text-sm text-gray-500 mb-2">📍 {trip.destination}</div>}
        <div className="flex items-center justify-between text-xs text-gray-400">
          <div>{trip.start_date ? `${fmt(trip.start_date)}${dur ? ` · ${dur}` : ""}` : "Datum onbekend"}</div>
          <div className="flex gap-2 items-center">
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
function ActivityForm({ dayId, tripId, initial, onSaved, onClose }) {
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
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Tijd"><Input type="time" value={form.time} onChange={set("time")} /></Field>
          <Field label="Categorie">
            <Select value={form.category} onChange={set("category")}>
              {ACTIVITY_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Titel"><Input required value={form.title} onChange={set("title")} placeholder="bijv. Colosseum bezoek" /></Field>
        <Field label="Locatie"><Input value={form.location} onChange={set("location")} placeholder="bijv. Via Sacra, Rome" /></Field>
        <Field label="Kosten (€)"><Input type="number" min="0" step="0.01" value={form.cost} onChange={set("cost")} placeholder="0,00" /></Field>
        <Field label="Notities"><Textarea rows={2} value={form.notes} onChange={set("notes")} /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Annuleren</Button>
          <Button type="submit" disabled={saving}>{saving ? "Opslaan..." : "Opslaan"}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- Accommodation form ----------
function AccommodationForm({ tripId, initial, onSaved, onClose }) {
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
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Naam"><Input required value={form.name} onChange={set("name")} placeholder="bijv. Hotel Roma Centrale" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Check-in"><Input type="date" value={form.check_in} onChange={set("check_in")} /></Field>
          <Field label="Check-out"><Input type="date" value={form.check_out} onChange={set("check_out")} /></Field>
        </div>
        <Field label="Adres"><Input value={form.address} onChange={set("address")} placeholder="Straat, stad" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Boekingsnummer"><Input value={form.booking_ref} onChange={set("booking_ref")} /></Field>
          <Field label="Kosten totaal (€)"><Input type="number" min="0" step="0.01" value={form.cost} onChange={set("cost")} placeholder="0,00" /></Field>
        </div>
        <Field label="Notities"><Textarea rows={2} value={form.notes} onChange={set("notes")} /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Annuleren</Button>
          <Button type="submit" disabled={saving}>{saving ? "Opslaan..." : "Opslaan"}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- Transport form ----------
function TransportForm({ tripId, initial, onSaved, onClose }) {
  const [form, setForm] = useState(initial ? {
    ...initial,
    departure_time: initial.departure_time ? new Date(initial.departure_time).toISOString().slice(0,16) : "",
    arrival_time: initial.arrival_time ? new Date(initial.arrival_time).toISOString().slice(0,16) : "",
    cost: initial.cost ?? "",
    booking_ref: initial.booking_ref ?? "",
    notes: initial.notes ?? "",
  } : { type: "Vliegtuig", from_location: "", to_location: "", departure_time: "", arrival_time: "", booking_ref: "", cost: "", notes: "" });
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
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Type">
          <Select value={form.type} onChange={set("type")}>
            {TRANSPORT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Van"><Input value={form.from_location} onChange={set("from_location")} placeholder="Vertrekpunt" /></Field>
          <Field label="Naar"><Input value={form.to_location} onChange={set("to_location")} placeholder="Bestemming" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Vertrek"><Input type="datetime-local" value={form.departure_time} onChange={set("departure_time")} /></Field>
          <Field label="Aankomst"><Input type="datetime-local" value={form.arrival_time} onChange={set("arrival_time")} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Boekingsnummer"><Input value={form.booking_ref} onChange={set("booking_ref")} /></Field>
          <Field label="Kosten (€)"><Input type="number" min="0" step="0.01" value={form.cost} onChange={set("cost")} placeholder="0,00" /></Field>
        </div>
        <Field label="Notities"><Textarea rows={2} value={form.notes} onChange={set("notes")} /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Annuleren</Button>
          <Button type="submit" disabled={saving}>{saving ? "Opslaan..." : "Opslaan"}</Button>
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

// ---------- Day planning tab ----------
const CATEGORY_ICONS = { Bezienswaardigheid: "🏛", Restaurant: "🍽", Museum: "🖼", Natuur: "🌿", Sport: "⚽", Shopping: "🛍", Anders: "📌" };
const CATEGORY_COLORS = { Bezienswaardigheid: "#7c3aed", Restaurant: "#b45309", Museum: "#0369a1", Natuur: "#065f46", Sport: "#9f1239", Shopping: "#1e40af", Anders: "#374151" };
const DAY_NAMES = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const MONTH_NAMES = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function DayPlanningTab({ trip, days, transports, accommodations, onRefresh }) {
  const [showActivityForm, setShowActivityForm] = useState(null);
  const [editingActivity, setEditingActivity] = useState(null);
  const [editingTransport, setEditingTransport] = useState(null);
  const [editingAccommodation, setEditingAccommodation] = useState(null);
  const [addingDay, setAddingDay] = useState(false);
  const [newDayDate, setNewDayDate] = useState("");
  const [photos, setPhotos] = useState({});
  const [tipsLocation, setTipsLocation] = useState(null);
  const fetchedRef = useRef(new Set());
  const accent = trip.cover_color || "#0369a1";

  useEffect(() => {
    const locs = new Set();
    days.forEach((day) => (day.activities || []).forEach((a) => { if (a.location) locs.add(a.location); }));
    [...locs].slice(0, 10).forEach(async (loc) => {
      if (fetchedRef.current.has(loc)) return;
      fetchedRef.current.add(loc);
      try {
        const d = await api.suggestPhoto(loc);
        setPhotos((p) => ({ ...p, [loc]: d.thumb }));
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

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h3 className="font-semibold text-gray-700">Dagplanning</h3>
        <Button onClick={() => setAddingDay(true)} variant="secondary">+ Dag toevoegen</Button>
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

            return (
              <div key={day.id} className="relative flex gap-4 pb-6">
                {/* Day node */}
                <div className="flex flex-col items-center shrink-0 z-10" style={{ width: "5.2rem" }}>
                  <div className="w-12 h-12 rounded-2xl flex flex-col items-center justify-center text-white shadow-md font-bold"
                    style={{ background: accent }}>
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
                    <div className="flex items-center gap-2">
                      {day.title && <span className="font-semibold text-gray-700 text-sm">{day.title}</span>}
                      {totalItems === 0 && <span className="text-xs text-gray-400 italic">Leeg</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setShowActivityForm({ dayId: day.id })}
                        className="text-xs font-medium px-2.5 py-1 rounded-lg hover:opacity-80 transition-opacity text-white"
                        style={{ background: accent }}>
                        + Activiteit
                      </button>
                      <button onClick={() => handleDeleteDay(day.id)} className="text-gray-300 hover:text-red-400 px-1 ml-1">🗑</button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {/* Transport cards */}
                    {dayTransports.map((t) => {
                      const isArrival = isoDate(t.arrival_time) === dayStr && isoDate(t.departure_time) !== dayStr;
                      const time = isArrival ? t.arrival_time : t.departure_time;
                      return (
                        <div key={t.id + (isArrival ? "-a" : "-d")}
                          onClick={() => setEditingTransport(t)}
                          className="flex items-center gap-3 rounded-xl px-4 py-3 border cursor-pointer hover:shadow-md transition-shadow"
                          style={{ background: "#eff6ff", borderColor: "#bfdbfe" }}>
                          <div className="text-2xl">{TRANSPORT_ICONS[t.type] || "🚀"}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "#1d4ed8" }}>
                                {isArrival ? "Aankomst" : "Vertrek"}
                              </span>
                              {time && <span className="text-xs font-mono font-semibold" style={{ color: "#3b82f6" }}>
                                {new Date(time).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}
                              </span>}
                            </div>
                            <div className="font-semibold text-gray-800 text-sm">{t.from_location} → {t.to_location}</div>
                            <div className="flex gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
                              {t.booking_ref && <span className="font-mono bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">#{t.booking_ref}</span>}
                              {t.cost && <span className="font-medium text-blue-700">{fmtMoney(t.cost, trip.currency)}</span>}
                            </div>
                          </div>
                          {t.to_location && (
                            <button onClick={(e) => { e.stopPropagation(); setTipsLocation(t.to_location); }}
                              className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors shrink-0 whitespace-nowrap">
                              💡 Tips
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
                          className="flex items-center gap-3 rounded-xl px-4 py-3 border cursor-pointer hover:shadow-md transition-shadow"
                          style={{ background: "#fffbeb", borderColor: "#fde68a" }}>
                          <div className="text-2xl">🏨</div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold uppercase tracking-wide" style={{ color: "#b45309" }}>
                              {isCheckIn && isCheckOut ? "Check-in & Check-out" : isCheckIn ? "Check-in" : "Check-out"}
                            </div>
                            <div className="font-semibold text-gray-800 text-sm">{a.name}</div>
                            {a.address && <div className="text-xs text-gray-400 mt-0.5">📍 {a.address}</div>}
                            {a.cost && <div className="text-xs font-medium text-amber-700 mt-0.5">{fmtMoney(a.cost, trip.currency)}</div>}
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); setTipsLocation(a.address || a.name); }}
                            className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors shrink-0 whitespace-nowrap">
                            💡 Tips
                          </button>
                        </div>
                      );
                    })}

                    {/* Activity cards */}
                    {day.activities.map((act) => {
                      const photo = act.location ? photos[act.location] : null;
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
                            <div className="opacity-0 group-hover:opacity-100 flex gap-1 shrink-0 transition-opacity">
                              <button onClick={(e) => { e.stopPropagation(); handleDeleteActivity(act.id); }} className="text-gray-300 hover:text-red-400 text-sm">🗑</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {totalItems === 0 && (
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
        <ActivityForm dayId={showActivityForm.dayId} tripId={trip.id}
          onSaved={() => { setShowActivityForm(null); onRefresh(); }}
          onClose={() => setShowActivityForm(null)} />
      )}
      {editingActivity && (
        <ActivityForm dayId={editingActivity.day_id} tripId={trip.id} initial={editingActivity}
          onSaved={() => { setEditingActivity(null); onRefresh(); }}
          onClose={() => setEditingActivity(null)} />
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
      {tipsLocation && (
        <TipsModal tripId={trip.id} trip={trip} location={tipsLocation} onClose={() => setTipsLocation(null)} />
      )}
    </div>
  );
}

// ---------- Accommodation tab ----------
function AccommodationTab({ trip, accommodations, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  async function handleDelete(id) {
    if (!confirm("Verblijf verwijderen?")) return;
    await api.deleteAccommodation(id);
    onRefresh();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-gray-700">Accommodaties</h3>
        <Button onClick={() => setShowForm(true)} variant="secondary">+ Verblijf toevoegen</Button>
      </div>

      {accommodations.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-2">🏨</div>
          <div>Nog geen verblijven toegevoegd</div>
        </div>
      ) : (
        <div className="space-y-3">
          {accommodations.map((acc) => (
            <div key={acc.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex gap-4 items-start group">
              <div className="text-2xl">🏨</div>
              <div className="flex-1">
                <div className="font-semibold text-gray-800">{acc.name}</div>
                {acc.address && <div className="text-sm text-gray-500">📍 {acc.address}</div>}
                <div className="flex gap-4 mt-1 text-sm text-gray-500">
                  {acc.check_in && <span>Check-in: {fmt(acc.check_in)}</span>}
                  {acc.check_out && <span>Check-out: {fmt(acc.check_out)}</span>}
                  {acc.booking_ref && <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">#{acc.booking_ref}</span>}
                  {acc.cost && <span className="text-sky-700 font-medium">{fmtMoney(acc.cost)}</span>}
                </div>
                {acc.notes && <div className="text-sm text-gray-500 mt-1">{acc.notes}</div>}
              </div>
              <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                <button onClick={() => setEditing(acc)} className="text-gray-400 hover:text-sky-600">✏️</button>
                <button onClick={() => handleDelete(acc.id)} className="text-gray-400 hover:text-red-500">🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && <AccommodationForm tripId={trip.id} onSaved={() => { setShowForm(false); onRefresh(); }} onClose={() => setShowForm(false)} />}
      {editing && <AccommodationForm tripId={trip.id} initial={editing} onSaved={() => { setEditing(null); onRefresh(); }} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ---------- Transport tab ----------
const TRANSPORT_ICONS = { Vliegtuig: "✈️", Trein: "🚆", Bus: "🚌", Huurauto: "🚗", Taxi: "🚕", Boot: "⛴️", Anders: "🚀" };

function TransportTab({ trip, transports, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  async function handleDelete(id) {
    if (!confirm("Vervoer verwijderen?")) return;
    await api.deleteTransport(id);
    onRefresh();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-gray-700">Vervoer</h3>
        <Button onClick={() => setShowForm(true)} variant="secondary">+ Vervoer toevoegen</Button>
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
                  {t.notes && <div className="text-sm text-gray-500 mt-1">{t.notes}</div>}
                </div>
                <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                  <button onClick={() => setEditing(t)} className="text-gray-400 hover:text-sky-600">✏️</button>
                  <button onClick={() => handleDelete(t.id)} className="text-gray-400 hover:text-red-500">🗑</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && <TransportForm tripId={trip.id} onSaved={() => { setShowForm(false); onRefresh(); }} onClose={() => setShowForm(false)} />}
      {editing && <TransportForm tripId={trip.id} initial={editing} onSaved={() => { setEditing(null); onRefresh(); }} onClose={() => setEditing(null)} />}
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
function TipAccordion({ section, accentColor }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-lg">{section.icon}</span>
        <span className="font-semibold text-gray-800 text-sm flex-1">{section.category}</span>
        <span className="text-gray-400 text-xs transition-transform duration-200" style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
      </button>
      {open && (
        <ul className="divide-y divide-gray-50 border-t border-gray-100">
          {(section.items || []).map((tip, j) => (
            <li key={j} className="flex items-start gap-3 px-4 py-2.5">
              <span className="w-1.5 h-1.5 rounded-full mt-2 shrink-0" style={{ background: accentColor }} />
              <span className="text-sm text-gray-700 leading-relaxed">{tip}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- Tips modal (per locatie) ----------
function TipsModal({ tripId, trip, location, onClose }) {
  const [tips, setTips] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const tripMonth = trip?.start_date ? String(trip.start_date).slice(0, 7) : "";
  const cacheKey = `tips_loc_${location}_${tripMonth}`;

  function fetchTips() {
    setLoading(true); setError(null);
    apiFetch(`/api/trips/${tripId}/tips?location=${encodeURIComponent(location)}`)
      .then((data) => {
        setTips(data);
        try { localStorage.setItem(cacheKey, JSON.stringify({ data, ts: Date.now() })); } catch {}
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { data, ts } = JSON.parse(cached);
        if (Date.now() - ts < 24 * 60 * 60 * 1000) { setTips(data); setLoading(false); return; }
      }
    } catch {}
    fetchTips();
  }, [location]);

  return (
    <Modal title={`Tips voor ${location}`} onClose={onClose} wide>
      {loading ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-3xl mb-3">✨</div>
          <div className="font-medium text-gray-600">Tips ophalen voor {location}...</div>
          <div className="text-sm mt-1">Even geduld</div>
        </div>
      ) : error ? (
        <div className="text-center py-8 text-gray-400">
          <div className="text-sm">{error}</div>
          <button onClick={fetchTips} className="mt-2 text-sm text-sky-600 underline">Opnieuw proberen</button>
        </div>
      ) : tips ? (
        <div className="space-y-3">
          {tips.did_you_know && (
            <div className="rounded-xl p-4 bg-sky-50 border border-sky-100">
              <div className="text-xs font-bold uppercase tracking-wide text-sky-700 mb-1">Wist je dat?</div>
              <div className="text-sm text-gray-700 leading-relaxed">{tips.did_you_know}</div>
            </div>
          )}
          {tips.best_time && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex gap-2 items-start">
              <span>📅</span>
              <div>
                <div className="text-xs font-bold text-amber-700 mb-0.5">Beste reistijd</div>
                <div className="text-sm text-gray-700 leading-relaxed">{tips.best_time}</div>
              </div>
            </div>
          )}
          {(tips.tips || []).map((section, i) => (
            <TipAccordion key={i} section={section} accentColor="#0369a1" />
          ))}
          <div className="text-center pt-1">
            <button onClick={() => { try { localStorage.removeItem(cacheKey); } catch {} setTips(null); fetchTips(); }}
              className="text-xs text-gray-400 hover:text-gray-600 underline">Nieuwe tips genereren</button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

// ---------- Tips tab ----------
function TipsTab({ trip }) {
  const [tips, setTips] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const accent = trip.cover_color || "#0369a1";
  const tripMonth = trip.start_date ? String(trip.start_date).slice(0, 7) : "";
  const cacheKey = `tips_${trip.id}_${trip.destination}_${tripMonth}`;

  function fetchTips() {
    setLoading(true); setError(null);
    apiFetch(`/api/trips/${trip.id}/tips`)
      .then((data) => {
        setTips(data);
        try { localStorage.setItem(cacheKey, JSON.stringify({ data, ts: Date.now() })); } catch {}
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!trip.destination) return;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { data, ts } = JSON.parse(cached);
        if (Date.now() - ts < 24 * 60 * 60 * 1000) { setTips(data); return; }
      }
    } catch {}
    fetchTips();
  }, [trip.id, trip.destination]);

  if (!trip.destination) return (
    <div className="text-center py-16 text-gray-400">
      <div className="text-4xl mb-3">💡</div>
      <div className="font-medium">Geen bestemming ingesteld</div>
      <div className="text-sm mt-1">Voeg een bestemming toe aan je reis voor AI-tips</div>
    </div>
  );

  if (loading) return (
    <div className="text-center py-16 text-gray-400">
      <div className="text-4xl mb-3">✨</div>
      <div className="font-medium text-gray-600">Tips ophalen voor {trip.destination}...</div>
      <div className="text-sm mt-1">Claude denkt na, even geduld</div>
    </div>
  );

  if (error) return (
    <div className="text-center py-16 text-gray-400">
      <div className="text-4xl mb-3">😕</div>
      <div className="text-sm">{error}</div>
      <button onClick={fetchTips} className="mt-3 text-sm underline" style={{ color: accent }}>Opnieuw proberen</button>
    </div>
  );

  if (!tips) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-gray-700">Tips voor {trip.destination}</h3>
        <span className="text-xs text-gray-400">✨ Gegenereerd door Claude</span>
      </div>

      {tips.did_you_know && (
        <div className="rounded-xl p-4 mb-4 border" style={{ background: accent + "10", borderColor: accent + "30" }}>
          <div className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: accent }}>Wist je dat?</div>
          <div className="text-sm text-gray-700 leading-relaxed">{tips.did_you_know}</div>
        </div>
      )}

      {tips.best_time && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-4 flex gap-3 items-start">
          <span className="text-xl">📅</span>
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-amber-700 mb-0.5">Beste reistijd</div>
            <div className="text-sm text-gray-700 leading-relaxed">{tips.best_time}</div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {(tips.tips || []).map((section, i) => (
          <TipAccordion key={i} section={section} accentColor={accent} />
        ))}
      </div>

      <div className="mt-5 text-center">
        <button onClick={() => { try { localStorage.removeItem(cacheKey); } catch {} setTips(null); fetchTips(); }}
          className="text-xs text-gray-400 hover:text-gray-600 underline transition-colors">
          Nieuwe tips genereren
        </button>
      </div>
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
  const fileRef = useRef(null);

  useEffect(() => { api.getDays(tripId).then(setDays); }, [tripId]);

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

  async function saveTransport(t, idx) {
    setSaving(true);
    try {
      await api.addTransport(tripId, t);
      setSaved((s) => ({ ...s, transports: [...s.transports, idx] }));
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  }

  async function saveAccommodation(a, idx) {
    setSaving(true);
    try {
      await api.addAccommodation(tripId, a);
      setSaved((s) => ({ ...s, accommodations: [...s.accommodations, idx] }));
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
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
              {loading ? "Analyseren..." : "✨ Analyseren"}
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
  const [link, setLink] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.createInvite(tripId)
      .then((d) => setLink(d.link))
      .finally(() => setLoading(false));
  }, [tripId]);

  function handleCopy() {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Modal title="Reis delen" onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Deel de link hieronder. De ontvanger kan inloggen via Google of Apple en krijgt direct toegang tot deze reis.
        </p>
        {loading ? (
          <div className="text-center py-4 text-gray-400">Link aanmaken...</div>
        ) : (
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
        <div className="flex justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>Sluiten</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Trip detail ----------
function TripDetail({ tripId, onBack, onChanged }) {
  const [trip, setTrip] = useState(null);
  const [days, setDays] = useState([]);
  const [accommodations, setAccommodations] = useState([]);
  const [transports, setTransports] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [tab, setTab] = useState("days");
  const [editing, setEditing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sharing, setSharing] = useState(false);

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

  const tabs = [
    { key: "days", label: "Dagen", icon: "🗓" },
    { key: "accommodation", label: "Verblijf", icon: "🏨" },
    { key: "transport", label: "Vervoer", icon: "✈️" },
    { key: "budget", label: "Budget", icon: "💰" },
    { key: "tips", label: "Algemene tips", icon: "💡" },
  ];

  return (
    <div>
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium hover:opacity-70 transition-opacity" style={{ color: accent }}>
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
                  {trip.is_owner === false && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-500/70 text-white backdrop-blur-sm">Gedeeld</span>}
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
            <div className="bg-white px-3 py-2.5 flex gap-2 overflow-x-auto border-t border-gray-100">
              <Button variant="secondary" onClick={() => setImporting(true)} className="shrink-0 !text-xs !px-3 !py-1.5">📧 Importeren</Button>
              {trip.is_owner && <Button variant="secondary" onClick={() => setSharing(true)} className="shrink-0 !text-xs !px-3 !py-1.5">🔗 Delen</Button>}
              {trip.is_owner && <Button variant="secondary" onClick={() => setEditing(true)} className="shrink-0 !text-xs !px-3 !py-1.5">✏️ Bewerken</Button>}
              {trip.is_owner && <Button variant="danger" onClick={handleDelete} className="shrink-0 !text-xs !px-3 !py-1.5">🗑 Verwijderen</Button>}
            </div>
          </>
        ) : (
          <>
            <div className="relative h-28 w-full flex items-end px-6 pb-4" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }}>
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-black/25" />
              <div className="relative flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {trip.is_owner === false && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-400/60 text-white">Gedeeld</span>}
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
              <div className="flex gap-2 overflow-x-auto pb-1">
                <Button variant="secondary" onClick={() => setImporting(true)} className="shrink-0">📧 Importeren</Button>
                {trip.is_owner && <Button variant="secondary" onClick={() => setSharing(true)} className="shrink-0">🔗 Delen</Button>}
                {trip.is_owner && <Button variant="secondary" onClick={() => setEditing(true)} className="shrink-0">✏️ Bewerken</Button>}
                {trip.is_owner && <Button variant="danger" onClick={handleDelete} className="shrink-0">🗑 Verwijderen</Button>}
              </div>
              {trip.notes && <div className="text-sm text-gray-500 mt-2">{trip.notes}</div>}
            </div>
          </>
        )}
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} accentColor={accent} />

      {tab === "days" && <DayPlanningTab trip={trip} days={days} transports={transports} accommodations={accommodations} onRefresh={load} />}
      {tab === "accommodation" && <AccommodationTab trip={trip} accommodations={accommodations} onRefresh={load} />}
      {tab === "transport" && <TransportTab trip={trip} transports={transports} onRefresh={load} />}
      {tab === "budget" && <BudgetTab trip={trip} expenses={expenses} transports={transports} accommodations={accommodations} days={days} onRefresh={load} />}
      {tab === "tips" && <TipsTab trip={trip} />}

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
                  {u.last_login_at && <span>Laatst ingelogd: {fmt(u.last_login_at)}</span>}
                  <span>Lid sinds: {fmt(u.created_at)}</span>
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
    if (!user) return;
    loadTrips();
    const params = new URLSearchParams(location.search);
    const tripId = params.get("trip");
    if (tripId) {
      setView({ name: "detail", id: parseInt(tripId) });
      window.history.replaceState({}, "", "/");
    }
  }, [user, loadTrips]);

  async function handleLogout() {
    await fetch("/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  if (authLoading) return (
    <div className="min-h-screen flex items-center justify-center text-gray-400">Laden...</div>
  );

  if (!user) {
    window.location.href = "/login";
    return null;
  }

  const tripStats = trips.length > 0 ? `${trips.length} rei${trips.length === 1 ? "s" : "zen"}` : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-sky-900 to-sky-700 text-white py-5 px-4 sm:px-8 mb-6 shadow-lg">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold flex items-center gap-2 cursor-pointer leading-none" onClick={() => setView({ name: "list" })}>
              ✈️ Reisplanner
            </h1>
            <p className="text-sky-100 text-sm font-medium mt-1">{greeting(user.given_name || user.name)}</p>
            {view.name === "list" && tripStats && (
              <p className="text-sky-300 text-xs mt-0.5 hidden sm:block">{tripStats}</p>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {view.name === "list" && (
              <Button onClick={() => setShowTripForm(true)} className="!bg-white !text-sky-800 hover:!bg-sky-50 font-semibold shadow-sm">
                + Nieuwe reis
              </Button>
            )}
            {user.is_admin && view.name !== "admin" && (
              <button onClick={() => setView({ name: "admin" })} className="text-sky-300 hover:text-white text-xs px-2 py-1 rounded hover:bg-sky-800 transition-colors">
                👁 Alle reizen
              </button>
            )}
            <div className="flex items-center gap-2 border-l border-sky-600 pl-3">
              {user.avatar
                ? <img src={user.avatar} alt={user.name} className="w-9 h-9 rounded-full ring-2 ring-sky-400 ring-offset-1 ring-offset-sky-800 shrink-0" />
                : <div className="w-9 h-9 rounded-full bg-sky-600 flex items-center justify-center text-white font-bold text-sm shrink-0">{(user.given_name || user.name || "?")[0].toUpperCase()}</div>
              }
              <div className="hidden sm:block">
                <div className="text-sm font-medium text-white leading-none">{user.given_name || user.name?.split(" ")[0] || user.email}</div>
                <button onClick={handleLogout} className="text-sky-300 hover:text-white text-xs transition-colors">Uitloggen</button>
              </div>
              <button onClick={handleLogout} className="sm:hidden text-sky-200 hover:text-white text-xs font-medium px-2 py-1 rounded-lg border border-sky-500 hover:border-sky-300 transition-colors">Uit</button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-8 pb-12">
        {view.name === "list" ? (
          loading ? (
            <div className="text-center py-16 text-gray-400">Laden...</div>
          ) : trips.length === 0 ? (
            <div className="text-center py-24 text-gray-400">
              <div className="text-6xl mb-4">🗺️</div>
              <div className="text-xl font-semibold text-gray-600 mb-2">Nog geen reizen</div>
              <div className="mb-6">Maak je eerste reis aan om te beginnen</div>
              <Button onClick={() => setShowTripForm(true)}>+ Nieuwe reis</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {trips.map((t) => (
                <TripCard key={t.id} trip={t} onClick={() => setView({ name: "detail", id: t.id })} />
              ))}
            </div>
          )
        ) : view.name === "admin" ? (
          <AdminView onBack={() => setView({ name: "list" })} />
        ) : (
          <TripDetail tripId={view.id} onBack={() => setView({ name: "list" })} onChanged={loadTrips} />
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
