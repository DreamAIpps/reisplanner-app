// ---------- Trip detail ----------
function TripDetail({ tripId, initialTab, onBack, onChanged, currentUserId }) {
  const [trip, setTrip] = useState(null);
  const [days, setDays] = useState([]);
  const [accommodations, setAccommodations] = useState([]);
  const [transports, setTransports] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [tab, setTab] = useState(initialTab || "days");
  const [editing, setEditing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sharing, setSharing] = useState(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [previewViewer, setPreviewViewer] = useState(false);
  // Budgetbalk op planning is standaard ingeklapt (klein) — de uitsplitsing per
  // categorie komt pas als je 'm openklapt.
  const [budgetExpanded, setBudgetExpanded] = useState(false);

  useEffect(() => {
    if (!showMoreMenu) return;
    const h = (e) => e.key === "Escape" && setShowMoreMenu(false);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [showMoreMenu]);

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

  // Vanuit "Wie heeft de reis bekeken" naar de betreffende dag in het
  // dagboek — de tab moet eerst wisselen en monteren voordat het element er
  // is, vandaar de korte vertraging.
  function jumpToDay(dayId) {
    setSharing(null);
    setTab("journal");
    setTimeout(() => {
      scrollNaarElement(`journal-day-${dayId}`);
    }, 50);
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
    { key: "photos", label: "Foto's", icon: "camera" },
    { key: "accommodation", label: "Verblijf", icon: "bed" },
    { key: "transport", label: "Vervoer", icon: "plane" },
    { key: "packing", label: "Paklijst", icon: "suitcase" },
    { key: "map", label: "Kaart", icon: "map" },
    { key: "quiz", label: "Fotoquiz", icon: "sparkle" },
    // Het fotoboek is niet voor meekijkers: een deel-link laat de reis zien,
    // niet het boek dat je er achteraf van maakt. De server weigert het ook
    // (403), maar dan zou een kijker eerst op een doodlopende knop tikken.
    ...(readOnly ? [] : [{ key: "photobook", label: "Fotoboek", icon: "frame" }]),
  ];

  // De onderste balk hoort te gaan over wat je onderweg het vaakst doet. De
  // fotoquiz stond daar met een vaste plek terwijl je die hooguit één avond per
  // reis speelt; de kaart — "waar is dit, waar ben ik" — zat juist weggestopt
  // achter "Meer". Die twee zijn omgewisseld.
  const bottomNavItems = [
    { key: "days", icon: "route", label: "Planning" },
    ...(currentUserId ? [{ key: "journal", icon: "book", label: "Dagboek" }] : []),
    { key: "map", icon: "map", label: "Kaart" },
  ];
  // Alleen bereikbaar via "Meer". Zeven losse regels lazen als één lange lijst;
  // met kopjes valt in één oogopslag te zien waar iets bij hoort. Bewust géén
  // samenvoeging van Foto's/Fotoboek/Fotoquiz tot één bestemming met subtabs:
  // dat maakt er twee tikken van in plaats van één, en dat is meer frictie, niet
  // minder. Ze horen bij elkaar, dus staan ze onder één kopje.
  const moreMenuGroups = [
    { titel: "Onderweg", items: [
      { key: "photos", icon: "camera", label: "Foto's" },
      { key: "packing", icon: "suitcase", label: "Paklijst" },
      ...(readOnly ? [] : [{ key: "budget", icon: "wallet", label: "Budget" }]),
    ] },
    { titel: "Boekingen", items: [
      { key: "accommodation", icon: "bed", label: "Verblijf" },
      { key: "transport", icon: "plane", label: "Vervoer" },
    ] },
    { titel: "Achteraf", items: [
      ...(readOnly ? [] : [{ key: "photobook", icon: "frame", label: "Fotoboek" }]),
      { key: "quiz", icon: "sparkle", label: "Fotoquiz" },
    ] },
  ];
  const moreMenuItems = moreMenuGroups.flatMap((g) => g.items);
  const isMoreActive = moreMenuItems.some((item) => item.key === tab);

  // Hero: de bestemming is waar je heen gaat en hoort dus het grootst; de
  // reisnaam blijft er als klein regeltje boven staan. "Kyoto, Japan" wordt
  // gesplitst op de laatste komma, zodat het land eronder komt — staat er geen
  // komma in, dan is de hele tekst de plaats en blijft het land weg.
  const heroOnPhoto = !!trip.cover_image;
  const heroInk = heroOnPhoto ? "#FFFFFF" : textOn(accent);
  const heroDest = trip.destination || "";
  const heroComma = heroDest.lastIndexOf(",");
  const heroCity = heroComma > 0 ? heroDest.slice(0, heroComma).trim() : heroDest;
  const heroCountry = heroComma > 0 ? heroDest.slice(heroComma + 1).trim() : null;
  const heroDuration = tripDuration(trip.start_date, trip.end_date);
  const heroShowBudget = viewTrip.budget && tab !== "journal" && tab !== "photos";
  const heroShowActions = isOwnerActions && tab !== "journal" && tab !== "photos";
  // Op de twee werk-tabs (planning en dagboek) is de grote fto-hero te fors — daar
  // volstaat een slanke balk van één regel met de reisnaam, zonder omslagfoto.
  const heroCompact = tab === "days" || tab === "journal";
  const heroCompactInk = textOn(accent);

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
      {/* Back button — only on desktop, except for read-only viewers who have no bottom nav */}
      <button onClick={onBack} className={`${readOnly ? "inline-flex" : "hidden sm:inline-flex"} mb-4 items-center gap-1 text-sm font-medium hover:opacity-70 transition-opacity`} style={{ color: legibleOn(accent) }}>
        ← Alle reizen
      </button>

      {/* Op planning en dagboek: een slanke balk van één regel met de reisnaam,
          zonder omslagfoto — de grote hero neemt daar te veel ruimte in weg van
          de dagen/verhalen zelf. De datums staan er muted achteraan; op smal
          krimpt de naam (truncate) en blijven de datums heel. */}
      {heroCompact ? (
        <div className="mb-6 rp-rise">
          <div className="rounded-2xl shadow-sm px-5 h-14 flex items-center gap-3" style={{ background: accent, color: heroCompactInk }}>
            {/* De reisnaam krijgt de volle regel; datums stonden hier eerst ook,
                maar die duwden een langere naam in een afgekapt "Zomer i…". */}
            <h2 className="font-display text-[19px] font-semibold truncate flex-1 min-w-0">{trip.name}</h2>
            {trip.is_owner === false && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/90 text-gray-700 shrink-0">{readOnly ? "Alleen-lezen" : "Gedeeld"}</span>
            )}
            {isOwnerActions && tab === "days" && (
              <div className="shrink-0"><TripActionsMenu onEdit={() => setEditing(true)} onDelete={handleDelete} /></div>
            )}
          </div>
          {trip.notes && <div className="text-[15px] text-gray-500 leading-relaxed mt-2 px-1">{trip.notes}</div>}
        </div>
      ) : (
      <div className="rounded-3xl overflow-hidden shadow-md mb-8 rp-rise">
        <div className="relative flex flex-col justify-end" style={{ height: 220 }}>
          {heroOnPhoto
            ? <img src={trip.cover_image} alt={heroDest || trip.name} className="absolute inset-0 w-full h-full object-cover" />
            : <div className="absolute inset-0" style={{ background: `linear-gradient(150deg, ${accent}, ${accent}cc)` }} />}
          {heroOnPhoto && <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />}

          <div className="relative px-6 pb-6" style={{ color: heroInk }}>
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="text-[13px] font-medium" style={{ opacity: 0.85 }}>{trip.name}</span>
              {trip.is_owner === false && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/90 text-gray-700">{readOnly ? "Alleen-lezen" : "Gedeeld"}</span>
              )}
              {!readOnly && tab !== "journal" && (
                <button onClick={() => setTab("days")} className="sm:hidden text-[13px] font-medium hover:opacity-100 transition-opacity" style={{ opacity: 0.75 }}>
                  · Dagplanning
                </button>
              )}
            </div>
            <h2 className="font-display text-[32px] font-semibold leading-tight">{heroCity || trip.name}</h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5 text-[13px] font-medium" style={{ opacity: 0.85 }}>
              {heroCountry && <span>{heroCountry}</span>}
              {trip.start_date && (
                <span className="flex items-center gap-1.5">
                  <Icon name="calendar" size={13} /><span className="tnum">{fmt(trip.start_date)} — {fmt(trip.end_date)}</span>
                </span>
              )}
              {heroDuration && <span>{heroDuration}</span>}
              {heroShowBudget && (
                <span className="flex items-center gap-1.5">
                  <Icon name="wallet" size={13} /><span className="tnum">{fmtMoney(viewTrip.budget, trip.currency)}</span>
                </span>
              )}
            </div>
          </div>
        </div>
        {(trip.notes || heroShowActions) && (
          <div className="bg-white px-6 py-4 flex items-center gap-4">
            {trip.notes && <div className="text-[15px] text-gray-500 leading-relaxed min-w-0 flex-1">{trip.notes}</div>}
            {heroShowActions && <div className="shrink-0 ml-auto"><TripActionsMenu onEdit={() => setEditing(true)} onDelete={handleDelete} /></div>}
          </div>
        )}
      </div>
      )}

      {/* Desktop tabs — op mobiel navigeert de onderste balk al, en "· Dagplanning"
          naast de reisnaam hierboven is de subtiele snelkoppeling daar terug. */}
      {!readOnly && (
        <div className="hidden sm:block">
          <Tabs tabs={tabs} active={tab} onChange={setTab} accentColor={accent} />
        </div>
      )}

      {/* Budget balk */}
      {viewTrip.budget && tab !== "journal" && tab !== "photos" && (() => {
        const transportTotal = viewTransports.reduce((s, t) => s + Number(t.cost || 0), 0);
        const accommodationTotal = viewAccommodations.reduce((s, a) => s + Number(a.cost || 0), 0);
        const activityTotal = viewDays.reduce((s, d) => s + (d.activities || []).reduce((s2, a) => s2 + Number(a.cost || 0), 0), 0);
        const expenseTotal = viewExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
        const total = Number(viewTrip.budget);
        const spent = transportTotal + accommodationTotal + activityTotal + expenseTotal;
        const pct = (v) => Math.min((v / total) * 100, 100);
        const tPct = pct(transportTotal);
        const aPct = pct(accommodationTotal);
        const acPct = pct(activityTotal);
        const ePct = pct(expenseTotal);
        const overBudget = spent > total;
        // Compacte balk: label + bedrag + een dunne balk op één regel, plus een
        // chevron die de uitsplitsing per categorie in-/uitklapt. Het bedrag-deel
        // blijft een knop naar het volledige budgetscherm; de chevron klapt alleen
        // open, dus die twee bijten elkaar niet.
        return (
          <div className="w-full mb-8 bg-white rounded-2xl shadow-sm px-5 py-3.5">
            <div className="flex items-center gap-3">
              <button onClick={() => setTab("budget")} className="rp-press flex-1 min-w-0 text-left">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-semibold text-gray-400 uppercase tracking-[0.1em]">Budget</span>
                  <span className="text-[15px] font-semibold text-gray-800 tnum">
                    {fmtMoney(spent, trip.currency)}
                    <span className="text-[13px] font-medium text-gray-400"> / {fmtMoney(total, trip.currency)}</span>
                  </span>
                </div>
                {/* Dunne, afgeronde balk met een haardun wit naadje tussen de vakken. */}
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden flex gap-px mt-2">
                  <div style={{ width: `${tPct}%`, background: PALETTE.coralDeep }} className="h-full transition-all" title={`Vervoer: ${fmtMoney(transportTotal, trip.currency)}`} />
                  <div style={{ width: `${aPct}%`, background: PALETTE.coral }} className="h-full transition-all" title={`Verblijf: ${fmtMoney(accommodationTotal, trip.currency)}`} />
                  <div style={{ width: `${acPct}%`, background: PALETTE.success }} className="h-full transition-all" title={`Activiteiten: ${fmtMoney(activityTotal, trip.currency)}`} />
                  <div style={{ width: `${ePct}%`, background: PALETTE.info }} className="h-full transition-all" title={`Overig: ${fmtMoney(expenseTotal, trip.currency)}`} />
                </div>
              </button>
              <button onClick={() => setBudgetExpanded((v) => !v)} aria-label={budgetExpanded ? "Uitsplitsing inklappen" : "Uitsplitsing tonen"}
                className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors self-center">
                <Icon name="chevronDown" size={16} style={{ transform: budgetExpanded ? "rotate(180deg)" : "none" }} />
              </button>
            </div>
            {overBudget && <div className="text-[13px] font-medium text-red-600 mt-2">Boven budget</div>}
            {budgetExpanded && (
              <div className="flex gap-x-5 gap-y-2 mt-3 flex-wrap">
                {[
                  [transportTotal, PALETTE.coralDeep, "Vervoer"],
                  [accommodationTotal, PALETTE.coral, "Verblijf"],
                  [activityTotal, PALETTE.success, "Activiteiten"],
                  [expenseTotal, PALETTE.info, "Overig"],
                ].filter(([v]) => v > 0).map(([value, color, label]) => (
                  <span key={label} className="text-[13px] font-medium text-gray-500 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ background: color }} />
                    {label} <span className="tnum text-gray-400">{fmtMoney(value, trip.currency)}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {readOnly ? (
        <>
          {/* Alleen-lezen bezoekers krijgen geen volledige tabbalk, maar wel
              dagboek, kaart en de fotoquiz — die wijzigt niets aan de reis,
              dus past prima bij alleen-lezen toegang. */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-4 w-fit flex-wrap">
            <button onClick={() => setTab("journal")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-1.5 ${tab === "journal" || tab === "days" ? "bg-white shadow" : "text-gray-500 hover:text-gray-700"}`}
              style={tab === "journal" || tab === "days" ? { color: legibleOn(accent) } : {}}>
              <Icon name="book" size={15} />Dagboek
            </button>
            <button onClick={() => setTab("map")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-1.5 ${tab === "map" ? "bg-white shadow" : "text-gray-500 hover:text-gray-700"}`}
              style={tab === "map" ? { color: legibleOn(accent) } : {}}>
              <Icon name="map" size={15} />Kaart
            </button>
            <button onClick={() => setTab("quiz")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-1.5 ${tab === "quiz" ? "bg-white shadow" : "text-gray-500 hover:text-gray-700"}`}
              style={tab === "quiz" ? { color: legibleOn(accent) } : {}}>
              <Icon name="sparkle" size={15} />Fotoquiz
            </button>
          </div>
          {tab === "map"
            ? <TripMapTab trip={trip} accommodations={accommodations} transports={transports} days={days} />
            : <JournalTab trip={viewTrip} days={viewDays} transports={viewTransports} accommodations={viewAccommodations} readOnly={readOnly} currentUserId={currentUserId} onRefresh={load} onPreviewViewer={() => setPreviewViewer(true)} onShare={isOwnerActions ? () => setSharing("viewer") : null} onGoToPlanning={() => setTab("days")} />}
        </>
      ) : (
        <>
          {tab === "days" && <DayPlanningTab trip={viewTrip} days={viewDays} transports={viewTransports} accommodations={viewAccommodations} onRefresh={load} readOnly={readOnly} currentUserId={currentUserId} onShareEditor={isOwnerActions ? () => setSharing("editor") : null} onEditTrip={isOwnerActions ? () => setEditing(true) : null} />}
          {tab === "journal" && <JournalTab trip={viewTrip} days={viewDays} transports={viewTransports} accommodations={viewAccommodations} readOnly={readOnly} currentUserId={currentUserId} onRefresh={load} onPreviewViewer={() => setPreviewViewer(true)} onShare={isOwnerActions ? () => setSharing("viewer") : null} />}
          {tab === "photos" && <PhotoGalleryTab trip={viewTrip} days={viewDays} transports={viewTransports} accommodations={viewAccommodations} readOnly={readOnly} currentUserId={currentUserId} />}
          {tab === "accommodation" && <AccommodationTab trip={viewTrip} accommodations={viewAccommodations} onRefresh={load} readOnly={readOnly} currentUserId={currentUserId} />}
          {tab === "transport" && <TransportTab trip={viewTrip} transports={viewTransports} onRefresh={load} readOnly={readOnly} currentUserId={currentUserId} />}
          {tab === "budget" && !readOnly && <BudgetTab trip={viewTrip} expenses={viewExpenses} transports={viewTransports} accommodations={viewAccommodations} days={viewDays} onRefresh={load} />}
          {tab === "map" && <TripMapTab trip={trip} accommodations={accommodations} transports={transports} days={days} />}
          {tab === "packing" && <PackingTab tripId={trip.id} readOnly={readOnly} />}
        </>
      )}

      {/* De fotoquiz rendert los van de rest, full screen, voor iedereen met
          toegang tot de reis — ook alleen-lezen bezoekers kunnen 'm hosten
          (een nieuwe sessie aanmaken/starten/stoppen), niet alleen
          eigenaar/editor. Wie een sessie aanmaakt wordt daar zelf gastheer
          van, ongeacht wie de reis bezit. */}
      {tab === "quiz" && (
        <QuizFullscreen onClose={() => setTab(readOnly ? "journal" : "days")} label="Fotoquiz sluiten">
          <PhotoQuizTab trip={viewTrip} />
        </QuizFullscreen>
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
            <button onClick={() => { setShowMoreMenu(false); onBack(); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-gray-50 transition-colors text-left text-gray-700 border-b border-gray-100">
              <Icon name="arrowLeft" size={17} />
              Terug
            </button>
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
      {importing && <ImportModal tripId={tripId} onImported={load} onClose={() => setImporting(false)} />}
      {sharing && (
        <ShareModal tripId={tripId} role={sharing} onClose={() => setSharing(null)}
          days={days} transports={transports} accommodations={accommodations} onJumpToDay={jumpToDay} />
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

function AdminView({ onBack, currentUserId }) {
  const [trips, setTrips] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("trips");
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [backfillResult, setBackfillResult] = useState(null);
  const [storage, setStorage] = useState(null);
  const [shrinkBusy, setShrinkBusy] = useState(false);
  const [shrinkResult, setShrinkResult] = useState(null);

  async function handleBackfillGps() {
    setBackfillBusy(true);
    setBackfillResult(null);
    try {
      const r = await api.backfillPhotoGps();
      setBackfillResult({ ok: true, text: `${r.updated} van ${r.checked} foto's zonder locatie kregen alsnog GPS.` });
    } catch (err) {
      setBackfillResult({ ok: false, text: err.message || "Nabewerking mislukt" });
    } finally {
      setBackfillBusy(false);
    }
  }

  async function handleShrinkPhotos() {
    setShrinkBusy(true);
    setShrinkResult(null);
    // In batches: bij een paar honderd foto's duurt één herschrijf-slag per
    // foto lang genoeg dat één groot verzoek Railway's eigen proxy-timeout kan
    // raken — de browser meldt dat dan als een kale "Load failed", niet als
    // een bruikbare foutmelding. Zo blijft elk verzoek klein, en zie je de
    // voortgang terwijl het loopt in plaats van pas (of nooit) aan het eind.
    let afterId = 0, totalChecked = 0, totalResized = 0, bytesBefore = 0, bytesAfter = 0;
    try {
      for (;;) {
        const r = await api.shrinkPhotos(afterId);
        totalChecked += r.checked;
        totalResized += r.resized;
        bytesBefore += r.bytesBefore;
        bytesAfter += r.bytesAfter;
        afterId = r.lastId;
        setShrinkResult({
          ok: true,
          text: totalResized > 0
            ? `Bezig... ${totalResized} van ${totalChecked} gecontroleerde foto's verkleind, ${fmtBytes(bytesBefore - bytesAfter)} bespaard tot nu toe.`
            : `Bezig... ${totalChecked} foto's gecontroleerd, nog niets te verkleinen.`,
        });
        if (!r.hasMore) break;
      }
      setShrinkResult({
        ok: true,
        text: totalResized > 0
          ? `Klaar: ${totalResized} van ${totalChecked} foto's verkleind, ${fmtBytes(bytesBefore - bytesAfter)} bespaard (was ${fmtBytes(bytesBefore)}, nu ${fmtBytes(bytesAfter)}).`
          : `Klaar — niets te verkleinen, alle ${totalChecked} foto's waren al klein genoeg.`,
      });
      api.getStorageInfo().then(setStorage).catch(() => {});
    } catch (err) {
      setShrinkResult({ ok: false, text: (err.message || "Verkleinen mislukt") + ` (tot hier: ${totalResized} van ${totalChecked} verkleind)` });
    } finally {
      setShrinkBusy(false);
    }
  }

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
          <div className="text-xs text-gray-400 mt-2 max-w-md">
            Foto's staan als data in de database zelf. Loopt dit vol ("Niet gelukt: ... No space left on
            device" bij uploaden), dan helpt alleen oude foto's verwijderen of de Postgres-schijf op Railway
            groter maken — dit scherm ververst niet vanzelf, herlaad de pagina om een nieuw cijfer te zien.
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold text-gray-700">Locatie nalopen bij bestaande foto's</div>
            <div className="text-xs text-gray-400 mt-0.5 max-w-md">
              Zoekt in alle foto's zonder locatie of er alsnog GPS uit de opgeslagen bytes te halen is. Werkt
              alleen als die bytes nog de originele Exif hebben — een HEIC-foto die al is omgezet naar JPEG is
              die kwijt en blijft zonder locatie.
            </div>
          </div>
          <Button variant="secondary" onClick={handleBackfillGps} disabled={backfillBusy} className="shrink-0">
            {backfillBusy ? "Bezig..." : "Nalopen"}
          </Button>
        </div>
        {backfillResult && (
          <div className={`text-xs mt-2 ${backfillResult.ok ? "text-green-600" : "text-red-500"}`}>{backfillResult.text}</div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold text-gray-700">Bestaande foto's verkleinen</div>
            <div className="text-xs text-gray-400 mt-0.5 max-w-md">
              Herschrijft elke foto die groter is dan de nieuwe 2000px-grens naar dat formaat — hetzelfde wat
              nieuwe uploads nu al krijgen, met terugwerkende kracht. Kan even duren bij veel foto's.
            </div>
          </div>
          <Button variant="secondary" onClick={handleShrinkPhotos} disabled={shrinkBusy} className="shrink-0">
            {shrinkBusy ? "Bezig..." : "Verkleinen"}
          </Button>
        </div>
        {shrinkResult && (
          <div className={`text-xs mt-2 ${shrinkResult.ok ? "text-green-600" : "text-red-500"}`}>{shrinkResult.text}</div>
        )}
      </div>

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
                  <div key={t.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-4">
                    {t.cover_image
                      ? <img src={t.cover_image} className="w-14 h-14 rounded-lg object-cover shrink-0" />
                      : <div className="w-14 h-14 rounded-lg shrink-0" style={{ background: t.cover_color || PALETTE.primary }} />}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-800">{t.name}</div>
                      {t.destination && <div className="text-sm text-gray-500 flex items-center gap-1"><Icon name="pin" size={13} />{t.destination}</div>}
                      {t.start_date && <div className="text-xs text-gray-400">{fmt(t.start_date)}</div>}
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
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : tab === "users" ? (
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
              <div className="text-xs text-gray-400 shrink-0 text-right">
                {(byUser[u.id]?.trips.length || 0)} rei{(byUser[u.id]?.trips.length || 0) !== 1 ? "zen" : "s"}
              </div>
              {u.id !== currentUserId && (
                <button type="button" onClick={() => handleDeleteUser(u)} aria-label="Gebruiker verwijderen"
                  className="shrink-0 text-gray-300 hover:text-red-500 transition-colors p-1">
                  <Icon name="trash" size={16} />
                </button>
              )}
            </div>
          ))}
          {users.length === 0 && <div className="text-center py-12 text-gray-400">Geen gebruikers gevonden</div>}
        </div>
      ) : (
        <CockpitPanel />
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
  const [view, setView] = useState({ name: "list" });
  const [showTripForm, setShowTripForm] = useState(false);
  const [showAccount, setShowAccount] = useState(false);

  const loadUser = useCallback(async () => {
    try {
      const r = await fetch("/auth/me");
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
      const lopend = (geladen || []).find((t) => tripCategory(t.start_date, t.end_date) === 0);
      if (lopend) setView({ name: "detail", id: lopend.id });
    })();
  }, [user, authLoading, loadTrips]);

  async function handleLogout() {
    await fetch("/auth/logout", { method: "POST" });
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
            <span className="truncate font-display text-[19px] font-semibold text-gray-800">Reisplanner</span>
          </button>
          <div className="flex items-center gap-2 shrink-0">
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
              onClick={() => setShowTripForm(true)}
              className="fixed bottom-6 right-4 z-50 flex items-center gap-2 px-6 py-4 rounded-xl font-semibold text-base transition-colors hover:brightness-95"
              style={{ background: PALETTE.primary, color: PALETTE.textPrimary, boxShadow: "0 8px 24px rgba(233,171,155,0.45)", paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
            >
              + Nieuwe reis
            </button>
          </>
        ) : view.name === "admin" ? (
          <AdminView onBack={() => setView({ name: "list" })} currentUserId={user?.id} />
        ) : (
          <TripDetail tripId={view.id} initialTab={view.tab} onBack={() => setView({ name: "list" })} onChanged={loadTrips} currentUserId={user?.id} />
        )}
      </main>

      {/* Eén plek voor de "verwijderd — ongedaan maken"-balkjes, altijd
          gemonteerd zodat elk tabblad ze kan tonen. */}
      <ToastHost />

      {showAccount && user && (
        <AccountModal user={user} onClose={() => setShowAccount(false)} onChanged={loadUser} onLogout={handleLogout} />
      )}
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
