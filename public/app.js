const { useState, useEffect, useCallback, useRef } = React;

// ---------- Constants ----------
const TRANSPORT_TYPES = ["Vliegtuig", "Trein", "Bus", "Huurauto", "Taxi", "Boot", "Anders"];
const EXPENSE_CATEGORIES = ["Vluchten", "Accommodatie", "Vervoer", "Eten & Drinken", "Activiteiten", "Winkelen", "Overig"];
const ACTIVITY_CATEGORIES = ["Bezienswaardigheid", "Restaurant", "Museum", "Natuur", "Sport", "Shopping", "Anders"];
const TRIP_STATUSES = ["planning", "geboekt", "onderweg", "afgerond"];
const STATUS_LABELS = { planning: "Planning", geboekt: "Geboekt", onderweg: "Onderweg", afgerond: "Afgerond" };
const STATUS_COLORS = {
  planning: "bg-yellow-100 text-yellow-800",
  geboekt: "bg-blue-100 text-blue-800",
  onderweg: "bg-green-100 text-green-800",
  afgerond: "bg-gray-100 text-gray-700",
};
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
  getAdminTrips: () => apiFetch("/api/admin/trips"),
  getAdminUsers: () => apiFetch("/api/admin/users"),
  assignTrip: (tripId, userId) => apiFetch(`/api/admin/trips/${tripId}/assign`, { method: "PATCH", body: JSON.stringify({ user_id: userId }) }),
  suggestPhoto: (destination) => apiFetch(`/api/photo-suggest?destination=${encodeURIComponent(destination)}`),
};

