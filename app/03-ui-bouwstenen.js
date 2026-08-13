// ---------- UI Components ----------
// Keuzeblad dat vanaf de onderkant omhoog glijdt — dichter bij hoe een
// telefoon-app een lijstje acties aanbiedt dan een dialoog midden in beeld,
// en het houdt de duim binnen bereik. Rijen komen als children binnen, zodat
// dit alleen over presentatie gaat en niets over wat de acties doen.
function BottomSheet({ title, subtitle, onClose, children }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center rp-veil"
      style={{ background: "rgba(47,42,40,0.28)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rp-sheet bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[85vh] flex flex-col"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {/* Greepje: puur een aanwijzing dat dit blad van onderen komt. */}
        <div className="pt-3 pb-1 flex justify-center sm:hidden" aria-hidden="true">
          <span className="w-10 h-1 rounded-full bg-gray-200" />
        </div>
        <div className="px-6 pt-4 pb-2">
          <h2 className="font-display text-[26px] font-semibold text-gray-800 leading-tight">{title}</h2>
          {subtitle && <p className="text-[15px] text-gray-500 mt-1 leading-relaxed">{subtitle}</p>}
        </div>
        <div className="overflow-y-auto px-4 pb-4 pt-2">{children}</div>
      </div>
    </div>
  );
}

// Eén rij in een BottomSheet: icoon in een zacht vlakje, titel, uitleg.
function SheetAction({ icon, label, description, onClick }) {
  return (
    <button type="button" onClick={onClick}
      className="rp-press w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-left hover:bg-gray-50 transition-colors">
      <span className="shrink-0 w-11 h-11 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center">
        <Icon name={icon} size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[19px] font-semibold text-gray-800 leading-snug">{label}</span>
        {description && <span className="block text-[13px] font-medium text-gray-500 mt-0.5">{description}</span>}
      </span>
      <Icon name="chevronRight" size={16} className="shrink-0 text-gray-300" />
    </button>
  );
}

function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: "rgba(55,52,50,0.28)" }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`bg-white rounded-3xl shadow-2xl w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between gap-4 px-6 pt-6 pb-4">
          <h2 className="font-display text-[21px] font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} aria-label="Sluiten" className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-800 hover:bg-gray-100 transition-colors"><Icon name="close" size={18} /></button>
        </div>
        <div className="overflow-y-auto px-6 pb-6 flex-1">{children}</div>
      </div>
    </div>
  );
}

// Lichte opmaak voor fotoboek-tekst: vet, cursief en lettertype, als een
// beperkte HTML-substring (b/i/font/br) — geen zichtbare markers, gewoon
// direct zichtbaar terwijl je typt. DOMPurify is de enige plek die bepaalt
// wat er ooit gerenderd wordt, dus dat is waar de echte veiligheidsgrens zit.
const RICH_TEXT_ALLOWED_TAGS = ["b", "i", "font", "br", "div"];
// "style" mag erbij voor de lettergrootte in punten; DOMPurify ontleedt de CSS
// zelf en gooit er alles uit wat geen nette eigenschap is, dus dit opent geen
// deur naar url()/expression-trucs. size blijft toegestaan zodat tekst uit
// oudere boeken (<font size="1..7">) gewoon blijft werken.
const RICH_TEXT_ALLOWED_ATTR = ["face", "color", "size", "style"];
function sanitizeRichText(html) {
  return window.DOMPurify
    ? window.DOMPurify.sanitize(html || "", { ALLOWED_TAGS: RICH_TEXT_ALLOWED_TAGS, ALLOWED_ATTR: RICH_TEXT_ALLOWED_ATTR })
    : "";
}
const RICH_TEXT_FONTS = [
  { key: "sans", label: "Standaard", family: 'ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif' },
  { key: "serif", label: "Klassiek", family: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif' },
  { key: "mono", label: "Mono", family: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' },
  { key: "rounded", label: "Rond", family: '"Trebuchet MS", Verdana, "Segoe UI", sans-serif' },
  { key: "elegant", label: "Sierlijk", family: '"Big Caslon", Didot, serif' },
  { key: "script", label: "Script", family: '"Bradley Hand", "Segoe Script", "Comic Sans MS", cursive' },
];
// Kleine, verzorgde tekstkleur-set — de app-inkt plus een paar duidelijk van
// elkaar te onderscheiden tinten, geen volledige kleurenkiezer nodig.
const RICH_TEXT_COLORS = [PALETTE.textPrimary, PALETTE.textSecondary, PALETTE.coralDeep, PALETTE.info, PALETTE.success, "#ffffff"];
// Uitlijning geldt voor het hele tekstveld (titel/beschrijving/bijschrift),
// niet per selectie zoals vet/cursief/kleur — daarom apart bijgehouden i.p.v.
// als HTML-opmaak, en gewoon via CSS text-align toegepast.
const RICH_TEXT_ALIGNMENTS = [
  { key: "left", icon: "alignLeft" },
  { key: "center", icon: "alignCenter" },
  { key: "right", icon: "alignRight" },
];
// document.execCommand("fontSize", ...) gebruikt de oude HTML-schaal van 1
// t/m 7 (3 = standaard) en wikkelt de selectie in <font size="N">, dezelfde
// aanpak als de lettertype- en kleurknoppen hierboven — de browser (en de
// PDF-export, zie pdfParseRichHtml op de server) kennen dat attribuut al.
// Lettergrootte in punten, dezelfde eenheid als de PDF gebruikt — zo staat er
// in het boek ook echt wat je kiest. Opgeslagen als font-size op een <font>,
// niet als de oude size="1..7"; die schaal had maar zeven stappen en zei niets
// over de uiteindelijke afdruk.
const RICH_TEXT_SIZES_PT = [8, 10, 12, 14, 18, 24, 32, 48];
// Alleen-lezen weergave van opgeslagen fotoboek-tekst — altijd door de
// sanitizer heen, ook al is er clientside al gesaneerd vóór het opslaan (de
// databasewaarde is niet per se te vertrouwen als enige bron).
function RichTextView({ html, align, className }) {
  if (!html) return null;
  return <div className={className} style={{ textAlign: align || "left" }} dangerouslySetInnerHTML={{ __html: sanitizeRichText(html) }} />;
}
// contentEditable in plaats van een input/textarea, zodat vet/cursief/
// lettertype meteen zichtbaar zijn terwijl je typt — geen **markers** die je
// zelf moet interpreteren.
const RichTextEditable = React.forwardRef(function RichTextEditable({ value, onChange, placeholder, className, align }, ref) {
  const innerRef = useRef(null);
  const lastValue = useRef(value);
  React.useImperativeHandle(ref, () => innerRef.current);

  // Los van de sync-effect hieronder: die vergelijkt tegen lastValue, dat bij
  // het allereerste render al op de meegekregen `value` staat (via useRef's
  // lazy initializer) — dus als een pagina met bestaand tekst laadt (bijv.
  // een automatisch gegenereerde titel), ziet die effect "geen wijziging" en
  // zet de DOM nooit. Deze mount-only effect zet 'm altijd hardhandig één keer.
  useEffect(() => {
    if (innerRef.current) innerRef.current.innerHTML = sanitizeRichText(value || "");
  }, []);

  useEffect(() => {
    if (innerRef.current && value !== lastValue.current && value !== innerRef.current.innerHTML) {
      innerRef.current.innerHTML = sanitizeRichText(value || "");
    }
    lastValue.current = value;
  }, [value]);

  function sync() {
    const raw = innerRef.current.innerHTML;
    const html = sanitizeRichText(raw);
    // Als saneren iets veranderde (een niet-toegestane tag/attribuut), moet de
    // DOM zelf ook bijgewerkt worden — anders blijft het scherm iets tonen
    // dat niet is wat er straks opgeslagen/getoond wordt elders.
    if (html !== raw) innerRef.current.innerHTML = html;
    lastValue.current = html;
    onChange(html);
  }
  function handleFocus() {
    // Regeleinden altijd als <br> (niet <div>/<p>) zodat weergave en PDF één
    // simpel formaat hoeven te begrijpen; stijl via tags, niet inline CSS.
    try {
      document.execCommand("defaultParagraphSeparator", false, "br");
      document.execCommand("styleWithCSS", false, false);
    } catch {}
  }
  const isEmpty = !value || value === "<br>";
  return (
    // w-full/h-full zijn hier geen opsmuk: dit wrappertje staat op de
    // fotoboek-canvas in een flex-container. Zonder breedte krimpt het als
    // flex-item mee met zijn inhoud, en bij een léég veld is dat nul — dan
    // valt er niets aan te tikken en opent er dus ook geen toetsenbord. De
    // w-full op het veld zelf hielp niet, want dat is 100% van nul. Bij een
    // ouder zonder eigen hoogte is h-full simpelweg auto, dus elders schaadt
    // het niet.
    <div className="relative w-full h-full">
      {isEmpty && placeholder && (
        <div className="absolute inset-0 px-3 py-2 text-sm text-gray-400 pointer-events-none truncate" style={{ textAlign: align || "left" }}>{placeholder}</div>
      )}
      {/* select-text is hier geen detail maar noodzaak: dit veld hangt op de
          fotoboek-canvas in een container met select-none (nodig om te kunnen
          slepen zonder dat je tekst selecteert). iOS weigert de cursor én het
          toetsenbord in een contentEditable waar -webkit-user-select: none op
          van kracht is — op de desktop krijgt het veld wél gewoon focus, dus
          dit valt alleen op een telefoon op. Direct gezet wint het van de
          geërfde waarde. */}
      <div ref={innerRef} contentEditable suppressContentEditableWarning
        onFocus={handleFocus} onInput={sync} onBlur={sync}
        style={{ textAlign: align || "left" }}
        className={`select-text w-full min-h-[2.5rem] border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent whitespace-pre-wrap break-words ${className || ""}`} />
    </div>
  );
});
// Werkt op de browser-selectie in het bijbehorende contentEditable-veld —
// document.execCommand is verouderd maar nog altijd de simpelste manier om
// vet/cursief/lettertype op een selectie toe te passen zonder een hele
// rich-text-library toe te voegen.
function RichTextToolbar({ getEl, onChange, align, onAlignChange }) {
  // Alles in het veld selecteren voordat een opdracht wordt uitgevoerd. Deze
  // tekstvakken zijn klein en staan op een canvas; eerst met je vinger een
  // stuk tekst aanwijzen om het daarna vet te maken is een omweg die niemand
  // wil. Een tik op een opmaakknop geldt dus voor het hele vak.
  function selectWhole(el) {
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
  function run(cmd, value) {
    const el = getEl();
    if (!el) return;
    selectWhole(el);
    document.execCommand(cmd, false, value);
    onChange(sanitizeRichText(el.innerHTML));
  }
  // Lettergrootte in punten. execCommand kent alleen de schaal 1..7, dus die
  // wordt gebruikt om de selectie in <font>-elementen te laten verpakken (dat
  // is precies wat de browser goed doet) waarna die elementen hier een echte
  // font-size in punten krijgen en het size-attribuut kwijtraken. Omdat dit
  // altijd op het hele veld werkt, worden meteen ook oude size="1..7"-restanten
  // in dat veld omgezet — bestaande boeken blijven verder ongemoeid.
  function applySizePt(pt) {
    const el = getEl();
    if (!el) return;
    selectWhole(el);
    document.execCommand("fontSize", false, "7");
    el.querySelectorAll("font[size]").forEach((f) => {
      f.removeAttribute("size");
      f.style.fontSize = `${pt}pt`;
    });
    setCurrentPt(pt);
    onChange(sanitizeRichText(el.innerHTML));
  }
  // De keuzelijst laat zien wat er nú staat in plaats van een lege plek. De
  // browser rekent pt om naar px (1pt = 1/72 duim, 1px = 1/96), dus terug is
  // maal 0,75. Zonder eigen grootte in het veld staat er de geërfde maat, en
  // die valt lang niet altijd samen met een van de keuzes — dan blijft de
  // lijst leeg staan in plaats van een verkeerde waarde aan te wijzen.
  const [currentPt, setCurrentPt] = useState(null);
  useEffect(() => {
    const el = getEl();
    if (!el) return;
    const gemarkeerd = el.querySelector('[style*="font-size"]');
    if (!gemarkeerd) { setCurrentPt(null); return; }
    const px = parseFloat(getComputedStyle(gemarkeerd).fontSize);
    setCurrentPt(Number.isFinite(px) ? Math.round(px * 0.75) : null);
  }, [getEl]);
  // De opmaakknoppen staan meteen open. Ze zaten achter één "Aa"-knop om
  // ruimte te sparen, maar dat kostte bij elke tekstwijziging een extra tik.
  //
  // Wél in één rij die horizontaal schuift, niet omgebroken over meerdere
  // regels: uitgeklapt over drie regels wordt het zwevende paneel zo hoog dat
  // het over het tekstvak op de canvas valt, en dan is de tekst zelf niet meer
  // aan te tikken.
  //
  // Lettergrootte en lettertype zijn keuzelijsten en geen rijen losse knoppen.
  // Als knoppen waren dat samen veertien stuks, en die duwden de puntgroottes —
  // helemaal achteraan — op een telefoon volledig buiten beeld, zonder dat te
  // zien was dat de rij nog doorliep. Als lijst kosten ze samen twee plekken,
  // staat de grootte vooraan, en laat het bovendien zien wat er nú staat.
  const CONTROL = "h-8 rounded-lg border border-gray-300 bg-white text-xs text-gray-700 hover:border-gray-400 transition-colors px-1.5";

  // De rij schuift horizontaal — dat moest wel, want alles naast elkaar past
  // niet op een telefoon en over twee regels werd het zwevende paneel zo hoog
  // dat het over de tekst viel. Maar schuiven zonder dat je het ziet is net zo
  // erg als niet passen: op iOS is er geen schuifbalk, dus het leek gewoon of
  // dit alles was en de uitlijnknoppen half achter de prullenbak hoorden.
  // Vandaar een pijltje aan de kant waar nog meer staat. Bewust een knop en geen
  // vervaging alleen: het paneel is wit, een witte vervaging op wit valt niet op,
  // en op een telefoon is er geen muisaanwijzer die het per ongeluk ontdekt.
  // Tikken schuift een stuk op, zodat je er ook zonder vegen bij komt.
  const rijRef = useRef(null);
  const [meerLinks, setMeerLinks] = useState(false);
  const [meerRechts, setMeerRechts] = useState(false);
  useEffect(() => {
    const el = rijRef.current;
    if (!el) return;
    const meet = () => {
      setMeerLinks(el.scrollLeft > 2);
      setMeerRechts(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    };
    meet();
    el.addEventListener("scroll", meet, { passive: true });
    // Ook meten als het paneel van breedte verandert (draaien, toetsenbord),
    // anders blijft er een vervaging staan waar niets meer achter zit.
    const ro = new ResizeObserver(meet);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", meet); ro.disconnect(); };
  }, []);
  // Ruim een half venster per tik: genoeg om verder te komen, weinig genoeg om
  // te zien wat er langsschuift.
  function schuif(richting) {
    const el = rijRef.current;
    if (el) el.scrollBy({ left: richting * Math.max(120, el.clientWidth * 0.6), behavior: "smooth" });
  }

  return (
    <div className="relative flex-1 min-w-0 mb-1.5">
    <div ref={rijRef} className="flex items-center gap-1.5 overflow-x-auto [&>*]:shrink-0">
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => run("bold")} title="Vet"
        className="w-8 h-8 rounded-lg border border-gray-300 flex items-center justify-center font-bold text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors">B</button>
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => run("italic")} title="Cursief"
        className="w-8 h-8 rounded-lg border border-gray-300 flex items-center justify-center italic text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors">I</button>
      <div className="w-px h-6 bg-gray-200 mx-0.5" />
      {/* Het getal is de maat: wat hier staat is wat er in de PDF komt. */}
      <select value={currentPt ?? ""} title="Lettergrootte in punten"
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => applySizePt(Number(e.target.value))}
        className={`${CONTROL} tnum`}>
        <option value="" disabled>pt</option>
        {RICH_TEXT_SIZES_PT.map((pt) => <option key={pt} value={pt}>{pt} pt</option>)}
      </select>
      <select defaultValue="" title="Lettertype"
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => { const f = RICH_TEXT_FONTS.find((x) => x.key === e.target.value); if (f) run("fontName", f.family); }}
        className={CONTROL}>
        <option value="" disabled>Letter</option>
        {RICH_TEXT_FONTS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
      </select>
      <div className="w-px h-6 bg-gray-200 mx-0.5" />
      {onAlignChange && RICH_TEXT_ALIGNMENTS.map((a) => (
        <button key={a.key} type="button" onClick={() => onAlignChange(a.key)} title={`Uitlijnen: ${a.key}`}
          className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors ${(align || "left") === a.key ? "border-sky-400 bg-sky-50 text-sky-700" : "border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400"}`}>
          <Icon name={a.icon} size={15} />
        </button>
      ))}
      {onAlignChange && <div className="w-px h-6 bg-gray-200 mx-0.5" />}
      {RICH_TEXT_COLORS.map((c) => (
        <button key={c} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => run("foreColor", c)} title="Tekstkleur"
          className="w-6 h-6 rounded-full border border-gray-300 shrink-0" style={{ background: c }} />
      ))}
    </div>
    {meerLinks && (
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => schuif(-1)}
        title="Meer opmaakopties" aria-label="Meer opmaakopties naar links"
        className="absolute inset-y-0 left-0 w-8 flex items-center justify-start bg-gradient-to-r from-white via-white to-transparent text-gray-500 hover:text-gray-800 transition-colors">
        <Icon name="chevronRight" size={16} style={{ transform: "rotate(180deg)" }} />
      </button>
    )}
    {meerRechts && (
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => schuif(1)}
        title="Meer opmaakopties" aria-label="Meer opmaakopties naar rechts"
        className="absolute inset-y-0 right-0 w-8 flex items-center justify-end bg-gradient-to-l from-white via-white to-transparent text-gray-500 hover:text-gray-800 transition-colors">
        <Icon name="chevronRight" size={16} />
      </button>
    )}
    </div>
  );
}

