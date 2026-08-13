// ---------- Fotoquiz ----------
// Tekent de QR puur client-side (qrcode-generator via CDN, net als Leaflet/
// exif-js) — er hoeft niets naar een externe QR-dienst verstuurd te worden
// voor iets dat toch al gewoon een link is.
function QrCode({ value, size = 180 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    if (!value || typeof window.qrcode !== "function") { ref.current.innerHTML = ""; return; }
    try {
      const qr = window.qrcode(0, "M");
      qr.addData(value);
      qr.make();
      ref.current.innerHTML = qr.createSvgTag({ scalable: true });
      const svg = ref.current.querySelector("svg");
      if (svg) { svg.style.width = "100%"; svg.style.height = "100%"; }
    } catch { ref.current.innerHTML = ""; }
  }, [value]);
  return <div ref={ref} style={{ width: size, height: size }} className="mx-auto" />;
}

// Neemt het hele scherm over — koptekst, tabbalk en onderbalk verdwijnen
// achter deze laag — zodat de quiz als een echt spelmoment voelt in plaats
// van nog een tabblad tussen de rest van de reisplanning.
// Niet quiz-specifiek ondanks de naam — generieke volledig-scherm-overlay,
// ook hergebruikt door het fotoboek.
function QuizFullscreen({ onClose, children, label = "Sluiten" }) {
  const scrollRef = useRef(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  function handleScroll(e) {
    setShowScrollTop(e.target.scrollTop > 400);
  }
  function scrollToTop() {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="fixed inset-0 z-[60] bg-gray-50 overflow-y-auto">
      <div className="sticky top-0 z-10 flex justify-end p-3" style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}>
        <button onClick={onClose} aria-label={label}
          className="w-9 h-9 rounded-full bg-white shadow-md flex items-center justify-center text-gray-500 hover:text-gray-700">
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="px-4 pb-10" style={{ paddingBottom: "calc(2.5rem + env(safe-area-inset-bottom))" }}>{children}</div>
      {/* Vooral handig in het fotoboek, waar een pagina met veel foto's flink
          kan doorscrollen — "fixed" i.p.v. "sticky" omdat dit element zelf
          buiten de doorschuivende inhoud staat, direct in de scrollende
          container. */}
      {showScrollTop && (
        <button onClick={scrollToTop} aria-label="Naar boven"
          className="fixed z-20 w-11 h-11 rounded-full bg-white shadow-lg border border-gray-100 flex items-center justify-center text-gray-500 hover:text-sky-600 transition-colors"
          style={{ right: "1rem", bottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}>
          <Icon name="arrowUp" size={18} />
        </button>
      )}
    </div>
  );
}

// Fisher-Yates, niet `.sort(() => Math.random() - 0.5)` — die laatste schudt
// niet uniform (zie de vergelijkbare fix in generateQuizQuestions op de
// server) en zou hier de foto's in de rol systematisch in dezelfde volgorde
// laten eindigen.
function shuffleClient(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Kleine, gesynthetiseerde geluidseffecten voor de quiz — geen audiobestanden
// nodig (die passen niet bij een app zonder buildstap), gewoon een paar korte
// toontjes via de Web Audio API. Eén gedeelde AudioContext, lazy aangemaakt
// en pas bij een echte gebruikersactie (klik) — Safari/iOS negeert geluid dat
// zonder gebaar van de gebruiker start, dus de allereerste aanroep gebeurt
// altijd vanuit een click-handler (start/antwoord-knop).
let quizAudioCtx = null;
function quizAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!quizAudioCtx) quizAudioCtx = new Ctx();
  if (quizAudioCtx.state === "suspended") quizAudioCtx.resume().catch(() => {});
  return quizAudioCtx;
}
function playTone(freq, startOffset, duration, { type = "sine", gain = 0.15 } = {}) {
  const ctx = quizAudio();
  if (!ctx) return;
  const t0 = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}
