// ---------- Evaluatie aan het eind van de reis ----------
//
// Twee losse onderdelen op één scherm, met opzet uit elkaar gehouden: je top
// vijf van de mooiste foto's, en vijf vragen over wat het leukste was. Ze
// hebben elk hun eigen knop, hun eigen "klaar"-moment en hun eigen uitslag. Wie
// alleen de foto's wil doen hoeft de vragen niet af te maken.
//
// Eén regel geldt voor allebei: de uitslag verschijnt pas als je dat onderdeel
// zelf hebt ingeleverd. Zie je eerst wat de rest vond, dan vul je niet meer in
// wat jíj vond, en dan is de uitslag een echo in plaats van een optelsom. De
// server stuurt hem daarom ook niet mee — het is dus geen kwestie van iets
// verbergen dat al op je scherm staat.

// Plek 1 telt vijf punten, plek 5 er één, zodat een foto die bij twee mensen
// bovenaan staat wint van een foto die bij vijf mensen vijfde staat. Zelfde
// regel als op de server; die telt echt.
const EVAL_TOP = 5;

// De lijst bij "de leukste plaats" moet dezelfde namen tonen als het dagboek:
// "Kyoto", niet "Gionmachi, Higashiyama, Kyoto 605-0862, Japan". De server kan
// dat niet: het opschonen gebeurt in de app, met geocodePlace, en die bewaart
// zijn antwoorden in localStorage. Dezelfde functie aanroepen betekent dus ook
// dezelfde cache — en dat is de enige manier om zeker te weten dat er in deze
// lijst hetzelfde staat als in het dagboek.
//
// Wat al kort is wordt overgeslagen: "Kyoto" is de plaatsnaam, daar valt niets
// op te zoeken. Dat scheelt oproepen naar een route waar een limiet op zit.
function moetOpgezocht(naam) {
  return naam.includes(",") || naam.trim().split(/\s+/).length > 2;
}

function useSchonePlaatsen(ruw) {
  const [lijst, setLijst] = useState(ruw);
  const [bezig, setBezig] = useState(false);
  const sleutel = ruw.join("|");

  useEffect(() => {
    const bronnen = sleutel ? sleutel.split("|") : [];
    if (!bronnen.some(moetOpgezocht)) { setLijst(bronnen); setBezig(false); return; }
    let vervallen = false;
    setBezig(true);
    (async () => {
      const uit = await Promise.all(bronnen.map(async (naam) => {
        if (!moetOpgezocht(naam)) return naam;
        try { return (await geocodePlace(naam))?.city || naam; } catch { return naam; }
      }));
      if (vervallen) return;
      // Opnieuw ontdubbelen: twee adressen in dezelfde stad worden na het
      // opschonen één regel, en dat is precies de bedoeling.
      setLijst([...new Set(uit.map((x) => String(x).trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "nl")));
      setBezig(false);
    })();
    return () => { vervallen = true; };
  }, [sleutel]);

  return { lijst, bezig };
}

function EvaluatieTab({ trip, readOnly, currentUserId }) {
  // Zelf ophalen in plaats van doorgereikt krijgen: dit tabblad is het enige
  // dat álle foto's van de reis tegelijk nodig heeft, en het wordt zelden
  // geopend.
  const [photos, setPhotos] = useState([]);
  const [data, setData] = useState(null);
  const [fout, setFout] = useState(null);

  const laden = useCallback(async () => {
    try { setData(await api.getEvaluatie(trip.id)); }
    catch (err) { setFout(err.message || "Evaluatie laden is niet gelukt"); }
  }, [trip.id]);
  useEffect(() => { laden(); }, [laden]);
  useEffect(() => {
    let vervallen = false;
    api.getPhotos(trip.id).then((r) => { if (!vervallen) setPhotos(asList(r)); }).catch(() => {});
    return () => { vervallen = true; };
  }, [trip.id]);

  if (fout && !data) return <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{fout}</div>;
  if (!data) return <div className="text-center py-16 text-gray-400">Laden...</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <h2 className="font-display text-[22px] text-gray-800 leading-snug">Hoe was de reis?</h2>
        <p className="text-sm text-gray-500 mt-1">
          Twee dingen, los van elkaar. Je kunt er ook maar één doen.
        </p>
      </header>

      <FotoStemmen trip={trip} data={data} photos={photos} onOpgeslagen={setData} />

      {data.magVragenBeantwoorden !== false ? (
        <VraagAntwoord trip={trip} data={data} currentUserId={currentUserId} onOpgeslagen={setData} />
      ) : (
        <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3.5 text-sm text-gray-500">
          De vijf vragen zijn voor wie mee is geweest — over het fijnste hotel valt weinig te
          zeggen als je er niet geslapen hebt.
        </div>
      )}
    </div>
  );
}

