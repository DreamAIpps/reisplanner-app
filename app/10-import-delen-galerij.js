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
    api.getDays(tripId).then(setDays).catch(() => setDays([]));
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

// Wie de reis bekeken heeft, met hoe lang en wat ze deden. Stond in het
// deelvenster van de reis zelf; die plek was zowel te verstopt (alleen zichtbaar
// als je toevallig een kijk-link aan het maken was) als te ruim (het hoort bij
// het beheer, niet bij het delen). Staat nu in het beheeroverzicht bij de
// gebruikers, en is daarom een eigen component geworden.
function KijkStatistieken({ tripId, days, transports, accommodations, onJumpToDay }) {
  const [stats, setStats] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [fout, setFout] = useState(null);

  useEffect(() => {
    let vervallen = false;
    api.getShareStats(tripId)
      .then((d) => { if (!vervallen) setStats(d); })
      .catch((err) => { if (!vervallen) setFout(err.message || "Kon de cijfers niet ophalen"); });
    return () => { vervallen = true; };
  }, [tripId]);

  if (fout) return <div className="text-xs text-gray-400 px-1 py-2">{fout}</div>;
  if (!stats) return <div className="text-xs text-gray-400 px-1 py-2">Laden...</div>;
  if (!stats.members.length) return <div className="text-xs text-gray-400 px-1 py-2">Nog niemand heeft deze reis bekeken.</div>;

  return (
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

// Alleen nog het maken en delen van de link. De kijkcijfers die hier ook
// stonden zijn verhuisd naar het beheeroverzicht (zie KijkStatistieken).
function ShareModal({ tripId, onClose, role = "viewer" }) {
  const [link, setLink] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

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
    scrollNaarElement(`gallery-photo-${todayPhoto.id}`, { blok: "center" });
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