const { useState, useEffect, useRef } = React;

// ---------- Error boundary ----------
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) return (
      <div className="min-h-screen flex items-center justify-center p-8" style={{ background: "#fdf6f0" }}>
        <div className="bg-white rounded-2xl shadow p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">😕</div>
          <h2 className="text-lg font-bold text-gray-800 mb-2">Er ging iets mis</h2>
          <p className="text-sm text-gray-500 mb-4">{this.state.error.message}</p>
          <button onClick={() => window.location.reload()} className="px-6 py-2 rounded-xl text-white text-sm font-medium" style={{ background: "#7c2d12" }}>Pagina herladen</button>
        </div>
      </div>
    );
    return this.props.children;
  }
}

// ---------- Constants ----------
const WINE_TYPES = ["Rood", "Wit", "Rosé", "Mousseux", "Dessert", "Versterkt", "Oranje"];
const WINE_TYPE_COLORS = {
  "Rood": "#7c2d12", "Wit": "#a16207", "Rosé": "#be185d",
  "Mousseux": "#7c3aed", "Dessert": "#92400e", "Versterkt": "#9a3412", "Oranje": "#c2410c",
};
const WINE_TYPE_ICONS = {
  "Rood": "🍷", "Wit": "🥂", "Rosé": "🌸",
  "Mousseux": "🍾", "Dessert": "🍯", "Versterkt": "🫙", "Oranje": "🍊",
};

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
  getWines: () => apiFetch("/api/wines"),
  createWine: (d) => apiFetch("/api/wines", { method: "POST", body: JSON.stringify(d) }),
  updateWine: (id, d) => apiFetch(`/api/wines/${id}`, { method: "PUT", body: JSON.stringify(d) }),
  deleteWine: (id) => apiFetch(`/api/wines/${id}`, { method: "DELETE" }),
  getStats: () => apiFetch("/api/wines/stats"),
  getTastings: (wineId) => apiFetch(`/api/wines/${wineId}/tastings`),
  addTasting: (wineId, d) => apiFetch(`/api/wines/${wineId}/tastings`, { method: "POST", body: JSON.stringify(d) }),
  updateTasting: (id, d) => apiFetch(`/api/tastings/${id}`, { method: "PUT", body: JSON.stringify(d) }),
  deleteTasting: (id) => apiFetch(`/api/tastings/${id}`, { method: "DELETE" }),
  getAiTip: (wineId, type) => apiFetch(`/api/wines/${wineId}/ai-tip?type=${type}`),
};

// ---------- Helpers ----------
function fmtMoney(n) {
  if (n == null || n === "") return null;
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}
function fmtDate(d) {
  if (!d) return null;
  return new Date(String(d).slice(0, 10) + "T12:00:00Z").toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
function drinkWindowStatus(wine) {
  const y = new Date().getFullYear();
  if (!wine.drink_from && !wine.drink_until) return "unknown";
  if (wine.drink_from && y < wine.drink_from) return "too-early";
  if (wine.drink_until && y > wine.drink_until) return "past";
  return "ready";
}
function drinkWindowLabel(wine) {
  const s = drinkWindowStatus(wine);
  if (s === "unknown") return null;
  if (s === "too-early") return `Drinken vanaf ${wine.drink_from}`;
  if (s === "past") return `Voorbij drinkvenster (t/m ${wine.drink_until})`;
  if (wine.drink_from && wine.drink_until) return `Drinkbaar: ${wine.drink_from}–${wine.drink_until}`;
  if (wine.drink_from) return `Drinkbaar vanaf ${wine.drink_from}`;
  return null;
}
const STATUS_COLORS = { "too-early": "#6b7280", "ready": "#15803d", "past": "#dc2626", "unknown": "#9ca3af" };

// ---------- Stars ----------
function Stars({ rating, onChange, size = "base" }) {
  const r = Math.round(rating) || 0;
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <button key={i} type={onChange ? "button" : undefined}
          onClick={onChange ? () => onChange(r === i ? 0 : i) : undefined}
          className={`${size === "lg" ? "text-2xl" : "text-base"} ${onChange ? "cursor-pointer hover:scale-110 transition-transform" : "pointer-events-none"}`}
          style={{ color: i <= r ? "#f59e0b" : "#d1d5db" }}>
          ★
        </button>
      ))}
    </div>
  );
}

// ---------- UI Components ----------
function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", h); document.body.style.overflow = ""; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-md"} max-h-[92vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-semibold text-gray-800 truncate pr-4">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none w-8 h-8 flex items-center justify-center shrink-0">×</button>
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

const Input = ({ className = "", ...props }) =>
  <input className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:border-transparent ${className}`}
    style={{ "--tw-ring-color": "#fca5a5" }} {...props} />;

const Textarea = ({ className = "", ...props }) =>
  <textarea className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:border-transparent resize-none ${className}`} {...props} />;