// navigator.clipboard.writeText() geeft geen enkele terugkoppeling als hij
// stilzwijgend weigert (geen HTTPS-context, geen clipboard-permissie in een
// ingesloten webview, iOS-eigenaardigheden) — de knop leek dan "niets te doen".
// Vandaar de omweg via een verborgen textarea + execCommand, en een echt
// ja/nee terug zodat de aanroeper iets kan zeggen als het niet lukte.
async function kopieerTekst(tekst) {
  try {
    await navigator.clipboard.writeText(tekst);
    return true;
  } catch { /* onderstaande omweg */ }
  try {
    const el = document.createElement("textarea");
    el.value = tekst;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.focus();
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
    return true;
  } catch { return false; }
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

// Eén set veldstijlen voor input/textarea/select, zodat ze niet uit elkaar
// kunnen lopen: rustige rand, ruime binnenmarge en een zachte koraalring bij
// focus in plaats van een harde blauwe systeemring.
const FIELD = "w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-400/50 focus:border-sky-300 transition-colors";

const Input = React.forwardRef(function Input({ className = "", ...props }, ref) {
  return <input ref={ref} className={`${FIELD} ${className}`} {...props} />;
});

const Textarea = React.forwardRef(function Textarea({ className = "", ...props }, ref) {
  return <textarea ref={ref} className={`${FIELD} resize-none ${className}`} {...props} />;
});

function Select({ className = "", children, ...props }) {
  return <select className={`${FIELD} ${className}`} {...props}>{children}</select>;
}

// Gevulde knoppen, geen omlijnde: primair is de pastel zelf met donkere letters,
// secundair hetzelfde in het lichtste perzik. "lg" is de volle-breedte
// hoofdactie (56px) — de standaard blijft compact genoeg voor knoppenrijen,
// maar houdt 44px aan zodat het op een telefoon een eerlijk trefvlak is.
function Button({ variant = "primary", size = "md", className = "", children, ...props }) {
  const base = "rp-press inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer";
  const sizes = {
    md: "px-4 h-11 text-sm",
    lg: "px-6 h-14 text-base",
  };
  const styles = {
    // sky-100 en niet sky-50: dat laatste ligt zo dicht bij de warme
    // achtergrond dat een secundaire knop er niet meer als knop uitziet.
    primary: "bg-sky-300 text-gray-800 hover:bg-sky-200",
    secondary: "bg-sky-100 text-gray-800 hover:bg-sky-200",
    danger: "bg-red-50 text-red-700 hover:bg-red-100",
  };
  return <button className={`${base} ${sizes[size]} ${styles[variant]} ${className}`} {...props}>{children}</button>;
}

function Tabs({ tabs, active, onChange, accentColor }) {
  const primary = tabs.filter((t) => t.primary);
  const secondary = tabs.filter((t) => !t.primary);
  return (
    <div className="mb-6 space-y-2">
      {primary.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className="w-full h-14 px-4 rounded-xl text-base font-semibold transition-colors whitespace-nowrap flex items-center justify-center gap-2"
          style={active === t.key
            ? { background: accentColor || PALETTE.primary, color: textOn(accentColor || PALETTE.primary) }
            : { background: PALETTE.surfaceSecondary, color: PALETTE.textSecondary }}
        >
          <Icon name={t.icon} size={17} /> {t.label}
        </button>
      ))}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {secondary.map((t) => (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`shrink-0 py-2 px-3 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${active === t.key ? "bg-white shadow-sm text-gray-800 font-semibold" : "text-gray-500 hover:text-gray-800"}`}
          >
            <Icon name={t.icon} size={15} /> {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Naar een dag of activiteit springen. Ziet eruit als één regel werk, maar is
// het niet: dagblokken buiten beeld worden door de browser overgeslagen (zie
// content-visibility in app.css) en hebben zolang alleen een gescháátte hoogte.
// Spring je naar een dag verderop, dan worden de blokken die je onderweg
// passeert alsnog getekend, blijkt hun echte hoogte af te wijken van die
// schatting, en schuift het doel onder je vandaan.
//
// Gemeten op een reis van drie weken, met "Vandaag" vanaf de bovenkant van het
// dagboek: je kwam op dag 8 uit in plaats van dag 11, en vanaf een andere
// beginpositie zelfs tussen twee dagen in. Vanaf beneden naar boven klopte het
// wél — vandaar dat het "soms" leek.
//
// Daarom niet één keer springen maar bijsturen tot het stil ligt: opnieuw meten,
// nog eens richten, en dat herhalen tot het doel twee keer achter elkaar op
// dezelfde plek staat. Een bovengrens op het aantal rondes zodat dit nooit kan
// blijven doorlopen.
function scrollNaarElement(id, opties = {}) {
  const { blok = "start" } = opties;
  const el = document.getElementById(id);
  if (!el) return;

  // Een zachte glijbeweging over tienduizenden pixels is niet prettig én maakt
  // het bijsturen zichtbaar als een sprong achteraf. Dichtbij dus zacht,
  // veraf direct.
  const afstand = Math.abs(el.getBoundingClientRect().top);
  const zacht = afstand < window.innerHeight * 3;
  el.scrollIntoView({ behavior: zacht ? "smooth" : "auto", block: blok });

  let rondes = 0;
  let vorigeTop = null;
  const bijsturen = () => {
    const doel = document.getElementById(id);
    if (!doel || rondes++ > 40) return;
    const top = Math.round(doel.getBoundingClientRect().top);
    // Twee keer dezelfde uitkomst betekent dat alles eronder is uitgerekend en
    // er niets meer verschuift.
    if (vorigeTop !== null && Math.abs(top - vorigeTop) <= 1) return;
    vorigeTop = top;
    doel.scrollIntoView({ block: blok });
    requestAnimationFrame(bijsturen);
  };
  // Pas na de zachte beweging bijsturen; anders breekt de eerste correctie de
  // animatie meteen af. Bij een directe sprong kan het volgende frame al.
  if (zacht) setTimeout(() => requestAnimationFrame(bijsturen), 450);
  else requestAnimationFrame(bijsturen);
}

// Een balk die laat zien hoe ver iets is. Gebruikt bij het uploaden van foto's
// en bij het opzoeken van de plaatsen op de dagboekkaart: twee dingen die
// merkbaar duren en waarbij zonder terugkoppeling niet te zien is of er nog
// iets gebeurt of dat het gewoon stuk is.
function Voortgangsbalk({ done, total, label, ariaLabel, className = "" }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{label}</span>
        <span className="tnum">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden"
        role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total}
        aria-label={ariaLabel}>
        <div className="h-full rounded-full bg-sky-300 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// Even aanwijzen waar je terechtkomt. Spring je vanuit het reactie-overzicht
// naar een dag of activiteit, dan sta je ineens ergens middenin een lange
// pagina en is het maar de vraag welk blok nu bedoeld werd — zeker als er twee
// activiteiten onder elkaar staan. Een randje van een paar tellen beantwoordt
// die vraag zonder er iets bij te hoeven schrijven.
function lichtOp(id, ms = 2200) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("rp-aangewezen");
  setTimeout(() => el.classList.remove("rp-aangewezen"), ms);
}
