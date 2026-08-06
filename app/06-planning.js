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

// Een activiteit verwijderen, met een paar tellen de kans om dat terug te
// draaien. Geen bevestigingsvraag vooraf: dat scheelt een tik bij elke bedoelde
// verwijdering én helpt echt bij een onbedoelde, want de prullenbak zit vlak
// naast het gebied dat de kaart opent.
//
// Gedeeld door de dagplanning en het dagboek: op beide plekken staan dezelfde
// activiteiten, dus daar hoort ook hetzelfde te gebeuren.
async function verwijderActiviteit(act, onKlaar) {
  await api.deleteActivity(act.id);
  onKlaar?.();
  toonMelding(`"${act.title}" verwijderd`, {
    label: "Ongedaan maken",
    run: async () => {
      // Zelfde velden terug; de activiteit krijgt wel een nieuw id, wat verder
      // nergens toe doet omdat er niets anders naar verwijst.
      await api.addActivity(act.day_id, {
        time: act.time, title: act.title, location: act.location, notes: act.notes,
        category: act.category, cost: act.cost, is_private: act.is_private,
      });
      onKlaar?.();
    },
  });
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

  const handleDeleteActivity = (act) => verwijderActiviteit(act, onRefresh);
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
              <div key={day.id} id={`day-${day.id}`} className="rp-rise rp-dagblok"
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