const Select = ({ className = "", children, ...props }) =>
  <select className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 bg-white ${className}`} {...props}>{children}</select>;

function Btn({ variant = "primary", className = "", children, ...props }) {
  const styles = {
    primary: "text-white hover:opacity-90",
    secondary: "bg-gray-100 text-gray-700 hover:bg-gray-200",
    danger: "bg-red-50 text-red-600 hover:bg-red-100",
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 cursor-pointer active:scale-95 ${styles[variant]} ${className}`}
      style={variant === "primary" ? { background: "#7c2d12" } : {}}
      {...props}>
      {children}
    </button>
  );
}

// ---------- Wine Form ----------
const EMPTY_WINE = {
  name: "", producer: "", vintage_year: "", region: "", country: "",
  grape_variety: "", type: "Rood", price: "", purchase_date: "",
  bottles: "1", rack: "", notes: "", label_image: "", drink_from: "", drink_until: "",
};

function WineForm({ initial, onSaved, onClose }) {
  const [form, setForm] = useState(initial ? {
    ...EMPTY_WINE, ...initial,
    vintage_year: initial.vintage_year || "",
    price: initial.price || "",
    purchase_date: initial.purchase_date ? String(initial.purchase_date).slice(0, 10) : "",
    bottles: initial.bottles ?? 1,
    drink_from: initial.drink_from || "",
    drink_until: initial.drink_until || "",
    rack: initial.rack || "",
    notes: initial.notes || "",
    label_image: initial.label_image || "",
    grape_variety: initial.grape_variety || "",
    producer: initial.producer || "",
    region: initial.region || "",
    country: initial.country || "",
  } : { ...EMPTY_WINE });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const accent = WINE_TYPE_COLORS[form.type] || "#7c2d12";

  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true); setError(null);
    try {
      const data = {
        ...form,
        vintage_year: form.vintage_year ? parseInt(form.vintage_year) : null,
        bottles: form.bottles !== "" ? parseInt(form.bottles) : 1,
        price: form.price !== "" ? parseFloat(form.price) : null,
        drink_from: form.drink_from ? parseInt(form.drink_from) : null,
        drink_until: form.drink_until ? parseInt(form.drink_until) : null,
        purchase_date: form.purchase_date || null,
      };
      const saved = initial?.id ? await api.updateWine(initial.id, data) : await api.createWine(data);
      onSaved(saved);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  return (
    <Modal title={initial?.id ? "Wijn bewerken" : "Wijn toevoegen"} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Field label="Naam *">
              <Input required value={form.name} onChange={set("name")} placeholder="bijv. Château Margaux" />
            </Field>
          </div>
          <Field label="Type">
            <Select value={form.type} onChange={set("type")} style={{ borderColor: accent + "66" }}>
              {WINE_TYPES.map(t => <option key={t}>{t}</option>)}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Producent / wijnhuis">
            <Input value={form.producer} onChange={set("producer")} placeholder="bijv. Château Margaux" />
          </Field>
          <Field label="Jaargang">
            <Input type="number" min="1900" max={new Date().getFullYear()} value={form.vintage_year} onChange={set("vintage_year")} placeholder={new Date().getFullYear()} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Regio / appellation">
            <Input value={form.region} onChange={set("region")} placeholder="bijv. Margaux, Bordeaux" />
          </Field>
          <Field label="Land">
            <Input value={form.country} onChange={set("country")} placeholder="bijv. Frankrijk" />
          </Field>
        </div>

        <Field label="Druivenras(sen)">
          <Input value={form.grape_variety} onChange={set("grape_variety")} placeholder="bijv. Cabernet Sauvignon, Merlot" />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Flessen">
            <Input type="number" min="0" value={form.bottles} onChange={set("bottles")} />
          </Field>
          <Field label="Prijs per fles (€)">
            <Input type="number" min="0" step="0.01" value={form.price} onChange={set("price")} placeholder="0" />
          </Field>
          <Field label="Aankoopdatum">
            <Input type="date" value={form.purchase_date} onChange={set("purchase_date")} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Drinken vanaf (jaar)">
            <Input type="number" min="2000" max="2100" value={form.drink_from} onChange={set("drink_from")} placeholder="bijv. 2025" />
          </Field>
          <Field label="Drinken voor (jaar)">
            <Input type="number" min="2000" max="2100" value={form.drink_until} onChange={set("drink_until")} placeholder="bijv. 2035" />
          </Field>
        </div>

        <Field label="Kelderlocatie" hint="bijv. rek, rij, positie">
          <Input value={form.rack} onChange={set("rack")} placeholder="bijv. Rek A, rij 3, positie 7" />
        </Field>

        <Field label="Persoonlijke notities">
          <Textarea rows={3} value={form.notes} onChange={set("notes")} placeholder="Indrukken, aankoopomstandigheden..." />
        </Field>

        <Field label="Etiketfoto (URL)" hint="optioneel">
          <Input value={form.label_image} onChange={set("label_image")} placeholder="https://..." />
          {form.label_image && (
            <img src={form.label_image} alt="preview" className="mt-2 h-24 w-auto rounded-lg object-contain border border-gray-100" onError={e => e.target.style.display = "none"} />
          )}
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Btn type="button" variant="secondary" onClick={onClose}>Annuleren</Btn>
          <Btn type="submit" disabled={saving} style={{ background: accent }}>{saving ? "Opslaan..." : "Opslaan"}</Btn>
        </div>
      </form>
    </Modal>
  );
}

