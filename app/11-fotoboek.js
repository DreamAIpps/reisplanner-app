// ---------- Fotoboek ----------
function PhotobookTab({ trip }) {
  const [books, setBooks] = useState(undefined); // undefined = laden
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [openBookId, setOpenBookId] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  // 1 = staand/liggend, 2 = hoeken van de foto's, 3 = achtergrondkleur,
  // 4 = automatisch vullen?, 5 = hoeveel foto's per pagina?,
  // 6 = paginatitels uit het dagboek?
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardOrientation, setWizardOrientation] = useState("portrait");
  const [wizardCorner, setWizardCorner] = useState(0);
  const [wizardBackground, setWizardBackground] = useState(null); // null = wit laten
  const [wizardPerPage, setWizardPerPage] = useState(1);

  const load = useCallback(async () => {
    try { setBooks(await api.getPhotobooks(trip.id)); }
    catch { setBooks([]); }
  }, [trip.id]);

  useEffect(() => { load(); }, [load]);

  // Geen ongedaan-maken zoals bij een activiteit: de server kent geen manier om
  // een fotoboek met al zijn pagina's terug te zetten. Dus wél eerst vragen, met
  // de titel erbij zodat duidelijk is welk boek je weggooit.
  async function handleDeleteBook(book) {
    if (!confirm(`"${book.title}" verwijderen? Dit kan niet ongedaan gemaakt worden.`)) return;
    try { await api.deletePhotobook(book.id); await load(); }
    catch (err) { toonMelding(err.message || "Verwijderen is niet gelukt"); }
  }

  // Drukwerkprijzen komen van Print API en dus van buiten: apart ophalen, ná de
  // lijst, zodat het overzicht meteen staat en een trage of onbereikbare
  // Print API hooguit betekent dat er geen prijs bij staat. Elke boek-aanvraag
  // vangt zijn eigen fout op, zodat één mislukking de rest niet meesleept.
  const [quotes, setQuotes] = useState({});
  useEffect(() => {
    if (!books || !books.length) return;
    let cancelled = false;
    Promise.all(books.map((b) =>
      api.getPhotobookPrintQuote(b.id).then((q) => [b.id, q]).catch(() => [b.id, { available: false }])
    )).then((pairs) => {
      if (!cancelled) setQuotes(Object.fromEntries(pairs));
    });
    return () => { cancelled = true; };
  }, [books]);

  async function handleCreate(opts) {
    setCreating(true); setError(null);
    try {
      const book = await api.createPhotobook(trip.id, opts);
      setWizardOpen(false);
      setOpenBookId(book.id);
      load();
    } catch (err) { setError(err.message || "Kon geen fotoboek maken"); }
    finally { setCreating(false); }
  }

  if (openBookId) {
    return <PhotobookEditor tripId={trip.id} bookId={openBookId} onBack={() => { setOpenBookId(null); load(); }} />;
  }

  if (books === undefined) return <div className="text-center py-16 text-gray-400">Laden...</div>;

  // Elke keuze toont meteen het bijpassende paginasjabloon (zelfde indelingen
  // als de "Pagina sjablonen" in de editor), zodat je ziet wat je kiest.
  const PHOTOBOOK_AUTOFILL_CHOICES = [
    { n: 1, layout: PHOTOBOOK_LAYOUTS[0] },
    { n: 2, layout: PHOTOBOOK_LAYOUTS[1] },
    { n: 3, layout: PHOTOBOOK_LAYOUTS[3] },
    { n: 4, layout: PHOTOBOOK_LAYOUTS[4] },
  ];

  return (
    <div className="max-w-md mx-auto">
      <div className="text-center py-6">
        <Icon name="frame" size={38} strokeWidth={1.2} className="mx-auto mb-3 text-sky-400" />
        <h3 className="font-display text-[21px] text-gray-800 mb-2">Fotoboek</h3>
        <p className="text-sm text-gray-500 leading-relaxed mb-5">
          Stel samen een fotoboek van deze reis samen — een voorgestelde selectie, volgorde en bijschrift om mee te beginnen, die je zelf verder aanpast.
        </p>
        {error && !wizardOpen && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg mb-4 text-left">{error}</div>}
        <Button onClick={() => { setWizardStep(1); setWizardOrientation("portrait"); setWizardCorner(0); setWizardBackground(null); setWizardPerPage(1); setWizardOpen(true); setError(null); }} disabled={creating}>+ Nieuw fotoboek</Button>
      </div>

      {wizardOpen && (
        <Modal title="Nieuw fotoboek" onClose={() => !creating && setWizardOpen(false)}>
          {wizardStep === 1 && (
            <div>
              <p className="text-sm text-gray-600 mb-4">Staand of liggend formaat?</p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <button type="button" onClick={() => { setWizardOrientation("portrait"); setWizardStep(2); }} disabled={creating}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border border-gray-200 hover:border-sky-300 hover:bg-sky-50 transition-colors disabled:opacity-50">
                  <div className="w-12 h-16 rounded border-2 border-gray-300 bg-gray-50" />
                  <span className="text-sm font-medium text-gray-800">Staand</span>
                </button>
                <button type="button" onClick={() => { setWizardOrientation("landscape"); setWizardStep(2); }} disabled={creating}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border border-gray-200 hover:border-sky-300 hover:bg-sky-50 transition-colors disabled:opacity-50">
                  <div className="w-16 h-12 rounded border-2 border-gray-300 bg-gray-50" />
                  <span className="text-sm font-medium text-gray-800">Liggend</span>
                </button>
              </div>
            </div>
          )}
          {wizardStep === 2 && (
            <div>
              <p className="text-sm text-gray-600 mb-4">
                Welke hoeken wil je voor de foto's? Dit geldt voor het hele boek — per foto kun je het later nog bijstellen.
              </p>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {PHOTOBOOK_CORNER_PRESETS.map((p) => (
                  <button key={p.value} type="button" onClick={() => { setWizardCorner(p.value); setWizardStep(3); }} disabled={creating}
                    className="flex flex-col items-center gap-2 p-2.5 rounded-xl border border-gray-200 hover:border-sky-300 hover:bg-sky-50 transition-colors disabled:opacity-50">
                    {/* Het voorbeeldje is 40px; de presets zijn fracties van een
                        paginazijde, dus hier omgerekend naar deze maat zodat het
                        blokje toont wat je op de pagina krijgt. */}
                    <span className="w-10 h-10 bg-sky-200 shrink-0" style={{ borderRadius: `${p.value * 40 * 4}px` }} />
                    <span className="text-xs font-medium text-gray-800">{p.label}</span>
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setWizardStep(1)} disabled={creating}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors">← Terug</button>
            </div>
          )}
          {wizardStep === 3 && (
            <div>
              <p className="text-sm text-gray-600 mb-4">
                Wil je de pagina's een achtergrondkleur geven? Die geldt voor het hele boek — per pagina kun je 'm later nog wijzigen.
              </p>
              <div className="grid grid-cols-4 gap-2 mb-4">
                <button type="button" onClick={() => { setWizardBackground(null); setWizardStep(4); }} disabled={creating}
                  className="flex flex-col items-center gap-2 p-2.5 rounded-xl border border-gray-200 hover:border-sky-300 hover:bg-sky-50 transition-colors disabled:opacity-50">
                  <span className="w-10 h-10 rounded-lg shrink-0 border border-gray-200 bg-white" />
                  <span className="text-xs font-medium text-gray-800">Wit</span>
                </button>
                {PHOTOBOOK_BG_SWATCHES.map((c) => (
                  <button key={c} type="button" onClick={() => { setWizardBackground(c); setWizardStep(4); }} disabled={creating}
                    className="flex flex-col items-center gap-2 p-2.5 rounded-xl border border-gray-200 hover:border-sky-300 hover:bg-sky-50 transition-colors disabled:opacity-50">
                    <span className="w-10 h-10 rounded-lg shrink-0 border border-black/5" style={{ background: c }} />
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setWizardStep(2)} disabled={creating}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors">← Terug</button>
            </div>
          )}
          {wizardStep === 4 && (
            <div>
              <p className="text-sm text-gray-600 mb-4">
                Wil je een automatisch voorgevuld fotoboek maken, met de foto's van deze reis alvast verdeeld over de pagina's?
              </p>
              <div className="space-y-2">
                <button type="button" onClick={() => setWizardStep(5)} disabled={creating}
                  className="w-full text-left p-3 rounded-xl border border-sky-200 bg-sky-50 hover:border-sky-300 transition-colors disabled:opacity-50">
                  <div className="font-medium text-gray-800">Ja, vul automatisch</div>
                  <div className="text-xs text-gray-500 mt-0.5">Alle foto's van de reis worden verdeeld over pagina's, die je daarna zelf verder aanpast.</div>
                </button>
                <button type="button" onClick={() => handleCreate({ autofill: false, orientation: wizardOrientation, cornerRadius: wizardCorner, backgroundColor: wizardBackground })} disabled={creating}
                  className="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors disabled:opacity-50">
                  <div className="font-medium text-gray-800">Nee, ik begin leeg</div>
                  <div className="text-xs text-gray-500 mt-0.5">Een leeg fotoboek waar je zelf pagina's en foto's aan toevoegt.</div>
                </button>
              </div>
              <button type="button" onClick={() => setWizardStep(3)} disabled={creating}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors mt-3">← Terug</button>
            </div>
          )}
          {wizardStep === 5 && (
            <div>
              <p className="text-sm text-gray-600 mb-4">Hoeveel foto's per pagina?</p>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {PHOTOBOOK_AUTOFILL_CHOICES.map(({ n, layout }) => (
                  <button key={n} type="button" disabled={creating}
                    onClick={() => { setWizardPerPage(n); setWizardStep(6); }}
                    className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl border border-gray-200 hover:border-sky-300 hover:bg-sky-50 transition-colors disabled:opacity-50">
                    <PhotobookLayoutThumb slots={layout.slots} orientation={wizardOrientation} />
                    <span className="text-sm font-medium text-gray-800">{n}</span>
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setWizardStep(4)} disabled={creating}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors">← Terug</button>
            </div>
          )}
          {wizardStep === 6 && (
            <div>
              <p className="text-sm text-gray-600 mb-4">
                Wil je de paginatitels uit je dagboek overnemen? Dan krijgt elke pagina het onderschrift dat je bij die foto schreef, of anders de activiteit of dag waar hij bij hoort.
              </p>
              <div className="space-y-2">
                <button type="button" disabled={creating}
                  onClick={() => handleCreate({ autofill: true, photosPerPage: wizardPerPage, orientation: wizardOrientation, cornerRadius: wizardCorner, backgroundColor: wizardBackground, useJournalTitles: true })}
                  className="w-full text-left p-3 rounded-xl border border-sky-200 bg-sky-50 hover:border-sky-300 transition-colors disabled:opacity-50">
                  <div className="font-medium text-gray-800">Ja, neem ze over</div>
                  <div className="text-xs text-gray-500 mt-0.5">Titels staan er meteen in; je kunt ze per pagina aanpassen of weghalen.</div>
                </button>
                <button type="button" disabled={creating}
                  onClick={() => handleCreate({ autofill: true, photosPerPage: wizardPerPage, orientation: wizardOrientation, cornerRadius: wizardCorner, backgroundColor: wizardBackground, useJournalTitles: false })}
                  className="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors disabled:opacity-50">
                  <div className="font-medium text-gray-800">Nee, laat ze leeg</div>
                  <div className="text-xs text-gray-500 mt-0.5">Pagina's zonder titel, zodat je zelf bepaalt wat erbij komt.</div>
                </button>
              </div>
              <button type="button" onClick={() => setWizardStep(5)} disabled={creating}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors mt-3">← Terug</button>
            </div>
          )}
          {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg mt-4">{error}</div>}
          {creating && <div className="text-sm text-gray-400 mt-4">Fotoboek maken...</div>}
        </Modal>
      )}
      {books.length > 0 && (
        <div className="space-y-2">
          {/* De rij is geen knop meer maar een rij mét een knop erin: een
              verwijderknop binnen een knop kan niet. Weggooien hoort hier thuis
              en niet in de editor — je gooit een boek weg omdát je het niet meer
              wilt bewerken, en het scheelt daar een knop in een balk die toch al
              te vol was. */}
          {books.map((b) => (
            <div key={b.id}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-white shadow-sm hover:border-sky-200 transition-colors">
              <button type="button" onClick={() => setOpenBookId(b.id)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                {b.coverThumbUrl
                  ? <img src={b.coverThumbUrl} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
                  : <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center shrink-0"><Icon name="frame" size={20} className="text-gray-300" /></div>}
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-gray-800 truncate">{b.title}</div>
                  <div className="text-xs text-gray-400">
                    {b.pageCount} {b.pageCount === 1 ? "pagina" : "pagina's"}
                    {quotes[b.id]?.available && quotes[b.id].total != null && (
                      <span className="text-sky-700 font-medium"> · drukwerk {fmtMoney(quotes[b.id].total, quotes[b.id].currency || "EUR")}</span>
                    )}
                  </div>
                </div>
                <Icon name="arrowRight" size={16} className="text-gray-300 shrink-0" />
              </button>
              <button type="button" onClick={() => handleDeleteBook(b)} aria-label={`${b.title} verwijderen`}
                className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const PHOTOBOOK_BG_SWATCHES = [
  PALETTE.primarySoft, PALETTE.surfaceSecondary, PALETTE.border,
  PALETTE.textPrimary, PALETTE.primary, PALETTE.info,
];

// Hoekafronding per foto — net als bij professionele fotoboek-editors.
//
// cornerRadius is een fractie van de kórtste zijde van de pagina, niet van de
// foto. Dat is het verschil tussen "alle hoeken op deze pagina zijn even rond"
// en wat het eerder was: een grote foto kreeg een grote ronding en een kleine
// foto een kleine, en omdat een percentage in border-radius per as apart telt
// werden de hoeken bij een niet-vierkante foto ook nog eens ovaal. Paginamaat
// als maatstaf geeft één ronding voor de hele pagina, ongeacht formaat of
// verhouding van de foto.
// Op A4 (kortste zijde 210 mm) komt dit neer op ongeveer 1,7 / 3 / 5 mm —
// ingetogen genoeg om als afwerking te lezen in plaats van als vormgeving.
const PHOTOBOOK_CORNER_PRESETS = [
  { value: 0, label: "Geen" },
  { value: 0.008, label: "Zacht" },
  { value: 0.015, label: "Rond" },
  { value: 0.025, label: "Sterk" },
];
// Container-query-eenheid: 1cqmin is 1% van de kortste zijde van de pagina.
// Daardoor hoeft geen enkele render-plek de paginamaat zelf op te meten, en
// blijft de ronding automatisch kloppen als de canvas van formaat verandert.
function photobookCornerCss(cornerRadius) {
  return `${(cornerRadius ?? 0) * 100}cqmin`;
}
// Witte sluier over een achtergrondfoto, zodat voorgrondtekst/-foto's
// leesbaar blijven op een drukke achtergrond — een vast wit vlak boven de
// achtergrond in plaats van doorzicht op de foto zelf.
const PHOTOBOOK_OVERLAY_PRESETS = [
  { value: 0, label: "Geen" },
  { value: 0.25, label: "25%" },
  { value: 0.5, label: "50%" },
  { value: 0.75, label: "75%" },
];

// Kant-en-klare paginaindelingen, zoals "Pagina sjablonen" bij professionele
// fotoboek-editors (Albelli e.d.) — één tik legt de al aanwezige foto's op
// deze pagina in een verzorgde verhouding neer, in plaats van dat je zelf
// vanaf een stapel begint te schuiven. Vrij verslepen blijft daarna gewoon
// mogelijk om het naar smaak bij te stellen.
const PHOTOBOOK_LAYOUTS = [
  { key: "1", label: "1 foto", slots: [
    { x: 0.05, y: 0.05, width: 0.9, height: 0.9 },
  ] },
  { key: "2h", label: "2 naast elkaar", slots: [
    { x: 0.05, y: 0.05, width: 0.44, height: 0.9 },
    { x: 0.51, y: 0.05, width: 0.44, height: 0.9 },
  ] },
  { key: "2v", label: "2 boven-onder", slots: [
    { x: 0.05, y: 0.05, width: 0.9, height: 0.44 },
    { x: 0.05, y: 0.51, width: 0.9, height: 0.44 },
  ] },
  { key: "3", label: "1 groot + 2 klein", slots: [
    { x: 0.05, y: 0.05, width: 0.56, height: 0.9 },
    { x: 0.64, y: 0.05, width: 0.31, height: 0.43 },
    { x: 0.64, y: 0.52, width: 0.31, height: 0.43 },
  ] },
  { key: "4", label: "4 in raster", slots: [
    { x: 0.05, y: 0.05, width: 0.44, height: 0.44 },
    { x: 0.51, y: 0.05, width: 0.44, height: 0.44 },
    { x: 0.05, y: 0.51, width: 0.44, height: 0.44 },
    { x: 0.51, y: 0.51, width: 0.44, height: 0.44 },
  ] },
];

// Welke foto hoort bij welk vak van de gekozen indeling? Dat ging op volgorde
// van de fotolijst: foto 1 in vak 1, foto 2 in vak 2. De simpelste regel, maar
// hij negeert waar de foto's op dat moment stáán — koos je een indeling, dan
// wipte de foto rechtsonder zomaar naar linksboven omdat hij toevallig als
// eerste was toegevoegd. Nu krijgt elk vak de foto die er al het dichtst bij
// ligt (middelpunt tot middelpunt), zodat een indeling het beeld rechttrekt in
// plaats van het door elkaar te gooien.
//
// De aanpak: steeds het kortste nog beschikbare paar vastleggen, tot de vakken
// op zijn. Dat is niet gegarandeerd de kleinst mogelijke totale afstand — daar
// zou je alle toewijzingen voor moeten uitproberen — maar bij hoogstens vier
// vakken die duidelijk uit elkaar liggen komt het op hetzelfde neer, en het
// blijft navolgbaar. Foto's die overblijven (meer foto's dan vakken) houden
// hun eigen plek, net als voorheen.
function matchPhotosToSlots(photos, slots) {
  const midden = (r) => [(r.x ?? 0) + (r.width ?? 0) / 2, (r.y ?? 0) + (r.height ?? 0) / 2];
  const paren = [];
  photos.forEach((foto, fi) => {
    const [fx, fy] = midden(foto);
    slots.forEach((vak, vi) => {
      const [vx, vy] = midden(vak);
      paren.push({ fi, vi, afstand: (fx - vx) ** 2 + (fy - vy) ** 2 });
    });
  });
  // Bij gelijke afstand (een verse pagina waar alle foto's nog op dezelfde plek
  // liggen) beslist de oorspronkelijke volgorde, zodat de uitkomst niet afhangt
  // van hoe de browser toevallig sorteert.
  paren.sort((a, b) => a.afstand - b.afstand || a.vi - b.vi || a.fi - b.fi);
  const vakPerFoto = new Array(photos.length).fill(null);
  const fotoBezet = new Set();
  const vakBezet = new Set();
  for (const { fi, vi } of paren) {
    if (fotoBezet.has(fi) || vakBezet.has(vi)) continue;
    vakPerFoto[fi] = vi;
    fotoBezet.add(fi); vakBezet.add(vi);
    if (vakBezet.size === slots.length) break;
  }
  return vakPerFoto;
}

// Legt de foto's van een pagina in de vakken van een indeling, met de
// koppeling hierboven. Gedeeld door de losse indeling-knoppen en de
// ontwerp-presets, zodat beide zich hetzelfde gedragen.
function photosInLayout(photos, slots) {
  const vakPerFoto = matchPhotosToSlots(photos, slots);
  return photos.map((foto, i) => (vakPerFoto[i] === null ? foto : { ...foto, ...slots[vakPerFoto[i]] }));
}

// Klein diagram van de indeling zelf (geen foto-inhoud) — zodat je in één
// oogopslag ziet wat je kiest.
// Zelfde 36x44 vlak, alleen verwisseld voor liggend — zo laat het mini-
// diagram meteen de gekozen paginavorm zien in plaats van altijd staand.
function PhotobookLayoutThumb({ slots, orientation }) {
  return (
    <div className={`relative rounded border border-gray-300 bg-gray-50 overflow-hidden shrink-0 ${orientation === "landscape" ? "w-11 h-9" : "w-9 h-11"}`}>
      {slots.map((s, i) => (
        <div key={i} className="absolute bg-gray-400 rounded-[1px]"
          style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: `${s.width * 100}%`, height: `${s.height * 100}%` }} />
      ))}
    </div>
  );
}

// Kant-en-klare combinaties van indeling + achtergrondkleur — net als de
// "Designvorlagen" bij professionele fotoboek-editors (CEWE e.d.), die
// layout en achtergrond samen als één stijl aanbieden. Zet je daarna nog
// gewoon zelf verder naar smaak; puur een vertrekpunt.
const PHOTOBOOK_DESIGN_PRESETS = [
  { key: "clean", label: "Strak wit", layout: PHOTOBOOK_LAYOUTS[0], background: null },
  { key: "warm", label: "Warm duo", layout: PHOTOBOOK_LAYOUTS[1], background: { type: "color", value: PALETTE.primarySoft } },
  { key: "dark", label: "Donker elegant", layout: PHOTOBOOK_LAYOUTS[3], background: { type: "color", value: PALETTE.textPrimary } },
  { key: "ocean", label: "Oceaan raster", layout: PHOTOBOOK_LAYOUTS[4], background: { type: "color", value: PALETTE.info } },
];
function PhotobookDesignPresetThumb({ layout, background }) {
  return (
    <div className="relative w-9 h-11 rounded border border-gray-300 overflow-hidden shrink-0"
      style={{ background: background ? background.value : PALETTE.background }}>
      {layout.slots.map((s, i) => (
        <div key={i} className="absolute rounded-[1px]" style={{
          left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: `${s.width * 100}%`, height: `${s.height * 100}%`,
          background: background?.type === "color" && contrastRatio(background.value, "#ffffff") < 2.5 ? "rgba(255,255,255,.7)" : "rgba(0,0,0,.35)",
        }} />
      ))}
    </div>
  );
}

// Rooster/magneetpunten voor het verslepen en schalen — dezelfde gedachte
// als "Raster aan/uit" bij professionele fotoboek-editors: makkelijk precies
// tegen de marge/het midden aan leggen, zonder te moeten pixelen.
// Deze lijnen worden ook echt getekend zodra "Raster" aanstaat (zie de overlay
// op de canvas). Dat is de hele truc: waar je op mikt is waar het aan plakt.
// Eerder waren er alleen marges en het midden, en werd er verder naar een fijne
// stap van 0.02 afgerond — onzichtbaar én te fijn om als raster te voelen.
const PHOTOBOOK_SNAP_GUIDES = [0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1];
const PHOTOBOOK_SNAP_THRESHOLD = 0.015;
const PHOTOBOOK_SNAP_STEP = 0.02;
function snapPhotobookValue(v) {
  for (const g of PHOTOBOOK_SNAP_GUIDES) {
    if (Math.abs(v - g) < PHOTOBOOK_SNAP_THRESHOLD) return g;
  }
  return Math.round(v / PHOTOBOOK_SNAP_STEP) * PHOTOBOOK_SNAP_STEP;
}
// Altijd naar de díchtstbijzijnde zichtbare rasterlijn, hoe ver ook — anders
// dan snapPhotobookValue, dat pas binnen een marge vastklikt en daarbuiten op
// een fijner (onzichtbaar) 0.02-raster afrondt. Voor de "foto's op het raster"-
// knop wil je juist dat elke rand op een lijn belandt die de gebruiker ook echt
// ziet, ook als een foto er nu ver naast staat.
function nearestPhotobookGuide(v) {
  let best = PHOTOBOOK_SNAP_GUIDES[0];
  for (const g of PHOTOBOOK_SNAP_GUIDES) {
    if (Math.abs(v - g) < Math.abs(best - v)) best = g;
  }
  return best;
}
// Bij verslepen telt niet alleen de linker-/bovenrand van een foto: je wilt
// 'm net zo goed met de rechter-/onderrand tegen een lijn kunnen leggen.
// Daarom worden beide randen langs het raster gelegd en wint de rand die het
// dichtst bij een lijn zit — anders bleef de overkant altijd net los hangen.
function snapPhotobookStart(start, size) {
  const viaStart = snapPhotobookValue(start);
  const viaEnd = snapPhotobookValue(start + size) - size;
  return Math.abs(viaStart - start) <= Math.abs(viaEnd - start) ? viaStart : viaEnd;
}

// Laat een tekstvak meegroeien met zijn inhoud. Alleen groeien, nooit vanzelf
// krimpen: een leeg vak zou anders tot een streepje ineenschrompelen, en
// witruimte die iemand zelf onder de tekst heeft gelaten hoort te blijven
// staan. Meten gebeurt op de scrollhoogte van het binnenste vlak — dat is de
// hoogte die de tekst écht nodig heeft, inclusief de regels die nu buiten
// beeld vallen.
function usePhotobookAutoGrow({ innerRef, getPageEl, height, onChangeRect, html, enabled }) {
  useEffect(() => {
    if (!enabled) return;
    const el = innerRef.current;
    const page = getPageEl();
    if (!el || !page) return;

    function meet() {
      const pageH = page.getBoundingClientRect().height;
      // De canvas is bij de eerste render nog nul hoog (die krijgt zijn maat
      // pas van de ResizeObserver in de editor). Meten heeft dan geen zin;
      // de observer hieronder roept dit opnieuw aan zodra de maat er wél is.
      if (!pageH) return;
      // Meet het tékort (scrollHeight boven clientHeight), niet de gewenste
      // hoogte zelf. Dat laatste ging mis: het binnenste veld is h-full, dus
      // zijn hoogte volgt de doos, en "gewenst = hoogte + marge" was dan altijd
      // nét groter dan wat er stond — het vak groeide zichzelf tot de hele
      // pagina op. Zodra de tekst past is het tekort nul en gebeurt er niets.
      const tekort = el.scrollHeight - el.clientHeight;
      if (tekort <= 1) return;
      onChangeRect({ height: Math.min(1, (el.getBoundingClientRect().height + tekort) / pageH) });
    }

    meet();
    const observer = new ResizeObserver(meet);
    observer.observe(page);
    return () => observer.disconnect();
  }, [html, height, enabled]);
}

// Waarschuwt als een foto te weinig pixels heeft om scherp afgedrukt te
// worden op het formaat waarin 'm nu op de A4-pagina staat (net als de
// resolutie-check bij professionele fotoboek-editors). Alleen te bepalen
// voor foto's met bekende pixelafmetingen (nativeWidth/nativeHeight) — die
// ontbreken bij foto's die vóór deze functie zijn geüpload.
const PHOTOBOOK_A4_WIDTH_MM = 210, PHOTOBOOK_A4_HEIGHT_MM = 297;
const PHOTOBOOK_MIN_PRINT_DPI = 150;
function isPhotoLowRes(photo, orientation) {
  if (!photo.nativeWidth || !photo.nativeHeight) return false;
  const pageWidthMm = orientation === "landscape" ? PHOTOBOOK_A4_HEIGHT_MM : PHOTOBOOK_A4_WIDTH_MM;
  const pageHeightMm = orientation === "landscape" ? PHOTOBOOK_A4_WIDTH_MM : PHOTOBOOK_A4_HEIGHT_MM;
  const targetWidthIn = (photo.width * pageWidthMm) / 25.4;
  const targetHeightIn = (photo.height * pageHeightMm) / 25.4;
  return photo.nativeWidth < targetWidthIn * PHOTOBOOK_MIN_PRINT_DPI
    || photo.nativeHeight < targetHeightIn * PHOTOBOOK_MIN_PRINT_DPI;
}

// Zwevende panelen (paginainstellingen, foto/tekstvak-opties) zitten soms in
// de weg van wat eronder ligt — dit sleept 'm gewoon een stuk pixels opzij,
// los van de pagina-inhoud (dus geen fracties zoals bij foto's, gewoon een
// px-offset boven op de vaste positie). Niet geklemd op een grens: net als
// bij een blaadje dat je opzij schuift mag het best (bijna) uit beeld — je
// sleept 'm net zo makkelijk weer terug.
function usePhotobookPanelDrag(offset, setOffset) {
  const dragRef = useRef(null);
  function beginPanelDrag(e) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, startOffset: offset };
  }
  function onPanelDrag(e) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    setOffset({ x: d.startOffset.x + (e.clientX - d.startX), y: d.startOffset.y + (e.clientY - d.startY) });
  }
  function endPanelDrag(e) {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  }
  return { beginPanelDrag, onPanelDrag, endPanelDrag };
}

// Vrij verslepen (heel het element) en met de hoekgreep vergroten/verkleinen
// op de A4-canvas — x/y/width/height zijn fracties van de pagina, dus de
// berekening gaat via de pixel-afmetingen van de canvas zelf (getPageEl),
// niet via vaste pixelwaarden. Pointer Events (i.p.v. HTML5 drag-and-drop)
// omdat die zowel met muis als met een vinger op de telefoon werken. Gedeeld
// tussen foto's en tekstvakken op de canvas — alleen wat er ín het vak zit
// verschilt.
function usePhotobookDragResize({ rect, onChangeRect, getPageEl, snap, onSelect }) {
  const dragRef = useRef(null);

  function beginDrag(e, mode) {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      mode, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY,
      startRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  }
  function onDrag(e) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const el = getPageEl();
    if (!el) return;
    const pageRect = el.getBoundingClientRect();
    const fx = (e.clientX - d.startX) / pageRect.width;
    const fy = (e.clientY - d.startY) / pageRect.height;
    if (d.mode === "move") {
      let x = Math.min(1 - d.startRect.width, Math.max(0, d.startRect.x + fx));
      let y = Math.min(1 - d.startRect.height, Math.max(0, d.startRect.y + fy));
      if (snap) {
        x = Math.min(1 - d.startRect.width, Math.max(0, snapPhotobookStart(x, d.startRect.width)));
        y = Math.min(1 - d.startRect.height, Math.max(0, snapPhotobookStart(y, d.startRect.height)));
      }
      onChangeRect({ x, y });
    } else {
      let width = Math.min(1 - d.startRect.x, Math.max(0.05, d.startRect.width + fx));
      let height = Math.min(1 - d.startRect.y, Math.max(0.05, d.startRect.height + fy));
      if (snap) {
        width = Math.max(0.05, snapPhotobookValue(d.startRect.x + width) - d.startRect.x);
        height = Math.max(0.05, snapPhotobookValue(d.startRect.y + height) - d.startRect.y);
      }
      onChangeRect({ width, height });
    }
  }
  function endDrag(e) {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  }
  return { beginDrag, onDrag, endDrag };
}

function PhotobookCanvasPhoto({ photo, selected, onSelect, onChangeRect, getPageEl, snap, duplicatePages, cropActive, onToggleCrop, orientation }) {
  const { beginDrag, onDrag, endDrag } = usePhotobookDragResize({ rect: photo, onChangeRect, getPageEl, snap, onSelect });
  const photoElRef = useRef(null);
  // Bijsnijden gaat via slepen (verschuift het brandpunt) en knijpen
  // (inzoomen) direct op de foto zelf — net zo'n gebaar als in Foto's/
  // Instagram, in plaats van losse pijltjes-/zoomknoppen. cropDragRef houdt
  // alle actieve vingers bij (Map van pointerId->positie): één vinger =
  // verschuiven, twee vingers = knijpen; loslaten van één tijdens knijpen
  // valt terug op verschuiven met de overblijvende vinger, met een nieuwe
  // startpositie zodat de foto niet met een sprong verspringt.
  const cropDragRef = useRef(null);
  function onCropPointerDown(e) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const state = cropDragRef.current || { pointers: new Map() };
    state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (state.pointers.size >= 2) {
      const pts = [...state.pointers.values()].slice(-2);
      state.mode = "pinch";
      state.startDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      state.startZoom = photo.cropZoom ?? 1;
    } else {
      state.mode = "pan";
      state.startCropX = photo.cropX ?? 0.5;
      state.startCropY = photo.cropY ?? 0.5;
      state.startX = e.clientX;
      state.startY = e.clientY;
    }
    cropDragRef.current = state;
  }
  function onCropPointerMove(e) {
    const state = cropDragRef.current;
    if (!state || !state.pointers.has(e.pointerId)) return;
    state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const rect = photoElRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (state.mode === "pinch" && state.pointers.size >= 2) {
      const pts = [...state.pointers.values()].slice(-2);
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const zoom = Math.min(2.5, Math.max(1, state.startZoom * (dist / state.startDist)));
      onChangeRect({ cropZoom: Math.round(zoom * 100) / 100 });
    } else if (state.mode === "pan") {
      // Min-teken: de foto "volgt" je vinger (sleep naar rechts = beeld
      // schuift mee naar rechts, dus het brandpunt schuift naar links).
      const dx = (e.clientX - state.startX) / rect.width;
      const dy = (e.clientY - state.startY) / rect.height;
      onChangeRect({
        cropX: Math.min(1, Math.max(0, state.startCropX - dx)),
        cropY: Math.min(1, Math.max(0, state.startCropY - dy)),
      });
    }
  }
  function onCropPointerUp(e) {
    const state = cropDragRef.current;
    if (!state) return;
    state.pointers.delete(e.pointerId);
    if (state.pointers.size === 0) { cropDragRef.current = null; return; }
    const [[, pt]] = state.pointers;
    state.mode = "pan";
    state.startCropX = photo.cropX ?? 0.5;
    state.startCropY = photo.cropY ?? 0.5;
    state.startX = pt.x;
    state.startY = pt.y;
  }

  return (
    <div
      ref={photoElRef}
      onPointerDown={cropActive ? onCropPointerDown : (e) => beginDrag(e, "move")}
      onPointerMove={cropActive ? onCropPointerMove : onDrag}
      onPointerUp={cropActive ? onCropPointerUp : endDrag}
      onPointerCancel={cropActive ? onCropPointerUp : endDrag}
      className={`absolute select-none touch-none ${cropActive ? "cursor-move ring-2 ring-sky-600 ring-offset-1" : selected ? "cursor-move ring-2 ring-sky-500 ring-offset-1" : "cursor-pointer"}`}
      style={{ left: `${photo.x * 100}%`, top: `${photo.y * 100}%`, width: `${photo.width * 100}%`, height: `${photo.height * 100}%` }}
    >
      {/* Aparte clip-laag (i.p.v. afronding/overflow direct op de foto) omdat
          de vergrote (ingezoomde) foto anders over de hoekgreep/badges heen
          zou uitsteken — en overflow-hidden op de buitenste div zou zelf weer
          de greep afsnijden, die er juist net buiten hoort te steken. */}
      <div className="w-full h-full overflow-hidden" style={{ borderRadius: photobookCornerCss(photo.cornerRadius) }}>
        <img src={photo.thumbUrl || photo.url} alt="" draggable={false} className="w-full h-full object-cover pointer-events-none"
          style={{
            opacity: photo.opacity ?? 1,
            objectPosition: `${(photo.cropX ?? 0.5) * 100}% ${(photo.cropY ?? 0.5) * 100}%`,
            transform: `scale(${photo.cropZoom ?? 1})`,
            transformOrigin: `${(photo.cropX ?? 0.5) * 100}% ${(photo.cropY ?? 0.5) * 100}%`,
          }} />
      </div>
      {/* Alleen een hint tijdens het bewerken — niet in het voorbeeld of de
          uiteindelijke PDF, dus dit leeft puur hier in de editor-canvas. */}
      {duplicatePages?.length > 0 && (
        <div className="absolute top-1 left-1 right-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-medium leading-tight pointer-events-none truncate">
          Ook op pag. {duplicatePages.join(", ")}
        </div>
      )}
      {isPhotoLowRes(photo, orientation) && (
        <div title="Deze foto heeft weinig pixels voor dit formaat en kan er wazig uitzien op papier"
          className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center pointer-events-none shadow">
          <Icon name="alert" size={12} strokeWidth={2.2} />
        </div>
      )}
      {/* Tijdens bijsnijden doet slepen op de foto iets anders (verschuiven/
          zoomen in plaats van het kader vergroten), dus de hoekgreep zou
          verwarrend zijn en verdwijnt zolang cropActive aan staat. */}
      {selected && !cropActive && (
        <div
          onPointerDown={(e) => beginDrag(e, "resize")}
          onPointerMove={onDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="absolute -right-2 -bottom-2 w-6 h-6 rounded-full bg-sky-600 border-2 border-white shadow-md cursor-nwse-resize touch-none flex items-center justify-center"
        >
          <div className="w-2 h-2 border-b-2 border-r-2 border-white" />
        </div>
      )}
      {/* Bijsnijden zit hierachter i.p.v. altijd in het paneel eronder — dat
          hield het paneel onnodig groot voor iets dat je niet elke keer
          gebruikt. onToggleCrop is alleen gezet als deze foto geselecteerd is
          (zie de canvas-render hieronder), dus verschijnt niet op elke foto.
          Binnen de foto (top-1/left-1), niet erbuiten zoals de hoekgreep —
          een foto die tot tegen de paginarand staat zou 'm anders onder de
          overflow-hidden van de canvas laten verdwijnen, onbereikbaar. */}
      {selected && onToggleCrop && (
        // z-20: als een foto precies tegen de paginarand staat (x/y 0) valt
        // dit knopje samen met de vaste "+"/instellingen-knoppen op de
        // canvas zelf — bij een geselecteerde foto mag dit knopje dan winnen.
        <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onToggleCrop(); }}
          title="Bijsnijden"
          className={`absolute top-1 left-1 z-20 w-8 h-8 rounded-full border-2 border-white shadow-md flex items-center justify-center transition-colors touch-none ${cropActive ? "bg-sky-600 text-white" : "bg-white text-gray-500 hover:text-sky-600"}`}>
          <Icon name="crop" size={14} />
        </button>
      )}
    </div>
  );
}

// Achtergrond-presets voor een zwevend tekstvak — een paar duidelijk van
// elkaar te onderscheiden opties, geen vrije kleurenkiezer nodig.
const PHOTOBOOK_TEXTBOX_BACKGROUNDS = [
  { value: "transparent", label: "Geen" },
  { value: "rgba(255,255,255,0.85)", label: "Wit" },
  { value: "rgba(55,52,50,0.75)", label: "Donker" },
];
// Zelfde verslepen/schalen als een foto (usePhotobookDragResize), maar met
// tekst als inhoud i.p.v. een afbeelding. Zodra het vak geselecteerd is, mag
// je er middenin klikken om de cursor te plaatsen — dus dan verhuist het
// verslepen naar een klein apart handvat, anders zou elke tik in de tekst
// het vak verplaatsen in plaats van de cursor te zetten.
function PhotobookCanvasTextBox({ box, selected, onSelect, onChangeRect, onChangeHtml, getPageEl, snap, richTextRef }) {
  const { beginDrag, onDrag, endDrag } = usePhotobookDragResize({ rect: box, onChangeRect, getPageEl, snap, onSelect });
  const innerRef = useRef(null);
  usePhotobookAutoGrow({ innerRef, getPageEl, height: box.height, onChangeRect, html: box.html, enabled: true });

  return (
    <div
      onPointerDown={selected ? undefined : (e) => beginDrag(e, "move")}
      onPointerMove={onDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={`absolute select-none rounded-xl ${selected ? "ring-2 ring-sky-500 ring-offset-1" : "touch-none cursor-pointer"}`}
      style={{
        left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%`,
        background: box.backgroundColor || "transparent",
      }}
    >
      {selected && (
        <div
          onPointerDown={(e) => beginDrag(e, "move")}
          onPointerMove={onDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
          title="Verslepen"
          className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-sky-600 border-2 border-white shadow-md cursor-move touch-none flex items-center justify-center text-white z-10"
        >
          <Icon name="dragHandle" size={12} />
        </div>
      )}
      <div ref={innerRef} className="w-full h-full overflow-auto p-0.5" onPointerDown={(e) => selected && e.stopPropagation()}>
        {selected ? (
          <RichTextEditable ref={richTextRef} value={box.html || ""} onChange={onChangeHtml} align={box.align}
            className="!border-none !ring-0 !p-0 !min-h-0 h-full !bg-transparent text-sm" placeholder="Tekst..." />
        ) : (
          <RichTextView html={box.html} align={box.align} className="text-sm pointer-events-none" />
        )}
      </div>
      {selected && (
        <div
          onPointerDown={(e) => beginDrag(e, "resize")}
          onPointerMove={onDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
          className="absolute -right-2 -bottom-2 w-6 h-6 rounded-full bg-sky-600 border-2 border-white shadow-md cursor-nwse-resize touch-none flex items-center justify-center"
        >
          <div className="w-2 h-2 border-b-2 border-r-2 border-white" />
        </div>
      )}
    </div>
  );
}

// De titel is net als een zwevend tekstvak vrij te verslepen/vergroten —
// x/y/width/height staan rechtstreeks op de pagina (niet in een array,
// er is er maar één per pagina). Een wit vlak eronder (vast, niet te
// kiezen zoals bij een tekstvak) houdt 'm leesbaar op een drukke foto.
function PhotobookCanvasTitle({ page, selected, onSelect, onChangeRect, onChangeHtml, getPageEl, snap, richTextRef }) {
  // x:0.15/width:0.7 (i.p.v. bijna de volle breedte) om dezelfde reden als
  // bij een nieuw tekstvak: zo blijft de titel standaard uit de buurt van de
  // "+"/instellingen-knoppen in de canvas-hoeken. y:0.14 (i.p.v. hoger) om
  // ook verticaal onder die knoppen te blijven — anders ligt de sleepgreep
  // (die er nog -2 boven uitsteekt) er middenin, en vangt de knop de tik weg
  // die eigenlijk voor de tekst bedoeld was (geen toetsenbord dan).
  const rect = { x: page.titleX ?? 0.15, y: page.titleY ?? 0.14, width: page.titleWidth ?? 0.7, height: page.titleHeight ?? 0.1 };
  const { beginDrag, onDrag, endDrag } = usePhotobookDragResize({ rect, onChangeRect, getPageEl, snap, onSelect });
  const innerRef = useRef(null);
  usePhotobookAutoGrow({ innerRef, getPageEl, height: rect.height, onChangeRect, html: page.title, enabled: true });

  // Een lege titel toont geen (leeg wit) vak meer: pas als er echt tekst staat,
  // óf terwijl je 'm aan het bewerken bent (geselecteerd), verschijnt het vak.
  // Zo kun je een titel echt weghalen — leegmaken laat 'm verdwijnen — en pak
  // je 'm terug via "+ Titel". Losse tags zonder tekst tellen als leeg.
  const hasTitle = !!(page.title && page.title.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim());
  if (!selected && !hasTitle) return null;

  return (
    <div
      onPointerDown={selected ? undefined : (e) => beginDrag(e, "move")}
      onPointerMove={onDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      // z-20 zodra geselecteerd: als de titel (bijv. na verslepen) toch onder
      // de vaste "+"/instellingen-knoppen komt te liggen, mag de titel zelf
      // dan winnen — anders vangen die knoppen tikken weg die voor de tekst
      // bedoeld waren.
      className={`absolute select-none rounded-lg ${selected ? "z-20 ring-2 ring-sky-500 ring-offset-1" : "touch-none cursor-pointer"}`}
      style={{
        left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%`,
        background: "rgba(255,255,255,0.85)",
      }}
    >
      {selected && (
        <div
          onPointerDown={(e) => beginDrag(e, "move")}
          onPointerMove={onDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
          title="Verslepen"
          className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-sky-600 border-2 border-white shadow-md cursor-move touch-none flex items-center justify-center text-white z-10"
        >
          <Icon name="dragHandle" size={12} />
        </div>
      )}
      <div ref={innerRef} className="w-full h-full overflow-auto p-0.5 flex items-center" onPointerDown={(e) => selected && e.stopPropagation()}>
        {selected ? (
          <RichTextEditable ref={richTextRef} value={page.title || ""} onChange={onChangeHtml} align={page.titleAlign}
            className="!border-none !ring-0 !p-0 !min-h-0 h-full !bg-transparent font-display text-base w-full" placeholder="Titel..." />
        ) : (
          page.title ? <RichTextView html={page.title} align={page.titleAlign} className="font-display text-base w-full pointer-events-none" /> : null
        )}
      </div>
      {selected && (
        <div
          onPointerDown={(e) => beginDrag(e, "resize")}
          onPointerMove={onDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
          className="absolute -right-2 -bottom-2 w-6 h-6 rounded-full bg-sky-600 border-2 border-white shadow-md cursor-nwse-resize touch-none flex items-center justify-center"
        >
          <div className="w-2 h-2 border-b-2 border-r-2 border-white" />
        </div>
      )}
    </div>
  );
}

function PhotobookEditor({ tripId, bookId, onBack }) {
  const [title, setTitle] = useState("");
  const [orientation, setOrientation] = useState("portrait"); // bij aanmaken gekozen, geldt voor heel het boek
  const [bookCorner, setBookCorner] = useState(0); // idem: de hoekstijl uit de wizard, als startwaarde voor nieuwe foto's
  const [bookBackground, setBookBackground] = useState(null); // idem: de achtergrondkleur uit de wizard, voor pagina's die je later toevoegt
  // Balken opzij kosten breedte, en die is er alleen als het scherm breder is
  // dan hoog. Zonder deze voorwaarde hielden twee kolommen van 144px op een
  // rechtop gehouden telefoon nog geen 150px over voor de pagina zelf.
  const [screenWide, setScreenWide] = useState(() => window.innerWidth > window.innerHeight);
  useEffect(() => {
    const onResize = () => setScreenWide(window.innerWidth > window.innerHeight);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const [pages, setPages] = useState(null); // null = laden
  const [allPhotos, setAllPhotos] = useState([]);
  const [pickerForPage, setPickerForPage] = useState(null); // index van de pagina waar de gekozen foto's bij komen
  const [pickerMode, setPickerMode] = useState("photos"); // "photos" = op de pagina zetten, "background" = als achtergrond
  const [pickerSelected, setPickerSelected] = useState(new Set());
  const [pickerSearch, setPickerSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState(null);
  // Tijdstip van de laatste geslaagde opslag. Alleen om er even "Bewaard" bij te
  // kunnen zetten; daarna verdwijnt die melding weer vanzelf.
  const [bewaardOp, setBewaardOp] = useState(null);
  const [toonBewaard, setToonBewaard] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showBookMenu, setShowBookMenu] = useState(false); // voorbeeld/PDF/verwijderen, achter één knop
  const [selectedPhoto, setSelectedPhoto] = useState(null); // { page, photo } | null
  const [selectedTextBox, setSelectedTextBox] = useState(null); // { page, box } | null
  const [selectedTitle, setSelectedTitle] = useState(null); // { page } | null
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [pdfProgress, setPdfProgress] = useState(null); // { phase: "generating"|"downloading", percent: number|null } | null
  const [currentPageIndex, setCurrentPageIndex] = useState(0); // welke pagina fullscreen in beeld staat
  // Het boek opent op het overzicht: eerst zien hoe het wordt, dan pas op een
  // pagina inzoomen om te bewerken. Voorheen viel je meteen in pagina 1 en was
  // er geen enkele plek waar het boek als geheel te zien was behalve het
  // aparte voorbeeldscherm, dat je weer moest verlaten om iets te wijzigen.
  const [viewMode, setViewMode] = useState("overzicht"); // "overzicht" | "pagina"
  const [showPagePanel, setShowPagePanel] = useState(false); // zwevend paneel: titel/beschrijving/achtergrond/indeling
  // Het paneel voor een geselecteerde foto/tekstvak kan de canvas eronder
  // (incl. de sleepgreep) aan het zicht onttrekken — bijv. bij een foto die
  // al bijna de hele pagina vult. Een verbergknop laat 'm even wegklappen
  // zonder de selectie te verliezen, zodat verslepen/vergroten vrij blijft.
  const [showSelPanel, setShowSelPanel] = useState(true);
  // Bijsnijden (verschuiven/inzoomen) staat niet meer altijd in het paneel —
  // pas zichtbaar nadat het crop-icoontje op de foto zelf is aangetikt.
  const [cropMode, setCropMode] = useState(false);
  // Zwevende panelen kunnen aan de kant geschoven worden (via het
  // sleepgreepje bovenin) als ze net de canvas eronder in de weg zitten —
  // een pixel-offset boven op de vaste positie, puur voor deze sessie.
  const [pagePanelOffset, setPagePanelOffset] = useState({ x: 0, y: 0 });
  const [selPanelOffset, setSelPanelOffset] = useState({ x: 0, y: 0 });
  const [showAddMenu, setShowAddMenu] = useState(false); // "+"-knop: kiezen tussen foto's en tekstvak toevoegen
  // History van eerdere `pages`-snapshots, voor de "Ongedaan maken"-knop.
  // Elke muterende functie roept pushHistory() aan vóórdat 'ie zelf iets
  // wijzigt, met de op dat moment geldende `pages` (via closure) — zo hoeft
  // er niets omgebouwd te worden naar functionele setState-vorm.
  const [history, setHistory] = useState([]);
  // Steeds maar één pagina tegelijk in beeld (fullscreen), dus geen array
  // meer nodig zoals toen alle pagina's onder elkaar stonden — telkens één
  // canvas/titel/beschrijving-veld gemonteerd.
  const canvasRef = useRef(null); // DOM-node van de A4-canvas, voor pixel->fractie omrekening tijdens verslepen
  const canvasAreaRef = useRef(null); // omringende vlak waarbinnen de canvas moet passen (voor canvasSize hieronder)
  const swipeRef = useRef(null); // beginpunt van een veeg over de lege pagina/marge, voor bladeren tussen pagina's
  const titleRef = useRef(null); // titel-tekstveld van de geselecteerde titel, voor de opmaakknoppen
  const textBoxRef = useRef(null); // tekstveld van het geselecteerde zwevende tekstvak, idem
  const pagePanelDrag = usePhotobookPanelDrag(pagePanelOffset, setPagePanelOffset);
  const selPanelDrag = usePhotobookPanelDrag(selPanelOffset, setSelPanelOffset);
  // De canvas moet altijd de A4-verhouding houden, ongeacht of het beschikbare
  // vlak zelf breed-kort of smal-lang is (bijv. de telefoon gekanteld) — een
  // pure CSS-aanpak (aspect-ratio + max-width/max-height zonder vaste
  // breedte/hoogte) bleek in de praktijk niet betrouwbaar (het vlak werd of
  // 0x0, of rekte juist helemaal uit zonder de verhouding te respecteren).
  // In plaats daarvan hier zelf de grootste maat berekenen die binnen zowel
  // de beschikbare breedte als hoogte past (hetzelfde idee als
  // object-fit:contain, maar dan voor een gewone div) en als expliciete
  // pixelwaarden toepassen; een ResizeObserver houdt dit bij als het vlak
  // van vorm verandert (kantelen, resizen, het paneel openen/sluiten).
  const [canvasSize, setCanvasSize] = useState(null);
  const pagesLoaded = pages !== null; // canvasAreaRef bestaat pas zodra dit true wordt (zie "Laden..."-return hierboven) — zonder deze afhankelijkheid mist het effect die overgang als "orientation" ondertussen niet wijzigt

  // De opslag-functie draait uit een timer en zou anders de `pages` van het
  // moment van instellen meenemen in plaats van de actuele.
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  useEffect(() => {
    const el = canvasAreaRef.current;
    if (!el) return;
    const targetRatio = orientation === "landscape" ? 297 / 210 : 210 / 297;
    function recompute() {
      // el.clientWidth/Height omvat ook el's eigen padding (p-3); de canvas
      // wordt daarbinnen (in de content-box) gecentreerd, dus die padding
      // moet eraf, anders is de berekende maat te groot en wordt de canvas
      // alsnog scheefgetrokken doordat flexbox 'm terug moet knijpen.
      const cs = getComputedStyle(el);
      const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if (!w || !h) return;
      const areaRatio = w / h;
      const size = areaRatio > targetRatio
        ? { width: Math.round(h * targetRatio), height: h }
        : { width: w, height: Math.round(w / targetRatio) };
      setCanvasSize(size);
    }
    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(el);
    return () => observer.disconnect();
    // viewMode hoort hier écht bij: in het overzicht bestaat canvasAreaRef nog
    // niet, dus zonder deze afhankelijkheid hing de observer zich nergens aan
    // en bleef canvasSize null zodra je daarna op een pagina inzoomde — de
    // canvas viel dan terug op de onbetrouwbare aspect-ratio-noodgreep.
  }, [orientation, pagesLoaded, viewMode]);

  // Blijft binnen de grenzen als de laatste pagina verwijderd wordt, en
  // wisselt van geselecteerd element als er naar een andere pagina genavigeerd
  // wordt (een zwevend paneel voor een pagina die niet meer in beeld is, is
  // verwarrender dan gewoon opnieuw moeten selecteren).
  useEffect(() => {
    if (!pages) return;
    if (currentPageIndex > pages.length - 1) setCurrentPageIndex(Math.max(0, pages.length - 1));
  }, [pages, currentPageIndex]);
  useEffect(() => {
    setSelectedPhoto(null);
    setSelectedTextBox(null);
    setSelectedTitle(null);
    setShowAddMenu(false);
  }, [currentPageIndex]);
  // Een nieuwe selectie toont het paneel weer fris open, en verlaat bijsnij-
  // modus — anders blijft bijv. de zoomrij van de vorige foto zichtbaar op
  // een net geselecteerde andere foto.
  useEffect(() => {
    setShowSelPanel(true);
    setCropMode(false);
    setSelPanelOffset({ x: 0, y: 0 });
  }, [selectedPhoto?.page, selectedPhoto?.photo, selectedTextBox?.page, selectedTextBox?.box, selectedTitle?.page]);
  function toggleCropMode() {
    setCropMode((m) => {
      const next = !m;
      if (next) setShowSelPanel(true);
      return next;
    });
  }

  useEffect(() => {
    // Zonder catch bleef de editor bij een mislukte oproep leeg open staan:
    // nul pagina's, geen titel, geen melding. Wie dan iets neerzette en opsloeg
    // schreef die lege staat over het echte boek heen. Terug naar het overzicht
    // is hier het veilige antwoord.
    let vervallen = false;
    api.getPhotobook(bookId)
      .then((b) => {
        if (vervallen) return;
        // pages moet een lijst zijn; komt er iets anders terug dan valt de hele
        // editor om met "kan forEach niet lezen van undefined" — een leeg boek
        // tonen is dan het enige nuttige antwoord.
        setTitle(b.title); setPages(Array.isArray(b.pages) ? b.pages : []);
        setOrientation(b.orientation || "portrait"); setBookCorner(b.cornerRadius ?? 0); setBookBackground(b.backgroundColor ?? null);
      })
      .catch((err) => { if (!vervallen) { toonMelding(err.message || "Fotoboek laden is niet gelukt"); onBack?.(); } });
    api.getPhotos(tripId).then((l) => { if (!vervallen) setAllPhotos(l); }).catch(() => {});
    return () => { vervallen = true; };
  }, [bookId, tripId]);

  // Elke muterende functie hieronder roept dit eerst aan, met de `pages` die
  // op dat moment nog gelden (via closure) — zo kan "Ongedaan maken" terug
  // naar de staat vóór die actie, zonder dat elke aanroeper dit zelf hoeft
  // te doen. Cap op 20 stappen, anders groeit dit onbeperkt binnen één sessie.
  // Een sleep- of knijpgebaar (of gewoon typen) roept dit tientallen keren
  // per seconde aan — zonder de debounce hieronder zou zo'n gebaar in z'n
  // eentje de hele geschiedenis vullen, waardoor "Ongedaan maken" nooit
  // verder terug kan dan een fractie van diezelfde beweging. Binnen 400ms
  // van de vorige push telt het als dezelfde actie en wordt niets nieuws
  // weggeschreven — de eerste push van de reeks (de staat van vóórdat de
  // actie begon) blijft dan gewoon de enige stap terug.
  const lastHistoryPushRef = useRef(0);
  function pushHistory() {
    const now = Date.now();
    if (now - lastHistoryPushRef.current < 400) return;
    lastHistoryPushRef.current = now;
    setHistory((h) => [...h.slice(-19), pages]);
  }
  function undo() {
    if (!history.length) return;
    setPages(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
    setSelectedPhoto(null);
    setSelectedTextBox(null);
    setSelectedTitle(null);
    setDirty(true);
  }
  function updatePage(i, patch) {
    pushHistory();
    setPages((ps) => ps.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
    setDirty(true);
  }
  function removePage(i) {
    if (!confirm("Pagina verwijderen? Foto's en tekstvakken op deze pagina gaan mee verloren.")) return;
    pushHistory();
    setPages((ps) => ps.filter((_, idx) => idx !== i));
    setDirty(true);
  }
  function addPage() {
    pushHistory();
    setPages((ps) => {
      const nieuw = {
        title: null,
        background: bookBackground ? { type: "color", value: bookBackground } : null,
        photos: [],
      };
      // Achter de achterkant plakken zou de kaft middenin het boek zetten. Een
      // nieuwe pagina hoort bij het binnenwerk, dus vlak vóór de achterkant.
      const achter = ps.findIndex((p) => p.role === "cover_back");
      if (achter < 0) return [...ps, nieuw];
      return [...ps.slice(0, achter), nieuw, ...ps.slice(achter)];
    });
    setDirty(true);
  }
  // Legt de foto's in de gekozen verhouding neer — elke foto naar het vak dat
  // het dichtst bij zijn huidige plek ligt (zie matchPhotosToSlots). Zijn er
  // meer foto's dan vakken, dan blijven de overige ongemoeid staan.
  function applyLayout(pageIndex, layout) {
    pushHistory();
    setPages((ps) => ps.map((p, i) => (i !== pageIndex ? p : {
      ...p, photos: photosInLayout(p.photos, layout.slots),
    })));
    setDirty(true);
  }
  // Legt elke foto op de pagina netjes op de rasterlijnen, zónder de indeling
  // om te gooien: elke rand (links/rechts/boven/onder) schuift naar de
  // dichtstbijzijnde rasterlijn, dus een foto blijft op zijn eigen plek staan —
  // alleen recht uitgelijnd. Zo blijft de verdeling van de foto's over de
  // pagina behouden. Hetzelfde snappen als tijdens het verslepen, nu in één keer
  // op alles tegelijk (ook op foto's die scheef of net-naast-het-raster staan).
  function snapPhotosToGrid(pageIndex) {
    pushHistory();
    setPages((ps) => ps.map((p, i) => (i !== pageIndex ? p : {
      ...p,
      photos: p.photos.map((ph) => {
        const x = nearestPhotobookGuide(ph.x);
        const right = nearestPhotobookGuide(ph.x + ph.width);
        const y = nearestPhotobookGuide(ph.y);
        const bottom = nearestPhotobookGuide(ph.y + ph.height);
        return { ...ph, x, y, width: Math.max(0.05, right - x), height: Math.max(0.05, bottom - y) };
      }),
    })));
    setDirty(true);
  }
  // Horizontaal vegen over de lege pagina of de marge eromheen bladert naar de
  // vorige/volgende pagina. Alleen als de veeg op de achtergrond begint (niet
  // op een foto of tekstvak — die hebben hun eigen sleepgedrag), zodat vegen en
  // verslepen elkaar niet in de weg zitten. Verticaal vegen (scrollen) telt niet.
  function onCanvasTouchStart(e) {
    if (e.touches.length !== 1) { swipeRef.current = null; return; }
    const onBackground = e.target === canvasRef.current || e.target === canvasAreaRef.current;
    swipeRef.current = onBackground ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  }
  function onCanvasTouchEnd(e) {
    const s = swipeRef.current;
    swipeRef.current = null;
    if (!s || !e.changedTouches.length) return;
    const dx = e.changedTouches[0].clientX - s.x;
    const dy = e.changedTouches[0].clientY - s.y;
    // Duidelijk horizontaal en ver genoeg, anders is het een tik of een scroll.
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    // Van links naar rechts (vinger beweegt naar rechts) → volgende pagina,
    // zoals gevraagd; de andere kant op → vorige.
    if (dx > 0) setCurrentPageIndex((p) => Math.min(pages.length - 1, p + 1));
    else setCurrentPageIndex((p) => Math.max(0, p - 1));
  }
  function applyDesignPreset(pageIndex, preset) {
    pushHistory();
    setPages((ps) => ps.map((p, i) => (i !== pageIndex ? p : {
      ...p, background: preset.background,
      photos: photosInLayout(p.photos, preset.layout.slots),
    })));
    setDirty(true);
  }
  function removePhoto(pageIndex, photoIndex) {
    if (!confirm("Foto van deze pagina verwijderen?")) return;
    pushHistory();
    setPages((ps) => ps.map((p, i) => (i !== pageIndex ? p : { ...p, photos: p.photos.filter((_, j) => j !== photoIndex) })));
    setSelectedPhoto((sel) => (sel && sel.page === pageIndex && sel.photo === photoIndex ? null : sel));
    setDirty(true);
  }
  // Verandert de volgorde in de array, wat ook de z-volgorde op de canvas is
  // (later in de lijst = bovenop) — dus dit is "naar voren/achteren", niet
  // een verticale lijst-positie zoals vóór het vrije verslepen.
  function movePhoto(pageIndex, photoIndex, dir) {
    const page = pages[pageIndex];
    const j = photoIndex + dir;
    if (!page || j < 0 || j >= page.photos.length) return;
    pushHistory();
    setPages((ps) => ps.map((p, i) => {
      if (i !== pageIndex) return p;
      const copy = [...p.photos];
      [copy[photoIndex], copy[j]] = [copy[j], copy[photoIndex]];
      return { ...p, photos: copy };
    }));
    setSelectedPhoto((sel) => (sel && sel.page === pageIndex && sel.photo === photoIndex ? { page: pageIndex, photo: j } : sel));
    setDirty(true);
  }
  function updatePhotoRect(pageIndex, photoIndex, patch) {
    pushHistory();
    setPages((ps) => ps.map((p, i) => (i !== pageIndex ? p : {
      ...p, photos: p.photos.map((ph, j) => (j === photoIndex ? { ...ph, ...patch } : ph)),
    })));
    setDirty(true);
  }
  function addTextBox(pageIndex) {
    pushHistory();
    const box = {
      id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      html: "", x: 0.15, y: 0.4, width: 0.7, height: 0.15, align: "center", backgroundColor: "rgba(255,255,255,0.85)",
    };
    setPages((ps) => ps.map((p, i) => (i !== pageIndex ? p : { ...p, textBoxes: [...(p.textBoxes || []), box] })));
    setSelectedTextBox({ page: pageIndex, box: (pages[pageIndex].textBoxes || []).length });
    setSelectedPhoto(null);
    setSelectedTitle(null);
    setDirty(true);
  }
  function updateTextBoxRect(pageIndex, boxIndex, patch) {
    pushHistory();
    setPages((ps) => ps.map((p, i) => (i !== pageIndex ? p : {
      ...p, textBoxes: (p.textBoxes || []).map((b, j) => (j === boxIndex ? { ...b, ...patch } : b)),
    })));
    setDirty(true);
  }
  function removeTextBox(pageIndex, boxIndex) {
    pushHistory();
    setPages((ps) => ps.map((p, i) => (i !== pageIndex ? p : {
      ...p, textBoxes: (p.textBoxes || []).filter((_, j) => j !== boxIndex),
    })));
    setSelectedTextBox((sel) => (sel && sel.page === pageIndex ? null : sel));
    setDirty(true);
  }
  function setBackgroundColor(pageIndex, color) {
    updatePage(pageIndex, { background: { type: "color", value: color } });
  }
  function setBackgroundNone(pageIndex) {
    updatePage(pageIndex, { background: null });
  }
  function removeBackgroundPhoto(pageIndex) {
    if (!confirm("Achtergrondfoto verwijderen?")) return;
    updatePage(pageIndex, { background: null });
  }
  // De foto verhuist van de gewone foto-rij naar de achtergrond — niet
  // dubbel getoond.
  function useAsBackground(pageIndex, photo) {
    pushHistory();
    setPages((ps) => ps.map((p, i) => (i !== pageIndex ? p : {
      ...p,
      photos: p.photos.filter((ph) => ph.photoId !== photo.photoId),
      // 50% witte sluier als vertrekpunt — een foto direct als achtergrond
      // zetten resulteert anders vaak in onleesbare tekst/foto's erboven,
      // en de gebruiker kan dit zelf nog aanpassen via de Witte-sluier-rij.
      background: { type: "photo", photoId: photo.photoId, url: photo.url, overlay: 0.5 },
    })));
    setSelectedPhoto((sel) => (sel && sel.page === pageIndex ? null : sel));
    setDirty(true);
  }

  // De fotokiezer doet twee dingen: foto's op de pagina zetten (meerdere
  // tegelijk) of één foto als achtergrond kiezen. Dat scheelt een tweede
  // kiezer; alleen wat een tik doet verschilt, zie pickerMode.
  function openPicker(pageIndex, mode = "photos") {
    setPickerForPage(pageIndex);
    setPickerMode(mode);
    setPickerSelected(new Set());
    setPickerSearch("");
  }
  // Foto's rechtstreeks vanaf het toestel toevoegen, zonder eerst via het
  // dagboek te moeten. Ze komen in de reisbibliotheek terecht (zonder dag,
  // want die context is er hier niet) en staan meteen in de kiezer. Zelfde
  // verwerking als elders: verkleinen, EXIF uitlezen, een paar tegelijk.
  const [pickerUploading, setPickerUploading] = useState(false);
  const [pickerProgress, setPickerProgress] = useState({ done: 0, total: 0 });
  async function handlePickerFiles(e) {
    const files = [...e.target.files];
    e.target.value = "";
    if (!files.length) return;
    setPickerUploading(true);
    setPickerProgress({ done: 0, total: files.length });
    const failed = [];
    const uploaded = [];
    await mapWithConcurrency(files, 3, async (file) => {
      try {
        const [image, exif] = await Promise.all([readForUpload(file), readExif(file)]);
        const base64 = image.dataUrl.split(",")[1];
        if ((base64.length * 3) / 4 > MAX_PHOTO_BYTES) { failed.push(`${file.name} (te groot, max 8 MB)`); return; }
        uploaded.push(await api.addPhoto(tripId, {
          image: { data: base64, mediaType: image.mediaType },
          taken_at: exif.taken_at || null, latitude: exif.latitude ?? null, longitude: exif.longitude ?? null,
        }));
      } catch (err) {
        failed.push(`${file.name} (${err.message || "mislukt"})`);
      }
      setPickerProgress((p) => ({ ...p, done: p.done + 1 }));
    });
    try { setAllPhotos(await api.getPhotos(tripId)); } catch {}
    // Meteen aangevinkt, want wie ze net koos wil ze vrijwel zeker gebruiken.
    if (uploaded.length) setPickerSelected((s) => new Set([...s, ...uploaded.map((u) => u.id)]));
    setPickerUploading(false);
    if (failed.length) alert(`${files.length - failed.length} van ${files.length} foto's toegevoegd.\n\nNiet gelukt:\n${failed.join("\n")}`);
  }

  function togglePick(id) {
    setPickerSelected((s) => {
      const copy = new Set(s);
      if (copy.has(id)) copy.delete(id); else copy.add(id);
      return copy;
    });
  }
  function confirmPicker() {
    const chosen = allPhotos.filter((p) => pickerSelected.has(p.id));
    setPages((ps) => ps.map((p, i) => {
      if (i !== pickerForPage) return p;
      const startCount = p.photos.length;
      const added = chosen.map((c, k) => {
        // Trapsgewijs is de terugval voor pagina's waar geen raster voor
        // bestaat (meer dan vier foto's); de gebruiker schuift die zelf goed.
        const cascade = (startCount + k) % 6;
        return {
          photoId: c.id, url: c.url, thumbUrl: c.thumb_url,
          nativeWidth: c.width, nativeHeight: c.height,
          x: 0.08 + cascade * 0.05, y: 0.08 + cascade * 0.05, width: 0.38, height: 0.3,
          cornerRadius: bookCorner,
        };
      });
      // Foto's meteen netjes neerzetten in plaats van los over elkaar heen:
      // past het totaal binnen een bestaand raster, dan krijgt de hele pagina
      // die indeling. Bestaande foto's schuiven dus mee — dat is de bedoeling,
      // anders zou een nieuwe foto boven op een bestaande belanden.
      const all = [...p.photos, ...added];
      const grid = PHOTOBOOK_LAYOUTS.find((l) => l.slots.length === all.length);
      if (!grid) return { ...p, photos: all };
      return { ...p, photos: all.map((ph, k) => ({ ...ph, ...grid.slots[k] })) };
    }));
    setDirty(true);
    setPickerForPage(null);
  }

  async function handleSaveTitle() {
    if (!title.trim()) return;
    await api.updatePhotobook(bookId, { title: title.trim() });
  }

  // De opslaan-knop is weg; het boek bewaart zichzelf. Zie het effect verderop
  // voor wanneer dit vanzelf gaat. Deze functie doet het werk en let daarbij op
  // twee dingen die met een knop nauwelijks voorkwamen maar bij automatisch
  // opslaan aan de orde van de dag zijn:
  //
  // 1. Twee keer tegelijk opslaan. Blijf je doorwerken terwijl een opslag nog
  //    loopt, dan zou een tweede verzoek eroverheen kunnen gaan en in de
  //    verkeerde volgorde aankomen. Er is er daarom altijd maar één tegelijk;
  //    het effect start de volgende zodra deze klaar is.
  // 2. Wijzigingen tijdens het opslaan. "Alles bewaard" mag alleen als er
  //    intussen niets bijgekomen is — anders zou die ene versleping die je net
  //    tijdens het verzenden deed als opgeslagen tellen en bij de volgende
  //    ronde niet meer meegaan. Vandaar de vergelijking met de momentopname.
  // De ref houdt de lópende opslag vast, niet alleen "ja/nee bezig". Vraagt er
  // iemand anders om terwijl deze nog loopt — bijvoorbeeld de terugknop — dan
  // krijgt die dezelfde belofte terug en kan hij er gewoon op wachten in plaats
  // van te horen "nee, druk maar opnieuw".
  const bezigMetOpslaanRef = useRef(null);
  function handleSavePages() {
    if (bezigMetOpslaanRef.current) return bezigMetOpslaanRef.current;
    const momentopname = pagesRef.current;
    if (!momentopname) return Promise.resolve(true);
    const belofte = bewaarPaginas(momentopname).finally(() => { bezigMetOpslaanRef.current = null; });
    bezigMetOpslaanRef.current = belofte;
    return belofte;
  }
  // Geeft terug of het gelukt is, zodat de terugknop weet of hij weg mag.
  async function bewaarPaginas(momentopname) {
    setSaving(true); setError(null);
    try {
      await api.savePhotobookPages(bookId, momentopname.map((p) => ({
        title: p.title, titleAlign: p.titleAlign, role: p.role || null,
        titleX: p.titleX, titleY: p.titleY, titleWidth: p.titleWidth, titleHeight: p.titleHeight,
        background: !p.background ? null
          : p.background.type === "color" ? { type: "color", value: p.background.value }
          : { type: "photo", photo_id: p.background.photoId, overlay: p.background.overlay },
        photos: p.photos.map((ph) => ({
          photo_id: ph.photoId, x: ph.x, y: ph.y, width: ph.width, height: ph.height,
          opacity: ph.opacity, cornerRadius: ph.cornerRadius, cropX: ph.cropX, cropY: ph.cropY, cropZoom: ph.cropZoom,
        })),
        textBoxes: (p.textBoxes || []).map((b) => ({
          html: b.html, x: b.x, y: b.y, width: b.width, height: b.height, align: b.align, backgroundColor: b.backgroundColor,
        })),
      })));
      if (pagesRef.current === momentopname) { setDirty(false); setBewaardOp(Date.now()); }
      return true;
    } catch (err) { setError(err.message || "Opslaan mislukt"); return false; }
    finally { setSaving(false); }
  }

  // Automatisch bewaren. Niet bij elke wijziging meteen: verslepen, knijpen of
  // typen levert tientallen wijzigingen per seconde op, en die zou je niet
  // allemaal willen versturen. De timer begint opnieuw bij elke wijziging, dus
  // er wordt pas opgeslagen als je even niets doet — precies het moment waarop
  // een afgeronde handeling erin staat.
  //
  // `saving` staat bewust in de afhankelijkheden: is er tijdens het opslaan
  // alweer iets veranderd, dan blijft `dirty` staan en zet het aflopen van
  // `saving` dit effect opnieuw aan, waardoor de volgende ronde vanzelf volgt.
  // Zonder dat zou zo'n wijziging blijven liggen tot de eerstvolgende bewerking.
  //
  // Mislukt het (geen bereik — op reis eerder regel dan uitzondering), dan blijft
  // het boek "nog niet bewaard" en probeert hij het rustiger opnieuw in plaats
  // van door te blijven rammen. De melding in beeld vertelt intussen wat er aan
  // de hand is; je werk staat gewoon nog in het scherm en gaat mee zodra er weer
  // verbinding is.
  useEffect(() => {
    if (!dirty || saving || !pagesLoaded) return;
    const wachttijd = error ? 8000 : 1200;
    const timer = setTimeout(handleSavePages, wachttijd);
    return () => clearTimeout(timer);
  }, [dirty, saving, pages, error, pagesLoaded]);

  // Het tabblad sluiten of verversen terwijl er nog iets openstaat: de browser
  // vraagt dan zelf om bevestiging. Alleen zolang er echt iets te verliezen is,
  // anders is het een zinloze horde.
  useEffect(() => {
    if (!dirty) return;
    const waarschuw = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", waarschuw);
    return () => window.removeEventListener("beforeunload", waarschuw);
  }, [dirty]);

  // "Bewaard" een paar tellen laten staan en dan weglaten.
  useEffect(() => {
    if (!bewaardOp) return;
    setToonBewaard(true);
    const timer = setTimeout(() => setToonBewaard(false), 2500);
    return () => clearTimeout(timer);
  }, [bewaardOp]);

  // Terug naar het overzicht: eerst afmaken wat er nog openstaat. Lukt dat niet,
  // dan blijf je hier met de foutmelding in beeld — weglopen met werk dat nog
  // nergens staat is precies wat automatisch opslaan hoort te voorkomen.
  async function handleBack() {
    if (!dirty && !bezigMetOpslaanRef.current) { onBack(); return; }
    if (await handleSavePages()) onBack();
  }

  // Het fotoboek zelf weggooien gebeurt in het overzicht, niet hier.

  async function handleDownloadPdf() {
    if (!confirm("Fotoboek als PDF downloaden?")) return;
    setPdfProgress({ phase: "generating", percent: null });
    try {
      const resp = await appFetch(`/api/photobooks/${bookId}/pdf`);
      if (!resp.ok) throw new Error("Downloaden mislukt");
      const total = Number(resp.headers.get("Content-Length")) || 0;
      const reader = resp.body.getReader();
      const chunks = [];
      let received = 0;
      setPdfProgress({ phase: "downloading", percent: total ? 0 : null });
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        setPdfProgress({ phase: "downloading", percent: total ? Math.min(100, Math.round((received / total) * 100)) : null });
      }
      const blob = new Blob(chunks, { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title || "Fotoboek"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message || "Downloaden mislukt");
    } finally {
      setPdfProgress(null);
    }
  }

  if (pages === null) return <div className="text-center py-16 text-gray-400">Laden...</div>;

  if (showPreview) {
    return <PhotobookPreview title={title} pages={pages} orientation={orientation} onClose={() => setShowPreview(false)} />;
  }

  // Welke pagina's (1-based) elke foto gebruikt — voor het waarschuwings-
  // label in de canvas ("Ook op pag. X") en het "Al in dit boek"-teken in de
  // kiezer. Dubbel gebruik mag; dit is puur een hint, geen blokkade.
  const photoPageNumbers = new Map();
  pages.forEach((pg, idx) => {
    const pageNum = idx + 1;
    pg.photos.forEach((ph) => {
      if (!photoPageNumbers.has(ph.photoId)) photoPageNumbers.set(ph.photoId, new Set());
      photoPageNumbers.get(ph.photoId).add(pageNum);
    });
    if (pg.background?.type === "photo") {
      if (!photoPageNumbers.has(pg.background.photoId)) photoPageNumbers.set(pg.background.photoId, new Set());
      photoPageNumbers.get(pg.background.photoId).add(pageNum);
    }
  });

  const pickerQuery = pickerSearch.trim().toLowerCase();
  const pickable = !pickerQuery ? allPhotos : allPhotos.filter((p) => {
    const haystack = `${p.label || ""} ${p.caption || ""}`.toLowerCase();
    return haystack.includes(pickerQuery);
  });

  // Op reisdag gegroepeerd in plaats van één lange strook: bij een reis van
  // twee weken is "de foto's van dag 3" anders alleen met scrollen te vinden.
  // Foto's zonder dag sluiten achteraan aan, zodat ze niet verdwijnen.
  // Bewust geen useMemo: dit staat ná de "Laden..."-return hierboven, en een
  // hook achter een vroege return breekt de hook-volgorde (React-fout #310).
  // Groeperen van een handvol foto's is sowieso niet duur genoeg om te cachen.
  const pickableByDay = (() => {
    const groups = new Map();
    for (const p of pickable) {
      const key = p.day_date ? String(p.day_date).slice(0, 10) : "";
      if (!groups.has(key)) groups.set(key, { key, date: key, title: p.day_title || null, photos: [], blokken: new Map() });
      const dag = groups.get(key);
      dag.photos.push(p);
      // Binnen de dag ook per activiteit bij elkaar: foto's van dezelfde
      // bezienswaardigheid horen naast elkaar te staan. Losse foto's van die
      // dag komen in één blok zonder kop, achter de activiteiten aan.
      const actKey = p.activity_id ? `a${p.activity_id}` : "";
      if (!dag.blokken.has(actKey)) dag.blokken.set(actKey, { key: actKey, title: p.activity_title || null, photos: [] });
      dag.blokken.get(actKey).photos.push(p);
    }
    return [...groups.values()]
      .map((d) => ({
        ...d,
        // De volgorde binnen een dag volgt de eerste foto van elk blok, en dat
        // is de opnametijd — zo blijft de dag chronologisch lopen.
        blokken: [...d.blokken.values()].sort((a, b) => (a.key ? 0 : 1) - (b.key ? 0 : 1)),
      }))
      .sort((a, b) => {
        if (!a.date) return 1;
        if (!b.date) return -1;
        return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
      });
  })();

  const page = pages[currentPageIndex] || null;
  const photoSel = selectedPhoto?.page === currentPageIndex && page ? page.photos[selectedPhoto.photo] : null;
  const textBoxSel = selectedTextBox?.page === currentPageIndex && page ? page.textBoxes?.[selectedTextBox.box] : null;
  const titleSel = selectedTitle?.page === currentPageIndex ? page : null;
  const barsAside = orientation === "landscape" && screenWide;

  return (
    // Bij een liggend boek staan de balken links en rechts in plaats van boven
    // en onder. Een liggende pagina is breed en laag, en het scherm eromheen
    // ook: de hoogte is dan de knellende maat, dus horizontale balken kosten
    // precies de ruimte die de pagina het hardst nodig heeft.
    <div className={`fixed inset-0 z-10 flex bg-gray-800 ${barsAside ? "flex-row" : "flex-col"}`}>
      {/* Bovenbalk (liggend: linkerkolom): vast, niet zwevend — titel en
          boek-brede acties horen niet bij een specifieke pagina, dus die
          verdienen geen overlay. */}
      <div className={`shrink-0 flex gap-2 bg-gray-900 ${barsAside ? "flex-col w-36 px-2 py-3 overflow-y-auto" : "items-center px-3 py-2"}`}
        style={barsAside
          ? { paddingLeft: "calc(0.5rem + env(safe-area-inset-left))" }
          : { paddingTop: "calc(0.5rem + env(safe-area-inset-top))" }}>
        <button onClick={handleBack} aria-label="Alle fotoboeken" className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors">
          <Icon name="arrowLeft" size={16} />
        </button>
        {/* Ondergrens op de breedte: flex-1 alleen betekent "krimp maar mee met
            wat er overblijft", en dat werd 38 pixels. Een titelveld dat te smal
            is om je eigen boektitel in te lezen is geen titelveld meer. */}
        <Input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={handleSaveTitle}
          className={`!text-sm !bg-white/10 !border-white/20 !text-white ${barsAside ? "w-full shrink-0" : "flex-1 min-w-[6rem]"}`} placeholder="Titel van het fotoboek" />
        <button type="button" onClick={undo} disabled={history.length === 0} title="Ongedaan maken"
          className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors">
          <Icon name="undo" size={16} />
        </button>
        <button type="button" onClick={() => setSnapEnabled((s) => !s)} title="Rasterlijnen tonen en eraan vastklikken tijdens verslepen"
          className={`shrink-0 px-2.5 h-8 rounded-full text-xs font-medium border transition-colors ${snapEnabled ? "border-sky-400 bg-sky-500/20 text-sky-300" : "border-white/20 text-white/50 hover:border-white/40"}`}>
          Raster
        </button>
        {/* Direct naast de raster-schakelaar: alle foto's in één tik netjes op
            de rasterlijnen zetten, zonder de indeling om te gooien. Alleen
            zinvol op een pagina met foto's, dus in paginaweergave en niet leeg. */}
        {viewMode === "pagina" && (
          <button type="button" onClick={() => page && page.photos.length && snapPhotosToGrid(currentPageIndex)}
            disabled={!page || page.photos.length === 0} title="Foto's op het raster uitlijnen"
            className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors">
            <Icon name="alignGrid" size={16} />
          </button>
        )}
        {/* Voorbeeld, PDF en verwijderen zijn dingen die je één keer per boek
            doet, niet tijdens het opmaken. Ze stonden hier als drie losse
            knoppen en duwden de balk daarmee over de schermrand: die had 431
            pixels nodig terwijl een telefoon er 375 tot 430 heeft. Het titelveld
            werd samengeknepen tot 38 pixels — te smal om de naam van je boek te
            lezen, laat staan te wijzigen. Achter één knop teruggebracht scheelt
            dat ruim tachtig pixels, en die gaan naar de titel. */}
        <div className="relative shrink-0">
          <button type="button" onClick={() => setShowBookMenu((s) => !s)} aria-label="Meer acties"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${showBookMenu ? "bg-white/20 text-white" : "text-white/70 hover:text-white hover:bg-white/10"}`}>
            <Icon name="more" size={16} />
          </button>
          {showBookMenu && (
            <>
              {/* Onzichtbaar vlak eronder: een tik ergens anders sluit het menu,
                  zonder dat elke knop daarbuiten dat zelf hoeft te regelen. */}
              <div className="fixed inset-0 z-40" onClick={() => setShowBookMenu(false)} />
              <div className={`absolute z-50 bg-white rounded-xl shadow-2xl p-1.5 space-y-0.5 min-w-[12rem] ${barsAside ? "left-full top-0 ml-2" : "right-0 top-full mt-1"}`}>
                <button type="button" onClick={() => { setShowBookMenu(false); setShowPreview(true); }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 whitespace-nowrap">
                  <Icon name="eye" size={15} className="text-gray-400" />Voorbeeld bekijken
                </button>
                {/* Verwijderen staat niet meer hier maar in het overzicht met
                    alle fotoboeken: je gooit een boek weg omdát je het niet meer
                    wilt bewerken, dus dat hoort niet in de editor thuis. */}
                <button type="button" onClick={() => { setShowBookMenu(false); handleDownloadPdf(); }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 whitespace-nowrap">
                  <Icon name="doc" size={15} className="text-gray-400" />Downloaden als PDF
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {/* Middenkolom: foutmelding boven de canvas. Apart omhuld zodat de
          buitenste flex precies drie kinderen houdt (balk, midden, balk) en
          liggend/staand alleen een kwestie van richting is. */}
      <div className="relative flex-1 min-w-0 min-h-0 flex flex-col">
      {/* Hoe het bewaren ervoor staat. Bewust zwevend boven de pagina en niet
          als eigen balk: een strook die verschijnt en verdwijnt zou de pagina
          steeds een stukje op en neer duwen. En bewust hier, in de open ruimte
          boven de pagina, want in de balken eronder is simpelweg geen plek —
          dat was nu juist de reden dat de opslaan-knop niet te zien was.
          "Bewaard" verdwijnt na een paar tellen weer; een melding die er altijd
          staat leest niemand meer. Een fout blijft wél staan, met een knop
          erbij, want dan is er iets aan de hand en valt er iets te doen. */}
      {(error || saving || dirty || toonBewaard) && (
        <div className="absolute top-2 left-0 right-0 z-30 flex justify-center pointer-events-none px-3">
          {error ? (
            <button type="button" onClick={handleSavePages}
              className="pointer-events-auto max-w-full inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-600 text-white text-xs font-semibold shadow-lg">
              <Icon name="alert" size={14} className="shrink-0" />
              <span className="truncate">Niet bewaard — opnieuw proberen</span>
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/55 text-white/80 text-xs shadow-lg">
              {saving || dirty
                ? <><Icon name="cloud" size={13} />Bewaren...</>
                : <><Icon name="check" size={13} />Bewaard</>}
            </span>
          )}
        </div>
      )}

      {/* De pagina zelf blijft fullscreen in beeld; opmaak/instellingen liggen
          er als zwevende panelen overheen in plaats van in een scrollende
          lijst erboven/eronder — zo zie je altijd wat je aan het bewerken bent. */}
      {viewMode === "overzicht" ? (
        <div className="flex-1 overflow-y-auto pt-3">
          <PhotobookOverview pages={pages} orientation={orientation}
            onOpenPage={(i) => { setCurrentPageIndex(i); setViewMode("pagina"); }}
            onAddPage={addPage} />
        </div>
      ) : (
      <div ref={canvasAreaRef} onTouchStart={onCanvasTouchStart} onTouchEnd={onCanvasTouchEnd}
        className="flex-1 relative overflow-hidden flex items-center justify-center p-3">
        {!page ? (
          <div className="text-center text-white/60">
            <p className="text-sm mb-3">Nog geen pagina's in dit fotoboek.</p>
            <Button onClick={addPage}>+ Nieuwe pagina</Button>
          </div>
        ) : (
          <>
            <div
              ref={canvasRef}
              onPointerDown={() => { setSelectedPhoto(null); setSelectedTextBox(null); setSelectedTitle(null); }}
              className="relative overflow-hidden shadow-2xl"
              style={canvasSize ? {
                // Uitgerekende pixelmaat (zie canvasSize hierboven) i.p.v.
                // CSS aspect-ratio + max-width/max-height: die laatste bleek
                // in de praktijk niet betrouwbaar de juiste kant (breedte of
                // hoogte) als bottleneck te kiezen zodra het beschikbare vlak
                // zelf van vorm wisselt (bijv. de telefoon kantelen).
                width: `${canvasSize.width}px`, height: `${canvasSize.height}px`,
                // Maakt de pagina de maatstaf voor cqmin, waarmee de hoeken van
                // alle foto's even rond zijn. De maat staat hier al vast in
                // pixels, dus de size-containment die hierbij hoort verandert
                // niets aan de opmaak.
                containerType: "size",
                background: page.background?.type === "color" ? page.background.value
                  : page.background?.type === "photo" ? `url("${page.background.url}") center/cover no-repeat`
                  : PALETTE.background,
              } : {
                // Eerste render, vóórdat de ResizeObserver heeft kunnen meten —
                // dezelfde oude aanpak als noodgreep, maar dan maar heel even.
                aspectRatio: orientation === "landscape" ? "297 / 210" : "210 / 297",
                maxWidth: "100%", maxHeight: "100%",
                containerType: "size",
                background: page.background?.type === "color" ? page.background.value
                  : page.background?.type === "photo" ? `url("${page.background.url}") center/cover no-repeat`
                  : PALETTE.background,
              }}
            >
              {/* Het raster echt laten zien zolang "Raster" aanstaat. Zonder
                  lijnen leek de knop niets te doen: het snappen werkte wel,
                  maar er was niets om op te mikken. De lijnen staan precies op
                  de punten waar een foto aan blijft plakken. */}
              {snapEnabled && (
                <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
                  {PHOTOBOOK_SNAP_GUIDES.map((g) => (
                    <React.Fragment key={g}>
                      <span className="absolute top-0 bottom-0 w-px"
                        style={{ left: `${g * 100}%`, background: g === 0.5 ? "rgba(47,42,40,0.16)" : "rgba(47,42,40,0.07)" }} />
                      <span className="absolute left-0 right-0 h-px"
                        style={{ top: `${g * 100}%`, background: g === 0.5 ? "rgba(47,42,40,0.16)" : "rgba(47,42,40,0.07)" }} />
                    </React.Fragment>
                  ))}
                </div>
              )}
              {page.background?.type === "photo" && page.background.overlay > 0 && (
                <div className="absolute inset-0 bg-white pointer-events-none" style={{ opacity: page.background.overlay }} />
              )}
              {page.photos.map((ph, j) => (
                <PhotobookCanvasPhoto key={`${ph.photoId}-${j}`} photo={ph}
                  selected={selectedPhoto?.page === currentPageIndex && selectedPhoto?.photo === j}
                  onSelect={() => { setSelectedPhoto({ page: currentPageIndex, photo: j }); setSelectedTextBox(null); setSelectedTitle(null); }}
                  onChangeRect={(patch) => updatePhotoRect(currentPageIndex, j, patch)}
                  getPageEl={() => canvasRef.current}
                  snap={snapEnabled}
                  duplicatePages={[...(photoPageNumbers.get(ph.photoId) || [])].filter((n) => n !== currentPageIndex + 1)}
                  cropActive={selectedPhoto?.page === currentPageIndex && selectedPhoto?.photo === j && cropMode}
                  onToggleCrop={selectedPhoto?.page === currentPageIndex && selectedPhoto?.photo === j ? toggleCropMode : null}
                  orientation={orientation} />
              ))}
              {(page.textBoxes || []).map((box, k) => (
                <PhotobookCanvasTextBox key={box.id ?? k} box={box}
                  selected={selectedTextBox?.page === currentPageIndex && selectedTextBox?.box === k}
                  onSelect={() => { setSelectedTextBox({ page: currentPageIndex, box: k }); setSelectedPhoto(null); setSelectedTitle(null); }}
                  onChangeRect={(patch) => updateTextBoxRect(currentPageIndex, k, patch)}
                  onChangeHtml={(html) => updateTextBoxRect(currentPageIndex, k, { html })}
                  getPageEl={() => canvasRef.current}
                  snap={snapEnabled}
                  richTextRef={textBoxRef} />
              ))}
              {page.photos.length === 0 && !page.background && (page.textBoxes || []).length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm pointer-events-none">Nog geen foto's</div>
              )}
              {/* Altijd bovenop de foto's getekend (en met eigen achtergrond),
                  anders verdwijnt de titel achter een foto die er bovenop ligt
                  — bijv. bij één foto per pagina die bijna de hele pagina vult. */}
              <PhotobookCanvasTitle page={page}
                selected={selectedTitle?.page === currentPageIndex}
                onSelect={() => { setSelectedTitle({ page: currentPageIndex }); setSelectedPhoto(null); setSelectedTextBox(null); }}
                onChangeRect={(patch) => updatePage(currentPageIndex, {
                  titleX: patch.x ?? page.titleX, titleY: patch.y ?? page.titleY,
                  titleWidth: patch.width ?? page.titleWidth, titleHeight: patch.height ?? page.titleHeight,
                })}
                onChangeHtml={(html) => updatePage(currentPageIndex, { title: html })}
                getPageEl={() => canvasRef.current}
                snap={snapEnabled}
                richTextRef={titleRef} />

              {/* Deze twee knoppen staan bewust ALS KIND van de canvas (i.p.v.
                  ernaast, relatief aan het hele scherm) zodat ze bij een
                  liggende pagina (waar de canvas gecentreerd en dus smaller
                  dan het scherm kan staan) precies op de hoeken van de
                  pagina zelf blijven staan, niet ergens in de lege ruimte
                  eromheen. */}
              <button type="button" onClick={() => setShowPagePanel((s) => !s)} aria-label="Pagina-instellingen"
                className={`absolute top-3 right-3 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-colors ${showPagePanel ? "bg-sky-600 text-white" : "bg-white text-gray-600 hover:text-sky-600"}`}>
                <Icon name="sliders" size={17} />
              </button>
              <button type="button" onClick={() => setShowAddMenu((s) => !s)} aria-label="Toevoegen"
                className={`absolute top-3 left-3 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-colors ${showAddMenu ? "bg-sky-600 text-white" : "bg-white text-gray-600 hover:text-sky-600"}`}>
                <Icon name="plus" size={19} />
              </button>
              {showAddMenu && (
                <div className="absolute top-16 left-3 z-20 bg-white rounded-xl shadow-2xl p-1.5 space-y-0.5">
                  <button type="button" onClick={() => { setShowAddMenu(false); openPicker(currentPageIndex); }}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 whitespace-nowrap">
                    <Icon name="frame" size={15} className="text-gray-400" />Foto's
                  </button>
                  <button type="button" onClick={() => { setShowAddMenu(false); openPicker(currentPageIndex, "background"); }}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 whitespace-nowrap">
                    <Icon name="camera" size={15} className="text-gray-400" />Achtergrondfoto
                  </button>
                  <button type="button" onClick={() => { setShowAddMenu(false); addTextBox(currentPageIndex); }}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 whitespace-nowrap">
                    <Icon name="alignLeft" size={15} className="text-gray-400" />Tekstvak
                  </button>
                  {/* Titel toevoegen: selecteert het (nu nog lege) titelvak zodat
                      je meteen kunt typen. Een titel weghalen doe je met de
                      prullenbak in het titelpaneel. */}
                  <button type="button" onClick={() => { setShowAddMenu(false); setSelectedTitle({ page: currentPageIndex }); setSelectedPhoto(null); setSelectedTextBox(null); }}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 whitespace-nowrap">
                    <Icon name="titleText" size={15} className="text-gray-400" />Titel
                  </button>
                </div>
              )}
            </div>

            {showPagePanel && (
              <div className="absolute top-16 right-3 left-3 max-h-[75%] overflow-y-auto bg-white rounded-xl shadow-2xl p-3 space-y-3"
                style={{ transform: `translate(${pagePanelOffset.x}px, ${pagePanelOffset.y}px)` }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {/* Sleepgreepje: paneel even aan de kant schuiven als het
                        de canvas eronder in de weg zit — geen aparte modus,
                        gewoon overal op het paneel behalve de invoervelden. */}
                    <button type="button" onPointerDown={pagePanelDrag.beginPanelDrag} onPointerMove={pagePanelDrag.onPanelDrag}
                      onPointerUp={pagePanelDrag.endPanelDrag} onPointerCancel={pagePanelDrag.endPanelDrag}
                      title="Slepen" className="text-gray-300 hover:text-gray-500 cursor-move touch-none">
                      <Icon name="dragHandle" size={14} />
                    </button>
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pagina-instellingen</span>
                  </div>
                  <button type="button" onClick={() => { setShowPagePanel(false); setPagePanelOffset({ x: 0, y: 0 }); }} aria-label="Sluiten" className="text-gray-400 hover:text-gray-700">
                    <Icon name="close" size={16} />
                  </button>
                </div>

                <div>
                  <div className="text-xs text-gray-400 mb-1.5">Achtergrond</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button type="button" onClick={() => setBackgroundNone(currentPageIndex)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${!page.background ? "border-sky-300 bg-sky-50 text-sky-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                      Geen
                    </button>
                    <button type="button" onClick={() => setBackgroundColor(currentPageIndex, page.background?.type === "color" ? page.background.value : PALETTE.primarySoft)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${page.background?.type === "color" ? "border-sky-300 bg-sky-50 text-sky-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                      Kleur
                    </button>
                    {page.background?.type === "color" && (
                      <>
                        <input type="color" value={page.background.value} onChange={(e) => setBackgroundColor(currentPageIndex, e.target.value)}
                          className="w-7 h-7 rounded-full border border-gray-200 p-0 overflow-hidden cursor-pointer" />
                        {PHOTOBOOK_BG_SWATCHES.map((c) => (
                          <button key={c} type="button" onClick={() => setBackgroundColor(currentPageIndex, c)} aria-label={c}
                            className="w-5 h-5 rounded-full border border-gray-200" style={{ background: c }} />
                        ))}
                      </>
                    )}
                  </div>
                  {page.background?.type === "photo" && (
                    <div className="mt-2">
                      <div className="flex items-center gap-2 mb-2">
                        <img src={page.background.url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                        <span className="text-xs text-gray-400 flex-1">Deze foto is de achtergrond</span>
                        <button type="button" onClick={() => removeBackgroundPhoto(currentPageIndex)} title="Achtergrondfoto verwijderen"
                          className="w-7 h-7 rounded-full flex items-center justify-center text-red-500 hover:bg-red-50 transition-colors shrink-0">
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-gray-400 mr-0.5">Witte sluier</span>
                        {PHOTOBOOK_OVERLAY_PRESETS.map((p) => (
                          <button key={p.value} type="button" onClick={() => updatePage(currentPageIndex, { background: { ...page.background, overlay: p.value } })}
                            className={`px-2 h-6 rounded-full text-[11px] border transition-colors ${(page.background.overlay || 0) === p.value ? "border-sky-400 bg-sky-50 text-sky-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Ontwerp-presets: indeling + achtergrond in één tik, als kant-en-
                    klaar vertrekpunt — daarna nog gewoon zelf verder aan te passen. */}
                <div>
                  <div className="text-xs text-gray-400 mb-1.5">Ontwerp-presets</div>
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    {PHOTOBOOK_DESIGN_PRESETS.map((preset) => (
                      <button key={preset.key} type="button" onClick={() => applyDesignPreset(currentPageIndex, preset)} title={preset.label}
                        disabled={page.photos.length === 0}
                        className="disabled:opacity-30 hover:ring-2 hover:ring-sky-300 rounded transition-shadow shrink-0">
                        <PhotobookDesignPresetThumb layout={preset.layout} background={preset.background} />
                      </button>
                    ))}
                  </div>
                </div>

                {/* De indelingen stonden hier ook; die staan nu als vaste rij
                    onder de pagina zelf (zie hieronder). Twee plekken voor
                    precies dezelfde knoppen maakt het paneel alleen langer. */}

                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => openPicker(currentPageIndex)}
                    className="flex-1 text-center text-xs font-medium text-sky-600 hover:text-sky-700 py-1.5 border border-dashed border-sky-200 rounded-lg transition-colors">
                    + Foto's toevoegen
                  </button>
                  <button type="button" onClick={() => addTextBox(currentPageIndex)}
                    className="flex-1 text-center text-xs font-medium text-sky-600 hover:text-sky-700 py-1.5 border border-dashed border-sky-200 rounded-lg transition-colors">
                    + Tekstvak toevoegen
                  </button>
                </div>
              </div>
            )}

            {/* Verbergknop voor het zwevende foto/tekstvak-paneel — een grote
                geselecteerde foto kan de canvas (incl. sleepgreep) er onder
                helemaal aan het zicht onttrekken, dus even wegklappen moet
                kunnen zonder de selectie te verliezen. */}
            {(photoSel || textBoxSel || titleSel) && (
              <button type="button" onClick={() => setShowSelPanel((s) => !s)} title={showSelPanel ? "Opties verbergen" : "Opties tonen"}
                className="absolute bottom-3 right-3 z-10 w-9 h-9 rounded-full bg-white shadow-lg flex items-center justify-center text-gray-500 hover:text-sky-600 transition-colors">
                <Icon name="chevronDown" size={15} style={{ transform: showSelPanel ? "none" : "rotate(180deg)" }} />
              </button>
            )}

            {/* Zwevend paneel voor de geselecteerde foto — bijschrift,
                z-volgorde, achtergrond-knop, hoeken en verwijderen. Bijsnijden
                (verschuiven/inzoomen) zit niet hier maar achter het
                crop-icoontje op de foto zelf, zie PhotobookCanvasPhoto. */}
            {photoSel && showSelPanel && (
              <div className="absolute bottom-14 left-3 right-3 max-h-[55%] overflow-y-auto bg-white rounded-xl shadow-2xl p-2.5 space-y-1.5"
                style={{ transform: `translate(${selPanelOffset.x}px, ${selPanelOffset.y}px)` }}>
                <div className="flex items-center gap-2">
                  {/* Sleepgreepje: dit paneel opzij schuiven zonder de
                      selectie kwijt te raken — handig als het net de foto
                      of de sleepgreep eronder aan het zicht onttrekt. */}
                  <button type="button" onPointerDown={selPanelDrag.beginPanelDrag} onPointerMove={selPanelDrag.onPanelDrag}
                    onPointerUp={selPanelDrag.endPanelDrag} onPointerCancel={selPanelDrag.endPanelDrag}
                    title="Slepen" className="text-gray-300 hover:text-gray-500 cursor-move touch-none shrink-0 self-stretch flex items-center">
                    <Icon name="dragHandle" size={14} />
                  </button>
                  {/* Tijdens bijsnijden alleen het sleepgreepje en een label
                      — volgorde/achtergrond/verwijderen leiden alleen maar af
                      terwijl je met de foto zelf bezig bent. */}
                  {cropMode ? (
                    <span className="text-xs font-semibold text-gray-500">Bijsnijden</span>
                  ) : (
                    <>
                      <img src={photoSel.thumbUrl || photoSel.url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                      <div className="flex-1" />
                      <div className="flex items-center gap-1 shrink-0">
                        <button type="button" onClick={() => movePhoto(currentPageIndex, selectedPhoto.photo, -1)} disabled={selectedPhoto.photo === 0} title="Naar achteren"
                          className="w-7 h-7 rounded-full flex items-center justify-center text-sky-600 hover:bg-sky-100 disabled:opacity-30 transition-colors">
                          <Icon name="arrowLeft" size={13} />
                        </button>
                        <button type="button" onClick={() => movePhoto(currentPageIndex, selectedPhoto.photo, 1)} disabled={selectedPhoto.photo === page.photos.length - 1} title="Naar voren"
                          className="w-7 h-7 rounded-full flex items-center justify-center text-sky-600 hover:bg-sky-100 disabled:opacity-30 transition-colors">
                          <Icon name="arrowRight" size={13} />
                        </button>
                        <button type="button" onClick={() => useAsBackground(currentPageIndex, photoSel)} title="Als achtergrond gebruiken"
                          className="w-7 h-7 rounded-full flex items-center justify-center text-sky-600 hover:bg-sky-100 transition-colors">
                          <Icon name="frame" size={13} />
                        </button>
                        <button type="button" onClick={() => removePhoto(currentPageIndex, selectedPhoto.photo)} title="Verwijderen"
                          className="w-7 h-7 rounded-full flex items-center justify-center text-red-500 hover:bg-red-50 transition-colors">
                          <Icon name="trash" size={13} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
                {!cropMode && (
                  <div className="flex items-center gap-3 flex-wrap px-0.5">
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-gray-400 mr-0.5">Hoeken</span>
                      {PHOTOBOOK_CORNER_PRESETS.map((p) => (
                        <button key={p.value} type="button" onClick={() => updatePhotoRect(currentPageIndex, selectedPhoto.photo, { cornerRadius: p.value })}
                          className={`px-2 h-6 rounded-full text-[11px] border transition-colors ${(photoSel.cornerRadius ?? 0) === p.value ? "border-sky-400 bg-sky-50 text-sky-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {cropMode && (() => {
                  const cur = photoSel;
                  const zoomPct = Math.round((cur.cropZoom ?? 1) * 100);
                  return (
                    <div className="space-y-1.5 px-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-500 tnum">{zoomPct}%</span>
                        {(cur.cropX !== undefined && (cur.cropX !== 0.5 || cur.cropY !== 0.5 || (cur.cropZoom ?? 1) !== 1)) && (
                          <button type="button" onClick={() => updatePhotoRect(currentPageIndex, selectedPhoto.photo, { cropX: 0.5, cropY: 0.5, cropZoom: 1 })} title="Bijsnijden herstellen"
                            className="text-[11px] text-sky-600 hover:text-sky-700">Herstel</button>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Zwevend paneel voor het geselecteerde tekstvak. */}
            {textBoxSel && showSelPanel && (
              <div className="absolute bottom-14 left-3 right-3 max-h-[55%] overflow-y-auto bg-white rounded-xl shadow-2xl p-2.5 space-y-1.5"
                style={{ transform: `translate(${selPanelOffset.x}px, ${selPanelOffset.y}px)` }}>
                <div className="flex items-center justify-between">
                  <button type="button" onPointerDown={selPanelDrag.beginPanelDrag} onPointerMove={selPanelDrag.onPanelDrag}
                    onPointerUp={selPanelDrag.endPanelDrag} onPointerCancel={selPanelDrag.endPanelDrag}
                    title="Slepen" className="text-gray-300 hover:text-gray-500 cursor-move touch-none shrink-0 pr-1.5">
                    <Icon name="dragHandle" size={14} />
                  </button>
                  <RichTextToolbar getEl={() => textBoxRef.current} onChange={(v) => updateTextBoxRect(currentPageIndex, selectedTextBox.box, { html: v })}
                    align={textBoxSel.align} onAlignChange={(a) => updateTextBoxRect(currentPageIndex, selectedTextBox.box, { align: a })} />
                  <button type="button" onClick={() => removeTextBox(currentPageIndex, selectedTextBox.box)} title="Tekstvak verwijderen"
                    className="w-7 h-7 rounded-full flex items-center justify-center text-red-500 hover:bg-red-50 transition-colors shrink-0">
                    <Icon name="trash" size={13} />
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-gray-400 mr-0.5">Achtergrond</span>
                  {PHOTOBOOK_TEXTBOX_BACKGROUNDS.map((b) => (
                    <button key={b.value} type="button" onClick={() => updateTextBoxRect(currentPageIndex, selectedTextBox.box, { backgroundColor: b.value })}
                      className={`px-2 h-6 rounded-full text-[11px] border transition-colors ${(textBoxSel.backgroundColor || "transparent") === b.value ? "border-sky-400 bg-sky-100 text-sky-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Zwevend paneel voor de geselecteerde titel — alleen opmaak,
                geen achtergrondkeuze/verwijderknop: de titel zelf is geen
                los element om weg te halen, alleen de tekst kan leeg zijn. */}
            {titleSel && showSelPanel && (
              <div className="absolute bottom-14 left-3 right-3 max-h-[55%] overflow-y-auto bg-white rounded-xl shadow-2xl p-2.5 space-y-1.5"
                style={{ transform: `translate(${selPanelOffset.x}px, ${selPanelOffset.y}px)` }}>
                <div className="flex items-center gap-1.5">
                  <button type="button" onPointerDown={selPanelDrag.beginPanelDrag} onPointerMove={selPanelDrag.onPanelDrag}
                    onPointerUp={selPanelDrag.endPanelDrag} onPointerCancel={selPanelDrag.endPanelDrag}
                    title="Slepen" className="text-gray-300 hover:text-gray-500 cursor-move touch-none shrink-0">
                    <Icon name="dragHandle" size={14} />
                  </button>
                  <RichTextToolbar getEl={() => titleRef.current} onChange={(v) => updatePage(currentPageIndex, { title: v })}
                    align={titleSel.titleAlign} onAlignChange={(a) => updatePage(currentPageIndex, { titleAlign: a })} />
                  {/* Titel weghalen: leegt de tekst en deselecteert, waarna het
                      titelvak verdwijnt (zie PhotobookCanvasTitle). Terug te
                      halen via "+ Titel". */}
                  <button type="button" onClick={() => { updatePage(currentPageIndex, { title: null }); setSelectedTitle(null); }}
                    title="Titel verwijderen"
                    className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-red-500 hover:bg-red-50 transition-colors">
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      )}

      {/* Indelingen als losse knoppen, direct onder de pagina. Ze zaten twee
          niveaus diep — eerst het schuifjes-icoon, dan scrollen binnen het
          paneel — terwijl dit juist het gereedschap is waar je tijdens het
          opmaken van een pagina steeds naar teruggrijpt. De miniatuur is de
          knop: je ziet de indeling en tikt erop. */}
      {viewMode === "pagina" && page && (
        <div className="shrink-0 flex items-center justify-center gap-2 px-3 py-2 bg-gray-900/60"
          style={barsAside ? undefined : { paddingBottom: "0.5rem" }}>
          {PHOTOBOOK_LAYOUTS.map((layout) => (
            <button key={layout.key} type="button" onClick={() => applyLayout(currentPageIndex, layout)}
              title={layout.label} aria-label={`Indeling: ${layout.label}`}
              disabled={page.photos.length === 0}
              className="shrink-0 rounded ring-offset-2 ring-offset-gray-900 hover:ring-2 hover:ring-sky-400 disabled:opacity-25 transition-shadow">
              <PhotobookLayoutThumb slots={layout.slots} orientation={orientation} />
            </button>
          ))}
        </div>
      )}

      </div>

      {/* Onderbalk (liggend: rechterkolom): paginanavigatie en boek-brede
          acties, ook vast (niet zwevend) zodat 'm nooit per ongeluk de canvas
          overlapt. */}
      <div className={`shrink-0 flex gap-2 bg-gray-900 ${barsAside ? "flex-col w-36 px-2 py-3 overflow-y-auto" : "items-center px-3 py-2"}`}
        style={barsAside
          ? { paddingRight: "calc(0.5rem + env(safe-area-inset-right))" }
          : { paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}>
        {/* In een kolom wijzen vorige/volgende omhoog en omlaag in plaats van
            naar links en rechts — anders staan de pijlen dwars op de richting
            waarin de knoppen zelf staan. */}
        {viewMode === "pagina" ? (
          <>
            {/* Uitzoomen naar het hele boek. Dit is de tegenhanger van een tik
                op een pagina in het overzicht, en staat daarom vooraan — het is
                de weg terug, niet zomaar een van de acties. */}
            <button type="button" onClick={() => setViewMode("overzicht")} title="Terug naar het overzicht"
              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors self-center">
              <Icon name="grid" size={15} />
            </button>
            <button type="button" onClick={() => setCurrentPageIndex((p) => Math.max(0, p - 1))} disabled={currentPageIndex === 0}
              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors self-center">
              <Icon name="arrowUp" size={14} style={{ transform: barsAside ? "none" : "rotate(-90deg)" }} />
            </button>
            <span className="text-white/70 text-xs tnum text-center min-w-[4.5rem] shrink-0">
              {pages.length === 0 ? "Geen pagina's"
                : page?.role === "cover_front" ? "Voorkant"
                : page?.role === "cover_back" ? "Achterkant"
                : `Pagina ${currentPageIndex + 1} / ${pages.length}`}
            </span>
            <button type="button" onClick={() => setCurrentPageIndex((p) => Math.min(pages.length - 1, p + 1))} disabled={currentPageIndex >= pages.length - 1}
              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors self-center">
              <Icon name="arrowUp" size={14} style={{ transform: barsAside ? "rotate(180deg)" : "rotate(90deg)" }} />
            </button>
            <div className={`bg-white/15 shrink-0 ${barsAside ? "h-px w-full my-0.5" : "w-px h-6 mx-0.5"}`} />
            <button type="button" onClick={addPage} title="Nieuwe pagina"
              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors self-center">
              <Icon name="plus" size={16} />
            </button>
            {page && (
              <button type="button" onClick={() => removePage(currentPageIndex)} title="Pagina verwijderen"
                className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-red-400 hover:bg-white/10 transition-colors self-center">
                <Icon name="trash" size={14} />
              </button>
            )}
          </>
        ) : (
          <span className="text-white/70 text-xs tnum shrink-0 self-center px-1">
            {pages.length === 0 ? "Geen pagina's" : `${pages.length} pagina's`}
          </span>
        )}
        <div className="flex-1" />
        {/* Hier stond de opslaan-knop. Die is weg omdat het boek zichzelf
            bewaart — én omdat hij hier toch niet te zien wás: de knoppen in deze
            balk hebben samen 431 pixels nodig, en zo breed is geen enkele
            telefoon. Wat als laatste in de rij staat wordt dus altijd over de
            rand geduwd (op een scherm van 375 pixels zelfs 56 pixels ver). Nu de
            knop weg is past de balk wel. Hoe het opslaan ervoor staat is te zien
            aan het label boven de pagina, waar ruimte zat is. */}
      </div>

      {pickerForPage != null && (
        <Modal title={pickerMode === "background" ? "Achtergrondfoto kiezen" : "Foto's toevoegen"} onClose={() => setPickerForPage(null)}>
          <>
              <div className="flex items-center gap-2 mb-3">
                <div className="relative flex-1 min-w-0">
                  <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
                  <Input value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)}
                    placeholder="Zoeken..." className="!pl-9" />
                </div>
                {/* Foto's die nog niet in de reis zitten hoeven nu niet meer
                    eerst via het dagboek toegevoegd te worden. */}
                <label className={`rp-press shrink-0 inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-sky-100 text-gray-800 text-sm font-semibold cursor-pointer hover:bg-sky-200 transition-colors ${pickerUploading ? "opacity-50 pointer-events-none" : ""}`}>
                  <Icon name="plus" size={16} />
                  {pickerUploading ? "Bezig..." : "Apparaat"}
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handlePickerFiles} disabled={pickerUploading} />
                </label>
              </div>
              {pickerUploading && <UploadProgress done={pickerProgress.done} total={pickerProgress.total} className="mb-3" />}
              {allPhotos.length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-6">Deze reis heeft nog geen foto's. Voeg er hierboven een toe vanaf je apparaat.</div>
              ) : pickable.length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-6">Geen foto's gevonden.</div>
              ) : (
                pickableByDay.map((groep) => (
                <div key={groep.key} className="mb-4">
                  {/* Kopje per reisdag; foto's zonder dag sluiten achteraan aan. */}
                  <div className="text-[13px] font-semibold text-gray-500 mb-1.5 sticky top-0 bg-white py-1">
                    {groep.date
                      ? `${fmtShortDate(groep.date)}${groep.title ? ` · ${groep.title}` : ""}`
                      : "Zonder dag"}
                    <span className="text-gray-300 font-medium"> · {groep.photos.length}</span>
                  </div>
                {groep.blokken.map((blok) => (
                <div key={blok.key} className="mb-2">
                  {/* Alleen een kopje als de dag echt meerdere blokken heeft;
                      bij één blok zou het de dagkop hierboven herhalen. */}
                  {blok.title && groep.blokken.length > 1 && (
                    <div className="text-[13px] font-medium text-gray-400 mb-1 truncate">{blok.title}</div>
                  )}
                <div className="grid grid-cols-3 gap-2">
                  {blok.photos.map((p) => {
                    const picked = pickerSelected.has(p.id);
                    const alreadyIn = photoPageNumbers.has(p.id);
                    return (
                      <div key={p.id} className="relative">
                        <button type="button"
                          onClick={() => {
                            if (pickerMode === "background") {
                              useAsBackground(pickerForPage, { photoId: p.id, url: p.url });
                              setPickerForPage(null);
                            } else togglePick(p.id);
                          }}
                          className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-colors w-full ${picked ? "border-sky-500" : "border-gray-100"}`}>
                          <img src={p.thumb_url || p.url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                          {alreadyIn && !picked && (
                            <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/50 text-white text-[10px] font-medium">
                              In boek
                            </div>
                          )}
                          {picked && (
                            <div className="absolute inset-0 bg-sky-600/20 flex items-center justify-center">
                              <div className="w-6 h-6 rounded-full bg-sky-600 flex items-center justify-center">
                                <Icon name="check" size={13} className="text-white" />
                              </div>
                            </div>
                          )}
                        </button>
                        {/* In achtergrondmodus doet een tik op de tegel dit al,
                            dus dan is dit knopje overbodig. */}
                        {pickerMode !== "background" && (
                          <button type="button" title="Als achtergrond gebruiken"
                            onClick={() => { useAsBackground(pickerForPage, { photoId: p.id, url: p.url }); setPickerForPage(null); }}
                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-sky-600 transition-colors">
                            <Icon name="camera" size={12} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                </div>
                ))}
                </div>
                ))
              )}
              {/* Achtergrond kiezen is één tik op een tegel; dan hoort er geen
                  bevestigknop onder te staan die niets meer te doen heeft. */}
              {pickerMode !== "background" && (
                <div className="sticky bottom-0 -mx-6 px-6 pt-2 pb-1 bg-white">
                  <Button onClick={confirmPicker} disabled={pickerSelected.size === 0}>
                    Toevoegen{pickerSelected.size > 0 ? ` (${pickerSelected.size})` : ""}
                  </Button>
                </div>
              )}
          </>
        </Modal>
      )}

      {pdfProgress && (
        <Modal title="Fotoboek downloaden" onClose={() => {}}>
          <p className="text-sm text-gray-500 mb-4">
            {pdfProgress.phase === "generating" ? "Bezig met samenstellen..." : "Downloaden..."}
          </p>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            {pdfProgress.percent == null ? (
              <div className="h-full w-1/3 rounded-full bg-sky-500 rp-pdf-indeterminate" />
            ) : (
              <div className="h-full rounded-full bg-sky-500 transition-[width] duration-200" style={{ width: `${pdfProgress.percent}%` }} />
            )}
          </div>
          {pdfProgress.percent != null && (
            <p className="text-xs text-gray-400 mt-2 text-right tnum">{pdfProgress.percent}%</p>
          )}
        </Modal>
      )}
    </div>
  );
}

// Eén pagina zoals hij wordt: achtergrond, foto's, tekstvakken, titel. Dit is
// de enige plek waar dat opgebouwd wordt — het overzicht, het voorbeeld en
// straks een miniatuur tekenen allemaal hetzelfde, zodat ze niet uit elkaar
// kunnen lopen. Alles staat in fracties van de pagina, dus de component is
// maatloos: hij vult wat de ouder hem geeft.
// Een gekozen lettergrootte staat in punten, want dat is wat de drukker krijgt.
// Maar een voorbeeld is geen A4: een pagina van 200 pixels breed met 32-punts
// tekst erin geeft letters van een halve pagina hoog, tekst die uit zijn kader
// loopt en een titel die over zijn ondertitel heen valt. Dat is geen voorbeeld
// meer. Een punt omrekenen naar een percentage van de paginabreedte (cqi, want
// de pagina is de container) laat de tekst meeschalen — hoe groot het voorbeeld
// ook staat, de verhouding klopt met het gedrukte boek.
const A4_BREEDTE_PT = { portrait: 595.28, landscape: 841.89 };
function schaalPunten(html, orientation) {
  const breedte = A4_BREEDTE_PT[orientation === "landscape" ? "landscape" : "portrait"];
  return String(html || "").replace(
    /font-size:\s*([\d.]+)pt/gi,
    (_, pt) => `font-size: ${(Number(pt) / breedte * 100).toFixed(3)}cqi`
  );
}

function PhotobookPageView({ page, orientation, className = "", titleClassName = "font-display text-base text-gray-800", textClassName = "text-sm" }) {
  return (
    <div className={`overflow-hidden relative ${className}`}
      style={{
        aspectRatio: orientation === "landscape" ? "297 / 210" : "210 / 297",
        containerType: "size",
        background: page.background?.type === "color" ? page.background.value
          : page.background?.type === "photo" ? `url("${page.background.url}") center/cover no-repeat`
          : PALETTE.background,
      }}>
      {page.background?.type === "photo" && page.background.overlay > 0 && (
        <div className="absolute inset-0 bg-white pointer-events-none" style={{ opacity: page.background.overlay }} />
      )}
      {page.photos.map((ph, j) => (
        <div key={j} className="absolute overflow-hidden"
          style={{ left: `${ph.x * 100}%`, top: `${ph.y * 100}%`, width: `${ph.width * 100}%`, height: `${ph.height * 100}%` }}>
          <img src={ph.thumbUrl || ph.url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover"
            style={{
              opacity: ph.opacity ?? 1,
              borderRadius: photobookCornerCss(ph.cornerRadius),
              objectPosition: `${(ph.cropX ?? 0.5) * 100}% ${(ph.cropY ?? 0.5) * 100}%`,
              transform: `scale(${ph.cropZoom ?? 1})`,
              transformOrigin: `${(ph.cropX ?? 0.5) * 100}% ${(ph.cropY ?? 0.5) * 100}%`,
            }} />
        </div>
      ))}
      {(page.textBoxes || []).map((box, k) => (
        <div key={box.id ?? k} className="absolute overflow-hidden rounded-xl p-0.5"
          style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%`, background: box.backgroundColor || "transparent" }}>
          <RichTextView html={schaalPunten(box.html, orientation)} align={box.align} className={textClassName} />
        </div>
      ))}
      {page.title && (
        <div className="absolute rounded-lg p-0.5 bg-white/85"
          style={{
            left: `${(page.titleX ?? 0.15) * 100}%`, top: `${(page.titleY ?? 0.14) * 100}%`,
            width: `${(page.titleWidth ?? 0.7) * 100}%`, height: `${(page.titleHeight ?? 0.1) * 100}%`,
          }}>
          <RichTextView html={schaalPunten(page.title, orientation)} align={page.titleAlign} className={titleClassName} />
        </div>
      )}
    </div>
  );
}

function PhotobookPreview({ title, pages, orientation, onClose }) {
  return (
    <div className="fixed inset-0 z-[70] bg-gray-900 overflow-y-auto">
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3" style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}>
        <span className="text-white text-sm font-medium truncate">{title}</span>
        <button onClick={onClose} aria-label="Voorbeeld sluiten"
          className="shrink-0 w-9 h-9 rounded-full bg-white/15 flex items-center justify-center text-white hover:bg-white/25 transition-colors">
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="px-4 pb-10 space-y-4" style={{ paddingBottom: "calc(2.5rem + env(safe-area-inset-bottom))" }}>
        {pages.map((page, i) => (
          <div key={i} className="relative">
            <PhotobookPageView page={page} orientation={orientation} className="shadow-2xl" />
            {page.photos.length === 0 && !page.title && (page.textBoxes || []).length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">Lege pagina</div>
            )}
            <div className="absolute bottom-3 right-4 text-xs px-2 py-0.5 rounded-full bg-black/40 text-white tnum">{i + 1} / {pages.length}</div>
          </div>
        ))}
        {pages.length === 0 && <div className="text-center text-white/50 py-20">Nog geen pagina's.</div>}
      </div>
    </div>
  );
}

// Het boek zoals het wordt: de kaft alleen, daarna steeds twee pagina's naast
// elkaar zoals ze straks opengeslagen tegenover elkaar liggen. Een tik op een
// pagina zoomt in naar de detail-editor — dat is hoe je hier vandaan komt, dus
// de hele pagina is de knop, niet een klein pictogrammetje in een hoek.
function photobookSpreads(pages) {
  if (!pages.length) return [];
  // Een kaft is één vel: achterkant links, rug in het midden, voorkant rechts.
  // Zo komt hij van de drukker en zo staat hij hier, want anders is er niets aan
  // te zien dat er twéé kanten te ontwerpen zijn — de achterkant bleef ergens
  // achteraan hangen als "de laatste pagina" en kreeg nooit aandacht.
  const voorIndex = pages.findIndex((p) => p.role === "cover_front");
  const achterIndex = pages.findIndex((p) => p.role === "cover_back");
  const spreads = [];
  const binnenwerk = [];
  if (voorIndex >= 0 || achterIndex >= 0) {
    const items = [];
    if (achterIndex >= 0) items.push({ page: pages[achterIndex], index: achterIndex, label: "Achterkant" });
    if (voorIndex >= 0) items.push({ page: pages[voorIndex], index: voorIndex, label: "Voorkant" });
    spreads.push({ key: "kaft", kaft: true, items });
    pages.forEach((p, i) => { if (i !== voorIndex && i !== achterIndex) binnenwerk.push({ page: p, index: i }); });
  } else {
    // Boeken van vóór de losse kaftpagina's: pagina 1 stond alleen en heette
    // "Kaft". Dat blijft zo, anders verspringt bij die boeken ineens alles.
    spreads.push({ key: "kaft", items: [{ page: pages[0], index: 0, label: "Kaft" }] });
    pages.forEach((p, i) => { if (i !== 0) binnenwerk.push({ page: p, index: i }); });
  }
  // Het binnenwerk twee aan twee, zoals het opengeslagen tegenover elkaar ligt.
  for (let i = 0; i < binnenwerk.length; i += 2) {
    const items = [{ ...binnenwerk[i], label: String(i + 1) }];
    if (binnenwerk[i + 1]) items.push({ ...binnenwerk[i + 1], label: String(i + 2) });
    spreads.push({ key: `spread-${binnenwerk[i].index}`, items });
  }
  return spreads;
}

function PhotobookOverview({ pages, orientation, onOpenPage, onAddPage }) {
  const spreads = photobookSpreads(pages);
  return (
    <div className="px-4 pb-6 space-y-6">
      {spreads.map((spread) => (
        // De kaft is één pagina breed, een opengeslagen paar twee — vandaar de
        // halve breedte voor de kaft. Binnen die omhulling verdelen de pagina's
        // zich met flex-1, zodat het nummerregeltje eronder exact dezelfde
        // verdeling volgt en elk nummer onder zijn eigen pagina blijft staan.
        <div key={spread.key} className="mx-auto" style={{ width: spread.items.length === 1 ? "50%" : "100%" }}>
          {/* Eén regel uitleg boven het kaftvel. Zonder dat is "Achterkant |
              Voorkant" nog steeds te raden, maar niet te wéten — en dit is
              precies het punt dat mensen missen. */}
          {spread.kaft && (
            <div className="text-[11px] text-white/50 mb-1.5 text-center leading-snug">
              De kaft wordt als één vel gedrukt: achterkant links, voorkant rechts. Beide kanten ontwerp je zelf.
            </div>
          )}
          <div className="flex gap-0.5">
            {spread.items.map(({ page, index, label }) => (
              <button key={index} type="button" onClick={() => onOpenPage(index)}
                title={`${spread.kaft ? label : `Pagina ${label}`} bewerken`}
                className="rp-press relative block flex-1 min-w-0 shadow-2xl hover:ring-2 hover:ring-sky-400 transition-shadow">
                <PhotobookPageView page={page} orientation={orientation}
                  titleClassName="font-display text-[9px] text-gray-800"
                  textClassName="text-[7px]" />
                {page.photos.length === 0 && !page.title && (page.textBoxes || []).length === 0 && (
                  <span className="absolute inset-0 flex items-center justify-center text-gray-400 text-xs">Leeg</span>
                )}
              </button>
            ))}
          </div>
          <div className="flex gap-0.5 mt-1.5">
            {spread.items.map(({ index, label }, i) => (
              <div key={index} className={`flex-1 min-w-0 text-[11px] text-white/50 ${spread.kaft ? "font-semibold" : "tnum"}`}
                style={{ textAlign: spread.items.length === 1 ? "center" : i === 0 ? "left" : "right" }}>
                {label}
              </div>
            ))}
          </div>
        </div>
      ))}
      {onAddPage && (
        <button type="button" onClick={onAddPage}
          className="rp-press w-full rounded-2xl border-2 border-dashed border-white/20 py-6 text-sm font-medium text-white/50 hover:border-white/40 hover:text-white/80 transition-colors">
          + Nieuwe pagina
        </button>
      )}
      {pages.length === 0 && <div className="text-center text-white/50 py-16">Nog geen pagina's.</div>}
    </div>
  );
}

const PACKING_CATEGORIES = [
  { key: "📄 Documenten", label: "Documenten", icon: "doc" },
  { key: "👕 Kleding", label: "Kleding", icon: "shirt" },
  { key: "🔌 Elektronica", label: "Elektronica", icon: "plug" },
  { key: "🧴 Toilettas", label: "Toilettas", icon: "bottle" },
  { key: "💊 Medicijnen", label: "Medicijnen", icon: "pill" },
  { key: "🎒 Overig", label: "Overig", icon: "suitcase" },
];
const PACKING_SUGGESTIONS = {
  "📄 Documenten": ["Paspoort", "Vliegtickets", "Reisverzekering", "Rijbewijs", "Hotelvouchers", "Visabewijzen"],
  "👕 Kleding": ["T-shirts", "Broeken", "Ondergoed", "Sokken", "Trui/vest", "Regenjas", "Zwemkleding", "Pyjama", "Schoenen", "Slippers"],
  "🔌 Elektronica": ["Telefoon oplader", "Reisstekker adapter", "Powerbank", "Oordopjes", "Camera", "Laptop"],
  "🧴 Toilettas": ["Tandenborstel", "Tandpasta", "Shampoo", "Douchegel", "Zonnebrandcrème", "Deodorant", "Scheerspullen"],
  "💊 Medicijnen": ["Paracetamol", "Reizigersdiarree tabletten", "Pleisters", "Antihistamine", "Persoonlijke medicatie"],
  "🎒 Overig": ["Reiskussen", "Slaapmasker", "Hangslot", "Paraplu", "Waterfles", "Snacks voor onderweg"],
};

function PackingTab({ tripId, readOnly }) {
  const [items, setItems] = useState([]);
  const [newItem, setNewItem] = useState("");
  const [newCategory, setNewCategory] = useState(PACKING_CATEGORIES[0].key);
  const [openCategory, setOpenCategory] = useState(null);
  const [loading, setLoading] = useState(true);

  // setLoading(false) stond alleen in het geslaagde pad, dus bij een mislukte
  // oproep — een haperende verbinding onderweg is het normale geval — bleef
  // "Laden..." voor altijd staan zonder dat er iets te zien of te proberen was.
  const load = React.useCallback(() => {
    api.getPackingItems(tripId)
      .then((data) => setItems(data))
      .catch(() => toonMelding("Paklijst laden is niet gelukt"))
      .finally(() => setLoading(false));
  }, [tripId]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!newItem.trim()) return;
    try {
      await api.addPackingItem(tripId, { category: newCategory, item: newItem.trim() });
      setNewItem("");
      load();
    } catch (err) { toonMelding(err.message || "Toevoegen is niet gelukt"); }
  }

  async function handleToggle(item) {
    try {
      await api.updatePackingItem(item.id, { checked: !item.checked });
      setItems(prev => prev.map(p => p.id === item.id ? { ...p, checked: !p.checked } : p));
    } catch (err) { toonMelding(err.message || "Afvinken is niet gelukt"); }
  }

  async function handleDelete(id) {
    try {
      await api.deletePackingItem(id);
      setItems(prev => prev.filter(p => p.id !== id));
    } catch (err) { toonMelding(err.message || "Verwijderen is niet gelukt"); }
  }

  async function handleSuggest(cat, suggestion) {
    if (items.some(p => p.category === cat && p.item === suggestion)) return;
    try {
      await api.addPackingItem(tripId, { category: cat, item: suggestion });
      load();
    } catch (err) { toonMelding(err.message || "Toevoegen is niet gelukt"); }
  }

  async function handleUncheckAll() {
    try {
      await Promise.all(items.filter(p => p.checked).map(p => api.updatePackingItem(p.id, { checked: false })));
      load();
    } catch (err) { toonMelding(err.message || "Uitvinken is niet gelukt"); }
  }

  const grouped = PACKING_CATEGORIES.reduce((acc, cat) => {
    acc[cat.key] = items.filter(p => p.category === cat.key);
    return acc;
  }, {});
  const checkedCount = items.filter(p => p.checked).length;

  if (loading) return <div className="text-center py-12 text-gray-400">Laden...</div>;

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      {items.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">{checkedCount} / {items.length} ingepakt</span>
            {checkedCount > 0 && !readOnly && (
              <button onClick={handleUncheckAll} className="text-xs text-gray-400 hover:text-gray-600">Alles uitvinken</button>
            )}
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${items.length ? (checkedCount / items.length) * 100 : 0}%` }} />
          </div>
        </div>
      )}

      {/* Add item */}
      {!readOnly && (
        <form onSubmit={handleAdd} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex gap-2">
          <select value={newCategory} onChange={e => setNewCategory(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-400 shrink-0">
            {PACKING_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <input value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="Item toevoegen..."
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-400 min-w-0" />
          <button type="submit" className="bg-sky-300 text-gray-800 rounded-xl px-4 h-11 text-sm font-semibold hover:bg-sky-200 transition-colors shrink-0">+</button>
        </form>
      )}

      {/* Categories */}
      {PACKING_CATEGORIES.map(cat => {
        const catItems = grouped[cat.key] || [];
        const catChecked = catItems.filter(p => p.checked).length;
        const isOpen = openCategory === cat.key;
        const suggestions = (PACKING_SUGGESTIONS[cat.key] || []).filter(s => !catItems.some(p => p.item === s));
        return (
          <div key={cat.key} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <button onClick={() => setOpenCategory(isOpen ? null : cat.key)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-2.5">
                <Icon name={cat.icon} size={17} className="text-sky-700" />
                <span className="font-medium text-gray-800 text-sm">{cat.label}</span>
                {catItems.length > 0 && (
                  <span className="text-xs text-gray-400 tnum">{catChecked}/{catItems.length}</span>
                )}
              </div>
              <Icon name="arrowRight" size={15} className={`text-gray-400 transition-transform ${isOpen ? "rotate-90" : ""}`} />
            </button>

            {isOpen && (
              <div className="border-t border-gray-50 px-4 pb-3">
                {catItems.length === 0 && (
                  <p className="text-xs text-gray-400 italic py-2">Nog geen items in deze categorie</p>
                )}
                <div className="divide-y divide-gray-50">
                  {catItems.map(item => (
                    <div key={item.id} className="flex items-center gap-3 py-2 group">
                      <input type="checkbox" checked={item.checked} disabled={readOnly} onChange={() => handleToggle(item)}
                        className="w-4 h-4 rounded accent-sky-600 cursor-pointer shrink-0" />
                      <span className={`flex-1 text-sm ${item.checked ? "line-through text-gray-400" : "text-gray-800"}`}>{item.item}</span>
                      {!readOnly && (
                        <button onClick={() => handleDelete(item.id)}
                          className="text-gray-300 hover:text-red-500 active:text-red-600 p-1 opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Verwijderen"><Icon name="trash" size={15} /></button>
                      )}
                    </div>
                  ))}
                </div>
                {!readOnly && suggestions.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-50">
                    <p className="text-xs text-gray-400 mb-1.5">Suggesties:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.slice(0, 6).map(s => (
                        <button key={s} onClick={() => handleSuggest(cat.key, s)}
                          className="text-xs px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:bg-sky-50 hover:border-sky-300 hover:text-sky-700 transition-colors inline-flex items-center gap-1">
                          <Icon name="plus" size={12} /> {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {items.length === 0 && (
        <div className="text-center py-10 text-gray-400">
          <Icon name="suitcase" size={38} strokeWidth={1.2} className="mb-3 text-gray-300" />
          <div className="text-sm">Nog niets op de paklijst</div>
          <div className="text-xs mt-1">Voeg items toe of kies suggesties per categorie</div>
        </div>
      )}
    </div>
  );
}

// Bewerken/verwijderen zijn destructief-aanpalend genoeg dat ze niet als grote
// knoppen naast elkaar hoeven te staan — een klein "meer"-icoontje met een
// uitklapmenu houdt ze uit het zicht tot iemand er echt naar zoekt.
function TripActionsMenu({ onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={wrapRef}>
      {/* touchAction: net als de dubbeltik-fix in de fotoviewer eerder — zonder
          dit kan een browser op een echt touchscreen de tik laten wachten op
          een eventuele tweede tik (zoom-ambiguïteit), iets wat een synthetische
          muisklik in tests nooit blootlegt. Ook iets groter (w-9/h-9 i.p.v.
          w-8/h-8) voor een ruimer tikgebied. */}
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Meer opties"
        style={{ touchAction: "manipulation" }}
        className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 text-gray-500 transition-colors">
        <Icon name="more" size={18} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-50 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden py-1" style={{ minWidth: 170 }}>
          <button type="button" onClick={() => { setOpen(false); onEdit(); }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
            <Icon name="pen" size={15} />Bewerken
          </button>
          <button type="button" onClick={() => { setOpen(false); onDelete(); }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors text-left">
            <Icon name="trash" size={15} />Verwijderen
          </button>
        </div>
      )}
    </div>
  );
}