// ---------- Helpers ----------
function fmt(date) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}
function fmtDatetime(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
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

function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${active === t.key ? "bg-white shadow text-sky-700" : "text-gray-500 hover:text-gray-700"}`}
        >
          {t.icon} {t.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Trip form ----------
const EMPTY_TRIP = { name: "", destination: "", start_date: "", end_date: "", budget: "", currency: "EUR", status: "planning", notes: "", cover_color: "#0369a1", cover_image: "" };

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
        <Field label="Status">
          <Select value={form.status} onChange={set("status")}>
            {TRIP_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </Select>
        </Field>
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
  return (
    <div onClick={onClick} className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden border border-gray-100 group">
      {trip.cover_image
        ? <div className="h-36 w-full bg-gray-100 overflow-hidden"><img src={trip.cover_image} alt={trip.destination || trip.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" /></div>
        : <div className="h-3 w-full" style={{ background: trip.cover_color || "#0369a1" }} />}
      <div className="p-5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-bold text-gray-900 text-base group-hover:text-sky-700 transition-colors leading-tight">{trip.name}</h3>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[trip.status] || "bg-gray-100 text-gray-600"}`}>
            {STATUS_LABELS[trip.status] || trip.status}
          </span>
        </div>
        {trip.destination && <div className="text-sm text-gray-500 mb-3">📍 {trip.destination}</div>}
        <div className="flex items-center justify-between text-xs text-gray-400 mt-auto">
          <div>{trip.start_date ? `${fmt(trip.start_date)}${dur ? ` · ${dur}` : ""}` : "Datum onbekend"}</div>
          <div className="flex gap-3">
            {trip.activity_count > 0 && <span>🗓 {trip.activity_count}</span>}
            {trip.budget && <span>💰 {fmtMoney(trip.budget, trip.currency)}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Activity form ----------
function ActivityForm({ dayId, tripId, initial, onSaved, onClose }) {
  const [form, setForm] = useState(initial || { time: "", title: "", location: "", notes: "", category: "Bezienswaardigheid", cost: "" });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true);
    try {
      const saved = initial?.id
        ? await api.updateActivity(initial.id, form)
        : await api.addActivity(dayId, { ...form, trip_id: tripId });
      onSaved(saved);
    } finally { setSaving(false); }
  }
  return (
    <Modal title={initial?.id ? "Activiteit bewerken" : "Activiteit toevoegen"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
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
  const [form, setForm] = useState(initial ? { ...initial, check_in: initial.check_in?.slice(0,10)||"", check_out: initial.check_out?.slice(0,10)||"" } : { name: "", check_in: "", check_out: "", address: "", booking_ref: "", cost: "", notes: "" });
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
function DayPlanningTab({ trip, days, transports, accommodations, onRefresh }) {
  const [showActivityForm, setShowActivityForm] = useState(null); // { dayId }
  const [editingActivity, setEditingActivity] = useState(null);
  const [addingDay, setAddingDay] = useState(false);
  const [newDayDate, setNewDayDate] = useState("");

  async function handleDeleteActivity(id) {
    if (!confirm("Activiteit verwijderen?")) return;
    await api.deleteActivity(id);
    onRefresh();
  }

  async function handleAddDay(e) {
    e.preventDefault();
    if (!newDayDate) return;
    await api.addDay(trip.id, { date: newDayDate });
    setAddingDay(false); setNewDayDate("");
    onRefresh();
  }

  async function handleDeleteDay(id) {
    if (!confirm("Dag verwijderen (inclusief activiteiten)?")) return;
    await api.deleteDay(id);
    onRefresh();
  }

  const CATEGORY_ICONS = { Bezienswaardigheid: "🏛", Restaurant: "🍽", Museum: "🖼", Natuur: "🌿", Sport: "⚽", Shopping: "🛍", Anders: "📌" };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-gray-700">Dagplanning</h3>
        <Button onClick={() => setAddingDay(true)} variant="secondary">+ Dag toevoegen</Button>
      </div>

      {addingDay && (
        <form onSubmit={handleAddDay} className="bg-sky-50 border border-sky-200 rounded-xl p-4 mb-4 flex gap-3 items-end">
          <Field label="Datum">
            <Input type="date" value={newDayDate} onChange={(e) => setNewDayDate(e.target.value)} required />
          </Field>
          <Button type="submit">Toevoegen</Button>
          <Button type="button" variant="secondary" onClick={() => setAddingDay(false)}>Annuleren</Button>
        </form>
      )}

      {days.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-2">🗓</div>
          <div>Nog geen dagen gepland</div>
          <div className="text-sm">Voeg een dag toe om te beginnen</div>
        </div>
      )}

      <div className="space-y-4">
        {days.map((day) => {
          const dayStr = day.date ? day.date.slice(0, 10) : null;
          const isoDate = (dt) => dt ? dt.slice(0, 10) : null;
          const dayTransports = transports.filter((t) =>
            isoDate(t.departure_time) === dayStr || isoDate(t.arrival_time) === dayStr
          );
          const dayAccommodations = accommodations.filter((a) => {
            const ci = a.check_in ? a.check_in.slice(0, 10) : null;
            const co = a.check_out ? a.check_out.slice(0, 10) : null;
            return (ci === dayStr) || (co === dayStr);
          });
          const hasExtras = dayTransports.length > 0 || dayAccommodations.length > 0;

          return (
          <div key={day.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
              <div>
                <span className="font-semibold text-gray-800">{fmt(day.date)}</span>
                {day.title && <span className="ml-2 text-gray-500 text-sm">— {day.title}</span>}
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setShowActivityForm({ dayId: day.id })}>+ Activiteit</Button>
                <button onClick={() => handleDeleteDay(day.id)} className="text-gray-300 hover:text-red-500 text-sm">🗑</button>
              </div>
            </div>

            {hasExtras && (
              <div className="px-4 py-2 bg-sky-50 border-b border-sky-100 flex flex-wrap gap-3">
                {dayTransports.map((t) => {
                  const isArrival = t.arrival_time && isoDate(t.arrival_time) === dayStr && !(t.departure_time && isoDate(t.departure_time) === dayStr);
                  const time = isArrival ? t.arrival_time : t.departure_time;
                  return (
                    <div key={t.id + (isArrival ? "-arr" : "")} className="flex items-center gap-1.5 text-xs text-sky-800">
                      <span>{TRANSPORT_ICONS[t.type] || "🚀"}</span>
                      <span className="text-sky-500">{isArrival ? "Aankomst" : "Vertrek"}</span>
                      <span className="font-medium">{t.from_location} → {t.to_location}</span>
                      {time && <span className="text-sky-600">{new Date(time).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}</span>}
                      {t.booking_ref && <span className="font-mono bg-sky-100 px-1 rounded">#{t.booking_ref}</span>}
                    </div>
                  );
                })}
                {dayAccommodations.map((a) => {
                  const isCheckIn = a.check_in && a.check_in.slice(0, 10) === dayStr;
                  const isCheckOut = a.check_out && a.check_out.slice(0, 10) === dayStr;
                  return (
                    <div key={a.id} className="flex items-center gap-1.5 text-xs text-sky-800">
                      <span>🏨</span>
                      <span className="font-medium">{isCheckIn && isCheckOut ? "Check-in & -out" : isCheckIn ? "Check-in" : "Check-out"}: {a.name}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="divide-y divide-gray-50">
              {day.activities.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-400 italic">Geen activiteiten</div>
              ) : (
                day.activities.map((act) => (
                  <div key={act.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 group">
                    <div className="text-lg mt-0.5">{CATEGORY_ICONS[act.category] || "📌"}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {act.time && <span className="text-xs font-mono text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded">{act.time}</span>}
                        <span className="font-medium text-gray-800 text-sm">{act.title}</span>
                      </div>
                      {act.location && <div className="text-xs text-gray-400 mt-0.5">📍 {act.location}</div>}
                      {act.notes && <div className="text-xs text-gray-500 mt-0.5">{act.notes}</div>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {act.cost && <span className="text-xs text-gray-400">{fmtMoney(act.cost)}</span>}
                      <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                        <button onClick={() => setEditingActivity(act)} className="text-gray-400 hover:text-sky-600 text-xs">✏️</button>
                        <button onClick={() => handleDeleteActivity(act.id)} className="text-gray-400 hover:text-red-500 text-xs">🗑</button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          );
        })}
      </div>

      {showActivityForm && (
        <ActivityForm
          dayId={showActivityForm.dayId}
          tripId={trip.id}
          onSaved={() => { setShowActivityForm(null); onRefresh(); }}
          onClose={() => setShowActivityForm(null)}
        />
      )}
      {editingActivity && (
        <ActivityForm
          dayId={editingActivity.day_id}
          tripId={trip.id}
          initial={editingActivity}
          onSaved={() => { setEditingActivity(null); onRefresh(); }}
          onClose={() => setEditingActivity(null)}
        />
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
function BudgetTab({ trip, expenses, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  async function handleDelete(id) {
    if (!confirm("Uitgave verwijderen?")) return;
    await api.deleteExpense(id);
    onRefresh();
  }

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0);
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

      {showForm && <ExpenseForm tripId={trip.id} onSaved={() => { setShowForm(false); onRefresh(); }} onClose={() => setShowForm(false)} />}
      {editing && <ExpenseForm tripId={trip.id} initial={editing} onSaved={() => { setEditing(null); onRefresh(); }} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ---------- Import modal ----------
function ImportModal({ tripId, onImported, onClose }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState({ transports: [], accommodations: [], activities: [] });
  const [days, setDays] = useState([]);
  const [activityDays, setActivityDays] = useState({});

  useEffect(() => { api.getDays(tripId).then(setDays); }, [tripId]);

  async function handleAnalyze(e) {
    e.preventDefault();
    setLoading(true); setError(null); setResult(null);
    try {
      const data = await api.importEmail(tripId, text);
      setResult(data);
      // Pre-select day based on activity date if a matching day exists
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
          <p className="text-sm text-gray-500">Plak de tekst van je boekingsbevestiging hieronder. Claude analyseert de e-mail en extraheert vluchten, hotels en activiteiten automatisch.</p>
          {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
          <Field label="Tekst van de bevestiging">
            <Textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="Plak hier de volledige tekst van je boekingsbevestiging..." required />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>Annuleren</Button>
            <Button type="submit" disabled={loading || !text.trim()}>
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

  const tabs = [
    { key: "days", label: "Dagen", icon: "🗓" },
    { key: "accommodation", label: "Verblijf", icon: "🏨" },
    { key: "transport", label: "Vervoer", icon: "✈️" },
    { key: "budget", label: "Budget", icon: "💰" },
  ];

  return (
    <div>
      <button onClick={onBack} className="text-sky-600 hover:text-sky-800 mb-4 inline-flex items-center gap-1 text-sm">
        ← Alle reizen
      </button>

      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
        {trip.cover_image
          ? <div className="h-48 w-full overflow-hidden"><img src={trip.cover_image} alt={trip.destination || trip.name} className="w-full h-full object-cover" /></div>
          : <div className="h-2 w-full" style={{ background: trip.cover_color || "#0369a1" }} />}
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{trip.name}</h2>
              {trip.destination && <div className="text-gray-500 mt-0.5">📍 {trip.destination}</div>}
              <div className="flex gap-4 mt-2 text-sm text-gray-500 flex-wrap">
                {trip.start_date && <span>📅 {fmt(trip.start_date)} — {fmt(trip.end_date)} {tripDuration(trip.start_date, trip.end_date) ? `(${tripDuration(trip.start_date, trip.end_date)})` : ""}</span>}
                {trip.budget && <span>💰 Budget: {fmtMoney(trip.budget, trip.currency)}</span>}
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[trip.status]}`}>{STATUS_LABELS[trip.status]}</span>
              </div>
              {trip.notes && <div className="text-sm text-gray-500 mt-2">{trip.notes}</div>}
            </div>
            <div className="flex gap-2 shrink-0 flex-wrap justify-end">
              <Button variant="secondary" onClick={() => setImporting(true)}>📧 Bevestiging importeren</Button>
              <Button variant="secondary" onClick={() => setEditing(true)}>✏️ Bewerken</Button>
              <Button variant="danger" onClick={handleDelete}>🗑 Verwijderen</Button>
            </div>
          </div>
        </div>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === "days" && <DayPlanningTab trip={trip} days={days} transports={transports} accommodations={accommodations} onRefresh={load} />}
      {tab === "accommodation" && <AccommodationTab trip={trip} accommodations={accommodations} onRefresh={load} />}
      {tab === "transport" && <TransportTab trip={trip} transports={transports} onRefresh={load} />}
      {tab === "budget" && <BudgetTab trip={trip} expenses={expenses} onRefresh={load} />}

      {editing && <TripForm initial={trip} onSaved={() => { setEditing(false); load(); onChanged(); }} onClose={() => setEditing(false)} />}
      {importing && <ImportModal tripId={tripId} onImported={load} onClose={() => setImporting(false)} />}
    </div>
  );
}

// ---------- Admin view ----------
function AdminView({ onBack }) {
  const [trips, setTrips] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

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

  // Unassigned trips first, then by user
  const groups = [
    ...(byUser["unassigned"] ? [{ key: "unassigned", name: "Niet gekoppeld", email: null, avatar: null, trips: byUser["unassigned"].trips }] : []),
    ...Object.entries(byUser).filter(([k]) => k !== "unassigned").map(([, v]) => v),
  ];

  return (
    <div>
      <button onClick={onBack} className="text-sky-600 hover:text-sky-800 mb-4 inline-flex items-center gap-1 text-sm">← Mijn reizen</button>
      <h2 className="text-xl font-bold text-gray-800 mb-6">Alle reizen</h2>
      {loading ? <div className="text-center py-16 text-gray-400">Laden...</div> : (
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
                      <Select
                        value={t.user_id || ""}
                        onChange={(e) => handleAssign(t.id, e.target.value || null)}
                        className="text-xs"
                      >
                        <option value="">— Niet gekoppeld —</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>{u.name || u.email}</option>
                        ))}
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
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
      .then((u) => { setUser(u); setAuthLoading(false); });
  }, []);

  const loadTrips = useCallback(async () => {
    setLoading(true);
    try { setTrips(await api.getTrips()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (user) loadTrips(); }, [user, loadTrips]);

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

  return (
    <div className="min-h-screen">
      <header className="bg-sky-800 text-white py-6 px-4 sm:px-8 mb-6 shadow-md">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2 cursor-pointer" onClick={() => setView({ name: "list" })}>
              ✈️ Reisplanner
            </h1>
            <p className="text-sky-200 text-sm mt-0.5">Jouw reizen, overzichtelijk gepland</p>
          </div>
          <div className="flex items-center gap-3">
            {view.name === "list" && (
              <Button onClick={() => setShowTripForm(true)} className="!bg-white !text-sky-800 hover:!bg-sky-100 font-semibold">
                + Nieuwe reis
              </Button>
            )}
            {user.is_admin && view.name !== "admin" && (
              <button onClick={() => setView({ name: "admin" })} className="text-sky-300 hover:text-white text-xs px-2 py-1 rounded hover:bg-sky-700 transition-colors">
                👁 Alle reizen
              </button>
            )}
            <div className="flex items-center gap-2 border-l border-sky-700 pl-3">
              {user.avatar && <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full" />}
              <span className="text-sm text-sky-200 hidden sm:block">{user.name || user.email}</span>
              <button onClick={handleLogout} className="text-sky-300 hover:text-white text-xs px-2 py-1 rounded hover:bg-sky-700 transition-colors">Uitloggen</button>
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

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