// Voor de dramatische "riser" bij de intro: een doorlopende frequentiesweep
// in plaats van een vast toonhoogte, net als de spanningsopbouw in echte
// spelshowmuziek (Weekend Miljonairs, Rad van Fortuin).
function playSweep(freqStart, freqEnd, startOffset, duration, { type = "sawtooth", gain = 0.12 } = {}) {
  const ctx = quizAudio();
  if (!ctx) return;
  const t0 = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, t0);
  osc.frequency.linearRampToValueAtTime(freqEnd, t0 + duration);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + duration * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration + 0.05);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.08);
}
function playWheelLand() {
  playTone(110, 0, 0.15, { type: "sine", gain: 0.16 }); // korte lage "thump" voor extra impact
  playTone(880, 0.03, 0.12, { type: "triangle" });
  playTone(1175, 0.12, 0.24, { type: "triangle" });
}
function playTick() { playTone(1300, 0, 0.05, { type: "square", gain: 0.07 }); }
// Het klikkende geluid van een rad-van-fortuin-wieltje: één klikje per
// passerende foto, getimed op exact dezelfde cubic-bezier-vertraging als de
// visuele rol (zie inverseEase in PhotoWheel) — dus de klikjes versnellen
// niet lineair maar volgen precies hoe de rol zelf ook vertraagt.
function playWheelClick(offset = 0) { playTone(1600, offset, 0.03, { type: "square", gain: 0.08 }); }
// Dezelfde cubic-bezier(0,0,0.2,1) als de CSS-transition van de rol zelf —
// hiermee wordt uitgerekend op welk tijdstip elke volgende foto de kijkkant
// bereikt, zodat de klikjes precies de visuele vertraging volgen in plaats
// van een simpel, onrealistisch gelijkmatig tempo.
function easeDecelerateAt(x) {
  function bez(t, p1, p2) { const mt = 1 - t; return 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t; }
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (bez(mid, 0, 0.2) < x) lo = mid; else hi = mid;
  }
  return bez((lo + hi) / 2, 0, 1);
}
function wheelClickTimes(tileCount, totalMs) {
  const times = [];
  for (let i = 1; i < tileCount; i++) {
    const targetY = i / tileCount;
    let lo = 0, hi = 1;
    for (let k = 0; k < 24; k++) {
      const mid = (lo + hi) / 2;
      if (easeDecelerateAt(mid) < targetY) lo = mid; else hi = mid;
    }
    times.push(((lo + hi) / 2) * (totalMs / 1000));
  }
  return times;
}
function playCorrect() {
  [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => playTone(f, i * 0.08, 0.16, { type: "triangle", gain: 0.14 }));
}
function playWrong() {
  playSweep(320, 110, 0, 0.5, { type: "sawtooth", gain: 0.14 }); // "womp womp" — dalende glide i.p.v. één vaste zoemtoon
}
function playWinnerFanfare() {
  [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => playTone(f, i * 0.12, 0.2, { type: "triangle", gain: 0.13 }));
  // Slotakkoord: drie tonen tegelijk voor wat meer "voluit" op het eind.
  [1046.5, 1318.5, 1568].forEach((f) => playTone(f, 0.6, 0.7, { type: "triangle", gain: 0.11 }));
}
// Dramatisch spelshow-intromuziekje: een oplopende spanningssweep (de
// "riser" die je in echte spelshows vlak vóór de start hoort), gevolgd door
// een stevige aanslag en een fanfare-achtige oplopende reeks — in plaats van
// het simpele setje pieptonen van hiervoor.
function playGameShowIntro() {
  playSweep(90, 700, 0, 0.55, { type: "sawtooth", gain: 0.13 });
  playTone(80, 0.55, 0.18, { type: "sine", gain: 0.2 }); // stevige lage "hit"
  [523.25, 659.25, 783.99].forEach((f) => playTone(f, 0.58, 0.22, { type: "square", gain: 0.13 }));
  [
    { f: 659.25, t: 0.78, d: 0.09 },
    { f: 783.99, t: 0.88, d: 0.09 },
    { f: 1046.5, t: 0.98, d: 0.09 },
    { f: 1318.5, t: 1.08, d: 0.5 },
  ].forEach(({ f, t, d }) => playTone(f, t, d, { type: "square", gain: 0.13 }));
}
// Sting voor de verdubbelaar-tussenpagina: een korte oplopende sweep gevolgd
// door een heldere hit, om het "dit is bijzonder" gevoel te onderstrepen.
function playDoublerSting() {
  playSweep(200, 900, 0, 0.4, { type: "square", gain: 0.15 });
  playTone(1046.5, 0.4, 0.3, { type: "triangle", gain: 0.16 });
}

// Een slot-achtige foto-rol: een rij foto's uit de reis schuift voorbij en
// komt vertragend tot stilstand op de foto waar de vraag over gaat, als korte
// spanningsopbouw vóór de multiple-choice opties verschijnen. De rolrichting
// is altijd hetzelfde (naar links), alleen de duur van de vertraging geeft
// het "tot stilstand komen"-gevoel — geen fysica, gewoon een CSS-easing.
const WHEEL_SPIN_MS = 4300;

function PhotoWheel({ pool, target, onDone }) {
  const containerRef = useRef(null);
  const trackRef = useRef(null);
  const [tileSize, setTileSize] = useState(0);

  // Zo breed als de vraagkaart eronder (max-w-md, responsief) in plaats van
  // een vast aantal pixels — anders oogt de rol een stuk kleiner dan de foto
  // die er meteen op volgt.
  React.useLayoutEffect(() => {
    if (containerRef.current) setTileSize(containerRef.current.clientWidth);
  }, []);

  // Op `target.photo_id` in plaats van op `target` zelf: elke /state-poll (om
  // de 1,5s) levert een nieuw objectliteral voor dezelfde vraag, en zolang
  // hetzelfde fotonummer bedoeld wordt mag dat de rol niet laten herstarten.
  const sequence = React.useMemo(() => {
    const filler = shuffleClient(pool.filter((p) => p.id !== target.photo_id && (p.thumb_url || p.url))).slice(0, 13);
    while (filler.length < 9) filler.push(target);
    return [...filler, target];
  }, [pool, target.photo_id]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el || !tileSize) return;
    let done = false;
    el.style.transition = "none";
    el.style.transform = "translateX(0px)";
    void el.offsetHeight; // force reflow, anders negeert de browser de reset vóór de animatie
    const raf = requestAnimationFrame(() => {
      // Lang genoeg om als een echte rol te voelen: eerst duidelijk
      // ronddraaiend, dan een merkbaar lange, uitdovende staart voordat hij
      // stilstaat op de juiste foto.
      el.style.transition = `transform ${WHEEL_SPIN_MS}ms cubic-bezier(0,0,0.2,1)`;
      el.style.transform = `translateX(-${(sequence.length - 1) * tileSize}px)`;
    });
    wheelClickTimes(sequence.length, WHEEL_SPIN_MS).forEach((t) => playWheelClick(t));
    const timer = setTimeout(() => { if (!done) { done = true; onDone(); } }, WHEEL_SPIN_MS + 50);
    return () => { done = true; cancelAnimationFrame(raf); clearTimeout(timer); };
  }, [sequence, tileSize]);

  return (
    <div ref={containerRef} className="relative overflow-hidden rounded-2xl border-4 border-sky-400 shadow-lg mx-auto w-full max-w-[380px] aspect-square">
      <div ref={trackRef} className="flex h-full" style={{ willChange: "transform" }}>
        {sequence.map((p, i) => (
          <img key={i} src={p.thumb_url || p.url} alt="" className="object-cover shrink-0 h-full" style={{ width: tileSize || "100%" }} />
        ))}
      </div>
    </div>
  );
}

