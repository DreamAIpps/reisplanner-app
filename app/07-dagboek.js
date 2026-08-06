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
    // finally zonder catch: het opslaan faalde, het invoerveld bleef netjes
    // openstaan met de tekst er nog in — maar niemand kreeg te horen dát het
    // mislukt was, dus het las als opgeslagen.
    try { await onSave(text.trim()); setEditing(false); }
    catch (err) { toonMelding(err.message || "Opslaan is niet gelukt"); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!confirm("Verhaal verwijderen?")) return;
    try {
      await onDelete(myEntry.id);
      setText(""); setEditing(false);
    } catch (err) { toonMelding(err.message || "Verwijderen is niet gelukt"); }
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
      scrollNaarElement(`journal-day-${todayDay.id}`);
    });
  }, [entriesLoaded, todayDay, trip.id]);

  function scrollToToday() {
    if (!todayDay) return;
    scrollNaarElement(`journal-day-${todayDay.id}`);
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
    scrollNaarElement(`journal-day-${dayId}`);
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
          {/* "+ Activiteit vandaag" stond hier ook nog. Elke dag in het dagboek
              heeft zelf al een "+" (zie hieronder), en die staat bij de dag waar
              je op dat moment naar kijkt in plaats van altijd bij vandaag — dus
              deze knop deed hetzelfde, alleen minder precies. */}
          {todayDay && <Button onClick={scrollToToday} variant="secondary"><Icon name="pin" size={14} className="mr-1.5" />Vandaag</Button>}
          {onShare && !readOnly && (
            <Button onClick={onShare} variant="secondary"><Icon name="share" size={14} className="mr-1.5" />Delen</Button>
          )}
          {onPreviewViewer && !readOnly && (
            <Button onClick={onPreviewViewer} variant="secondary"><Icon name="eye" size={14} className="mr-1.5" />Bekijk als gast</Button>
          )}
        </div>
      </div>
      <JournalOverviewMap trip={trip} days={days} photos={tripPhotos} accommodations={accommodations} transports={transports} />
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
            <div key={day.id} id={`journal-day-${day.id}`} className="rp-dagblok rp-dagblok-dagboek rounded-2xl border border-gray-100 shadow-sm bg-white" style={{ scrollMarginTop: "5rem" }}>
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
                            {/* Je kon de naam hier al aanpassen maar de activiteit
                                niet weghalen — daarvoor moest je naar de planning.
                                Zelfde verwijderen-met-ongedaan-maken als daar. */}
                            {!readOnly && (
                              <button type="button" onClick={() => verwijderActiviteit(act, onRefresh)}
                                aria-label={`"${act.title}" verwijderen`} title="Activiteit verwijderen"
                                className="rp-press ml-auto shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                                <Icon name="trash" size={15} />
                              </button>
                            )}
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
