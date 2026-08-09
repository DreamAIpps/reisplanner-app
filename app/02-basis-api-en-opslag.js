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
    d.trips = (d.trips || []).map(t => t.id === id ? (found = { ...t, ...data }) : t);
    // Dezelfde regel als op de server (synchroniseerDagen): de dagkaarten
    // volgen de reisperiode. Ontbrekende datums komen erbij, datums die er al
    // zijn blijven één kaart, en dagen buiten de nieuwe periode gaan alleen weg
    // als er niets aan hangt.
    if (data.start_date && data.end_date) {
      const binnen = dateRange(data.start_date, data.end_date);
      const bestaand = new Set((d.days || []).filter(x => x.trip_id === id).map(x => x.date));
      const erbij = binnen.filter((date) => !bestaand.has(date)).map((date) => ({ id: _gid(), trip_id: id, date }));
      const acts = d.activities || [], fotos = d.photos || [], verhalen = d.journal_entries || [];
      const heeftInhoud = (dag) => !!(dag.title || dag.notes)
        || acts.some((a) => a.day_id === dag.id)
        || fotos.some((p) => p.day_id === dag.id)
        || verhalen.some((e) => e.day_id === dag.id);
      d.days = [...(d.days || []).filter((dag) => dag.trip_id !== id || binnen.includes(dag.date) || heeftInhoud(dag)), ...erbij];
    }
    _gw(d); return Promise.resolve(found);
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
  zetFotoVoorop: (photoId) => apiFetch(`/api/photos/${photoId}/voorop`, { method: "PUT", body: "{}" }),
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
  // Reacties en duimpjes van de afgelopen dagen. In gastmodus bestaat er geen
  // server om het aan te vragen — daar reageert ook niemand, dus leeg.
  getReacties: (tripId, dagen = 7) => _guestMode ? Promise.resolve({ dagen, items: [] }) : apiFetch(`/api/trips/${tripId}/reacties?dagen=${dagen}`),
  // alleenKijken: opvragen zonder jezelf als deelnemer in te schrijven. Nodig om
  // te bepalen of de quiz aan een alleen-lezen bezoeker getoond moet worden.
  getQuizSession: (tripId, alleenKijken) => _guestMode ? Promise.resolve({ session: null })
    : apiFetch(`/api/trips/${tripId}/quiz/session${alleenKijken ? "?kijk=1" : ""}`),
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
  getHighlights: (tripId, dayId) => _guestMode
    ? Promise.reject(new Error("Log in om hoogtepunten op te halen"))
    : apiFetch(`/api/trips/${tripId}/highlights`, { method: "POST", body: JSON.stringify({ day_id: dayId }) }),
  getAdminTrips: () => _guestMode ? guestApi.getAdminTrips() : apiFetch("/api/admin/trips"),
  getAdminUsers: () => _guestMode ? guestApi.getAdminUsers() : apiFetch("/api/admin/users"),
  getAdminUserReizen: (userId) => _guestMode ? Promise.resolve([]) : apiFetch(`/api/admin/users/${userId}/reizen`),
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
