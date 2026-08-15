// ---------- Spelletjes voor onderweg ----------
//
// Snake en Pong. Voor de derde file bij het inchecken, de tweede uur in de auto,
// de trein die stilstaat. Allebei zonder internet te hoeven hebben en zonder
// uitleg: iedereen boven de dertig kent ze, en iedereen eronder heeft ze binnen
// tien seconden door.
//
// Alles draait in de browser; de server bewaart alleen ieders beste score per
// reis. Dat is waar het om gaat op een gedeelde reis — niet het spelen zelf
// maar de ranglijst aan tafel.
//
// Beide spellen delen dezelfde afspraken, want los van elkaar gaan die altijd
// uit elkaar lopen:
//   * één <canvas>, geschaald op devicePixelRatio zodat het niet wazig is;
//   * de spelstand in een ref en niet in state — bij zestig beeldjes per
//     seconde is elke setState een hertekening van de hele React-boom;
//   * requestAnimationFrame met een vaste stap, zodat het op een trage telefoon
//     even snel gaat als op een laptop;
//   * pauzeren zodra het tabblad naar de achtergrond gaat, anders sta je dood
//     zodra je terugkomt.

const SPEL_INFO = {
  snake: { naam: "Snake", uitleg: "Eet de appels, raak jezelf of de rand niet.", icon: "leaf" },
  pong: { naam: "Pong", uitleg: "Wedstrijd tot acht punten. Elke tien ballen een niveau hoger.", icon: "ball" },
};

// Hoe hard het canvas mag worden ingezoomd. Zonder bovengrens tekent een
// telefoon met een driedubbele pixelratio een canvas van bijna tien keer het
// aantal beeldpunten — mooi, maar het scheelt merkbaar in de soepelheid.
const MAX_PIXELRATIO = 2;

// Eén canvas dat zich aanpast aan zijn vak, met de tekenlaag in echte pixels.
// Geeft een ref naar het element terug plus de logische maat waarop de spellen
// rekenen.
//
// Met een verhouding volgt de hoogte uit de breedte — dat past bij Snake, dat
// gewoon in de pagina staat. Zonder verhouding (null) neemt het canvas het hele
// vak over, breedte én hoogte; dat is wat een volschermspel nodig heeft, waar
// juist de beschikbare hoogte bepaalt hoe groot het veld mag worden.
function useCanvas(verhouding) {
  const canvasRef = useRef(null);
  const [maat, setMaat] = useState({ breedte: 0, hoogte: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const meet = () => {
      const vak = canvas.parentElement;
      if (!vak) return;
      const breedte = Math.max(160, Math.floor(vak.clientWidth));
      const hoogte = verhouding ? Math.round(breedte / verhouding) : Math.max(160, Math.floor(vak.clientHeight));
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXELRATIO);
      canvas.width = Math.round(breedte * ratio);
      canvas.height = Math.round(hoogte * ratio);
      canvas.style.width = breedte + "px";
      canvas.style.height = hoogte + "px";
      const ctx = canvas.getContext("2d");
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      setMaat({ breedte, hoogte });
    };
    meet();
    const waarnemer = new ResizeObserver(meet);
    if (canvas.parentElement) waarnemer.observe(canvas.parentElement);
    return () => waarnemer.disconnect();
  }, [verhouding]);

  return { canvasRef, maat };
}

// Een lus met een vaste stap. De callback krijgt hoeveel seconden er verstreken
// zijn, altijd hetzelfde getal, zodat de snelheid niet afhangt van hoe snel het
// apparaat is. Springt de klok een gat (tabblad even weg), dan wordt dat gat
// weggegooid in plaats van in één klap ingehaald.
function useSpelLus(actief, stapSeconden, stap) {
  const stapRef = useRef(stap);
  stapRef.current = stap;

  useEffect(() => {
    if (!actief) return;
    let bezig = true;
    let vorige = performance.now();
    let opgespaard = 0;
    let handvat = requestAnimationFrame(function tik(nu) {
      if (!bezig) return;
      const verstreken = Math.min((nu - vorige) / 1000, 0.25);
      vorige = nu;
      opgespaard += verstreken;
      let veiligheid = 0;
      while (opgespaard >= stapSeconden && veiligheid++ < 5) {
        opgespaard -= stapSeconden;
        stapRef.current(stapSeconden);
      }
      handvat = requestAnimationFrame(tik);
    });
    return () => { bezig = false; cancelAnimationFrame(handvat); };
  }, [actief, stapSeconden]);
}

// Terug naar de lijst zodra de app naar de achtergrond gaat. Anders speelt het
// spel vrolijk door terwijl je een berichtje beantwoordt en ben je bij
// terugkomst af.
function usePauzeerBijWegklikken(onPauze) {
  const ref = useRef(onPauze);
  ref.current = onPauze;
  useEffect(() => {
    const h = () => { if (document.hidden) ref.current(); };
    document.addEventListener("visibilitychange", h);
    window.addEventListener("blur", h);
    return () => {
      document.removeEventListener("visibilitychange", h);
      window.removeEventListener("blur", h);
    };
  }, []);
}