// ---------- Tasting Form ----------
function TastingForm({ wineId, initial, onSaved, onClose, wineColor }) {
  const [form, setForm] = useState(initial ? {
    tasting_date: initial.tasting_date ? String(initial.tasting_date).slice(0, 10) : "",
    rating: initial.rating || 0,
    nose: initial.nose || "",
    palate: initial.palate || "",
    finish: initial.finish || "",
    notes: initial.notes || "",
  } : { tasting_date: new Date().toISOString().slice(0, 10), rating: 0, nose: "", palate: "", finish: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const accent = wineColor || "#7c2d12";

  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true);
    try {
      const data = { ...form, rating: form.rating || null };
      const saved = initial?.id ? await api.updateTasting(initial.id, data) : await api.addTasting(wineId, data);
      onSaved(saved);
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!confirm("Proefnotitie verwijderen?")) return;
    await api.deleteTasting(initial.id);
    onSaved(null, true);
  }

  return (
    <Modal title={initial?.id ? "Proefnotitie bewerken" : "Proefnotitie toevoegen"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Datum">
            <Input type="date" value={form.tasting_date} onChange={set("tasting_date")} />
          </Field>
          <Field label="Beoordeling">
            <div className="pt-1">
              <Stars rating={form.rating} onChange={(r) => setForm(f => ({ ...f, rating: r }))} size="lg" />
            </div>
          </Field>
        </div>
        <Field label="Neus (geur & aroma)">
          <Input value={form.nose} onChange={set("nose")} placeholder="Fruitig, kruidig, bloemig..." />
        </Field>
        <Field label="Smaak (palate)">
          <Input value={form.palate} onChange={set("palate")} placeholder="Structuur, tannines, zuurgraad..." />
        </Field>
        <Field label="Afdronk (finish)">
          <Input value={form.finish} onChange={set("finish")} placeholder="Lang, kort, zacht, droog..." />
        </Field>
        <Field label="Algemene notities">
          <Textarea rows={3} value={form.notes} onChange={set("notes")} placeholder="Totaalindruk, combinatie, gelegenheid..." />
        </Field>
        <div className="flex justify-between items-center pt-2">
          {initial?.id
            ? <Btn type="button" variant="danger" onClick={handleDelete}>🗑 Verwijderen</Btn>
            : <span />}
          <div className="flex gap-2">
            <Btn type="button" variant="secondary" onClick={onClose}>Annuleren</Btn>
            <Btn type="submit" disabled={saving} style={{ background: accent }}>{saving ? "Opslaan..." : "Opslaan"}</Btn>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// ---------- AI Tip Panel ----------
function AiTipPanel({ wine }) {
  const [activeType, setActiveType] = useState(null);
  const [tips, setTips] = useState({});
  const [loading, setLoading] = useState(null);
  const color = WINE_TYPE_COLORS[wine.type] || "#7c2d12";

  async function loadTip(type) {
    if (activeType === type) { setActiveType(null); return; }
    setActiveType(type);
    if (tips[type]) return;
    setLoading(type);
    try {
      const data = await api.getAiTip(wine.id, type);
      setTips(t => ({ ...t, [type]: data }));
    } catch { setTips(t => ({ ...t, [type]: { error: true } })); }
    finally { setLoading(null); }
  }

  const tipButtons = [
    { type: "pairing", icon: "🍽", label: "Spijscombinaties" },
    { type: "window", icon: "📅", label: "Drinkmoment" },
    { type: "similar", icon: "🔍", label: "Vergelijkbare wijnen" },
  ];

  return (
    <div className="space-y-2">
      <div className="text-xs text-gray-400 text-center pb-1">✨ Gegenereerd door Claude AI</div>
      {tipButtons.map(({ type, icon, label }) => (
        <div key={type} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <button onClick={() => loadTip(type)}
            className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors">
            <span className="text-lg">{icon}</span>
            <span className="font-medium text-gray-800 text-sm flex-1">{label}</span>
            <span className="text-gray-400 text-xs transition-transform" style={{ display: "inline-block", transform: activeType === type ? "rotate(180deg)" : "none" }}>▾</span>
          </button>
          {activeType === type && (
            <div className="border-t border-gray-100 px-4 py-3">
              {loading === type ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-3 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-full" />
                  <div className="h-3 bg-gray-100 rounded w-2/3" />
                </div>
              ) : tips[type]?.error ? (
                <div className="text-sm text-red-500">Kon tips niet laden. <button onClick={() => { setTips(t => { const n = {...t}; delete n[type]; return n; }); loadTip(type); }} className="underline">Opnieuw</button></div>
              ) : tips[type] ? (
                <div className="space-y-3">
                  {type === "pairing" && (tips[type].pairings || []).map((p, i) => (
                    <div key={i} className="flex gap-2">
                      <div className="w-5 h-5 rounded-full text-white text-xs flex items-center justify-center shrink-0 mt-0.5" style={{ background: color }}>{i+1}</div>
                      <div>
                        <div className="text-sm font-semibold text-gray-800">{p.dish}</div>
                        {p.reason && <div className="text-xs text-gray-500 mt-0.5">{p.reason}</div>}
                      </div>
                    </div>
                  ))}
                  {type === "window" && (
                    <div className="space-y-2">
                      {tips[type].advice && <p className="text-sm text-gray-700 leading-relaxed">{tips[type].advice}</p>}
                      {tips[type].optimal_year && <div className="text-xs font-medium px-3 py-1.5 rounded-lg inline-block" style={{ background: color + "15", color }}>🎯 Optimaal: {tips[type].optimal_year}</div>}
                      {tips[type].peak && <div className="text-xs text-gray-500">⭐ Piek: {tips[type].peak}</div>}
                    </div>
                  )}
                  {type === "similar" && (tips[type].wines || []).map((w, i) => (
                    <div key={i} className="bg-gray-50 rounded-lg p-3">
                      <div className="text-sm font-semibold text-gray-800">{w.producer ? `${w.producer} ` : ""}{w.name}</div>
                      {w.region && <div className="text-xs text-gray-500">📍 {w.region}</div>}
                      {w.reason && <div className="text-xs text-gray-600 mt-1">{w.reason}</div>}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------- Wine Detail Modal ----------
function WineDetail({ wine: initialWine, onClose, onUpdated, onDeleted }) {
  const [wine, setWine] = useState(initialWine);
  const [tastings, setTastings] = useState([]);
  const [loadingTastings, setLoadingTastings] = useState(true);
  const [activeTab, setActiveTab] = useState("info");
  const [showEditForm, setShowEditForm] = useState(false);
  const [showTastingForm, setShowTastingForm] = useState(false);
  const [editingTasting, setEditingTasting] = useState(null);
  const color = WINE_TYPE_COLORS[wine.type] || "#7c2d12";
  const icon = WINE_TYPE_ICONS[wine.type] || "🍷";

  useEffect(() => {
    api.getTastings(wine.id).then(t => { setTastings(t); setLoadingTastings(false); }).catch(() => setLoadingTastings(false));
  }, [wine.id]);

  async function handleDelete() {
    if (!confirm(`"${wine.name}" definitief verwijderen uit je kelder?`)) return;
    try { await api.deleteWine(wine.id); onDeleted(wine.id); onClose(); }
    catch (err) { alert(err.message); }
  }

  const status = drinkWindowStatus(wine);
  const statusLabel = drinkWindowLabel(wine);
  const avgRating = wine.avg_rating ? parseFloat(wine.avg_rating) : null;

  const infoItems = [
    wine.grape_variety && { icon: "🍇", label: "Druivenras", value: wine.grape_variety },
    (wine.drink_from || wine.drink_until) && { icon: "📅", label: "Drinkvenster", value: [wine.drink_from, wine.drink_until].filter(Boolean).join(" – ") },
    wine.rack && { icon: "📦", label: "Kelderlocatie", value: wine.rack },
    wine.price && { icon: "💶", label: "Prijs per fles", value: fmtMoney(wine.price) },
    wine.purchase_date && { icon: "🗓", label: "Aankoopdatum", value: fmtDate(wine.purchase_date) },
    wine.notes && { icon: "📝", label: "Notities", value: wine.notes },
  ].filter(Boolean);

  return (
    <>
      <Modal title="" onClose={onClose} wide>
        {/* Header */}
        <div className="flex items-start gap-4 mb-5">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shrink-0 overflow-hidden" style={{ background: color + "18" }}>
            {wine.label_image
              ? <img src={wine.label_image} alt={wine.name} className="w-16 h-16 object-cover" onError={e => { e.target.style.display="none"; e.target.nextSibling.style.display="flex"; }} />
              : null}
            <span style={wine.label_image ? { display: "none" } : {}}>{icon}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 flex-wrap mb-1">
              <h2 className="text-xl font-bold text-gray-900 leading-tight">{wine.name}</h2>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white shrink-0 mt-0.5" style={{ background: color }}>{wine.type}</span>
            </div>
            {wine.producer && <div className="text-sm font-medium text-gray-600">{wine.producer}</div>}
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {wine.vintage_year && <span className="text-sm font-bold text-gray-800">{wine.vintage_year}</span>}
              {wine.region && <span className="text-xs text-gray-500">📍 {wine.region}{wine.country ? `, ${wine.country}` : ""}</span>}
            </div>
            {avgRating && <div className="mt-1.5"><Stars rating={avgRating} /></div>}
          </div>
          <div className="flex gap-1 shrink-0">
            <button onClick={() => setShowEditForm(true)} className="p-2 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100 transition-colors">✏️</button>
            <button onClick={handleDelete} className="p-2 text-gray-400 hover:text-red-500 rounded-xl hover:bg-red-50 transition-colors">🗑</button>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="rounded-xl p-3 text-center border" style={{ background: color + "08", borderColor: color + "25" }}>
            <div className="text-2xl font-bold" style={{ color: wine.bottles === 0 ? "#9ca3af" : color }}>{wine.bottles}</div>
            <div className="text-xs text-gray-500">{wine.bottles === 1 ? "fles" : "flessen"}</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
            <div className="text-2xl font-bold text-gray-800">{tastings.length}</div>
            <div className="text-xs text-gray-500">{tastings.length === 1 ? "proefnotitie" : "proefnotities"}</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
            {avgRating ? (
              <>
                <div className="text-2xl font-bold text-amber-500">{avgRating.toFixed(1)}</div>
                <div className="text-xs text-gray-500">gem. score</div>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-gray-300">—</div>
                <div className="text-xs text-gray-400">geen score</div>
              </>
            )}
          </div>
        </div>

        {/* Drink window badge */}
        {statusLabel && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-4 text-sm font-medium" style={{ background: STATUS_COLORS[status] + "15", color: STATUS_COLORS[status] }}>
            <span>●</span><span>{statusLabel}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5">
          {[
            { key: "info", label: "📋 Info" },
            { key: "tastings", label: `🍷 Proeven (${tastings.length})` },
            { key: "ai", label: "✨ AI Tips" },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className="flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
              style={activeTab === tab.key ? { background: "white", color, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" } : { color: "#6b7280" }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Info tab */}
        {activeTab === "info" && (
          <div>
            {infoItems.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <div className="text-3xl mb-2">📋</div>
                <div className="text-sm">Geen extra details ingevuld</div>
                <button onClick={() => setShowEditForm(true)} className="mt-2 text-xs underline" style={{ color }}>Details toevoegen</button>
              </div>
            ) : (
              <div className="space-y-2">
                {infoItems.map(({ icon: ic, label, value }) => (
                  <div key={label} className="bg-gray-50 rounded-xl px-4 py-3">
                    <div className="text-xs text-gray-500 mb-0.5">{ic} {label}</div>
                    <div className="text-sm text-gray-800">{value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tastings tab */}
        {activeTab === "tastings" && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-gray-700">Proefnotities</h3>
              <Btn variant="secondary" onClick={() => setShowTastingForm(true)}>+ Toevoegen</Btn>
            </div>
            {loadingTastings ? (
              <div className="space-y-2">
                {[1,2].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
              </div>
            ) : tastings.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <div className="text-4xl mb-2">🍷</div>
                <div className="text-sm">Nog geen proefnotities</div>
                <button onClick={() => setShowTastingForm(true)} className="mt-2 text-xs underline" style={{ color }}>Eerste notitie toevoegen</button>
              </div>
            ) : (
              <div className="space-y-3">
                {tastings.map(t => (
                  <div key={t.id}
                    onClick={() => setEditingTasting(t)}
                    className="bg-gray-50 rounded-xl p-4 cursor-pointer hover:bg-gray-100 transition-colors border border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      {t.tasting_date && <div className="text-xs font-medium text-gray-600">{fmtDate(t.tasting_date)}</div>}
                      {t.rating ? <Stars rating={t.rating} /> : <span className="text-xs text-gray-400">Geen beoordeling</span>}
                    </div>
                    {t.nose && <div className="text-xs text-gray-600 mb-1"><span className="font-semibold text-gray-700">Neus:</span> {t.nose}</div>}
                    {t.palate && <div className="text-xs text-gray-600 mb-1"><span className="font-semibold text-gray-700">Smaak:</span> {t.palate}</div>}
                    {t.finish && <div className="text-xs text-gray-600 mb-1"><span className="font-semibold text-gray-700">Afdronk:</span> {t.finish}</div>}
                    {t.notes && <div className="text-sm text-gray-700 mt-1.5 leading-relaxed">{t.notes}</div>}
                    <div className="text-xs text-gray-400 mt-2 text-right">Klik om te bewerken →</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* AI tab */}
        {activeTab === "ai" && <AiTipPanel wine={wine} />}
      </Modal>

      {showEditForm && (
        <WineForm initial={wine}
          onSaved={(w) => { const updated = { ...wine, ...w }; setWine(updated); setShowEditForm(false); onUpdated(updated); }}
          onClose={() => setShowEditForm(false)} />
      )}
      {(showTastingForm || editingTasting) && (
        <TastingForm
          wineId={wine.id}
          initial={editingTasting || null}
          wineColor={color}
          onSaved={(t, deleted) => {
            if (deleted) {
              setTastings(prev => prev.filter(x => x.id !== editingTasting?.id));
            } else if (editingTasting) {
              setTastings(prev => prev.map(x => x.id === t.id ? t : x));
            } else {
              setTastings(prev => [t, ...prev]);
            }
            setWine(w => ({ ...w, tasting_count: deleted ? Math.max(0, (w.tasting_count||1)-1) : (editingTasting ? w.tasting_count : (w.tasting_count||0)+1) }));
            setShowTastingForm(false); setEditingTasting(null);
          }}
          onClose={() => { setShowTastingForm(false); setEditingTasting(null); }}
        />
      )}
    </>
  );
}

// ---------- Wine Card ----------
function WineCard({ wine, onClick }) {
  const color = WINE_TYPE_COLORS[wine.type] || "#7c2d12";
  const icon = WINE_TYPE_ICONS[wine.type] || "🍷";
  const status = drinkWindowStatus(wine);
  const statusColor = STATUS_COLORS[status];
  const isEmpty = wine.bottles === 0;

  return (
    <div onClick={onClick}
      className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-all active:scale-[0.99] ${isEmpty ? "opacity-60" : ""}`}
      style={{ WebkitTapHighlightColor: "transparent" }}>
      <div className="flex items-center gap-3 p-4">
        <div className="w-1.5 self-stretch rounded-full shrink-0" style={{ background: color }} />
        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 overflow-hidden" style={{ background: color + "12" }}>
          {wine.label_image
            ? <img src={wine.label_image} alt="" className="w-11 h-11 object-cover" onError={e => { e.target.style.display="none"; }} />
            : icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-gray-900 text-sm truncate">{wine.name}</div>
              {wine.producer && <div className="text-xs text-gray-500 truncate">{wine.producer}</div>}
            </div>
            {wine.avg_rating && (
              <div className="shrink-0 flex items-center gap-0.5 mt-0.5">
                <span className="text-sm" style={{ color: "#f59e0b" }}>★</span>
                <span className="text-xs font-bold text-gray-700">{parseFloat(wine.avg_rating).toFixed(1)}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {wine.vintage_year && (
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-600">{wine.vintage_year}</span>
            )}
            {wine.region && <span className="text-xs text-gray-400 truncate max-w-[140px]">{wine.region}</span>}
            {status !== "unknown" && <span className="text-xs font-bold" style={{ color: statusColor }}>●</span>}
          </div>
        </div>
        <div className="shrink-0 text-right pl-1">
          <div className="text-xl font-bold" style={{ color: isEmpty ? "#9ca3af" : color }}>{wine.bottles}</div>
          <div className="text-xs text-gray-400 leading-tight">{isEmpty ? "leeg" : wine.bottles === 1 ? "fles" : "flessen"}</div>
        </div>
      </div>
    </div>
  );
}

// ---------- Stats Bar ----------
function StatsBar({ stats }) {
  if (!stats) return (
    <div className="grid grid-cols-3 gap-2 mb-5">
      {[1,2,3].map(i => <div key={i} className="h-16 bg-white rounded-xl animate-pulse border border-gray-100" />)}
    </div>
  );
  const items = [
    { value: Number(stats.total_bottles), label: "flessen" },
    { value: Number(stats.total_labels), label: "labels" },
    { value: stats.ready_to_drink?.length || 0, label: "drink nu", highlight: stats.ready_to_drink?.length > 0 },
    Number(stats.total_value) > 0 && { value: fmtMoney(stats.total_value), label: "waarde" },
  ].filter(Boolean);

  return (
    <div className={`grid gap-2 mb-5`} style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
      {items.map(({ value, label, highlight }) => (
        <div key={label} className="bg-white rounded-xl p-3 text-center border border-gray-100 shadow-sm">
          <div className="font-bold text-lg leading-tight" style={{ color: highlight ? "#15803d" : "#111827" }}>{value}</div>
          <div className="text-xs text-gray-500 mt-0.5 leading-tight">{label}</div>
        </div>
      ))}
    </div>
  );
}

// ---------- Ready To Drink Strip ----------
function ReadyToDrink({ wines, allWines, onSelect }) {
  if (!wines || wines.length === 0) return null;
  const color = "#15803d";
  return (
    <div className="mb-5">
      <div className="text-xs font-bold text-green-700 uppercase tracking-wide mb-2">🟢 Klaar om te drinken</div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
        {wines.map(w => {
          const c = WINE_TYPE_COLORS[w.type] || "#7c2d12";
          const full = allWines.find(x => x.id === w.id) || w;
          return (
            <div key={w.id} onClick={() => onSelect(full)}
              className="shrink-0 bg-white rounded-2xl border border-green-100 shadow-sm p-3 cursor-pointer hover:shadow-md transition-shadow"
              style={{ minWidth: "130px", maxWidth: "150px" }}>
              <div className="text-2xl mb-1.5">{WINE_TYPE_ICONS[w.type] || "🍷"}</div>
              <div className="text-xs font-bold text-gray-900 line-clamp-2 leading-tight">{w.name}</div>
              {w.producer && <div className="text-xs text-gray-400 truncate mt-0.5">{w.producer}</div>}
              {w.vintage_year && <div className="text-xs font-semibold mt-1" style={{ color: c }}>{w.vintage_year}</div>}
              <div className="text-xs font-bold text-green-700 mt-1">{w.bottles} fles{w.bottles !== 1 ? "sen" : ""}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Main WineCellar ----------
function WineCellar({ user, onLogout }) {
  const [wines, setWines] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedWine, setSelectedWine] = useState(null);
  const [showUserMenu, setShowUserMenu] = useState(false);

  async function reload() {
    try {
      const [w, s] = await Promise.all([api.getWines(), api.getStats()]);
      setWines(w); setStats(s);
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { reload(); }, []);

  const filtered = wines.filter(w =>
    (!filterType || w.type === filterType) &&
    (!search || [w.name, w.producer, w.region, w.country, w.grape_variety]
      .filter(Boolean).some(s => s.toLowerCase().includes(search.toLowerCase())))
  );

  const accent = "#7c2d12";
  const initial = (user.name || user.email || "?")[0].toUpperCase();

  return (
    <div className="min-h-screen" style={{ background: "#fdf6f0" }}>
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-gray-100 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🍷</span>
            <div>
              <div className="font-bold text-gray-900 text-base leading-tight">Mijn Wijnkelder</div>
              <div className="text-xs text-gray-400 leading-tight">{wines.length} {wines.length === 1 ? "wijn" : "wijnen"}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowAddForm(true)}
              className="text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-sm hover:opacity-90 active:scale-95 transition-all"
              style={{ background: accent }}>
              + Wijn
            </button>
            <div className="relative">
              <button onClick={() => setShowUserMenu(v => !v)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold hover:opacity-90 transition-opacity"
                style={{ background: user.avatar ? "transparent" : accent }}>
                {user.avatar
                  ? <img src={user.avatar} alt="" className="w-9 h-9 rounded-full" />
                  : initial}
              </button>
              {showUserMenu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowUserMenu(false)} />
                  <div className="absolute right-0 mt-1 w-52 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-40">
                    <div className="px-4 py-2 border-b border-gray-100 mb-1">
                      <div className="text-sm font-semibold text-gray-800 truncate">{user.name || "Gebruiker"}</div>
                      {user.email && <div className="text-xs text-gray-400 truncate">{user.email}</div>}
                    </div>
                    <button
                      onClick={async () => { await apiFetch("/auth/logout", { method: "POST" }); onLogout(); }}
                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
                      Uitloggen
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 pt-5 pb-24">
        <StatsBar stats={stats} />

        {stats?.ready_to_drink?.length > 0 && !search && !filterType && (
          <ReadyToDrink wines={stats.ready_to_drink} allWines={wines} onSelect={setSelectedWine} />
        )}

        {/* Search */}
        <div className="relative mb-3">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Zoeken op naam, producent, regio..."
            className="w-full pl-4 pr-9 py-3 border border-gray-200 rounded-2xl text-sm bg-white focus:outline-none focus:ring-2 shadow-sm"
            style={{ "--tw-ring-color": "rgba(124,45,18,0.25)" }} />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-lg">×</button>
          )}
        </div>

        {/* Type filter chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4 -mx-1 px-1">
          <button onClick={() => setFilterType("")}
            className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all"
            style={!filterType ? { background: accent, borderColor: accent, color: "white" } : { background: "white", borderColor: "#e5e7eb", color: "#6b7280" }}>
            Alle
          </button>
          {WINE_TYPES.map(type => {
            const c = WINE_TYPE_COLORS[type];
            const active = filterType === type;
            const count = wines.filter(w => w.type === type).length;
            if (count === 0 && !active) return null;
            return (
              <button key={type} onClick={() => setFilterType(active ? "" : type)}
                className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all"
                style={active ? { background: c, borderColor: c, color: "white" } : { background: "white", borderColor: "#e5e7eb", color: c }}>
                {WINE_TYPE_ICONS[type]} {type} {count > 0 && <span className="ml-0.5 opacity-70">({count})</span>}
              </button>
            );
          })}
        </div>

        {/* Wine list */}
        {loading ? (
          <div className="space-y-2">
            {[1,2,3,4].map(i => <div key={i} className="h-[72px] bg-white rounded-2xl animate-pulse border border-gray-100" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            {wines.length === 0 ? (
              <>
                <div className="text-6xl mb-4">🍷</div>
                <div className="font-bold text-gray-700 text-xl mb-2">Welkom in je wijnkelder!</div>
                <div className="text-sm text-gray-400 mb-6">Voeg je eerste wijn toe om te beginnen.</div>
                <button onClick={() => setShowAddForm(true)}
                  className="px-8 py-3 rounded-2xl text-white text-sm font-bold shadow-lg hover:opacity-90 active:scale-95 transition-all"
                  style={{ background: accent }}>
                  🍷 Eerste wijn toevoegen
                </button>
              </>
            ) : (
              <>
                <div className="text-4xl mb-3">🔍</div>
                <div className="font-medium text-gray-600">Geen wijnen gevonden</div>
                <div className="text-sm mt-1">Pas je zoekterm of filter aan</div>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(wine => (
              <WineCard key={wine.id} wine={wine} onClick={() => setSelectedWine(wine)} />
            ))}
            {filtered.length > 0 && (
              <div className="text-center text-xs text-gray-400 pt-3">
                {filtered.length} {filtered.length === 1 ? "wijn" : "wijnen"} {filterType || search ? "gevonden" : "in je kelder"}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modals */}
      {showAddForm && (
        <WineForm
          onSaved={(w) => { setWines(prev => [{ ...w, tasting_count: 0, avg_rating: null }, ...prev]); setShowAddForm(false); reload(); }}
          onClose={() => setShowAddForm(false)} />
      )}
      {selectedWine && (
        <WineDetail
          wine={selectedWine}
          onClose={() => setSelectedWine(null)}
          onUpdated={(w) => { setWines(prev => prev.map(x => x.id === w.id ? { ...x, ...w } : x)); setSelectedWine(prev => ({ ...prev, ...w })); reload(); }}
          onDeleted={(id) => { setWines(prev => prev.filter(x => x.id !== id)); setSelectedWine(null); reload(); }}
        />
      )}
    </div>
  );
}

// ---------- Login screen ----------
function LoginScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#fdf6f0" }}>
      <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center">
        <div className="text-6xl mb-4">🍷</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Mijn Wijnkelder</h1>
        <p className="text-gray-500 text-sm mb-8 leading-relaxed">
          Beheer je wijnverzameling, schrijf proefnotities en krijg slimme AI-aanbevelingen.
        </p>
        <a href="/login"
          className="block w-full py-3 rounded-xl text-white font-bold text-sm hover:opacity-90 transition-opacity shadow-sm"
          style={{ background: "#7c2d12" }}>
          Inloggen of registreren
        </a>
      </div>
    </div>
  );
}

// ---------- Root App ----------
function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/auth/me")
      .then(u => { setUser(u); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#fdf6f0" }}>
      <div className="text-5xl animate-pulse">🍷</div>
    </div>
  );
  if (!user) return <LoginScreen />;
  return <WineCellar user={user} onLogout={() => setUser(null)} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary><App /></ErrorBoundary>
);