// ---------- Onderdeel 1: de mooiste foto's ----------
function FotoStemmen({ trip, data, photos, onOpgeslagen }) {
  const [top, setTop] = useState(() => (data.mijn.top || []).sort((a, b) => a.positie - b.positie).map((r) => r.photoId));
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState(null);
  const klaar = !!data.mijn.fotosOp;
  const vol = top.length >= EVAL_TOP;

  function wissel(id) {
    setTop((rij) => {
      if (rij.includes(id)) return rij.filter((x) => x !== id);
      if (rij.length >= EVAL_TOP) return rij;   // vol; eerst iets weghalen
      return [...rij, id];
    });
  }

  function zetIngeleverd(uit, gekozen) {
    onOpgeslagen((d) => ({
      ...d, uitslagFotos: uit.uitslagFotos, voortgang: uit.voortgang,
      mijn: {
        ...d.mijn,
        top: gekozen.map((id, i) => ({ photoId: id, positie: i + 1 })),
        fotosOp: d.mijn.fotosOp || new Date().toISOString(),
      },
    }));
  }

  async function opslaan() {
    setBezig(true); setFout(null);
    try {
      zetIngeleverd(await api.slaEvaluatieFotosOp(trip.id, top), top);
    } catch (err) { setFout(err.message || "Opslaan is niet gelukt"); }
    finally { setBezig(false); }
  }

  // Opnieuw beginnen. Heb je nog niets ingeleverd, dan is dit gewoon je
  // selectie leegmaken. Was je al klaar, dan gaat je stem ook echt weg en
  // verdwijnt de uitslag weer tot je opnieuw hebt gekozen — anders zou je met
  // de uitslag in je achterhoofd opnieuw stemmen.
  //
  // Geen bevestigingsvraag maar een balkje met "ongedaan maken", zoals overal
  // in de app: dat kost geen tik extra en helpt wél als je te snel was.
  async function opnieuw() {
    const vorige = top;
    setTop([]);
    if (!klaar) return;
    setBezig(true); setFout(null);
    try {
      const uit = await api.wisEvaluatieFotos(trip.id);
      onOpgeslagen((d) => ({
        ...d, uitslagFotos: null, voortgang: uit.voortgang,
        mijn: { ...d.mijn, top: [], fotosOp: null },
      }));
      toonMelding("Je top vijf is gewist", vorige.length ? {
        label: "Ongedaan maken",
        run: async () => {
          zetIngeleverd(await api.slaEvaluatieFotosOp(trip.id, vorige), vorige);
          setTop(vorige);
        },
      } : null);
    } catch (err) {
      setFout(err.message || "Wissen is niet gelukt");
      setTop(vorige);
    } finally { setBezig(false); }
  }

  const fotoOpId = new Map(photos.map((p) => [p.id, p]));

  return (
    <section className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4 sm:p-5 space-y-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display text-[19px] text-gray-800">De mooiste foto's</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Tik vijf foto's aan, in volgorde: de eerste die je kiest is je nummer één.
          </p>
        </div>
        {(top.length > 0 || klaar) && (
          <button type="button" onClick={opnieuw} disabled={bezig}
            className="ml-auto text-xs text-gray-400 hover:text-gray-600 shrink-0 disabled:opacity-50">
            {klaar ? "Wissen en opnieuw" : "Begin opnieuw"}
          </button>
        )}
      </div>

      {fout && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{fout}</div>}

      {photos.length === 0 ? (
        <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-6 text-center text-sm text-gray-400">
          Er zijn nog geen foto's in deze reis.
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {photos.map((p) => {
            const plek = top.indexOf(p.id);
            const gekozen = plek !== -1;
            // Zit je top vol, dan is een niet-gekozen foto niet meer aan te
            // tikken. Hem doorzichtig maken zegt dat zonder een melding.
            const geblokkeerd = vol && !gekozen;
            return (
              <button key={p.id} type="button" onClick={() => wissel(p.id)} disabled={geblokkeerd}
                aria-pressed={gekozen}
                aria-label={gekozen ? `Foto op plek ${plek + 1}, tik om weg te halen` : "Foto kiezen"}
                className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                  gekozen ? "border-sky-400 ring-2 ring-sky-100" : "border-transparent"
                } ${geblokkeerd ? "opacity-35 cursor-not-allowed" : "hover:opacity-90 active:scale-95"}`}>
                <img src={p.thumb_url || p.url} alt={p.caption || ""} loading="lazy" decoding="async"
                  className="w-full h-full object-cover" />
                {gekozen && (
                  <span className="absolute top-1.5 left-1.5 w-7 h-7 rounded-full bg-sky-500 text-white text-sm font-bold flex items-center justify-center shadow tnum">
                    {plek + 1}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={opslaan} disabled={bezig || photos.length === 0}>
          {bezig ? "Opslaan…" : klaar ? "Mijn top vijf bijwerken" : "Klaar — laat de uitslag zien"}
        </Button>
        <span className="text-xs text-gray-400">
          {top.length} van de {EVAL_TOP} gekozen
          {data.aantalLeden > 1 && ` · ${data.voortgang?.fotos ?? 0} van de ${data.aantalLeden} klaar`}
        </span>
      </div>

      {data.uitslagFotos && <FotoUitslag lijst={data.uitslagFotos} fotoOpId={fotoOpId} />}
    </section>
  );
}

function FotoUitslag({ lijst, fotoOpId }) {
  const podium = lijst.slice(0, EVAL_TOP);
  if (podium.length === 0) {
    return <div className="pt-3 border-t border-gray-100 text-sm text-gray-400">Nog niemand heeft foto's gekozen.</div>;
  }
  return (
    <div className="pt-4 border-t border-gray-100 space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400">De uitslag</div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {podium.map((r, i) => {
          const foto = fotoOpId.get(r.photoId);
          return (
            <div key={r.photoId} className={i === 0 ? "col-span-2" : ""}>
              <div className="relative rounded-xl overflow-hidden border border-gray-100 bg-gray-50" style={{ aspectRatio: i === 0 ? 1.4 : 1 }}>
                {foto ? (
                  <img src={foto.thumb_url || foto.url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">Foto weg</div>
                )}
                <span className="absolute top-1.5 left-1.5 w-7 h-7 rounded-full bg-white/95 text-gray-800 text-sm font-bold flex items-center justify-center shadow tnum">
                  {i + 1}
                </span>
              </div>
              <div className="text-[11px] text-gray-500 mt-1 tnum">
                {r.punten} {r.punten === 1 ? "punt" : "punten"} · {r.stemmen}× gekozen
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Onderdeel 2: de vijf vragen ----------
function VraagAntwoord({ trip, data, currentUserId, onOpgeslagen }) {
  const [antwoorden, setAntwoorden] = useState(data.mijn.antwoorden || {});
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState(null);
  const klaar = !!data.mijn.vragenOp;
  const ietsIngevuld = Object.values(antwoorden).some((x) => String(x || "").trim());

  // Alleen bij "de leukste plaats" worden de namen opgeschoond; de andere vier
  // lijsten zijn namen die je zelf hebt ingetikt (een hotel, een restaurant) en
  // daar valt niets aan te verbeteren.
  const { lijst: plaatsen, bezig: plaatsenBezig } = useSchonePlaatsen(data.keuzes?.plaats || []);
  const keuzeLijst = (sleutel) => (sleutel === "plaats" ? plaatsen : data.keuzes?.[sleutel] || []);

  function zetIngeleverd(uit, ingevuld) {
    onOpgeslagen((d) => ({
      ...d, uitslagVragen: uit.uitslagVragen, aantalVragenIngediend: uit.aantalVragenIngediend, voortgang: uit.voortgang,
      mijn: { ...d.mijn, antwoorden: ingevuld, vragenOp: d.mijn.vragenOp || new Date().toISOString() },
    }));
  }

  async function opslaan() {
    setBezig(true); setFout(null);
    try {
      zetIngeleverd(await api.slaEvaluatieVragenOp(trip.id, antwoorden), antwoorden);
    } catch (err) { setFout(err.message || "Opslaan is niet gelukt"); }
    finally { setBezig(false); }
  }

  // Zelfde afspraak als bij de foto's: nog niet ingeleverd is gewoon de velden
  // leegmaken, wél ingeleverd haalt je antwoorden ook echt weg en verbergt de
  // uitslag weer.
  async function opnieuw() {
    const vorige = antwoorden;
    setAntwoorden({});
    if (!klaar) return;
    setBezig(true); setFout(null);
    try {
      const uit = await api.wisEvaluatieVragen(trip.id);
      onOpgeslagen((d) => ({
        ...d, uitslagVragen: null, voortgang: uit.voortgang,
        mijn: { ...d.mijn, antwoorden: {}, vragenOp: null },
      }));
      toonMelding("Je antwoorden zijn gewist", {
        label: "Ongedaan maken",
        run: async () => {
          zetIngeleverd(await api.slaEvaluatieVragenOp(trip.id, vorige), vorige);
          setAntwoorden(vorige);
        },
      });
    } catch (err) {
      setFout(err.message || "Wissen is niet gelukt");
      setAntwoorden(vorige);
    } finally { setBezig(false); }
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4 sm:p-5 space-y-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display text-[19px] text-gray-800">Vijf vragen</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Kies uit wat er in de reis staat, of vul zelf iets in.
          </p>
        </div>
        {(ietsIngevuld || klaar) && (
          <button type="button" onClick={opnieuw} disabled={bezig}
            className="ml-auto text-xs text-gray-400 hover:text-gray-600 shrink-0 disabled:opacity-50">
            {klaar ? "Wissen en opnieuw" : "Begin opnieuw"}
          </button>
        )}
      </div>

      {fout && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{fout}</div>}

      <div className="space-y-3">
        {data.vragen.map((v) => (
          <KeuzeOfEigen key={v.sleutel} vraag={v} keuzes={keuzeLijst(v.sleutel)}
            bezig={v.sleutel === "plaats" && plaatsenBezig}
            waarde={antwoorden[v.sleutel] || ""} maxTeken={data.maxTeken}
            onWijzig={(tekst) => setAntwoorden((a) => ({ ...a, [v.sleutel]: tekst }))} />
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={opslaan} disabled={bezig}>
          {bezig ? "Opslaan…" : klaar ? "Mijn antwoorden bijwerken" : "Klaar — laat de antwoorden zien"}
        </Button>
        <span className="text-xs text-gray-400">
          {data.aantalLeden > 1 && `${data.voortgang?.vragen ?? 0} van de ${data.aantalLeden} klaar`}
        </span>
      </div>

      {data.uitslagVragen && <VragenUitslag vragen={data.uitslagVragen} currentUserId={currentUserId} />}
    </section>
  );
}

// Een keuzelijst uit de reis zelf, met altijd een uitweg. De lijst voorkomt dat
// "Ryokan Sakura" en "ryokan sakura" als twee antwoorden geteld worden; de
// uitweg voorkomt dat je iets niet kunt noemen omdat het nooit in de planning
// terechtkwam.
function KeuzeOfEigen({ vraag, keuzes, waarde, maxTeken, bezig, onWijzig }) {
  const staatInLijst = keuzes.includes(waarde);
  const [eigen, setEigen] = useState(!!waarde && !staatInLijst);

  // Bewust geen <Field>: die zet zijn label in kapitalen, en dat is prima voor
  // "DATUM" maar schreeuwerig voor een hele vraag.
  const label = <div className="text-sm font-semibold text-gray-700 mb-1.5">{vraag.vraag}</div>;

  // Zonder keuzes uit de reis heeft een lijst geen zin — dan meteen een veld.
  // Behalve als de lijst nog onderweg is: dan zou het veld er staan en een tel
  // later ineens omslaan in een keuzelijst, precies terwijl je aan het tikken
  // bent.
  if (keuzes.length === 0 && !bezig) {
    return (
      <label className="block">
        {label}
        <Input value={waarde} maxLength={maxTeken} onChange={(e) => onWijzig(e.target.value)}
          placeholder="Laat leeg als je geen voorkeur hebt" />
      </label>
    );
  }

  return (
    <div>
      {label}
      <div className="space-y-2">
        <Select
          value={eigen ? "__anders" : waarde}
          onChange={(e) => {
            if (e.target.value === "__anders") { setEigen(true); onWijzig(""); }
            else { setEigen(false); onWijzig(e.target.value); }
          }}>
          <option value="">{bezig ? "Plaatsnamen ophalen…" : "Geen voorkeur"}</option>
          {keuzes.map((k) => <option key={k} value={k}>{k}</option>)}
          <option value="__anders">Anders, namelijk…</option>
        </Select>
        {eigen && (
          <Input autoFocus value={waarde} maxLength={maxTeken} onChange={(e) => onWijzig(e.target.value)}
            placeholder="Schrijf het zelf op" />
        )}
      </div>
    </div>
  );
}

function VragenUitslag({ vragen, currentUserId }) {
  return (
    <div className="pt-4 border-t border-gray-100 space-y-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400">De antwoorden</div>
      {vragen.map((v) => (
        <div key={v.sleutel}>
          <div className="text-sm font-semibold text-gray-700 mb-1.5">{v.vraag}</div>
          {v.antwoorden.length === 0 ? (
            <div className="text-sm text-gray-400">Nog niemand ingevuld.</div>
          ) : (
            <div className="space-y-1.5">
              {/* Gelijke antwoorden bij elkaar: dat is de hele reden dat er een
                  keuzelijst is — zo zie je meteen waar iedereen het over eens was. */}
              {groepeerAntwoorden(v.antwoorden).map((groep, i) => (
                <div key={i} className={`rounded-lg px-3 py-2 text-sm ${groep.ikZitErbij ? "bg-sky-50 border border-sky-100" : "bg-gray-50"}`}>
                  <span className="text-gray-700">{groep.tekst}</span>
                  {groep.namen.length > 1 && (
                    <span className="ml-2 text-xs font-semibold text-sky-700">{groep.namen.length}×</span>
                  )}
                  <span className="text-xs text-gray-400 ml-2">
                    — {groep.namen.map((n) => (n.isMe ? "jij" : n.naam)).join(", ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  function groepeerAntwoorden(lijst) {
    const perTekst = new Map();
    for (const a of lijst) {
      const sleutel = a.tekst.trim().toLowerCase();
      if (!perTekst.has(sleutel)) perTekst.set(sleutel, { tekst: a.tekst, namen: [], ikZitErbij: false });
      const groep = perTekst.get(sleutel);
      const isMe = a.userId === currentUserId;
      groep.namen.push({ naam: a.naam, isMe });
      if (isMe) groep.ikZitErbij = true;
    }
    return [...perTekst.values()].sort((a, b) => b.namen.length - a.namen.length);
  }
}