// ---------- Het tabblad ----------
function SpelletjesTab({ trip, currentUserId }) {
  const [spel, setSpel] = useState(null);
  const [ranglijsten, setRanglijsten] = useState(null);
  const [fout, setFout] = useState(null);

  const laad = useCallback(async () => {
    try { setRanglijsten((await api.getSpelScores(trip.id)).ranglijsten); }
    catch (err) { setFout(err.message || "De ranglijst laden is niet gelukt"); }
  }, [trip.id]);
  useEffect(() => { laad(); }, [laad]);

  // Wat jij op dit moment als beste hebt staan — nodig om "persoonlijk record"
  // te kunnen zeggen zonder de server daar een oordeel over te laten vellen.
  const mijnBeste = (welk) =>
    (ranglijsten?.[welk] || []).find((r) => r.userId === currentUserId)?.score ?? 0;

  async function meldScore(welk, score) {
    try {
      await api.slaSpelScoreOp(trip.id, welk, score);
      await laad();
    } catch (err) { toonMelding(err.message || "De score opslaan is niet gelukt"); }
  }

  if (spel) {
    const Spel = spel === "snake" ? SnakeSpel : PongSpel;
    return (
      <Spel trip={trip} beste={mijnBeste(spel)} onKlaar={(score) => meldScore(spel, score)}
        onSluiten={() => { setSpel(null); laad(); }} />
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <header>
        <h2 className="font-display text-[22px] text-gray-800 leading-snug">Spelletjes</h2>
        <p className="text-sm text-gray-500 mt-1">
          Voor in de rij, in de auto of op het vliegveld. Je beste score blijft staan, dus je kunt
          elkaar de hele reis blijven inhalen.
        </p>
      </header>

      {fout && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{fout}</div>}

      {Object.entries(SPEL_INFO).map(([sleutel, info]) => (
        <section key={sleutel} className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <span className="shrink-0 w-11 h-11 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center">
              <Icon name={info.icon} size={19} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-[19px] text-gray-800">{info.naam}</h3>
              <p className="text-sm text-gray-500">{info.uitleg}</p>
            </div>
            <Button onClick={() => setSpel(sleutel)} className="shrink-0">Spelen</Button>
          </div>
          <Ranglijst rijen={ranglijsten?.[sleutel]} currentUserId={currentUserId} />
        </section>
      ))}
    </div>
  );
}

function Ranglijst({ rijen, currentUserId }) {
  if (!rijen) return null;
  if (rijen.length === 0) {
    return <div className="mt-3 pt-3 border-t border-gray-100 text-sm text-gray-400">Nog niemand heeft gespeeld.</div>;
  }
  return (
    <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
      {rijen.slice(0, 5).map((r, i) => (
        <div key={r.userId}
          className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ${r.userId === currentUserId ? "bg-sky-50" : ""}`}>
          <span className="w-5 text-gray-400 tnum">{i + 1}</span>
          <span className="flex-1 min-w-0 truncate text-gray-700">
            {r.userId === currentUserId ? "jij" : r.naam}
          </span>
          <span className="font-semibold text-gray-800 tnum">{r.score}</span>
        </div>
      ))}
    </div>
  );
}

// Kop met de score, het record en een knop terug — hetzelfde boven beide
// spellen, zodat je bij het wisselen niet hoeft te zoeken.
function SpelKop({ titel, score, beste, onSluiten }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <button type="button" onClick={onSluiten}
        className="rp-press shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors"
        aria-label="Terug naar de spelletjes">
        <Icon name="arrowLeft" size={18} />
      </button>
      <h2 className="font-display text-[20px] text-gray-800 flex-1 min-w-0 truncate">{titel}</h2>
      <div className="text-right shrink-0">
        <div className="font-display text-[22px] text-gray-800 leading-none tnum">{score}</div>
        <div className="text-[10px] uppercase tracking-[0.1em] text-gray-400 mt-0.5 tnum">record {beste}</div>
      </div>
    </div>
  );
}

// Het scherm dat over het spel valt als je af bent of nog moet beginnen.
function SpelOverlay({ titel, uitleg, knop, onKnop }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center"
      style={{ background: "rgba(47,42,40,0.62)" }}>
      <div className="font-display text-[24px] text-white leading-snug">{titel}</div>
      {uitleg && <div className="text-sm text-white/80 max-w-xs leading-relaxed">{uitleg}</div>}
      <Button onClick={onKnop} className="mt-1">{knop}</Button>
    </div>
  );
}

// ---------- Snake ----------
const SNAKE_VAKJES = 17;          // even genoeg voor een spel, klein genoeg om te zien op een telefoon
const SNAKE_START_TEMPO = 0.16;   // seconden per stap
const SNAKE_MIN_TEMPO = 0.055;    // sneller dan dit wordt het onspeelbaar op touch
const SNAKE_VERSNELLING = 0.004;  // per appel

function SnakeSpel({ beste, onKlaar, onSluiten }) {
  const { canvasRef, maat } = useCanvas(1);
  const [score, setScore] = useState(0);
  const [staat, setStaat] = useState("klaar");   // klaar | speelt | af
  const [tempo, setTempo] = useState(SNAKE_START_TEMPO);
  const spel = useRef(null);

  const begin = useCallback(() => {
    const midden = Math.floor(SNAKE_VAKJES / 2);
    spel.current = {
      slang: [{ x: midden, y: midden }, { x: midden - 1, y: midden }, { x: midden - 2, y: midden }],
      richting: { x: 1, y: 0 },
      // Los van `richting`: draai je twee keer binnen één stap, dan zou je
      // zonder deze wachtrij in jezelf kunnen keren. Nu telt alleen de eerste
      // draai van deze stap, en de tweede is voor de volgende.
      volgende: { x: 1, y: 0 },
      appel: { x: midden + 4, y: midden },
      gegeten: 0,
    };
    setScore(0);
    setTempo(SNAKE_START_TEMPO);
    setStaat("speelt");
  }, []);

  const draai = useCallback((dx, dy) => {
    const s = spel.current;
    if (!s) return;
    // Rechtsomkeert kan niet: dan rijd je meteen je eigen nek in.
    if (s.richting.x === -dx && s.richting.y === -dy) return;
    s.volgende = { x: dx, y: dy };
  }, []);

  function nieuweAppel(slang) {
    const vrij = [];
    for (let y = 0; y < SNAKE_VAKJES; y++) {
      for (let x = 0; x < SNAKE_VAKJES; x++) {
        if (!slang.some((d) => d.x === x && d.y === y)) vrij.push({ x, y });
      }
    }
    // Geen vrij vakje meer betekent dat het bord vol is: dan is het uitgespeeld.
    return vrij.length ? vrij[Math.floor(Math.random() * vrij.length)] : null;
  }

  useSpelLus(staat === "speelt", tempo, () => {
    const s = spel.current;
    if (!s) return;
    s.richting = s.volgende;
    const kop = { x: s.slang[0].x + s.richting.x, y: s.slang[0].y + s.richting.y };

    const tegenDeRand = kop.x < 0 || kop.y < 0 || kop.x >= SNAKE_VAKJES || kop.y >= SNAKE_VAKJES;
    // De staartpunt schuift deze stap weg, dus daar mag je wél op landen —
    // anders ben je af terwijl er ruimte was.
    const inZichzelf = s.slang.slice(0, -1).some((d) => d.x === kop.x && d.y === kop.y);
    if (tegenDeRand || inZichzelf) { setStaat("af"); return; }

    s.slang.unshift(kop);
    if (s.appel && kop.x === s.appel.x && kop.y === s.appel.y) {
      s.gegeten++;
      setScore(s.gegeten);
      s.appel = nieuweAppel(s.slang);
      setTempo((t) => Math.max(SNAKE_MIN_TEMPO, t - SNAKE_VERSNELLING));
      if (!s.appel) setStaat("af");   // bord vol: knap staaltje
    } else {
      s.slang.pop();
    }
  });

  // Tekenen gebeurt elk beeldje, los van de spelstappen: zo blijft het beeld
  // vloeiend ook als er maar zes stappen per seconde zijn.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !maat.breedte) return;
    let bezig = true;
    const ctx = canvas.getContext("2d");
    const vak = maat.breedte / SNAKE_VAKJES;

    (function teken() {
      if (!bezig) return;
      ctx.fillStyle = "#1F2A24";
      ctx.fillRect(0, 0, maat.breedte, maat.hoogte);
      // Zwak raster, zoals het scherm van een oude telefoon.
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 1;
      for (let i = 1; i < SNAKE_VAKJES; i++) {
        ctx.beginPath(); ctx.moveTo(i * vak, 0); ctx.lineTo(i * vak, maat.hoogte); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * vak); ctx.lineTo(maat.breedte, i * vak); ctx.stroke();
      }
      const s = spel.current;
      if (s) {
        if (s.appel) {
          ctx.fillStyle = PALETTE.coral;
          ctx.beginPath();
          ctx.arc((s.appel.x + 0.5) * vak, (s.appel.y + 0.5) * vak, vak * 0.32, 0, Math.PI * 2);
          ctx.fill();
        }
        s.slang.forEach((d, i) => {
          ctx.fillStyle = i === 0 ? "#EAF6EE" : PALETTE.success;
          const rand = vak * 0.12;
          ctx.fillRect(d.x * vak + rand, d.y * vak + rand, vak - rand * 2, vak - rand * 2);
        });
      }
      requestAnimationFrame(teken);
    })();
    return () => { bezig = false; };
  }, [canvasRef, maat.breedte, maat.hoogte]);

  // Toetsenbord voor wie op een laptop zit.
  useEffect(() => {
    const h = (e) => {
      const kaart = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
      const d = kaart[e.key];
      if (!d) return;
      e.preventDefault();
      draai(d[0], d[1]);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [draai]);

  // Vegen over het speelveld. Een korte veeg volstaat; de richting met de
  // grootste uitslag wint, zodat een schuine haal niet allebei tegelijk doet.
  const veegStart = useRef(null);
  function veegBegin(e) { const t = e.touches[0]; veegStart.current = { x: t.clientX, y: t.clientY }; }
  function veegEind(e) {
    const start = veegStart.current;
    if (!start) return;
    veegStart.current = null;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x, dy = t.clientY - start.y;
    if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
    if (Math.abs(dx) > Math.abs(dy)) draai(Math.sign(dx), 0);
    else draai(0, Math.sign(dy));
  }

  const gemeld = useRef(false);
  useEffect(() => {
    if (staat !== "af" || gemeld.current) return;
    gemeld.current = true;
    if (score > 0) onKlaar(score);
  }, [staat, score, onKlaar]);
  useEffect(() => { if (staat === "speelt") gemeld.current = false; }, [staat]);

  usePauzeerBijWegklikken(() => setStaat((s) => (s === "speelt" ? "af" : s)));

  return (
    <div className="max-w-md mx-auto">
      <SpelKop titel="Snake" score={score} beste={beste} onSluiten={onSluiten} />
      <div className="relative rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-gray-900"
        onTouchStart={veegBegin} onTouchEnd={veegEind} style={{ touchAction: "none" }}>
        <canvas ref={canvasRef} className="block w-full" />
        {staat === "klaar" && (
          <SpelOverlay titel="Snake" uitleg="Veeg of gebruik de knoppen hieronder. Raak de rand niet, en jezelf ook niet."
            knop="Beginnen" onKnop={begin} />
        )}
        {staat === "af" && (
          <SpelOverlay titel={`${score} ${score === 1 ? "appel" : "appels"}`}
            uitleg={score > beste ? "Je eigen record verbroken." : `Je record staat op ${beste}.`}
            knop="Nog een keer" onKnop={begin} />
        )}
      </div>
      <Richtingknoppen onDraai={draai} />
    </div>
  );
}

// Vier knoppen als kruis. Op een telefoon veeg je, maar in een hobbelende auto
// is een knop die op zijn plek blijft een stuk prettiger — en op een laptop
// zonder aanraakscherm zijn ze de enige alternatief voor de pijltjestoetsen.
function Richtingknoppen({ onDraai }) {
  // justify-items-center: zonder dat plakt elke knop tegen de linkerkant van
  // zijn vak en staat het kruis scheef — links en rechts liggen dan niet even
  // ver van het midden.
  //
  // Er is geen pijl-omlaag in de iconenset, dus dat is de pijl omhoog een halve
  // slag gedraaid. De draai zit op het icoon en niet op een omhulsel, anders
  // draait het aanraakvlak mee en zit de knop net naast waar hij lijkt.
  const knop = (label, dx, dy, icoon, gedraaid) => (
    <button type="button" aria-label={label}
      onPointerDown={(e) => { e.preventDefault(); onDraai(dx, dy); }}
      className="rp-press w-14 h-14 rounded-2xl bg-white border border-gray-200 text-gray-600 flex items-center justify-center hover:border-gray-300 transition-colors"
      style={{ touchAction: "none" }}>
      <Icon name={icoon} size={20} className={gedraaid ? "rotate-180" : ""} />
    </button>
  );
  return (
    <div className="mt-4 grid grid-cols-3 gap-2 justify-items-center w-[13.5rem] mx-auto">
      <div />{knop("Omhoog", 0, -1, "arrowUp")}<div />
      {knop("Naar links", -1, 0, "arrowLeft")}
      <div />
      {knop("Naar rechts", 1, 0, "arrowRight")}
      <div />
      {knop("Omlaag", 0, 1, "arrowUp", true)}
      <div />
    </div>
  );
}

// ---------- Pong ----------
//
// Volledig scherm, en niet omdat het mooier is: op een telefoon van vier duim
// hoog was het veld zo klein dat de bal een stip was. En met een veld dat tot
// onderaan doorloopt ligt je vinger precies op de plek waar je moet kijken.
// Vandaar de veegstrook onder het veld — je stuurt daar, en het veld blijft
// vrij.
//
// Het is een wedstrijd tot acht punten. Mis je de bal, dan is dat een punt voor
// de tegenstander en niet meteen het einde — zo krijg je de kans terug te komen,
// en heeft "tot acht" pas betekenis. Elke tien ballen die je terugslaat ga je
// een niveau hoger: de bal wordt sneller en de tegenstander mikt nauwkeuriger.
// Je score is het aantal punten dat je maakte, acht als je wint.
const PONG_PEDDEL_BREED = 0.24;    // fractie van de breedte — iets ruimer dan de eerste versie
const PONG_PEDDEL_DIK = 0.02;
// De twee lijnen waarop de bal stuitert. Ook wat er getekend wordt gaat hierop
// af: eerst stond de peddel een paar procent lager dan de lijn waar de bal
// omkeerde, en dan zie je hem afketsen op niets.
const PONG_SPELER_LIJN = 1 - PONG_PEDDEL_DIK - 0.04;
const PONG_TEGEN_LIJN = PONG_PEDDEL_DIK + 0.04;
// Het eerste balletje was met 0.62 te snel om te leren waar je moet staan, maar
// 0.34 bleek weer aan de trage kant. Hier ligt hij tussenin; de snelheid komt er
// per niveau bij.
const PONG_START_SNELHEID = 0.42;
const PONG_PER_NIVEAU = 0.05;
const PONG_MAX_SNELHEID = 1.5;
// De tegenstander begint traag genoeg om te verslaan en wordt per niveau iets
// scherper, maar nooit onfeilbaar — anders is er na niveau vijf geen doorkomen
// meer aan.
const PONG_TEGEN_BASIS = 0.34;
const PONG_TEGEN_PER_NIVEAU = 0.045;
const PONG_TEGEN_MAX = 0.95;
// En dit is wat hem verslaanbaar maakt. Alleen aan zijn snelheid draaien werkt
// niet: bij een trage bal haalt hij hem altijd, en dan is er nooit een bal te
// winnen — gemeten, nul keer in vijfentwintig seconden. Daarom mikt hij per bal
// een stukje naast, en dat stukje wordt met elk niveau kleiner. Rond niveau
// tien staat hij er gewoon.
// Hoe vaak de tegenstander een bal weggeeft, als kans per bal.
//
// Eerst was dit een mikafwijking: hij richtte een willekeurig stukje naast, en
// hoe groot dat stukje mocht zijn nam per niveau af. Dat rekent slecht. De
// peddel is 0.24 breed, dus hij mist pas als de afwijking groter is dan 0.14 —
// en met een afwijking van hooguit 0.13 vanaf niveau vier gebeurde dat nooit
// meer. Gemeten liep een partij dan vast op 4–0: hij gaf niets meer weg en een
// speler die zelf niet mist komt in een rally zonder einde terecht.
//
// Als kans is het meteen af te lezen en te sturen. Er blijft een bodem onder,
// anders is de wedstrijd vanaf een bepaald niveau niet meer te winnen.
const PONG_MISKANS_BASIS = 0.20;
const PONG_MISKANS_PER_NIVEAU = 0.02;
const PONG_MISKANS_BODEM = 0.06;
// De wedstrijd is uit bij acht punten, voor wie ze het eerst heeft.
const PONG_WINSTPUNTEN = 8;
const PONG_SERVEER_SECONDEN = 1.2;   // adempauze vóór elke bal
const PONG_FEEST_SECONDEN = 1.9;     // hoe lang de felicitatie blijft staan
// Eerst ging je alleen omhoog als je een bal van de tegenstander won. Dat duurde
// te lang: zolang je alleen maar heen en weer slaat gebeurt er niets. Nu telt
// elke bal die je terugslaat mee, en na tien ervan ga je een niveau hoger. Een
// gewonnen bal is nog steeds een niveau waard — dat is de prestatie.
const PONG_BALLEN_PER_NIVEAU = 10;

const pongSnelheid = (niveau) => Math.min(PONG_MAX_SNELHEID, PONG_START_SNELHEID + (niveau - 1) * PONG_PER_NIVEAU);
const pongTegenstander = (niveau) => Math.min(PONG_TEGEN_MAX, PONG_TEGEN_BASIS + (niveau - 1) * PONG_TEGEN_PER_NIVEAU);
const pongMiskans = (niveau) =>
  Math.max(PONG_MISKANS_BODEM, PONG_MISKANS_BASIS - (niveau - 1) * PONG_MISKANS_PER_NIVEAU);

// Waar hij op mikt voor de bal die nu omhoog komt. Mist hij deze, dan zet hij
// zich net buiten bereik neer; anders mikt hij goed, met een klein beetje
// speling zodat het geen machine wordt.
function pongMikpunt(niveau) {
  if (Math.random() < pongMiskans(niveau)) {
    const kant = Math.random() < 0.5 ? -1 : 1;
    return kant * (PONG_PEDDEL_BREED / 2 + 0.06 + Math.random() * 0.12);
  }
  return (Math.random() * 2 - 1) * 0.03;
}

function PongSpel({ beste, onKlaar, onSluiten }) {
  const { canvasRef, maat } = useCanvas(null);
  const [niveau, setNiveau] = useState(1);
  // De stand. Jouw punten zijn ook je score: bij een wedstrijd tot acht is dat
  // het enige getal dat iets zegt — hoe ver je kwam voordat hij er acht had.
  const [punten, setPunten] = useState({ jij: 0, tegen: 0 });
  // Hoe vaak je de bal hebt teruggeslagen. Bepaalt het niveau.
  const [gespeeld, setGespeeld] = useState(0);
  // klaar → serveren → speelt → (punt | tegenpunt) → serveren → … → af
  const [staat, setStaat] = useState("klaar");
  const spel = useRef(null);

  const zetKlaar = useCallback((welkNiveau) => {
    // Recht naar beneden met een klein zijwaarts zetje, zodat de eerste bal te
    // halen is zonder dat hij saai recht blijft.
    const snelheid = pongSnelheid(welkNiveau);
    const zijwaarts = (Math.random() < 0.5 ? -1 : 1) * snelheid * 0.35;
    spel.current = {
      bal: { x: 0.5, y: 0.42, vx: zijwaarts, vy: Math.sqrt(Math.max(0.01, snelheid * snelheid - zijwaarts * zijwaarts)) },
      speler: spel.current?.speler ?? 0.5,
      computer: 0.5,
      gespeeld: spel.current?.gespeeld ?? 0,
      niveau: welkNiveau,
      snelheid,
      tegenTempo: pongTegenstander(welkNiveau),
      // Per bal opnieuw geloot, zodat hij niet elke keer dezelfde kant op mist.
      mikfout: 0,
      // De lus draait nog een paar stappen door nadat hierboven setStaat is
      // aangeroepen — state werkt pas bij de volgende render. Zonder deze vlag
      // vuurde "bal gewonnen" twee of drie keer af en sprong het niveau van 1
      // naar 3 naar 5.
      afgelopen: false,
    };
    setStaat("serveren");
  }, []);

  // Het niveau volgt rechtstreeks uit het aantal gespeelde ballen: elke tien
  // erbij is er één hoger. Geen optelling die ergens anders ook nog eens
  // gebeurt — daar kwam de sprong van 1 naar 3 naar 5 vandaan.
  //
  // De echte stand staat in de ref en niet in state. Een setState-updater mag
  // React meer dan eens aanroepen, en dat is precies de verkeerde plek om de
  // bal te versnellen: dan gebeurt dat twee keer.
  const stelNiveauBij = useCallback(() => {
    const s = spel.current;
    if (!s) return;
    const nieuw = 1 + Math.floor(s.gespeeld / PONG_BALLEN_PER_NIVEAU);
    if (nieuw === s.niveau) return;
    s.niveau = nieuw;
    // Midden in een rally versnellen, niet pas bij de volgende serveer — anders
    // merk je van een nieuw niveau niets. Richting blijft, alleen de lengte van
    // de snelheidsvector verandert.
    const nieuweSnelheid = pongSnelheid(nieuw);
    const huidig = Math.hypot(s.bal.vx, s.bal.vy) || 1;
    s.bal.vx *= nieuweSnelheid / huidig;
    s.bal.vy *= nieuweSnelheid / huidig;
    s.snelheid = nieuweSnelheid;
    s.tegenTempo = pongTegenstander(nieuw);
    setNiveau(nieuw);
  }, []);

  const begin = useCallback(() => {
    setNiveau(1);
    setPunten({ jij: 0, tegen: 0 });
    setGespeeld(0);
    spel.current = null;
    zetKlaar(1);
  }, [zetKlaar]);

  // De adempauze vóór een bal, en het feestje erna. Allebei gewoon een klok:
  // het spel staat zolang stil.
  useEffect(() => {
    if (staat !== "serveren") return;
    const t = setTimeout(() => setStaat("speelt"), PONG_SERVEER_SECONDEN * 1000);
    return () => clearTimeout(t);
  }, [staat]);
  useEffect(() => {
    if (staat !== "punt" && staat !== "tegenpunt") return;
    const uit = punten.jij >= PONG_WINSTPUNTEN || punten.tegen >= PONG_WINSTPUNTEN;
    const t = setTimeout(() => (uit ? setStaat("af") : zetKlaar(niveau)), PONG_FEEST_SECONDEN * 1000);
    return () => clearTimeout(t);
  }, [staat, niveau, punten, zetKlaar]);

  // Alles in fracties van 0 tot 1, zodat het spel niets van de schermgrootte
  // hoeft te weten en op elk formaat hetzelfde speelt.
  useSpelLus(staat === "speelt", 1 / 120, (dt) => {
    const s = spel.current;
    if (!s || s.afgelopen) return;
    s.bal.x += s.bal.vx * dt;
    s.bal.y += s.bal.vy * dt;

    if (s.bal.x < 0.02) { s.bal.x = 0.02; s.bal.vx = Math.abs(s.bal.vx); }
    if (s.bal.x > 0.98) { s.bal.x = 0.98; s.bal.vx = -Math.abs(s.bal.vx); }

    // De tegenstander stuurt bij met een maximumsnelheid; daardoor is hij te
    // verslaan met een scherpe hoek in plaats van onfeilbaar.
    const doel = s.bal.vy < 0 ? s.bal.x + s.mikfout : 0.5;
    s.computer += Math.max(-s.tegenTempo * dt, Math.min(s.tegenTempo * dt, doel - s.computer));
    s.computer = Math.max(PONG_PEDDEL_BREED / 2, Math.min(1 - PONG_PEDDEL_BREED / 2, s.computer));

    const raakt = (peddelX) => Math.abs(s.bal.x - peddelX) < PONG_PEDDEL_BREED / 2 + 0.02;
    const spelerLijn = PONG_SPELER_LIJN;
    const computerLijn = PONG_TEGEN_LIJN;

    if (s.bal.vy > 0 && s.bal.y >= spelerLijn) {
      if (raakt(s.speler)) {
        s.bal.y = spelerLijn;
        // Waar op de peddel je hem raakt bepaalt de hoek — anders is het na
        // twintig keer dezelfde beweging.
        const plek = (s.bal.x - s.speler) / (PONG_PEDDEL_BREED / 2);
        s.bal.vx = plek * s.snelheid * 0.7;
        s.bal.vy = -Math.sqrt(Math.max(0.04, s.snelheid * s.snelheid - s.bal.vx * s.bal.vx));
        // Nieuwe bal omhoog, dus opnieuw loten of hij hem deze keer laat gaan.
        s.mikfout = pongMikpunt(s.niveau);
        s.gespeeld++;
        setGespeeld(s.gespeeld);
        stelNiveauBij();
      } else if (s.bal.y > 1.05) {
        s.afgelopen = true;
        setPunten((p) => ({ ...p, tegen: p.tegen + 1 }));
        setStaat("tegenpunt");
      }
    }
    if (s.bal.vy < 0 && s.bal.y <= computerLijn) {
      if (raakt(s.computer)) {
        s.bal.y = computerLijn;
        const plek = (s.bal.x - s.computer) / (PONG_PEDDEL_BREED / 2);
        s.bal.vx = plek * s.snelheid * 0.7;
        s.bal.vy = Math.sqrt(Math.max(0.04, s.snelheid * s.snelheid - s.bal.vx * s.bal.vx));
      } else if (s.bal.y < -0.05) {
        // Punt: dit is het moment waar het spel om draait.
        s.afgelopen = true;
        setPunten((p) => ({ ...p, jij: p.jij + 1 }));
        setStaat("punt");
      }
    }
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !maat.breedte) return;
    let bezig = true;
    const ctx = canvas.getContext("2d");

    (function teken() {
      if (!bezig) return;
      const B = maat.breedte, H = maat.hoogte;
      ctx.fillStyle = "#1B2430";
      ctx.fillRect(0, 0, B, H);
      ctx.strokeStyle = "rgba(255,255,255,0.13)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]);
      ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(B, H / 2); ctx.stroke();
      ctx.setLineDash([]);

      const s = spel.current;
      if (s) {
        const pb = PONG_PEDDEL_BREED * B, pd = PONG_PEDDEL_DIK * H;
        const peddel = (midden, y, kleur) => {
          ctx.fillStyle = kleur;
          ctx.beginPath();
          ctx.roundRect(midden * B - pb / 2, y, pb, pd, pd / 2);
          ctx.fill();
        };
        peddel(s.computer, PONG_TEGEN_LIJN * H - pd, "rgba(255,255,255,0.45)");
        peddel(s.speler, PONG_SPELER_LIJN * H, PALETTE.info);
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.arc(s.bal.x * B, s.bal.y * H, Math.max(6, Math.min(B, H) * 0.016), 0, Math.PI * 2);
        ctx.fill();
      }
      requestAnimationFrame(teken);
    })();
    return () => { bezig = false; };
  }, [canvasRef, maat.breedte, maat.hoogte]);

  // Slepen mag overal binnen het bedieningsvlak: op het veld én in de strook
  // eronder. De peddel volgt alleen de horizontale plek van je vinger, dus waar
  // je hem precies neerzet maakt niet uit.
  const stuurRef = useRef(null);
  function stuur(clientX) {
    const s = spel.current;
    const vak = stuurRef.current;
    if (!s || !vak) return;
    const r = vak.getBoundingClientRect();
    const x = (clientX - r.left) / r.width;
    s.speler = Math.max(PONG_PEDDEL_BREED / 2, Math.min(1 - PONG_PEDDEL_BREED / 2, x));
  }

  useEffect(() => {
    const h = (e) => {
      const stap = e.key === "ArrowLeft" ? -0.06 : e.key === "ArrowRight" ? 0.06 : 0;
      if (!stap) return;
      e.preventDefault();
      const s = spel.current;
      if (!s) return;
      s.speler = Math.max(PONG_PEDDEL_BREED / 2, Math.min(1 - PONG_PEDDEL_BREED / 2, s.speler + stap));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const gemeld = useRef(false);
  useEffect(() => {
    if (staat !== "af" || gemeld.current) return;
    gemeld.current = true;
    onKlaar(punten.jij);
  }, [staat, punten.jij, onKlaar]);
  useEffect(() => { if (staat === "speelt") gemeld.current = false; }, [staat]);

  usePauzeerBijWegklikken(() => setStaat((s) => (s === "speelt" ? "af" : s)));

  return (
    <SpelVolscherm onSluiten={onSluiten}
      titel="Pong"
      links={`Niveau ${niveau} · nog ${PONG_BALLEN_PER_NIVEAU - (gespeeld % PONG_BALLEN_PER_NIVEAU)} ballen`}
      rechts={<span className="tnum"><b className="text-gray-800">{punten.jij}</b> – {punten.tegen} <span className="text-gray-400">tot {PONG_WINSTPUNTEN}</span></span>}>
      <div ref={stuurRef} className="flex-1 min-h-0 flex flex-col"
        style={{ touchAction: "none" }}
        onTouchStart={(e) => stuur(e.touches[0].clientX)}
        onTouchMove={(e) => stuur(e.touches[0].clientX)}
        onPointerMove={(e) => { if (e.pointerType === "mouse") stuur(e.clientX); }}>
        <div className="relative flex-1 min-h-0 rounded-2xl overflow-hidden bg-gray-900">
          <canvas ref={canvasRef} className="block" />
          {staat === "klaar" && (
            <SpelOverlay titel="Pong"
              uitleg={`Wie het eerst ${PONG_WINSTPUNTEN} punten heeft, wint. Beweeg met je vinger in de balk onderaan; elke ${PONG_BALLEN_PER_NIVEAU} ballen ga je een niveau hoger en wordt hij sneller én scherper.`}
              knop="Beginnen" onKnop={begin} />
          )}
          {staat === "serveren" && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="rp-rise font-display text-[30px] text-white/90">Niveau {niveau}</div>
            </div>
          )}
          {(staat === "punt" || staat === "tegenpunt") && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center"
              style={{ background: "rgba(47,42,40,0.62)" }}>
              <div className="rp-rise font-display text-[30px] text-white leading-snug">
                {staat === "punt" ? "Punt voor jou!" : "Punt voor de tegenstander"}
              </div>
              <div className="text-lg text-white/90 tnum">{punten.jij} – {punten.tegen}</div>
              {staat === "punt" && punten.jij === PONG_WINSTPUNTEN - 1 && punten.tegen < PONG_WINSTPUNTEN - 1 && (
                <div className="text-sm text-white/85">Nog één en je hebt hem.</div>
              )}
            </div>
          )}
          {staat === "af" && (
            <SpelOverlay
              titel={punten.jij >= PONG_WINSTPUNTEN
                ? `Gewonnen! ${punten.jij} – ${punten.tegen}`
                : `Verloren, ${punten.jij} – ${punten.tegen}`}
              uitleg={[
                `Je kwam tot niveau ${niveau}.`,
                punten.jij > beste ? "Je eigen record verbroken." : `Je record staat op ${beste}.`,
              ].join(" ")}
              knop="Nog een keer" onKnop={begin} />
          )}
        </div>

        {/* De veegstrook. Hij hoort bij hetzelfde bedieningsvlak als het veld,
            dus sturen kan hier én daar — maar hier zit je vinger niet in de weg. */}
        <div className="shrink-0 mt-2 rounded-2xl border border-dashed border-gray-200 bg-white/70 flex items-center justify-center select-none"
          style={{ height: "clamp(4.5rem, 16vh, 8rem)" }}>
          <span className="text-xs text-gray-400 flex items-center gap-2">
            <Icon name="arrowLeft" size={14} />Beweeg hier met je vinger<Icon name="arrowRight" size={14} />
          </span>
        </div>
      </div>
    </SpelVolscherm>
  );
}

// Een spel over het hele scherm: kop bovenaan, de rest is speelveld. Bewust
// niet de scrollende volschermschil van de fotoquiz — hier mag juist niets
// schuiven, anders scrol je de pagina weg terwijl je stuurt.
function SpelVolscherm({ titel, links, rechts, onSluiten, children }) {
  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[60] bg-gray-50 flex flex-col"
      style={{
        paddingTop: "calc(0.5rem + env(safe-area-inset-top))",
        paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))",
      }}>
      <div className="shrink-0 flex items-center gap-3 px-3 pb-2">
        <button type="button" onClick={onSluiten} aria-label="Spel sluiten"
          className="rp-press shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors">
          <Icon name="close" size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[18px] text-gray-800 leading-none truncate">{titel}</div>
          {links && <div className="text-[11px] uppercase tracking-[0.1em] text-gray-400 mt-1">{links}</div>}
        </div>
        {rechts && <div className="shrink-0 text-xs text-gray-500 tnum">{rechts}</div>}
      </div>
      <div className="flex-1 min-h-0 flex flex-col px-3 pb-1">{children}</div>
    </div>,
    document.body
  );
}