// Openingsscherm dat één keer per sessie te zien is, zodra de quiz écht
// begint (lobby → actief) en vóór de eerste vraag — puur decoratief, niet
// gekoppeld aan een specifieke reis of vraag.
const QUIZ_OPENING_IMAGE = "/quiz-cover-1.jpg";
const OPENING_SCREEN_MS = 6500;

function QuizOpeningScreen() {
  return (
    <div className="max-w-sm mx-auto">
      <div className="rounded-2xl overflow-hidden shadow-lg">
        <img src={QUIZ_OPENING_IMAGE} alt="" className="w-full object-cover" />
      </div>
    </div>
  );
}

const DOUBLER_SCREEN_MS = 3000;

// Tussenpagina vlak vóór de verdubbelaar-vraag — even iets groots en
// opvallends vóór de vraag zelf verschijnt, zodat niemand die dubbele punten
// mist.
function QuizDoublerScreen() {
  return (
    <div className="max-w-sm mx-auto text-center py-14">
      <div className="text-6xl mb-4 leading-none">⚡</div>
      <h2 className="font-display text-4xl font-bold text-amber-500 mb-2">Verdubbelaar!</h2>
      <p className="text-sm text-gray-500">Deze vraag levert dubbele punten op</p>
    </div>
  );
}

const SCORE_SPIN_MS = 3000;

// Telt op van de vorige naar de nieuwe stand in plaats van 'm meteen te
// tonen — dezelfde "eerst draaien, dan landen"-gedachte als de foto-rol,
// maar dan voor de score zelf. Ease-out: snel op gang, rustig uitlopend.
function AnimatedScore({ from, to, active, duration = SCORE_SPIN_MS }) {
  const [display, setDisplay] = useState(active ? from : to);
  useEffect(() => {
    if (!active) { setDisplay(to); return; }
    let raf;
    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, from, to, duration]);
  return <span className="tnum font-semibold text-gray-700">{display}</span>;
}

// Slingers bij het eindscherm van de quiz. Feestelijk mag, maar dan wel in de
// tinten van de app zelf in plaats van zeven vreemde primairkleuren.
const STREAMER_COLORS = [
  PALETTE.primary, PALETTE.coral, PALETTE.accent,
  PALETTE.success, PALETTE.info, PALETTE.primaryHover, PALETTE.coralDeep,
];

// Slingers voor het eindscherm van de fotoquiz — vallen één keer naar
// beneden (zie .rp-streamer in index.html) en blijven daarna hangen, geen
// oneindige loop. Willekeurige posities/timing worden één keer bepaald bij
// het monteren, niet bij elke re-render (anders "regent" het bij elke poll
// opnieuw).
function PartyStreamers({ count = 60 }) {
  const pieces = React.useMemo(() => Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.6,
    duration: 2.6 + Math.random() * 1.6,
    color: STREAMER_COLORS[i % STREAMER_COLORS.length],
    rotate: Math.round(Math.random() * 360),
  })), [count]);
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 70 }}>
      {pieces.map((p) => (
        <div key={p.id} className="rp-streamer" style={{
          left: `${p.left}%`,
          backgroundColor: p.color,
          animationDelay: `${p.delay}s`,
          animationDuration: `${p.duration}s`,
          transform: `rotate(${p.rotate}deg)`,
        }} />
      ))}
    </div>
  );
}

// Een Kahoot-achtige fotoquiz: één sessie, gedeeld via QR-code, met tussenstand
// na elke vraag en een winnaar aan het eind. De voortgang komt volledig uit
// GET .../state (zie computeQuizPhase in server.js) — deze component pollt
// alleen, er wordt hier niets aan lokale timers of host-besturing gedaan.
// De winnaar verschijnt pas als de ranglijst eronder van onderaf is
// opgebouwd. Tot die tijd staat er een neutrale regel, zodat het scherm niet
// leeg oogt maar ook nog niets verklapt.
function WinnaarOnthulling({ winners, vertraging }) {
  const [onthuld, setOnthuld] = useState(false);
  useEffect(() => {
    // Iets ná de laatste rij, zodat de lijst er echt staat.
    const t = setTimeout(() => setOnthuld(true), Math.max(0, vertraging) * 1000 + 400);
    return () => clearTimeout(t);
  }, [vertraging]);

  if (!onthuld) {
    return (
      <div className="py-2 mb-5">
        <div className="text-sm font-semibold uppercase tracking-[0.14em] text-gray-400">De uitslag</div>
        <div className="text-xs text-gray-400 mt-1">van onder naar boven…</div>
      </div>
    );
  }
  return (
    <div className="rp-rise">
      <Icon name="sparkle" size={38} strokeWidth={1.2} className="mx-auto mb-3 text-sky-400" />
      <h3 className="font-display text-[21px] text-gray-800 mb-1">
        {winners.length > 1 ? "Gedeelde winst!" : winners.length === 1 ? `${winners[0].name} wint!` : "Quiz afgelopen"}
      </h3>
      <p className="text-sm text-gray-500 mb-5">Eindstand van de fotoquiz</p>
    </div>
  );
}

// Alleen als terugval zolang de server nog geen tel heeft doorgegeven.
const QUIZ_INTRO_TELLER = 10;

