// ---------- Trip detail ----------
function TripDetail({ tripId, initialTab, startImport, onBack, onChanged, currentUserId, onKopInfo }) {
  const [trip, setTrip] = useState(null);
  const [days, setDays] = useState([]);
  const [accommodations, setAccommodations] = useState([]);
  const [transports, setTransports] = useState([]);
  const [expenses, setExpenses] = useState([]);
  // "evaluatie" was één tabblad met de foto's en de vragen onder elkaar; dat
  // zijn nu twee losse schermen. Een oude link of bladwijzer belandt op de
  // foto's in plaats van op een leeg scherm.
  const [tab, setTab] = useState((initialTab === "evaluatie" ? "mooistefoto" : initialTab) || "days");
  const [editing, setEditing] = useState(false);
  // Bij een net aangemaakte reis waar "ik heb al boekingen" is gekozen staat
  // het importvenster meteen open — dat is waar die keuze om vroeg.
  const [importing, setImporting] = useState(!!startImport);
  const [sharing, setSharing] = useState(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [previewViewer, setPreviewViewer] = useState(false);
  // Mag een alleen-lezen bezoeker de fotoquiz zien? Alleen als hij meespeelt.
  // Wie via een deel-link meekijkt heeft niets met de quiz te maken. Maar wie de
  // QR-code scant wordt door de server als deelnemer ingeschreven én als viewer
  // aan de reis toegevoegd, en landt daarna op tab=quiz — die hoort hem juist
  // wél te zien, anders is de QR-code een doodlopende weg.
  const [magQuiz, setMagQuiz] = useState(false);
  // Zelfde verhaal voor de reisvragen: een gewone meekijker hoort ze niet te
  // zien, maar wie de QR van de vragen scande is er juist voor uitgenodigd.
  const [magReisvragen, setMagReisvragen] = useState(false);

  useEffect(() => {
    if (!showMoreMenu) return;
    const h = (e) => e.key === "Escape" && setShowMoreMenu(false);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [showMoreMenu]);

  // De kop van de app toont de reisnaam en, voor de eigenaar, het menu om te
  // bewerken of te verwijderen. Die dingen wonen hier (trip, setEditing,
  // handleDelete), dus ze worden naar boven gemeld in plaats van dat App ze
  // nog eens zelf gaat uitzoeken.
  useEffect(() => {
    if (!onKopInfo) return;
    onKopInfo(trip ? {
      naam: trip.name,
      gedeeld: trip.is_owner === false ? (trip.role === "viewer" ? "Alleen-lezen" : "Gedeeld") : null,
      onEdit: trip.is_owner && !previewViewer ? () => setEditing(true) : null,
      onDelete: trip.is_owner && !previewViewer ? handleDelete : null,
    } : null);
    return () => onKopInfo(null);
  }, [onKopInfo, trip?.id, trip?.name, trip?.is_owner, trip?.role, previewViewer]);

  // Alleen voor alleen-lezen bezoekers opvragen: voor een eigenaar of reisgenoot
  // staat de quiz toch al in het menu, en dan is dit een verzoek om niets.
  useEffect(() => {
    if (trip?.role !== "viewer") { setMagQuiz(false); setMagReisvragen(false); return; }
    let vervallen = false;
    api.getQuizSession(tripId, true)
      .then((d) => { if (!vervallen) setMagQuiz(!!d?.session?.isParticipant); })
      .catch(() => { if (!vervallen) setMagQuiz(false); });
    api.getEvaluatie(tripId)
      .then((d) => { if (!vervallen) setMagReisvragen(!!d?.magVragenBeantwoorden); })
      .catch(() => { if (!vervallen) setMagReisvragen(false); });
    return () => { vervallen = true; };
  }, [tripId, trip?.role]);

  // Elke wijziging (activiteit toevoegen, verblijf opslaan, uitgave wissen)
  // roept load() opnieuw aan. Doe je er twee vlak achter elkaar, dan is niet
  // gezegd dat de antwoorden in dezelfde volgorde terugkomen: het antwoord van
  // de eerste ronde kan ná dat van de tweede binnenkomen en schrijft dan de
  // net opgehaalde stand weer terug — de zojuist toegevoegde activiteit
  // verdwijnt dan voor je ogen tot de volgende verversing. Dit nummertje zorgt
  // dat alleen de meest recente ronde nog iets in beeld mag zetten.
  const laadBeurt = useRef(0);
  const load = useCallback(async () => {
    const beurt = ++laadBeurt.current;
    try {
      const [t, d, a, tr, ex] = await Promise.all([
        api.getTrip(tripId),
        api.getDays(tripId),
        api.getAccommodations(tripId),
        api.getTransports(tripId),
        api.getExpenses(tripId),
      ]);
      if (beurt !== laadBeurt.current) return;
      setTrip(t); setDays(d); setAccommodations(a); setTransports(tr); setExpenses(ex);
      setLoadError(null);
    } catch (err) {
      if (beurt !== laadBeurt.current) return;
      // Without this the screen sat on "Laden..." forever — the back button is
      // inside the guarded return, so there was no way out but a reload.
      setLoadError(err.message || "Reis kon niet worden geladen");
    }
  }, [tripId]);

  useEffect(() => { load(); }, [load]);
  // Don't carry the guest preview over into another trip.
  useEffect(() => { setPreviewViewer(false); }, [tripId]);

  // Budget en fotoboek bestaan niet voor een meekijker. Zet je de gastweergave
  // aan terwijl je op zo'n tab staat, dan valt de inhoud weg en houd je een leeg
  // scherm over zonder iets om op te tikken — de menu-ingang waarlangs je
  // terug zou gaan is namelijk óók verborgen. Terug naar de dagplanning dan.
  const kijkerModus = trip?.role === "viewer" || previewViewer;
  useEffect(() => {
    if (kijkerModus && (tab === "budget" || tab === "photobook")) setTab("days");
  }, [kijkerModus, tab]);


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
    try {
      await api.deleteTrip(tripId);
      onBack(); onChanged();
    } catch (err) { alert(err.message); }
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

  const accent = trip.cover_color || PALETTE.primary;
  const readOnly = trip.role === "viewer" || previewViewer;
  const isOwnerActions = trip.is_owner && !previewViewer;

  // What a shared viewer actually receives: no budget, no per-item costs, no
  // expense list, and no items marked private. Mirrors stripCosts() and the
  // is_private filter on the server.
  const viewTrip = previewViewer ? { ...trip, budget: null, role: "viewer" } : trip;
  const viewDays = previewViewer
    ? days.map((d) => ({ ...d, activities: (d.activities || []).filter((a) => !a.is_private).map((a) => ({ ...a, cost: null })) }))
    : days;
  const viewTransports = previewViewer ? transports.filter((t) => !t.is_private).map((t) => ({ ...t, cost: null })) : transports;
  const viewAccommodations = previewViewer ? accommodations.filter((a) => !a.is_private).map((a) => ({ ...a, cost: null })) : accommodations;
  const viewExpenses = previewViewer ? [] : expenses;

  const tabs = [
    { key: "days", label: "Dagplanning", icon: "route", primary: true },
    ...(currentUserId ? [{ key: "journal", label: "Dagboek", icon: "book" }] : []),
    { key: "accommodation", label: "Verblijf", icon: "bed" },
    { key: "transport", label: "Vervoer", icon: "plane" },
    { key: "packing", label: "Paklijst", icon: "suitcase" },
    // Snake en Pong. Hoort bij "onderweg" en niet bij "achteraf": je speelt ze
    // in de rij en in de auto, niet als de reis voorbij is.
    { key: "spelletjes", label: "Spelletjes", icon: "ball" },
    { key: "quiz", label: "Fotoquiz", icon: "sparkle" },
    // Het fotoboek is niet voor meekijkers: een deel-link laat de reis zien,
    // niet het boek dat je er achteraf van maakt. De server weigert het ook
    // (403), maar dan zou een kijker eerst op een doodlopende knop tikken.
    ...(readOnly ? [] : [{ key: "photobook", label: "Fotoboek", icon: "frame" }]),
    // Aan het eind van de reis, twee losse dingen. De mooiste foto is voor
    // iedereen, ook voor meekijkers — die hebben alle foto's langs zien komen.
    // De reisvragen zijn dat niet: die zijn voor wie mee is geweest, of voor
    // wie de deel-link heeft gekregen.
    { key: "mooistefoto", label: "Mooiste foto", icon: "star" },
    ...(readOnly && !magReisvragen ? [] : [{ key: "reisvragen", label: "Reisvragen", icon: "chat" }]),
  ];

  // De onderste balk hoort te gaan over wat je onderweg het vaakst doet, en dat
  // zijn de planning en het dagboek. Er stond ook een losse kaart-bestemming,
  // maar planning en dagboek hebben allebei hun eigen kaartje gekregen — precies
  // op de plek waar de vraag opkomt — dus die aparte kaart voegde niets meer toe.
  const bottomNavItems = [
    { key: "days", icon: "route", label: "Planning" },
    ...(currentUserId ? [{ key: "journal", icon: "book", label: "Dagboek" }] : []),
  ];
  // Alleen bereikbaar via "Meer". Losse regels lazen als één lange lijst; met
  // kopjes valt in één oogopslag te zien waar iets bij hoort. Er stond hier ook
  // een aparte fotogalerij, maar foto's worden inmiddels vanuit het dagboek
  // geüpload en daar ook per dag getoond — twee plekken voor dezelfde foto's
  // maakt alleen maar de vraag welke van de twee je moet hebben.
  const moreMenuGroups = [
    { titel: "Onderweg", items: [
      { key: "packing", icon: "suitcase", label: "Paklijst" },
      { key: "spelletjes", icon: "ball", label: "Spelletjes" },
      ...(readOnly ? [] : [{ key: "budget", icon: "wallet", label: "Budget" }]),
    ] },
    { titel: "Boekingen", items: [
      { key: "accommodation", icon: "bed", label: "Verblijf" },
      { key: "transport", icon: "plane", label: "Vervoer" },
    ] },
    { titel: "Achteraf", items: [
      ...(readOnly ? [] : [{ key: "photobook", icon: "frame", label: "Fotoboek" }]),
      { key: "quiz", icon: "sparkle", label: "Fotoquiz" },
      { key: "mooistefoto", icon: "star", label: "Mooiste foto" },
      ...(readOnly && !magReisvragen ? [] : [{ key: "reisvragen", icon: "chat", label: "Reisvragen" }]),
    ] },
  ];
  const moreMenuItems = moreMenuGroups.flatMap((g) => g.items);
  // Wat een meekijker mag; zie de balk verderop.
  const gastTabs = [
    { key: "journal", icon: "book", label: "Dagboek" },
    { key: "mooistefoto", icon: "star", label: "Mooiste foto" },
    // Snake en Pong staan voor iedereen open. Een meekijker zit net zo goed in
    // de auto of in de rij, en er valt niets mee stuk te maken — het enige wat
    // hij achterlaat is zijn eigen score in de ranglijst.
    { key: "spelletjes", icon: "ball", label: "Spelletjes" },
    ...(magQuiz ? [{ key: "quiz", icon: "sparkle", label: "Fotoquiz" }] : []),
    ...(magReisvragen ? [{ key: "reisvragen", icon: "chat", label: "Reisvragen" }] : []),
  ];
  const isMoreActive = moreMenuItems.some((item) => item.key === tab);

  // De grote foto-hero en de budgetbalk zijn overal weg. Ze stonden op elk
  // scherm boven de inhoud waar je voor kwam: samen ruim een derde van een
  // telefoonscherm, elke keer opnieuw, met informatie die je na de eerste blik
  // al kende. Het dagboek deed het al zonder en dat las beter; nu doen alle
  // schermen dat.
  //
  // Wat blijft is één slanke balk met de reisnaam — genoeg om te weten in welke
  // reis je zit. Het budget staat nog gewoon op de budgettab, waar je het
  // opzoekt als je het wilt weten.

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
            className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full bg-sky-300 text-gray-800 hover:bg-sky-200 transition-colors">
            Sluiten
          </button>
        </div>
      )}
      {/* Hier stond "← Alle reizen". Weg: het logo in de kop doet hetzelfde en
          staat altijd in beeld, ook voor een meekijker zonder onderbalk. Twee
          knoppen voor dezelfde stap kostten alleen een regel hoogte boven de
          dagen. Ook de "Terug" in het meer-menu is om die reden weg. */}

      {/* Op planning en dagboek: een slanke balk van één regel met de reisnaam,
          zonder omslagfoto — de grote hero neemt daar te veel ruimte in weg van
          de dagen/verhalen zelf. De datums staan er muted achteraan; op smal
          krimpt de naam (truncate) en blijven de datums heel. */}
      {/* De reisnaam stond hier als eigen balk. Die is naar de kop van de app
          verhuisd, naast het logo: daar was al een regel, en zo scheelt het weer
          tachtig pixels op elk scherm. Wat hier overblijft zijn de notities, en
          alleen als je ze hebt. */}
      {trip.notes && <div className="text-[15px] text-gray-500 leading-relaxed mb-6 px-1">{trip.notes}</div>}

      {/* Desktop tabs — op mobiel navigeert de onderste balk al, en "· Dagplanning"
          naast de reisnaam hierboven is de subtiele snelkoppeling daar terug. */}
      {/* Vastgezet onder de kop. Op een telefoon is de onderste balk de
          navigatie en doet deze niet mee; op een iPad of laptop is dít de enige
          navigatie, en die scrollde weg zodra je een lange dagplanning inging.
          Dan zat je vast te scrollen om ergens anders heen te kunnen. */}
      {!readOnly && (
        <div className="hidden sm:block sticky z-30 -mx-1 px-1 bg-gray-50/95 backdrop-blur-md"
          style={{ top: "var(--rp-kop)" }}>
          <Tabs tabs={tabs} active={tab} onChange={setTab} accentColor={accent} />
        </div>
      )}


      {readOnly ? (
        <>
          {/* Een meekijker krijgt geen volledige tabbalk. Wat hij wél mag staat
              hier: het dagboek, en de mooiste foto — alle foto's heeft hij
              langs zien komen, dus daar hoort hij over mee te mogen stemmen.
              De fotoquiz en de reisvragen komen erbij zodra hij daar via een
              QR-code voor is uitgenodigd; zonder die uitnodiging heeft hij er
              niets mee te maken. */}
          {gastTabs.length > 1 && (
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-4 w-fit flex-wrap">
              {gastTabs.map((g) => {
                const actief = g.key === "journal" ? !gastTabs.some((x) => x.key === tab && x.key !== "journal") : tab === g.key;
                return (
                  <button key={g.key} onClick={() => setTab(g.key)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-1.5 ${actief ? "bg-white shadow" : "text-gray-500 hover:text-gray-700"}`}
                    style={actief ? { color: legibleOn(accent) } : {}}>
                    <Icon name={g.icon} size={15} />{g.label}
                  </button>
                );
              })}
            </div>
          )}
          {/* De mooiste foto, de reisvragen en de spelletjes tekenen zichzelf
              verderop, buiten deze splitsing om — hier alleen niet ook nog het
              dagboek eronder. */}
          {tab !== "mooistefoto" && tab !== "reisvragen" && tab !== "spelletjes" && (
            <JournalTab trip={viewTrip} days={viewDays} transports={viewTransports} accommodations={viewAccommodations} readOnly={readOnly} currentUserId={currentUserId} onRefresh={load} onPreviewViewer={() => setPreviewViewer(true)} onShare={isOwnerActions ? () => setSharing("viewer") : null} onGoToPlanning={() => setTab("days")} />
          )}
        </>
      ) : (
        <>
          {tab === "days" && <DayPlanningTab trip={viewTrip} days={viewDays} transports={viewTransports} accommodations={viewAccommodations} onRefresh={load} readOnly={readOnly} currentUserId={currentUserId} onShareEditor={isOwnerActions ? () => setSharing("editor") : null} onEditTrip={isOwnerActions ? () => setEditing(true) : null} />}
          {tab === "journal" && <JournalTab trip={viewTrip} days={viewDays} transports={viewTransports} accommodations={viewAccommodations} readOnly={readOnly} currentUserId={currentUserId} onRefresh={load} onPreviewViewer={() => setPreviewViewer(true)} onShare={isOwnerActions ? () => setSharing("viewer") : null} />}
          {tab === "accommodation" && <AccommodationTab trip={viewTrip} accommodations={viewAccommodations} onRefresh={load} readOnly={readOnly} currentUserId={currentUserId} />}
          {tab === "transport" && <TransportTab trip={viewTrip} transports={viewTransports} onRefresh={load} readOnly={readOnly} currentUserId={currentUserId} />}
          {tab === "budget" && !readOnly && <BudgetTab trip={viewTrip} expenses={viewExpenses} transports={viewTransports} accommodations={viewAccommodations} days={viewDays} onRefresh={load} />}
          {tab === "packing" && <PackingTab tripId={trip.id} readOnly={readOnly} />}
        </>
      )}

      {/* De fotoquiz rendert los van de rest, full screen, voor iedereen met
          toegang tot de reis — ook alleen-lezen bezoekers kunnen 'm hosten
          (een nieuwe sessie aanmaken/starten/stoppen), niet alleen
          eigenaar/editor. Wie een sessie aanmaakt wordt daar zelf gastheer
          van, ongeacht wie de reis bezit. */}
      {/* Ook het scherm zelf achter dezelfde voorwaarde: anders komt een
          alleen-lezen bezoeker er alsnog in via ?tab=quiz in de adresbalk. */}
      {tab === "quiz" && (!readOnly || magQuiz) && (
        <QuizFullscreen onClose={() => setTab(readOnly ? "journal" : "days")} label="Fotoquiz sluiten">
          <PhotoQuizTab trip={viewTrip} />
        </QuizFullscreen>
      )}

      {tab === "spelletjes" && <SpelletjesTab trip={viewTrip} currentUserId={currentUserId} />}

      {tab === "mooistefoto" && <MooisteFotoTab trip={viewTrip} />}

      {/* Ook het scherm zelf achter dezelfde voorwaarde als de tab, anders komt
          een meekijker er alsnog in via ?tab=reisvragen in de adresbalk. De
          server weigert hem daar dan wel, maar dat is een foutmelding op een
          scherm waar hij niets te zoeken had. */}
      {tab === "reisvragen" && (!readOnly || magReisvragen) && (
        <ReisvragenTab trip={viewTrip} currentUserId={currentUserId} />
      )}

      {/* Stond hier eerder bewust los van de readOnly-splitsing, zodat ook
          alleen-lezen reisleden konden meebouwen aan het fotoboek. Dat is
          teruggedraaid: een deel-link laat de reis zien, niet het boek dat je
          er achteraf van maakt. Wie wél mee mag maken krijgt een editor-link.
          Volledig scherm blijft, net als bij de fotoquiz — dat geeft de
          pagina's en foto's meer ruimte dan tussen de normale tabs. */}
      {tab === "photobook" && !readOnly && (
        <QuizFullscreen onClose={() => setTab(readOnly ? "journal" : "days")} label="Fotoboek sluiten">
          <PhotobookTab trip={viewTrip} />
        </QuizFullscreen>
      )}

      {/* "Meer" dropdown — Verblijf, Vervoer, Paklijst live only here on mobile */}
      {!readOnly && showMoreMenu && (
        <>
          <div className="sm:hidden fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
          <div className="sm:hidden fixed z-50 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden py-1"
            style={{ right: 12, bottom: "calc(68px + env(safe-area-inset-bottom) + 10px)", minWidth: 180 }}>
            {/* Hier stond "Terug". Weg: het logo in de kop van de app brengt je
                ook naar alle reizen en staat altijd in beeld. Dit menu gaat over
                wat je in deze reis kunt doen, niet over hoe je hem verlaat. */}
            {moreMenuGroups.map((groep) => (
              <React.Fragment key={groep.titel}>
                <div className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400">{groep.titel}</div>
                {groep.items.map((item) => (
                  <button key={item.key} onClick={() => { setTab(item.key); setShowMoreMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 h-11 text-sm font-medium hover:bg-gray-50 transition-colors text-left"
                    style={{ color: tab === item.key ? legibleOn(accent) : PALETTE.textSecondary }}>
                    <Icon name={item.icon} size={17} />
                    {item.label}
                  </button>
                ))}
              </React.Fragment>
            ))}
          </div>
        </>
      )}

      {/* Mobile bottom nav — dichter bij iOS dan bij Material: geen gekleurde
          streep of vlak, maar een zacht perzik pilletje achter het icoon van
          het actieve tabblad. De tekst wint aan gewicht in plaats van aan kleur. */}
      {!readOnly && (
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-md border-t border-gray-200" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex">
          {bottomNavItems.map((item) => (
            <button key={item.key} onClick={() => setTab(item.key)}
              className={`rp-press flex-1 flex flex-col items-center justify-center gap-1.5 pt-3 pb-2 transition-colors min-w-0 ${tab === item.key ? "text-sky-700" : "text-gray-300 hover:text-gray-500"}`}
              style={{ minHeight: 72 }}>
              <span className={`flex items-center justify-center h-8 px-4 rounded-full transition-colors ${tab === item.key ? "bg-sky-100" : ""}`}>
                <Icon name={item.icon} size={20} />
              </span>
              <span className={`text-[11px] leading-none ${tab === item.key ? "font-semibold" : "font-medium"}`}>{item.label}</span>
            </button>
          ))}
          <button onClick={() => setShowMoreMenu((v) => !v)}
            className={`rp-press flex-1 flex flex-col items-center justify-center gap-1.5 pt-3 pb-2 transition-colors min-w-0 ${isMoreActive || showMoreMenu ? "text-sky-700" : "text-gray-300 hover:text-gray-500"}`}
            style={{ minHeight: 72 }}>
            <span className={`flex items-center justify-center h-8 px-4 rounded-full transition-colors ${isMoreActive || showMoreMenu ? "bg-sky-100" : ""}`}>
              <Icon name="more" size={20} />
            </span>
            <span className={`text-[11px] leading-none ${isMoreActive ? "font-semibold" : "font-medium"}`}>Meer</span>
          </button>
        </div>
      </div>
      )}

      {editing && <TripForm initial={trip} onSaved={() => { setEditing(false); load(); onChanged(); }} onClose={() => setEditing(false)} />}
      {importing && <ImportModal tripId={tripId} onImported={() => { setImporting(false); load(); }} onClose={() => setImporting(false)} />}
      {sharing && (
        <ShareModal tripId={tripId} role={sharing} onClose={() => setSharing(null)} />
      )}
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

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}u`;
  if (h > 0) return `${h}u ${m}m`;
  return `${m}m`;
}

function StatTile({ label, value, tone }) {
  const toneClass = tone === "critical" ? "text-red-600" : tone === "good" ? "text-green-600" : "text-gray-900";
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
      <div className={`text-lg font-bold tnum ${toneClass}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
    </div>
  );
}

// Gestapelde staaf per minuut: totale hoogte = aantal requests, het rode
// topsegment (indien aanwezig) = daarvan het aantal serverfouten (5xx) —
// laat in één oogopslag zowel volume als foutmomenten zien, zonder een
// tweede as nodig te hebben. <title> geeft een simpele hover-tooltip per
// staaf (browsereigen, geen aparte tooltip-component nodig voor dit
// interne beheerscherm).
function CockpitBarChart({ timeline }) {
  const max = Math.max(1, ...timeline.map((t) => t.count));
  const w = 600, h = 90, gap = 1;
  const barWidth = Math.max(0.5, w / timeline.length - gap);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-24">
      {timeline.map((t, i) => {
        const x = i * (barWidth + gap);
        const errorH = t.count ? (t.errorCount / max) * h : 0;
        const normalH = t.count ? ((t.count - t.errorCount) / max) * h : 0;
        const time = new Date(t.t).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
        return (
          <g key={i}>
            <title>{`${time} — ${t.count} requests, ${t.errorCount} fouten, ${t.avgDuration}ms gem.`}</title>
            <rect x={x} y={h - normalH - errorH} width={barWidth} height={normalH} fill={PALETTE.textPrimary} fillOpacity="0.65" />
            {errorH > 0 && <rect x={x} y={h - errorH} width={barWidth} height={errorH} fill="#EF4444" />}
          </g>
        );
      })}
    </svg>
  );
}

// Eén reeks (gemiddelde responstijd), dus geen legenda nodig — de titel van
// de kaart erboven noemt de metriek al.
function CockpitSparkline({ timeline }) {
  const max = Math.max(1, ...timeline.map((t) => t.avgDuration));
  const w = 600, h = 60;
  const points = timeline.map((t, i) => {
    const x = timeline.length > 1 ? (i / (timeline.length - 1)) * w : 0;
    const y = h - (t.avgDuration / max) * h;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-16">
      <polyline points={points} fill="none" stroke={PALETTE.coralDeep} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Operationele cockpit: alleen wat dit ene serverproces sinds het opstarten
// heeft gezien (in-memory, zie METRICS_* op de server) — geen historie over
// een herstart heen, en geen aparte tijdreeksdatabase nodig voor een simpel
// beheerscherm.
// Staan de koppelingen naar buiten nog overeind? "Ingesteld" zegt weinig — een
// sleutel kan ingetrokken zijn zonder dat de omgevingsvariabele verandert, en
// dan merk je het pas als een gebruiker klaagt dat de tips leeg blijven. De
// server klopt daarom echt even aan; hier staat alleen de uitslag.
// Foto's die op elkaar lijken, met de plaatjes erbij. Zonder die plaatjes is
// het een lijst met getallen waar je niets over kunt beslissen — en dit is een
// aanwijzing, geen bewijs: een serieopname deelt ook zijn opnametijdstip.
// Vandaar kijken vóór opruimen, en per groep zelf aanwijzen welke blijft.
function FotoDubbelsPanel() {
  const [data, setData] = useState(null);
  const [fout, setFout] = useState(null);
  const [bezig, setBezig] = useState(false);
  // Per groep het id dat blijft staan. Standaard de grootste: die is meestal
  // het origineel en de andere de verkleinde kopie.
  const [houd, setHoud] = useState({});
  const [uitgevoerd, setUitgevoerd] = useState(null);

  const laad = useCallback(() => {
    setBezig(true); setFout(null);
    api.getFotoDubbels()
      .then((d) => {
        setData(d);
        const keuze = {};
        d.groepen.forEach((g, i) => {
          keuze[i] = g.fotos.reduce((a, b) => (b.bytes > a.bytes ? b : a)).id;
        });
        setHoud(keuze);
      })
      .catch((e) => setFout(e.message || "Laden mislukt"))
      .finally(() => setBezig(false));
  }, []);
  useEffect(() => { laad(); }, [laad]);

  async function ruimOp() {
    const groepen = data.groepen.map((g, i) => ({
      houd: houd[i],
      weg: g.fotos.map((f) => f.id).filter((id) => id !== houd[i]),
    })).filter((g) => g.weg.length);
    if (!groepen.length) return;
    const aantal = groepen.reduce((n, g) => n + g.weg.length, 0);
    if (!confirm(`${aantal} ${aantal === 1 ? "foto" : "foto's"} samenvoegen? Dit kan niet ongedaan gemaakt worden. Plaatsingen in fotoboeken en stemmen in de evaluatie verhuizen mee naar de foto die blijft.`)) return;
    setBezig(true); setFout(null);
    try {
      const r = await api.ruimFotoDubbelsOp(groepen);
      setUitgevoerd(r.opgeruimd);
      laad();
    } catch (e) { setFout(e.message || "Opruimen mislukt"); setBezig(false); }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="text-sm font-semibold text-gray-700">Foto's die op elkaar lijken</div>
        <button type="button" onClick={laad} disabled={bezig}
          className="text-xs font-medium text-sky-600 hover:text-sky-800 disabled:opacity-50">
          {bezig ? "Zoeken…" : "Opnieuw zoeken"}
        </button>
      </div>
      <p className="text-xs text-gray-400 mb-3">
        Exact gelijke foto's kunnen niet twee keer in een reis staan. Dit vindt de gevallen die
        gelijk zijn maar net andere bytes hebben — zelfde opnametijdstip, of zelfde afmetingen en
        bestandsgrootte.
      </p>

      {fout && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg mb-3">{fout}</div>}
      {uitgevoerd !== null && (
        <div className="bg-green-50 text-green-800 text-sm px-3 py-2 rounded-lg mb-3">
          {uitgevoerd} {uitgevoerd === 1 ? "foto" : "foto's"} samengevoegd.
        </div>
      )}
      {!data && !fout && <div className="text-sm text-gray-400 py-4">Zoeken…</div>}

      {data && data.groepen.length === 0 && (
        <div className="text-sm text-gray-400 py-3">Geen foto's gevonden die op elkaar lijken.</div>
      )}

      {data && data.groepen.length > 0 && (
        <>
          <div className="text-xs text-gray-500 mb-3 tnum">
            {data.aantalGroepen} {data.aantalGroepen === 1 ? "groep" : "groepen"} ·
            {" "}{data.aantalDubbel} {data.aantalDubbel === 1 ? "foto" : "foto's"} zou verdwijnen
          </div>
          <div className="space-y-4 max-h-[28rem] overflow-y-auto pr-1">
            {data.groepen.map((g, i) => (
              <div key={i} className="border border-gray-100 rounded-xl p-3">
                <div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
                  <div className="text-xs font-semibold text-gray-600">{g.tripNaam}</div>
                  <div className="text-[11px] text-gray-400">
                    {g.signaal === "exif" ? `zelfde opnametijdstip · ${fmtMoment(g.sleutel)}` : `zelfde maat · ${g.sleutel}`}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {g.fotos.map((f) => {
                    const blijft = houd[i] === f.id;
                    return (
                      <button key={f.id} type="button" onClick={() => setHoud((h) => ({ ...h, [i]: f.id }))}
                        aria-pressed={blijft}
                        className={`text-left rounded-lg border-2 p-1 transition-colors ${blijft ? "border-sky-400 bg-sky-50" : "border-transparent hover:bg-gray-50"}`}>
                        <img src={`/api/photos/${f.id}/thumb`} alt="" loading="lazy"
                          className={`w-20 h-20 object-cover rounded ${blijft ? "" : "opacity-60"}`} />
                        <div className="text-[10px] text-gray-500 mt-1 tnum leading-tight">
                          {f.width && f.height ? `${f.width}×${f.height}` : "onbekend"}<br />
                          {fmtBytes(f.bytes)}<br />
                          <span className={blijft ? "text-sky-700 font-semibold" : "text-gray-400"}>
                            {blijft ? "blijft" : "gaat weg"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <Button variant="secondary" onClick={ruimOp} disabled={bezig} className="mt-3">
            {bezig ? "Bezig…" : "Samenvoegen"}
          </Button>
        </>
      )}
    </div>
  );
}

function ApiStatusPanel() {
  const [data, setData] = useState(null);
  const [fout, setFout] = useState(null);
  const [bezig, setBezig] = useState(false);

  const laad = useCallback(() => {
    setBezig(true);
    api.getApiStatus().then(setData).catch((e) => setFout(e.message || "Laden mislukt")).finally(() => setBezig(false));
  }, []);
  useEffect(() => { laad(); }, [laad]);

  const KLEUR = {
    goed: { stip: "bg-green-500", tekst: "text-green-700", label: "Werkt" },
    fout: { stip: "bg-red-500", tekst: "text-red-700", label: "Probleem" },
    ingesteld: { stip: "bg-sky-400", tekst: "text-sky-700", label: "Ingesteld" },
    uit: { stip: "bg-gray-300", tekst: "text-gray-400", label: "Uit" },
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="text-sm font-semibold text-gray-700">API-verbindingen</div>
        <button type="button" onClick={laad} disabled={bezig}
          className="text-xs font-medium text-sky-600 hover:text-sky-800 disabled:opacity-50">
          {bezig ? "Testen…" : "Opnieuw testen"}
        </button>
      </div>
      {fout && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg mb-3">{fout}</div>}
      {!data && !fout && <div className="text-sm text-gray-400 py-4">Verbindingen testen…</div>}
      {data && (
        <div className="divide-y divide-gray-50">
          {data.checks.map((c) => {
            const k = KLEUR[c.staat] || KLEUR.uit;
            return (
              // Naam en oordeel op één regel, de uitleg eronder over de volle
              // breedte. Eerder stonden uitleg en detail náást elkaar in twee
              // kolommen; op een telefoon duwde een lange detailtekst ("alleen
              // te testen bij een echte inlogpoging") de linkerkolom zo smal
              // dat "Meldingen naar de telefoon" woord voor woord onder elkaar
              // kwam te staan en achter de tekst rechts verdween.
              <div key={c.naam} className="py-2.5 flex items-start gap-3">
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${k.stip}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-gray-800 truncate">{c.naam}</span>
                    <span className={`text-xs font-semibold shrink-0 ${k.tekst}`}>{k.label}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{c.waarvoor}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">{c.detail}</div>
                  {c.waarschuwing && <div className="text-xs text-amber-600 mt-0.5">{c.waarschuwing}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Wie verbruikt hoeveel AI? De rekening komt per maand op één account binnen,
// dus zonder dit is niet te zien waar hij vandaan komt. Tokens, geen euro's:
// een tarief in de code veroudert stil zodra Anthropic het aanpast, en dan
// staat er een bedrag op het scherm dat niemand meer controleert.
function AiVerbruikPanel() {
  const [dagen, setDagen] = useState(30);
  const [data, setData] = useState(null);
  const [fout, setFout] = useState(null);

  useEffect(() => {
    setData(null);
    api.getAiVerbruik(dagen).then(setData).catch((e) => setFout(e.message || "Laden mislukt"));
  }, [dagen]);

  const kort = (n) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="text-sm font-semibold text-gray-700">AI-verbruik per gebruiker</div>
        <div className="flex gap-1 bg-gray-100 rounded-full p-1">
          {[7, 30, 90].map((d) => (
            <button key={d} type="button" onClick={() => setDagen(d)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${dagen === d ? "bg-white shadow-sm text-gray-800 font-semibold" : "text-gray-500 hover:text-gray-700"}`}>
              {d} dagen
            </button>
          ))}
        </div>
      </div>
      {fout && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{fout}</div>}
      {!data && !fout && <div className="text-sm text-gray-400 py-4">Laden…</div>}
      {data && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <StatTile label="Verzoeken" value={data.totaal.verzoeken} />
            <StatTile label="Tokens erin" value={kort(data.totaal.inputTokens)} />
            <StatTile label="Tokens eruit" value={kort(data.totaal.outputTokens)} />
          </div>
          {data.gebruikers.length === 0 ? (
            <div className="text-sm text-gray-400 py-6 text-center">Nog geen AI-verbruik in deze periode.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 text-left">
                    <th className="font-medium pb-2">Gebruiker</th>
                    {/* "Aantal" in plaats van "Verzoeken": dat woord bepaalde in zijn eentje
                        de kolombreedte en at dertig pixels van de naam ernaast op. */}
                    <th className="font-medium pb-2 text-right pl-4">Aantal</th>
                    <th className="font-medium pb-2 text-right pl-4">Erin</th>
                    <th className="font-medium pb-2 text-right pl-4">Eruit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.gebruikers.map((g) => (
                    // Zonder ruimte tussen de kolommen liepen "2", "168" en "14"
                    // in elkaar over tot iets dat las als een getal van zes
                    // cijfers. De naam mag krimpen, de cijfers niet.
                    <tr key={g.id || "onbekend"}>
                      <td className="py-2 pr-3 max-w-0 w-full">
                        <div className="font-medium text-gray-800 truncate">{g.naam}</div>
                        {g.email && g.email !== g.naam && <div className="text-xs text-gray-400 truncate">{g.email}</div>}
                      </td>
                      <td className="py-2 pl-4 text-right tnum text-gray-700 whitespace-nowrap">{g.verzoeken}</td>
                      <td className="py-2 pl-4 text-right tnum text-gray-700 whitespace-nowrap">{kort(g.inputTokens)}</td>
                      <td className="py-2 pl-4 text-right tnum text-gray-700 whitespace-nowrap">{kort(g.outputTokens)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.doelen.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-50">
              <div className="text-xs font-semibold text-gray-500 mb-2">Waar gaat het heen</div>
              <div className="flex flex-wrap gap-2">
                {data.doelen.map((d) => (
                  <span key={d.doel} className="text-xs px-2.5 py-1 rounded-full bg-gray-50 text-gray-600">
                    {d.doel} · <span className="tnum font-semibold">{kort(d.tokens)}</span> ({d.verzoeken}×)
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CockpitPanel() {
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    api.getCockpitMetrics().then(setMetrics).catch((err) => setError(err.message || "Laden mislukt"));
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load]);

  if (error) return <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>;
  if (!metrics) return <div className="text-center py-16 text-gray-400">Laden...</div>;

  const errorRate = metrics.requestsInWindow ? Math.round((metrics.errorsInWindow / metrics.requestsInWindow) * 1000) / 10 : 0;
  const dbActive = metrics.dbPool.total - metrics.dbPool.idle;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Uptime" value={formatUptime(metrics.uptimeSeconds)} />
        <StatTile label={`Requests (${metrics.windowMinutes} min)`} value={metrics.requestsInWindow} />
        <StatTile label="Foutpercentage" value={`${errorRate}%`} tone={errorRate > 1 ? "critical" : "good"} />
        <StatTile label="Gem. responstijd" value={`${metrics.avgDurationWindow} ms`} />
        <StatTile label="p95 responstijd" value={`${metrics.p95DurationWindow} ms`} />
        <StatTile label="Geheugen (RSS)" value={`${metrics.memory.rssMb} MB`} />
        <StatTile label="DB-pool" value={`${dbActive}/${metrics.dbPool.total} actief`} tone={metrics.dbPool.waiting > 0 ? "critical" : undefined} />
        <StatTile label="Totaal sinds start" value={`${metrics.totalRequests} req`} />
        <StatTile label="Database-grootte" value={metrics.databaseBytes != null ? fmtBytes(metrics.databaseBytes) : "—"} />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
          <div className="text-sm font-semibold text-gray-700">Requests per minuut (laatste uur)</div>
          <div className="flex items-center gap-3 text-xs text-gray-500 shrink-0">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: PALETTE.textPrimary, opacity: 0.65 }} />Normaal</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block bg-red-500" />Fout</span>
          </div>
        </div>
        <CockpitBarChart timeline={metrics.timeline} />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="text-sm font-semibold text-gray-700 mb-2">Gemiddelde responstijd per minuut</div>
        <CockpitSparkline timeline={metrics.timeline} />
      </div>

      {metrics.byRoute.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 overflow-x-auto">
          <div className="text-sm font-semibold text-gray-700 mb-2">Per route (sinds opstarten)</div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-400">
                <th className="pb-1.5 font-medium">Route</th>
                <th className="pb-1.5 font-medium text-right">Aantal</th>
                <th className="pb-1.5 font-medium text-right">Fouten</th>
                <th className="pb-1.5 font-medium text-right">Gem.</th>
                <th className="pb-1.5 font-medium text-right">Max</th>
              </tr>
            </thead>
            <tbody>
              {metrics.byRoute.map((r) => (
                <tr key={r.route} className="border-t border-gray-50">
                  <td className="py-1.5 text-gray-700 font-mono text-[11px] whitespace-nowrap">{r.route}</td>
                  <td className="py-1.5 text-right tnum text-gray-600">{r.count}</td>
                  <td className={`py-1.5 text-right tnum ${r.errorCount > 0 ? "text-red-600 font-semibold" : "text-gray-300"}`}>{r.errorCount}</td>
                  <td className="py-1.5 text-right tnum text-gray-600 whitespace-nowrap">{r.avgDuration} ms</td>
                  <td className="py-1.5 text-right tnum text-gray-400 whitespace-nowrap">{r.maxDuration} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {metrics.slowest.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 overflow-x-auto">
          <div className="text-sm font-semibold text-gray-700 mb-2">Traagste/foutieve requests (laatste uur)</div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-400">
                <th className="pb-1.5 font-medium whitespace-nowrap">Tijd</th>
                <th className="pb-1.5 font-medium">Route</th>
                <th className="pb-1.5 font-medium text-right">Status</th>
                <th className="pb-1.5 font-medium text-right">Duur</th>
              </tr>
            </thead>
            <tbody>
              {metrics.slowest.map((s, i) => (
                <tr key={i} className="border-t border-gray-50">
                  <td className="py-1.5 text-gray-400 tnum whitespace-nowrap">{new Date(s.t).toLocaleTimeString("nl-NL")}</td>
                  <td className="py-1.5 text-gray-700 font-mono text-[11px] whitespace-nowrap">{s.method} {s.route}</td>
                  <td className={`py-1.5 text-right tnum whitespace-nowrap ${s.status >= 500 ? "text-red-600 font-semibold" : "text-gray-500"}`}>{s.status}</td>
                  <td className="py-1.5 text-right tnum text-gray-600 whitespace-nowrap">{Math.round(s.durationMs)} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Per gebruiker: elke reis waar hij bij mag, en wanneer hij daar voor het laatst
// keek. De kijkcijfers per reis (KijkStatistieken) beantwoorden de omgekeerde
// vraag — "wie heeft déze reis gezien" — en dat is precies de verkeerde kant op
// als je wilt weten of iemand nog meeleest.
//
// De laatste ping is nauwkeuriger dan de laatste opening: die telt per minuut
// dat de reis openstond, terwijl een opening ook een tik kan zijn die meteen
// weer weg is. Staat er geen ping, dan valt het terug op de opening — anders
// las een kort bezoek als "nog nooit gekeken".
function GebruikerReizen({ userId }) {
  const [reizen, setReizen] = useState(null);
  const [fout, setFout] = useState(null);

  useEffect(() => {
    let vervallen = false;
    api.getAdminUserReizen(userId)
      .then((d) => { if (!vervallen) setReizen(asList(d)); })
      .catch((err) => { if (!vervallen) setFout(err.message || "Kon de reizen niet ophalen"); });
    return () => { vervallen = true; };
  }, [userId]);

  if (fout) return <div className="text-xs text-gray-400 py-2">{fout}</div>;
  if (!reizen) return <div className="text-xs text-gray-400 py-2">Laden...</div>;
  if (!reizen.length) return <div className="text-xs text-gray-400 py-2">Deze gebruiker heeft geen reizen.</div>;

  return (
    <div className="space-y-1.5">
      {reizen.map((r) => {
        const gezien = r.last_active_at || r.last_viewed_at;
        return (
          <div key={r.id} className="flex items-start gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5">
            {/* Sleutel = van hem, pen = mag wijzigen, oog = mag alleen kijken. */}
            <Icon name={r.is_owner ? "key" : r.role === "viewer" ? "eye" : "pen"} size={13}
              className="mt-1 text-gray-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm text-gray-700 truncate">{r.name}</div>
              <div className="text-xs text-gray-400">
                {r.is_owner ? "Eigenaar" : r.role === "viewer" ? "Alleen-lezen" : "Bewerker"}
                {Number(r.views) > 0 && <> · <span className="tnum">{r.views}</span>x geopend</>}
                {Number(r.minutes) > 0 && <> · {fmtDuration(Number(r.minutes))} gelezen</>}
              </div>
            </div>
            <div className="shrink-0 text-right">
              {gezien ? (
                <>
                  <div className="text-xs font-medium text-gray-600">{fmtMoment(gezien)}</div>
                  <div className="text-[10px] text-gray-400 uppercase tracking-wide">laatst gekeken</div>
                </>
              ) : (
                <div className="text-xs text-gray-300">nooit gekeken</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// De verhuizing van foto's uit de database naar de objectopslag. Eén knop die
// batch na batch afwerkt, want in één verzoek zou dit bij een echte hoeveelheid
// foto's ruim over elke proxy-timeout heen gaan. De voortgang staat in beeld
// zodat het geen minutenlang zwart gat is, en stoppen kan altijd: wat verhuisd
// is blijft verhuisd, de volgende ronde pakt de rest.
function FotoVerhuizing({ storage, onKlaar }) {
  const [bezig, setBezig] = React.useState(false);
  const [gestopt, setGestopt] = React.useState(false);
  const stopRef = React.useRef(false);
  const [voortgang, setVoortgang] = React.useState(null);
  const [fout, setFout] = React.useState(null);

  const nogInDatabase = storage.inDatabaseBytes > 0;

  async function verhuis() {
    setBezig(true); setFout(null); setGestopt(false);
    stopRef.current = false;
    let naId = 0, totaal = 0, bytes = 0;
    try {
      // Doorgaan tot een ronde niet meer vol zit — dan was dat de laatste.
      for (;;) {
        const r = await api.verhuisFotos(naId, 25);
        totaal += r.verhuisd;
        bytes += r.bytes;
        naId = r.laatsteId;
        setVoortgang({ totaal, bytes, resterend: r.resterend, mislukt: r.mislukt });
        if (!r.nogTeGaan || stopRef.current) break;
      }
      if (stopRef.current) setGestopt(true);
    } catch (err) {
      setFout(err.message || "Verhuizen mislukt");
    } finally {
      setBezig(false);
      onKlaar?.();
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <div className="text-xs text-gray-500 max-w-lg">
        Foto's gaan naar de objectopslag: {storage.inObjectopslag} van de {storage.photoCount} staan er al.
        {nogInDatabase
          ? ` Er staat nog ${fmtBytes(storage.inDatabaseBytes)} aan foto's in de database zelf.`
          : " De database bevat geen fotobytes meer — na een VACUUM FULL komt die ruimte ook echt vrij."}
      </div>
      {nogInDatabase && (
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <button type="button" onClick={verhuis} disabled={bezig}
            className="px-3 h-9 rounded-lg text-xs font-semibold bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50 transition-colors">
            {bezig ? "Bezig met verhuizen..." : "Rest verhuizen"}
          </button>
          {bezig && (
            <button type="button" onClick={() => { stopRef.current = true; }}
              className="px-3 h-9 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:border-gray-300 transition-colors">
              Stoppen na deze ronde
            </button>
          )}
        </div>
      )}
      {voortgang && (
        <div className="text-xs text-gray-500 mt-2 tnum">
          {voortgang.totaal} foto's verhuisd ({fmtBytes(voortgang.bytes)}), nog {voortgang.resterend} in de database.
          {gestopt && " Gestopt — je kunt zo verder."}
          {voortgang.mislukt?.length > 0 && (
            <span className="text-red-600"> {voortgang.mislukt.length} mislukt (zie de serverlog).</span>
          )}
        </div>
      )}
      {fout && <div className="text-xs text-red-600 mt-2">{fout}</div>}
    </div>
  );
}

function AdminView({ onBack, currentUserId }) {
  const [trips, setTrips] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("trips");
  const [openStats, setOpenStats] = useState(null); // welke reis zijn kijkcijfers open heeft staan
  const [openReizen, setOpenReizen] = useState(null); // welke gebruiker zijn reizen open heeft staan
  const [storage, setStorage] = useState(null);

  // Bij een fout viel de spinner wel weg, maar zonder catch bleef het scherm
  // achter met lege lijsten — niet te onderscheiden van "er zijn geen reizen".
  const reload = () => {
    Promise.all([api.getAdminTrips(), api.getAdminUsers()])
      .then(([t, u]) => { setTrips(t); setUsers(u); })
      .catch((err) => toonMelding(err.message || "Beheergegevens laden is niet gelukt"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);
  useEffect(() => { api.getStorageInfo().then(setStorage).catch(() => {}); }, []);

  async function handleAssign(tripId, userId) {
    await api.assignTrip(tripId, userId || null);
    reload();
  }

  async function handleDeleteTrip(trip) {
    if (!confirm(`"${trip.name}" definitief verwijderen? Dit verwijdert ook alle dagen, foto's, dagboek en het dagboek van iedereen die meekeek.`)) return;
    try { await api.deleteAdminTrip(trip.id); reload(); }
    catch (err) { alert(err.message || "Verwijderen mislukt"); }
  }

  async function handleDeleteUser(u) {
    if (!confirm(`${u.name || u.email} definitief verwijderen? Reizen die deze gebruiker bezat blijven bestaan maar raken ontkoppeld (net als bij "Niet gekoppeld").`)) return;
    try { await api.deleteAdminUser(u.id); reload(); }
    catch (err) { alert(err.message || "Verwijderen mislukt"); }
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
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === "trips" ? "bg-white shadow-sm text-gray-800 font-semibold" : "text-gray-500 hover:text-gray-700"}`}>
            <Icon name="plane" size={15} className="mr-1.5" />Reizen ({trips.length})
          </button>
          <button onClick={() => setTab("users")}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === "users" ? "bg-white shadow-sm text-gray-800 font-semibold" : "text-gray-500 hover:text-gray-700"}`}>
            <Icon name="users" size={15} className="mr-1.5" />Gebruikers ({users.length})
          </button>
          <button onClick={() => setTab("cockpit")}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === "cockpit" ? "bg-white shadow-sm text-gray-800 font-semibold" : "text-gray-500 hover:text-gray-700"}`}>
            <Icon name="clock" size={15} className="mr-1.5" />Cockpit
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
          {storage.objectopslag ? (
            <FotoVerhuizing storage={storage} onKlaar={() => api.getStorageInfo().then(setStorage).catch(() => {})} />
          ) : (
            <div className="text-xs text-gray-400 mt-2 max-w-md">
              Foto's staan als data in de database zelf. Loopt dit vol ("Niet gelukt: ... No space left on
              device" bij uploaden), dan helpt alleen oude foto's verwijderen of de Postgres-schijf op Railway
              groter maken — dit scherm ververst niet vanzelf, herlaad de pagina om een nieuw cijfer te zien.
            </div>
          )}
        </div>
      )}

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
                  <div key={t.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <div className="flex items-center gap-4">
                    {t.cover_image
                      ? <img src={t.cover_image} className="w-14 h-14 rounded-lg object-cover shrink-0" />
                      : <div className="w-14 h-14 rounded-lg shrink-0" style={{ background: t.cover_color || PALETTE.primary }} />}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-800">{t.name}</div>
                      {t.destination && <div className="text-sm text-gray-500 flex items-center gap-1"><Icon name="pin" size={13} />{t.destination}</div>}
                      {t.start_date && <div className="text-xs text-gray-400">{fmt(t.start_date)}</div>}
                      {/* De kijkcijfers worden per reis apart opgehaald, dus pas
                          uitklappen als iemand ze wil zien — anders vuurt het
                          openen van dit overzicht een verzoek per reis af. */}
                      <button type="button" onClick={() => setOpenStats(openStats === t.id ? null : t.id)}
                        className="mt-1 text-xs font-medium text-sky-700 hover:underline inline-flex items-center gap-1">
                        <Icon name="eye" size={13} />
                        {openStats === t.id ? "Kijkcijfers verbergen" : "Wie heeft gekeken"}
                      </button>
                    </div>
                    {/* Zonder een breedtegrens hier kan de <Select> (die zelf
                        w-full is) net zo breed worden als de langste
                        gebruikersnaam — bij genoeg gebruikers duwt dat de
                        verwijderknop erna uit beeld op een smal scherm. */}
                    <div className="shrink-0 w-32 sm:w-40">
                      <Select value={t.user_id || ""} onChange={(e) => handleAssign(t.id, e.target.value || null)} className="!w-full text-xs">
                        <option value="">— Niet gekoppeld —</option>
                        {users.map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                      </Select>
                    </div>
                    <button type="button" onClick={() => handleDeleteTrip(t)} aria-label="Reis verwijderen"
                      className="shrink-0 text-gray-300 hover:text-red-500 transition-colors p-1">
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                  {openStats === t.id && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <KijkStatistieken tripId={t.id} />
                    </div>
                  )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : tab === "users" ? (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-4">
              {u.avatar
                ? <img src={u.avatar} className="w-10 h-10 rounded-full shrink-0" />
                : <div className="w-10 h-10 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-sm shrink-0">
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
              {/* Pas ophalen als iemand het openklapt: anders kost het openen van
                  dit scherm een verzoek per gebruiker, voor een vraag die je
                  telkens over één iemand hebt. */}
              <button type="button" onClick={() => setOpenReizen(openReizen === u.id ? null : u.id)}
                className="shrink-0 text-right text-xs text-sky-700 hover:underline">
                <span className="tnum">{byUser[u.id]?.trips.length || 0}</span> eigen rei{(byUser[u.id]?.trips.length || 0) !== 1 ? "zen" : "s"}
                <span className="block text-gray-400">{openReizen === u.id ? "verbergen ▲" : "laatst gekeken ▼"}</span>
              </button>
              {u.id !== currentUserId && (
                <button type="button" onClick={() => handleDeleteUser(u)} aria-label="Gebruiker verwijderen"
                  className="shrink-0 text-gray-300 hover:text-red-500 transition-colors p-1">
                  <Icon name="trash" size={16} />
                </button>
              )}
            </div>
            {openReizen === u.id && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Reizen en laatste bezoek</div>
                <GebruikerReizen userId={u.id} />
              </div>
            )}
            </div>
          ))}
          {users.length === 0 && <div className="text-center py-12 text-gray-400">Geen gebruikers gevonden</div>}
        </div>
      ) : (
        <div className="space-y-6">
          <CockpitPanel />
          <FotoDubbelsPanel />
          <ApiStatusPanel />
          <AiVerbruikPanel />
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
    // Een benoemde functie in plaats van een pijltje ter plekke: met een inline
    // functie is er geen verwijzing meer om mee op te ruimen, dus die listener
    // bleef achter en riep setState aan op een component die er niet meer was.
    function onInstalled() { setDeferredPrompt(null); }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
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

// ---------- Korte melding met ongedaan maken ----------
// Verwijderen ging via confirm(): een kale systeemdialoog die je bij elke
// handeling onderbreekt, er niet uitziet als de app, en je nog steeds niets
// oplevert als je per ongeluk "OK" tikt — er was nergens ongedaan maken. Dat is
// riskant op een gedeelde reis waar meerdere gezinsleden in werken.
//
// Nu andersom: de handeling gebeurt meteen (geen tik extra) en er verschijnt
// een paar tellen een balkje waarmee je het terugdraait. Bewust géén React-
// context: meldingen komen uit tabbladen door de hele boom, en een losse
// abonneelijst scheelt elk van die componenten een provider-prop.
const toastLuisteraars = new Set();
let toastTeller = 0;
function toonMelding(bericht, actie) {
  const melding = { id: ++toastTeller, bericht, actie };
  toastLuisteraars.forEach((fn) => fn(melding));
}

function ToastHost() {
  const [melding, setMelding] = useState(null);
  useEffect(() => {
    const fn = (m) => setMelding(m);
    toastLuisteraars.add(fn);
    return () => toastLuisteraars.delete(fn);
  }, []);
  useEffect(() => {
    if (!melding) return;
    // Lang genoeg om het te lezen en te reageren, kort genoeg om niet in de weg
    // te blijven zitten.
    const t = setTimeout(() => setMelding(null), 7000);
    return () => clearTimeout(t);
  }, [melding]);
  if (!melding) return null;
  return (
    // Centreren met left/right + mx-auto, niet met -translate-x-1/2: rp-rise
    // animeert transform en eindigt (fill-mode both) op "transform: none", wat
    // een translate-klasse overschrijft. De melding kwam daardoor half buiten
    // beeld te staan.
    <div role="status" aria-live="polite"
      className="rp-rise fixed left-3 right-3 z-50 mx-auto max-w-md"
      style={{ bottom: "calc(72px + env(safe-area-inset-bottom) + 16px)" }}>
      {/* Eén regel: de naam wordt afgekapt in plaats van over vier regels te
          breken. Geen sluitknop — het balkje verdwijnt vanzelf, en die knop
          kostte alleen maar breedte die de tekst nodig heeft. */}
      <div className="flex items-center gap-2 rounded-2xl pl-4 pr-2 py-2 shadow-lg"
        style={{ background: PALETTE.textPrimary, color: "#FFFFFF" }}>
        <span className="flex-1 min-w-0 truncate text-[15px]">{melding.bericht}</span>
        {melding.actie && (
          <button type="button"
            onClick={async () => { setMelding(null); try { await melding.actie.run(); } catch (err) { toonMelding(err.message || "Terugzetten mislukt"); } }}
            className="rp-press shrink-0 text-[15px] font-semibold px-3 h-11 rounded-xl hover:bg-white/15 transition-colors">
            {melding.actie.label}
          </button>
        )}
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
  // Welke reis je het laatst open had. Bij het opstarten koos de app anders de
  // lópende reis, en na een herlaad — wat een foutmelding nogal eens veroorzaakt —
  // stond je daardoor ineens in een andere reis dan die je aan het bekijken was.
  // In sessionStorage en niet in localStorage: dit gaat over "ik was hier net
  // nog", niet over een voorkeur die dagen later nog moet gelden. Sluit je het
  // tabblad, dan begint het weer bij de lopende reis.
  const LAATSTE_REIS = "rp_laatste_reis";
  const onthoudReis = (id) => { try { id ? sessionStorage.setItem(LAATSTE_REIS, String(id)) : sessionStorage.removeItem(LAATSTE_REIS); } catch {} };
  // Wat de kop over de geopende reis moet weten. TripDetail meldt dit; App
  // tekent het, want de kop hoort bij de app en niet bij één scherm.
  const [kopInfo, setKopInfo] = useState(null);
  const [view, _setView] = useState({ name: "list" });
  const setView = useCallback((v) => {
    onthoudReis(v?.name === "detail" ? v.id : null);
    _setView(v);
  }, []);
  // Een nieuwe reis loopt in twee stappen: eerst de vraag hoe je wilt beginnen
  // (boekingen importeren of blanco), dan het formulier. null = dicht.
  const [nieuweReis, setNieuweReis] = useState(null); // null | "keuze" | "import" | "blanco"
  const [showAccount, setShowAccount] = useState(false);

  const loadUser = useCallback(async () => {
    try {
      const r = await appFetch("/auth/me");
      setUser(r.ok ? await r.json() : null);
    } catch { setUser(null); }
    finally { setAuthLoading(false); }
  }, []);
  useEffect(() => { loadUser(); }, [loadUser]);

  const loadTrips = useCallback(async () => {
    setLoading(true);
    try {
      const gesorteerd = sortTripsByDeparture(await api.getTrips());
      setTrips(gesorteerd);
      return gesorteerd;
    } finally { setLoading(false); }
  }, []);

  // Eén keer per sessie: als er een reis loopt, open die meteen. Wie de app
  // onderweg opent komt voor die ene reis — het overzicht ertussen was een tik
  // die altijd hetzelfde antwoord had. Eenmalig, zodat je na "Alle reizen" ook
  // echt in het overzicht kunt blijven.
  const autoGeopend = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    setGuestMode(!user);
    const params = new URLSearchParams(location.search);
    const tripId = params.get("trip");
    (async () => {
      const geladen = await loadTrips();
      // Een expliciete link (uitnodiging, melding) wint altijd van de
      // automatische keuze hieronder.
      if (tripId) {
        setView({ name: "detail", id: tripId, tab: params.get("tab") || null });
        window.history.replaceState({}, "", "/");
        autoGeopend.current = true;
        return;
      }
      if (autoGeopend.current) return;
      autoGeopend.current = true;
      // Eerst waar je was, dan pas de lopende reis. Alleen als die reis er nog
      // is: een verwijderde of niet meer gedeelde reis moet je niet opnieuw
      // voorgeschoteld krijgen met een foutmelding erbij.
      let vorige = null;
      try { vorige = sessionStorage.getItem(LAATSTE_REIS); } catch {}
      if (vorige && (geladen || []).some((t) => String(t.id) === String(vorige))) {
        setView({ name: "detail", id: vorige });
        return;
      }
      const lopend = (geladen || []).find((t) => tripCategory(t.start_date, t.end_date) === 0);
      if (lopend) setView({ name: "detail", id: lopend.id });
    })();
  }, [user, authLoading, loadTrips]);

  async function handleLogout() {
    await appFetch("/auth/logout", { method: "POST" });
    // De service worker bewaart je reisgegevens zodat ze onderweg zonder bereik
    // beschikbaar zijn. Bij uitloggen moeten die weg: anders blijft op een
    // gedeeld of geleend toestel na het uitloggen alsnog je reis te zien.
    try {
      const namen = await caches.keys();
      await Promise.all(namen.filter((n) => n.startsWith("rp-data-")).map((n) => caches.delete(n)));
    } catch {}
    window.location.href = "/login";
  }

  if (authLoading) return (
    <div className="min-h-screen flex items-center justify-center text-gray-400">Laden...</div>
  );

  const tripStats = trips.length > 0 ? `${trips.length} rei${trips.length === 1 ? "s" : "zen"}` : null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky compact header */}
      {/* De kop draagt de app niet meer: hij staat op de achtergrondkleur, de
          iconen zijn monochroom en het perzik komt alleen terug als klein
          merkteken naast de naam. Zo wordt de inhoud eronder het zwaartepunt.
          Een haarrand in plaats van een schaduw houdt het rustig bij scrollen. */}
      <header className="sticky top-0 z-40 bg-gray-50/90 backdrop-blur-md border-b border-gray-200" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <button onClick={() => setView({ name: "list" })} className="flex items-center gap-2.5 leading-none min-w-0 group">
            <span className="w-8 h-8 rounded-lg bg-sky-300 text-gray-800 flex items-center justify-center shrink-0">
              <Icon name="plane" size={16} />
            </span>
            {/* In een reis staat de reisnaam hier, in plaats van "Reisplanner"
                en in plaats van een eigen balk eronder. Het logo blijft de weg
                terug naar alle reizen. */}
            <span className="truncate font-display text-[19px] font-semibold text-gray-800">
              {kopInfo?.naam || "Reisplanner"}
            </span>
            {kopInfo?.gedeeld && (
              <span className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">{kopInfo.gedeeld}</span>
            )}
          </button>
          <div className="flex items-center gap-2 shrink-0">
            {kopInfo?.onEdit && (
              <TripActionsMenu onEdit={kopInfo.onEdit} onDelete={kopInfo.onDelete} />
            )}
            {user ? (
              <>
                {user.is_admin && view.name !== "admin" && (
                  <button onClick={() => setView({ name: "admin" })} title="Beheer"
                    className="text-gray-500 hover:text-gray-800 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                    <Icon name="eye" size={16} />
                  </button>
                )}
                {/* "Uitloggen" stond hier op elk scherm met een vaste plek in de
                    kopbalk — dure ruimte voor iets wat je bijna nooit doet, pal
                    naast het account-knopje waar het thuishoort. Het staat nu in
                    dat scherm zelf. Het knopje is meteen op aanraakmaat gebracht
                    (was 36px, onder het minimum van 44). */}
                <button onClick={() => setShowAccount(true)} title="Account" aria-label="Account"
                  className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
                  {user.avatar
                    ? <img src={user.avatar} alt={user.name} className="w-9 h-9 rounded-full ring-2 ring-gray-200" />
                    : <div className="w-9 h-9 rounded-full bg-sky-100 text-gray-800 flex items-center justify-center font-semibold text-sm">{(user.given_name || user.name || "?")[0].toUpperCase()}</div>
                  }
                </button>
              </>
            ) : (
              <>
                <a href="/login" className="text-gray-800 text-xs font-semibold px-4 py-2 rounded-lg bg-sky-300 hover:bg-sky-200 transition-colors">Inloggen</a>

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
                  <div className="font-display text-2xl font-semibold text-gray-800">{greeting(user.given_name || user.name)}</div>
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
              onClick={() => setNieuweReis("keuze")}
              className="fixed bottom-6 right-4 z-50 flex items-center gap-2 px-6 py-4 rounded-xl font-semibold text-base transition-colors hover:brightness-95"
              style={{ background: PALETTE.primary, color: PALETTE.textPrimary, boxShadow: "0 8px 24px rgba(233,171,155,0.45)", paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
            >
              + Nieuwe reis
            </button>
          </>
        ) : view.name === "admin" ? (
          <AdminView onBack={() => setView({ name: "list" })} currentUserId={user?.id} />
        ) : (
          <TripDetail tripId={view.id} initialTab={view.tab} startImport={view.importeren} onBack={() => setView({ name: "list" })} onChanged={loadTrips} currentUserId={user?.id} onKopInfo={setKopInfo} />
        )}
      </main>

      {/* Eén plek voor de "verwijderd — ongedaan maken"-balkjes, altijd
          gemonteerd zodat elk tabblad ze kan tonen. */}
      <ToastHost />

      {showAccount && user && (
        <AccountModal user={user} onClose={() => setShowAccount(false)} onChanged={loadUser} onLogout={handleLogout} />
      )}
      {nieuweReis === "keuze" && (
        <NieuweReisStart onKies={setNieuweReis} onClose={() => setNieuweReis(null)} />
      )}
      {(nieuweReis === "import" || nieuweReis === "blanco") && (
        <TripForm
          onSaved={(trip) => {
            const metImport = nieuweReis === "import";
            setNieuweReis(null);
            loadTrips();
            setView({ name: "detail", id: trip.id, importeren: metImport });
          }}
          onClose={() => setNieuweReis(null)}
        />
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary><App /></ErrorBoundary>
);
