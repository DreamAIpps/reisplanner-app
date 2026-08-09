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
  const [, m, d] = iso.split("-").map(Number);
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
// Waar een lege datumkiezer moet openen. Een leeg veld opent bij vandaag, en
// dat is voor een reis in oktober het enige moment dat zeker fout is: je bent
// dan een half jaar aan het terugbladeren. Vandaar dat een nieuw vervoer of
// verblijf begint op de dag waarop de reis begint — en, staat er al iets
// gepland, ná wat er al staat, zodat de terugreis niet vóór de heenreis
// aangeboden wordt.
//
// De grenzen (min/max) staan op de reis zelf. Dat houdt de kiezer binnen de
// reis en scheelt het soort typefout waarbij een vlucht een jaar verkeerd komt
// te staan zonder dat iemand het merkt.
function reisDagIso(waarde) {
  return waarde ? String(waarde).slice(0, 10) : "";
}
function laatsteMoment(items, velden) {
  const momenten = asList(items)
    .flatMap((it) => velden.map((v) => it[v]))
    .filter(Boolean)
    .map((d) => new Date(d))
    .filter((d) => !isNaN(d));
  if (!momenten.length) return null;
  return new Date(Math.max(...momenten.map((d) => d.getTime())));
}
// Lokale tijd, niet UTC: een datetime-local-veld toont wat er staat zonder
// omrekenen, dus met toISOString zou een vertrek om 09:00 in Nederland als
// 07:00 in het veld belanden.
function lokaalIsoMinuut(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
// Standaard 09:00 op de eerste reisdag. Een tijd moet er staan (het veld vraagt
// erom), en negen uur 's ochtends is de minst verkeerde gok voor een vertrek.
function beginVoorVervoer(trip, transports) {
  const na = laatsteMoment(transports, ["arrival_time", "departure_time"]);
  if (na) return lokaalIsoMinuut(new Date(na.getTime() + 60 * 60 * 1000));
  const start = reisDagIso(trip?.start_date);
  return start ? `${start}T09:00` : "";
}
function beginVoorVerblijf(trip, accommodations) {
  const na = laatsteMoment(accommodations, ["check_out"]);
  if (na) return reisDagIso(na.toISOString());
  return reisDagIso(trip?.start_date);
}

function AccommodationForm({ tripId, trip, accommodations, initial, onSaved, onClose, onImport, journalEntries, onJournalChange, currentUserId, photos, onPhotosChange, readOnly, showPhotos = false }) {
  // `initial` is the raw DB row, where empty columns are null. Feeding null
  // into a controlled <Input> makes React flip it to uncontrolled on typing.
  const [form, setForm] = useState(initial ? {
    ...initial,
    check_in: initial.check_in ? String(initial.check_in).slice(0,10) : "", check_out: initial.check_out ? String(initial.check_out).slice(0,10) : "",
    address: initial.address ?? "", booking_ref: initial.booking_ref ?? "", cost: initial.cost ?? "", notes: initial.notes ?? "",
  } : { name: "", check_in: beginVoorVerblijf(trip, accommodations), check_out: "", address: "", booking_ref: "", cost: "", notes: "", is_private: false });
  const reisVan = reisDagIso(trip?.start_date);
  const reisTot = reisDagIso(trip?.end_date);
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
          <Field label="Check-in"><Input type="date" value={form.check_in} onChange={set("check_in")} min={reisVan || undefined} max={reisTot || undefined} disabled={readOnly} /></Field>
          {/* Check-out kan niet vóór check-in: die grens schuift mee met wat er
              hierboven staat. */}
          <Field label="Check-out"><Input type="date" value={form.check_out} onChange={set("check_out")} min={form.check_in || reisVan || undefined} max={reisTot || undefined} disabled={readOnly} /></Field>
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
function TransportForm({ tripId, trip, transports, initial, onSaved, onClose, onImport, journalEntries, onJournalChange, currentUserId, photos, onPhotosChange, readOnly, showPhotos = false }) {
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
  } : { type: "Vliegtuig", from_location: "", to_location: "", departure_time: beginVoorVervoer(trip, transports), arrival_time: "", booking_ref: "", cost: "", notes: "", baggage_allowance: "", is_private: false });
  // Een reis loopt tot en met de einddatum, dus de grens is die dag om 23:59 en
  // niet om middernacht — anders valt een avondvlucht op de laatste dag erbuiten.
  const reisVan = reisDagIso(trip?.start_date);
  const reisTot = reisDagIso(trip?.end_date);
  const vanMinuut = reisVan ? `${reisVan}T00:00` : undefined;
  const totMinuut = reisTot ? `${reisTot}T23:59` : undefined;
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
          <Field label="Vertrek"><Input type="datetime-local" value={form.departure_time} onChange={set("departure_time")} min={vanMinuut} max={totMinuut} disabled={readOnly} /></Field>
          {/* Aankomen vóór je vertrekt kan niet; die ondergrens volgt het
              vertrekveld hierboven. */}
          <Field label="Aankomst"><Input type="datetime-local" value={form.arrival_time} onChange={set("arrival_time")} min={form.departure_time || vanMinuut} max={totMinuut} disabled={readOnly} /></Field>
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