// De namen van wie deze vraag goed had. Niemand goed is óók een uitkomst en
// hoort er te staan — anders lijkt het alsof de lijst niet geladen is.
function GoedeAntwoorders({ lijst, totaal }) {
  if (!Array.isArray(lijst)) return null;
  if (lijst.length === 0) {
    return (
      <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5 text-center">
        <div className="text-sm text-gray-500">Niemand had deze goed</div>
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-green-50 border border-green-100 px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-green-700 mb-1.5 text-center">
        Goed{typeof totaal === "number" && totaal > 0 ? ` — ${lijst.length} van de ${totaal}` : ""}
      </div>
      <div className="flex flex-wrap justify-center gap-1.5">
        {lijst.map((p, i) => (
          <span key={`${p.id ?? "x"}-${i}`}
            className={`text-sm px-2.5 py-1 rounded-full ${p.isMe ? "bg-green-600 text-white font-semibold" : "bg-white text-green-800 border border-green-200"}`}>
            {/* De snelste vooraan, met een medaille voor de eerste. */}
            {i === 0 && lijst.length > 1 ? "⚡ " : ""}{p.isMe ? "Jij" : p.naam}
          </span>
        ))}
      </div>
    </div>
  );
}

function PhotoQuizTab({ trip }) {
  const [session, setSession] = useState(undefined); // undefined = laden, null = geen sessie
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [live, setLive] = useState(null);
  const [myPick, setMyPick] = useState(null);
  const [questionSeconds, setQuestionSeconds] = useState(20);
  const [questionCount, setQuestionCount] = useState(15);
  const [photoPool, setPhotoPool] = useState([]);
  const [revealedIndex, setRevealedIndex] = useState(-1);
  const [openingScreenActive, setOpeningScreenActive] = useState(false);
  const openingScreenShownRef = useRef(false);
  const openingScreenTimerRef = useRef(null);
  const [doublerScreenActive, setDoublerScreenActive] = useState(false);
  const doublerScreenShownRef = useRef(false);
  const doublerScreenTimerRef = useRef(null);
  const [scoreSpinActive, setScoreSpinActive] = useState(false);
  const scoreSpinTimerRef = useRef(null);
  const scoreSpinBaselineRef = useRef(new Map()); // id -> score vóór deze onthulling
  const lastRevealScoresRef = useRef(null); // id -> score ná de vórige onthulling (null = nog geen enkele gehad)
  const revealedStandingsIndexRef = useRef(-1);
  const [showNewQuizForm, setShowNewQuizForm] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState(null);
  const lastTickRef = useRef(null);
  const doneSoundPlayedRef = useRef(false);
  const introPlayedRef = useRef(false);

  const refreshSession = useCallback(async () => {
    try { const data = await api.getQuizSession(trip.id); setSession(data.session || null); }
    catch { setSession(null); }
  }, [trip.id]);

  useEffect(() => { refreshSession(); }, [refreshSession]);

  async function toggleStats() {
    if (showStats) { setShowStats(false); return; }
    setShowStats(true);
    setStats(null);
    try { setStats(await api.getQuizStats(trip.id)); }
    catch { setStats([]); }
  }

  // Vulling voor de foto-rol (zie PhotoWheel) — gewoon de fotobibliotheek van
  // de reis, niet gekoppeld aan quizvragen, dus geen risico dat een nog niet
  // gestelde vraag hierdoor wordt verklapt.
  useEffect(() => {
    api.getPhotos(trip.id).then((photos) => setPhotoPool(photos || [])).catch(() => {});
  }, [trip.id]);

  useEffect(() => {
    if (!session || !session.isParticipant) { setLive(null); return; }
    let cancelled = false;
    async function poll() {
      try {
        const data = await api.getQuizState(session.id);
        if (!cancelled) setLive(data);
      } catch { /* volgende poll probeert het opnieuw */ }
    }
    poll();
    const timer = setInterval(poll, 1500);
    return () => { cancelled = true; clearInterval(timer); };
  }, [session]);

  useEffect(() => { setMyPick(null); }, [live?.currentIndex]);

  // Korte tik in de laatste 3 seconden van het antwoordvenster — alleen
  // tijdens het echte kiezen (niet terwijl de foto-rol nog draait; de
  // blur-variant heeft geen rad, dus daar mag de tik altijd), en hooguit één
  // keer per seconde-waarde (anders zou elke 1,5s-poll 'm opnieuw afvuren
  // zolang de weergegeven seconde niet is veranderd).
  useEffect(() => {
    if (live?.phase !== "question") return;
    const stillSpinning = live.question?.mode !== "blur" && revealedIndex !== live.currentIndex;
    if (stillSpinning) return;
    const s = live.remainingSeconds;
    if (s > 0 && s <= 3 && lastTickRef.current !== s) { lastTickRef.current = s; playTick(); }
  }, [live?.phase, live?.remainingSeconds, live?.currentIndex, live?.question?.mode, revealedIndex]);

  // Fanfare zodra de eindstand in beeld komt — precies één keer, niet bij
  // elke poll zolang de quiz al "done" is.
  useEffect(() => {
    if (live?.phase === "done" && !doneSoundPlayedRef.current) {
      doneSoundPlayedRef.current = true;
      playWinnerFanfare();
    }
  }, [live?.phase]);

  // Spelshow-intromuziekje zodra de quiz écht begint — voor iedereen die op
  // dat moment aan het pollen is (niet alleen de gastheer die op "start"
  // klikte), en precies één keer per sessie.
  useEffect(() => {
    if (live && live.phase !== "lobby" && !introPlayedRef.current) {
      introPlayedRef.current = true;
      playGameShowIntro();
    }
  }, [live?.phase]);

  // Openingsscherm: net als het intromuziekje hierboven precies één keer
  // getriggerd zodra de quiz de lobby uit is, en toont zichzelf even (los van
  // de eigenlijke serverfase) vóór de eerste vraag in beeld komt.
  //
  // Belangrijk: geen `return () => clearTimeout(timer)` hier — dat zou de
  // timer bij elke volgende fase-wisseling annuleren (het effect draait
  // opnieuw zodra live.phase verandert, en React ruimt dan eerst de vorige
  // cleanup op), waardoor het scherm nooit meer automatisch verdwijnt als er
  // binnen de weergaveduur alweer een nieuwe fase intreedt. De timer leeft in
  // een ref en wordt alleen bij het unmounten van de tab opgeruimd.
  useEffect(() => {
    if (live && live.phase !== "lobby" && !openingScreenShownRef.current) {
      openingScreenShownRef.current = true;
      setOpeningScreenActive(true);
      openingScreenTimerRef.current = setTimeout(() => setOpeningScreenActive(false), OPENING_SCREEN_MS);
    }
  }, [live?.phase]);
  useEffect(() => () => clearTimeout(openingScreenTimerRef.current), []);

  // Tussenpagina vlak vóór de verdubbelaar-vraag — precies één keer, zodra
  // die vraag voor het eerst in beeld komt (niet bij elke poll erna). Zelfde
  // reden als hierboven: de timer leeft in een ref, geen cleanup-per-render.
  useEffect(() => {
    if (live?.phase === "question" && live.question?.doubler && !doublerScreenShownRef.current) {
      doublerScreenShownRef.current = true;
      setDoublerScreenActive(true);
      playDoublerSting();
      doublerScreenTimerRef.current = setTimeout(() => setDoublerScreenActive(false), DOUBLER_SCREEN_MS);
    }
  }, [live?.phase, live?.currentIndex, live?.question?.doubler]);
  useEffect(() => () => clearTimeout(doublerScreenTimerRef.current), []);

  // Tussenstand-onthulling: eerst de oude stand tonen, dan de score per
  // deelnemer laten oplopen naar de nieuwe stand, precies één keer per ronde
  // (niet bij elke poll terwijl de tussenstand al in beeld staat). Alleen bij
  // een echte tussenstand (elke 3e vraag) of de eindstand — de korte "dit was
  // het goede antwoord"-pauze na de andere vragen toont sowieso geen
  // ranglijst, dus daar hoeft ook niets te spinnen.
  useEffect(() => {
    const isRealStandings = live?.phase === "done" || (live?.phase === "standings" && live?.showsLeaderboard);
    if (isRealStandings && revealedStandingsIndexRef.current !== live.currentIndex) {
      revealedStandingsIndexRef.current = live.currentIndex;
      const participants = live.participants || [];
      scoreSpinBaselineRef.current = lastRevealScoresRef.current
        || new Map(participants.map((p) => [p.id ?? p.name, 0]));
      setScoreSpinActive(true);
      scoreSpinTimerRef.current = setTimeout(() => {
        setScoreSpinActive(false);
        lastRevealScoresRef.current = new Map(participants.map((p) => [p.id ?? p.name, p.score]));
      }, SCORE_SPIN_MS);
    }
  }, [live?.phase, live?.currentIndex, live?.showsLeaderboard]);
  useEffect(() => () => clearTimeout(scoreSpinTimerRef.current), []);

  async function createSession() {
    setCreating(true); setError(null);
    try {
      const data = await api.createQuizSession(trip.id, { questionSeconds, questionCount });
      setSession(data.session);
      setLive(null);
      setRevealedIndex(-1);
      setShowNewQuizForm(false);
      doneSoundPlayedRef.current = false;
      introPlayedRef.current = false;
      clearTimeout(openingScreenTimerRef.current);
      openingScreenShownRef.current = false;
      setOpeningScreenActive(false);
      clearTimeout(doublerScreenTimerRef.current);
      doublerScreenShownRef.current = false;
      setDoublerScreenActive(false);
      clearTimeout(scoreSpinTimerRef.current);
      setScoreSpinActive(false);
      scoreSpinBaselineRef.current = new Map();
      lastRevealScoresRef.current = null;
      revealedStandingsIndexRef.current = -1;
    } catch (err) { setError(err.message || "Kon geen quiz starten"); }
    finally { setCreating(false); }
  }

  async function startSession() {
    quizAudio(); // klik van de gastheer — beste kans om geluid alvast te ontgrendelen
    setStarting(true);
    try { await api.startQuizSession(trip.id, session.id); await refreshSession(); }
    catch (err) { alert(err.message || "Kon quiz niet starten"); }
    finally { setStarting(false); }
  }

  async function stopSession() {
    if (!confirm("Quiz stoppen voor iedereen?")) return;
    setStopping(true);
    try { await api.stopQuizSession(trip.id, session.id); await refreshSession(); }
    catch (err) { alert(err.message || "Kon quiz niet stoppen"); }
    finally { setStopping(false); }
  }

  async function copyJoinLink() {
    if (!await kopieerTekst(session.joinLink)) {
      alert("Kopiëren is niet gelukt. Tik op de link hierboven om 'm handmatig te selecteren.");
      return;
    }
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  async function pick(choice) {
    if (myPick || !live || live.phase !== "question") return;
    quizAudio(); // ontgrendel de AudioContext binnen dit klik-gebaar (iOS staat geluid niet toe zonder)
    setMyPick({ index: live.currentIndex, choice, pending: true });
    try {
      const res = await api.answerQuizQuestion(session.id, live.currentIndex, choice);
      setMyPick({ index: live.currentIndex, choice, correct: res.correct, points: res.points });
      if (res.correct) playCorrect(); else playWrong();
    } catch (err) {
      setMyPick(null);
      alert(err.message || "Kon antwoord niet versturen");
    }
  }

  if (session === undefined) {
    return <div className="text-center py-16 text-gray-400">Laden...</div>;
  }

  // Gedeeld tussen het allereerste scherm (nog nooit een sessie gehad) én
  // "Nieuwe quiz starten" ná afloop — dat laatste opende voorheen meteen een
  // nieuwe sessie met de oude waarden, zonder ooit deze instellingen nog eens
  // te tonen. Zodra er ooit een sessie is geweest blijft `session` immers
  // altijd de laatst gemaakte sessie (nooit meer null), dus dit was de enige
  // andere plek waar aantal vragen / tijd per vraag nog aanpasbaar konden zijn.
  function renderQuizSettings(buttonLabel) {
    return (
      <>
        <div className="flex items-center justify-center gap-4 mb-5 text-sm">
          {/* Een <select> in plaats van een los getal om in te typen: op de
              telefoon (waar dit toch altijd wordt bediend) opent dit het
              systeemeigen wieltje om uit te kiezen — geen tikfoutjes met een
              cijfertoetsenbord meer mogelijk. */}
          <label className="flex items-center gap-2 text-gray-500">
            Aantal vragen
            <Select value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} className="!w-20 !py-1.5 text-center tnum">
              {Array.from({ length: 14 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </label>
          <label className="flex items-center gap-2 text-gray-500">
            Seconden per vraag
            <Select value={questionSeconds} onChange={(e) => setQuestionSeconds(Number(e.target.value))} className="!w-20 !py-1.5 text-center tnum">
              {[5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60].map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </label>
        </div>
        <Button onClick={createSession} disabled={creating}>{creating ? "Quiz wordt gemaakt..." : buttonLabel}</Button>
      </>
    );
  }

  // Alleen potjes die echt zijn afgerond tellen mee (zie de server-route) —
  // dus bij een reis die nog nooit een quiz heeft uitgespeeld is deze lijst
  // gewoon leeg.
  function renderStats() {
    if (stats === null) return <div className="text-sm text-gray-400 py-4 text-center">Laden...</div>;
    if (!stats.length) return <div className="text-sm text-gray-400 py-4 text-center">Nog geen afgeronde potjes.</div>;
    return (
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm divide-y divide-gray-50 overflow-hidden text-left">
        <div className="flex items-center justify-between px-4 py-2 text-xs text-gray-400">
          <span>Speler</span>
          <span className="flex gap-4"><span className="w-16 text-right">Totaal</span><span className="w-14 text-right">Potjes</span><span className="w-16 text-right">Gem.</span></span>
        </div>
        {stats.map((s) => (
          <div key={s.userId} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="font-medium text-gray-700">{s.name}</span>
            <span className="flex gap-4 tnum">
              <span className="w-16 text-right font-semibold text-gray-700">{s.totalScore}</span>
              <span className="w-14 text-right text-gray-400">{s.gamesPlayed}</span>
              <span className="w-16 text-right text-gray-400">{s.avgScore}</span>
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-center py-14 max-w-sm mx-auto">
        <Icon name="sparkle" size={38} strokeWidth={1.2} className="mx-auto mb-3 text-sky-400" />
        <h3 className="font-display text-[21px] text-gray-800 mb-2">Fotoquiz</h3>
        <p className="text-sm text-gray-500 leading-relaxed mb-5">
          Foto's uit deze reis, elk met vier antwoorden. Start een sessie en laat anderen meespelen via een QR-code — met tussenstand en een winnaar aan het eind.
        </p>
        {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg mb-4">{error}</div>}
        {renderQuizSettings("Start een fotoquiz")}
        <div className="mt-5">
          <button type="button" onClick={toggleStats} className="text-xs text-gray-400 hover:text-sky-600 transition-colors">
            {showStats ? "Verberg topscores" : "Topscores bekijken"}
          </button>
          {showStats && <div className="mt-3">{renderStats()}</div>}
        </div>
      </div>
    );
  }

  const phase = live?.phase || (session.status === "lobby" ? "lobby" : session.status === "done" ? "done" : null);
  const participants = live?.participants || [];
  const totalQuestions = live?.totalQuestions || session.totalQuestions;

  // Alleen de gastheer kan de quiz voor iedereen beëindigen, en alleen zolang
  // hij nog loopt — eenmaal "done" is er niets meer te stoppen.
  const stopControl = session.isHost && phase !== "done" && (
    <div className="max-w-md mx-auto mb-3 text-right">
      <button type="button" onClick={stopSession} disabled={stopping}
        className="text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50">
        {stopping ? "Bezig..." : "Quiz stoppen"}
      </button>
    </div>
  );

  // Neemt voorrang op de eigenlijke fase, ongeacht of de server intussen al
  // bij de eerste vraag is — dit is puur een lokale, eenmalige vertraging
  // vóór de eerste vraag verschijnt.
  if (openingScreenActive) {
    return (
      <>
      {stopControl}
      <QuizOpeningScreen />
      </>
    );
  }

  // Tien tellen voordat de eerste vraag komt. Zonder die pauze stond vraag één
  // er al terwijl de halve tafel nog naar zijn telefoon zocht — en die vraag
  // telt net zo zwaar als de rest.
  if (phase === "intro") {
    const nog = live?.remainingSeconds ?? QUIZ_INTRO_TELLER;
    return (
      <>
      {stopControl}
      <div className="max-w-md mx-auto text-center py-10">
        <div className="text-sm font-semibold uppercase tracking-[0.14em] text-gray-400 mb-6">Maak je klaar</div>
        <div key={nog} className="rp-aftellen font-display tabular-nums text-gray-800 mx-auto" style={{ fontSize: 96, lineHeight: 1 }}>
          {nog}
        </div>
        <p className="text-sm text-gray-500 mt-6">
          {totalQuestions} vragen · {live?.questionSeconds ?? "?"} seconden per vraag
        </p>
        <p className="text-xs text-gray-400 mt-1">Hoe sneller je antwoordt, hoe meer punten.</p>
      </div>
      </>
    );
  }

  if (phase === "lobby") {
    const count = participants.length || session.participantCount || 0;
    return (
      <>
      {stopControl}
      <div className="text-center py-10 max-w-sm mx-auto">
        <Icon name="sparkle" size={38} strokeWidth={1.2} className="mx-auto mb-3 text-sky-400" />
        <h3 className="font-display text-[21px] text-gray-800 mb-1">Wachten op spelers</h3>
        <p className="text-sm text-gray-500 mb-5">{count} deelnemer{count === 1 ? "" : "s"} klaar om te spelen</p>
        {session.isHost ? (
          <>
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm mb-4">
              <QrCode value={session.joinLink} />
              <p className="text-xs text-gray-400 mt-3 leading-relaxed">Scan om mee te doen op je eigen scherm.</p>
              <div className="flex gap-2 mt-2">
                <input readOnly value={session.joinLink} onClick={(e) => e.target.select()}
                  className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 bg-gray-50 focus:outline-none" />
                <Button variant="secondary" onClick={copyJoinLink} className="!text-xs !px-3 !py-1.5 shrink-0">
                  {linkCopied ? <><Icon name="check" size={13} className="mr-1" />Gekopieerd</> : "Kopiëren"}
                </Button>
              </div>
            </div>
            {participants.length > 0 && (
              <div className="flex flex-wrap gap-1.5 justify-center mb-5">
                {participants.map((p, i) => (
                  <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-sky-50 text-sky-700 font-medium">{p.name}</span>
                ))}
              </div>
            )}
            <Button onClick={startSession} disabled={starting}>{starting ? "Starten..." : "Start de quiz"}</Button>
          </>
        ) : (
          <div className="text-sm text-gray-400">Wacht tot de gastheer de quiz start...</div>
        )}
      </div>
      </>
    );
  }

  if (phase === "question" && live?.question) {
    const q = live.question;
    const isTextMode = q.type === "text";
    const isBlurMode = q.mode === "blur";

    if (doublerScreenActive) {
      return (
        <>
        {stopControl}
        <QuizDoublerScreen />
        </>
      );
    }

    // Vóór elke nieuwe vraag draait de foto-rol één keer tot stilstand op
    // deze foto — alleen bij de allereerste keer dat dit vraagnummer in beeld
    // komt, niet bij elke poll erna (anders zou hij bij elke verversing
    // opnieuw beginnen te draaien). De blur-variant en de tekstvraag (die
    // geen foto heeft) slaan het rad helemaal over: daar mag je vanaf het
    // begin al antwoorden.
    if (!isTextMode && !isBlurMode && revealedIndex !== live.currentIndex) {
      return (
        <>
        {stopControl}
        <div className="max-w-md mx-auto text-center">
          <div className="text-sm text-gray-500 mb-1">Vraag <span className="tnum font-semibold text-gray-700">{live.currentIndex + 1}</span> / {totalQuestions}</div>
          {q.doubler && <div className="inline-block mb-2 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">⚡ Dubbele punten!</div>}
          <div className="text-xs text-gray-400 mb-4">Waar hoort deze foto bij?</div>
          <PhotoWheel pool={photoPool} target={q} onDone={() => { playWheelLand(); setRevealedIndex(live.currentIndex); }} />
        </div>
        </>
      );
    }

    const answered = myPick || live.myAnswer;
    const resolved = answered && !answered.pending;

    // Loopt lineair van flink onscherp naar volledig scherp over de eerste
    // 75% van het antwoordvenster — als fractie van de ingestelde vraagduur,
    // dus ongeacht of een sessie 5 of 60 seconden per vraag heeft staan.
    const blurPx = (() => {
      if (!isBlurMode || !live.questionSeconds) return 0;
      const elapsedFraction = (live.questionSeconds - live.remainingSeconds) / live.questionSeconds;
      return Math.max(0, 18 * (1 - elapsedFraction / 0.75));
    })();
    return (
      <>
      {stopControl}
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-1 text-sm text-gray-500">
          <span>Vraag <span className="tnum font-semibold text-gray-700">{live.currentIndex + 1}</span> / {totalQuestions}</span>
          <span className="tnum font-bold text-2xl text-sky-600 leading-none">{live.remainingSeconds}s</span>
        </div>
        {q.doubler && <div className="mb-3"><span className="inline-block px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">⚡ Dubbele punten!</span></div>}
        <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-white">
          {isTextMode ? (
            <div className="px-5 pt-6 pb-2 text-center">
              <Icon name="bulb" size={30} strokeWidth={1.3} className="mx-auto mb-3 text-sky-400" />
              <div className="font-display text-lg text-gray-800 leading-snug">{q.question}</div>
            </div>
          ) : (
            <img src={q.thumb_url || q.url} alt=""
              className="w-full aspect-square object-cover"
              style={isBlurMode ? { filter: `blur(${blurPx}px)`, transition: "filter 1.5s linear" } : undefined} />
          )}
          <div className="p-4">
            {!isTextMode && <div className="text-sm font-semibold text-gray-800 mb-3">Waar hoort deze foto bij?</div>}
            <div className="space-y-2">
              {q.options.map((opt) => {
                const isPicked = answered && answered.choice === opt;
                const cls = !answered
                  ? "border-gray-200 hover:border-sky-300 hover:bg-sky-50 text-gray-700"
                  : isPicked
                    ? resolved
                      ? answered.correct ? "border-green-300 bg-green-50 text-green-700" : "border-red-300 bg-red-50 text-red-700"
                      : "border-sky-300 bg-sky-50 text-sky-700"
                    : "border-gray-100 text-gray-400";
                return (
                  <button key={opt} type="button" onClick={() => pick(opt)} disabled={!!answered}
                    className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${cls}`}>
                    {opt}
                    {resolved && isPicked && answered.correct && <Icon name="check" size={14} className="ml-1.5 inline text-green-600" />}
                  </button>
                );
              })}
            </div>
            <div className="text-xs text-gray-400 mt-3 text-center">
              {!answered
                ? (q.doubler ? "Kies snel — dubbele punten deze ronde!" : "Kies snel — hoe sneller, hoe meer punten")
                : resolved
                  ? answered.correct ? `Goed! +${answered.points} punten` : "Helaas, geen punten"
                  : "Antwoord verstuurd..."}
            </div>
          </div>
        </div>
      </div>
      </>
    );
  }

  // Korte "dit was het goede antwoord"-pauze ná elke vraag die geen
  // tussenstand-ronde is — alleen het antwoord, geen ranglijst (die komt
  // alleen elke vijfde vraag, zie showsLeaderboard vanuit de server).
  if (phase === "standings" && live && live.showsLeaderboard === false) {
    const q = live.question;
    const myAnswer = (myPick && myPick.index === live.currentIndex) ? myPick : live.myAnswer;
    return (
      <>
      {stopControl}
      <div className="max-w-md mx-auto">
        <div className="text-sm text-gray-500 mb-3 text-center">Vraag <span className="tnum font-semibold text-gray-700">{live.currentIndex + 1}</span> / {totalQuestions}</div>
        <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-white">
          {q?.type === "text" ? (
            <div className="px-5 pt-6 pb-2 text-center">
              <Icon name="bulb" size={30} strokeWidth={1.3} className="mx-auto mb-3 text-sky-400" />
              <div className="font-display text-lg text-gray-800 leading-snug">{q.question}</div>
            </div>
          ) : q ? (
            <img src={q.thumb_url || q.url} alt="" className="w-full aspect-square object-cover" />
          ) : null}
          <div className="p-4">
            {q?.options && (
              <div className="space-y-2 mb-3">
                {q.options.map((opt) => {
                  const isCorrect = opt === q.correct;
                  const isMine = myAnswer && myAnswer.choice === opt;
                  const cls = isCorrect
                    ? "border-green-300 bg-green-50 text-green-700"
                    : isMine ? "border-red-300 bg-red-50 text-red-700" : "border-gray-100 text-gray-400";
                  return (
                    <div key={opt} className={`px-4 py-2.5 rounded-xl border text-sm font-medium ${cls}`}>
                      {opt}
                      {isCorrect && <Icon name="check" size={14} className="ml-1.5 inline text-green-600" />}
                    </div>
                  );
                })}
              </div>
            )}
            {/* Wie had 'm goed. Dit is het moment waar het aan tafel om draait
                — je zag tot nu toe alleen of jíj het goed had. Op volgorde van
                antwoorden, dus wie het snelst was staat vooraan; dat is ook de
                volgorde waarin de punten zijn toegekend. */}
            <GoedeAntwoorders lijst={live.goedeAntwoorden} totaal={live.aantalGeantwoord} />
            <p className="text-xs text-gray-400 text-center mt-3">
              {q?.correct && <>Juiste antwoord: <span className="font-semibold text-gray-600">{q.correct}</span></>}
              {live.remainingSeconds != null && <> · volgende vraag over {live.remainingSeconds}s</>}
            </p>
          </div>
        </div>
      </div>
      </>
    );
  }

  if (phase === "standings" || phase === "done") {
    const sorted = [...participants].sort((a, b) => b.score - a.score);
    const top = sorted.length ? sorted[0].score : 0;
    const winners = sorted.filter((p) => p.score === top && top > 0);
    const isFinal = phase === "done";
    return (
      <>
      {stopControl}
      {isFinal && <PartyStreamers />}
      <div className="max-w-md mx-auto text-center">
        {isFinal ? (
          <>
            {/* De uitslag bouwt van onderaf op — zie de vertraging per rij
                hieronder — dus de winnaar hoort er pas te staan als de lijst
                daar is aangekomen. Anders lees je de afloop boven de opbouw en
                is de spanning weg voordat hij begint. */}
            <WinnaarOnthulling winners={winners} vertraging={sorted.length * 0.45} />
          </>
        ) : (
          <>
            <div className="text-sm text-gray-500 mb-1">Tussenstand</div>
            {live?.question?.correct && (
              <p className="text-xs text-gray-400 mb-3">
                Juiste antwoord: <span className="font-semibold text-gray-600">{live.question.correct}</span>
                {live.remainingSeconds != null && <> · volgende vraag over {live.remainingSeconds}s</>}
              </p>
            )}
            {/* Ook hier wie 'm goed had. Dit scherm komt elke vijfde vraag in
                plaats van de korte onthulling, en zonder dit rijtje waren dat
                precies de vragen waarbij niemand zag wie er goed zat — ook de
                laatste vraag, want die valt altijd op een tussenstand. */}
            <div className="mb-4">
              <GoedeAntwoorders lijst={live?.goedeAntwoorden} totaal={live?.aantalGeantwoord} />
            </div>
          </>
        )}
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm divide-y divide-gray-50 overflow-hidden">
          {/* Bouwt van onder (laatste plek) naar boven (koploper) op — vandaar
              de delay op basis van afstand tot de laatste rij, niet de eigen
              positie. */}
          {sorted.map((p, i) => (
            <div key={i} className={`rp-standings-row flex items-center justify-between px-4 py-2.5 text-sm ${p.isMe ? "bg-sky-50" : ""}`}
              style={{ animationDelay: `${(sorted.length - 1 - i) * (isFinal ? 0.45 : 0.3)}s` }}>
              <span className="flex items-center gap-2 font-medium text-gray-700">
                <span className="tnum text-gray-400 w-4">{i + 1}</span>
                {isFinal && i === 0 && p.score > 0 && <Icon name="sparkle" size={13} className="text-sky-500" />}
                {p.name}{p.isMe && <span className="text-xs text-gray-400"> (jij)</span>}
              </span>
              <AnimatedScore from={scoreSpinBaselineRef.current.get(p.id ?? p.name) ?? p.score} to={p.score} active={scoreSpinActive} />
            </div>
          ))}
        </div>
        {isFinal && session.isHost && (
          <div className="mt-5">
            {showNewQuizForm
              ? renderQuizSettings("Start nieuwe quiz")
              : <Button onClick={() => setShowNewQuizForm(true)}>Nieuwe quiz starten</Button>}
          </div>
        )}
        {isFinal && (
          <div className="mt-5">
            <button type="button" onClick={toggleStats} className="text-xs text-gray-400 hover:text-sky-600 transition-colors">
              {showStats ? "Verberg topscores" : "Topscores bekijken"}
            </button>
            {showStats && <div className="mt-3">{renderStats()}</div>}
          </div>
        )}
      </div>
      </>
    );
  }

  return <div className="text-center py-16 text-gray-400">Laden...</div>;
}
