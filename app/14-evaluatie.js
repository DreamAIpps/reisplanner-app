// ---------- Evaluatie aan het eind van de reis ----------
//
// Twee dingen die bij elkaar horen: je eigen top vijf van de mooiste foto's, en
// vijf vragen over wat het leukste was. Iedereen die bij de reis mag vult zijn
// eigen versie in.
//
// Eén keuze die het hele scherm bepaalt: de uitslag verschijnt pas als je zelf
// klaar bent. Zie je eerst wat de rest vond, dan vul je niet meer in wat jíj
// vond — en dan is de uitslag een echo in plaats van een optelsom. De server
// stuurt hem daarom ook niet mee zolang je nog niets hebt ingediend; het is dus
// geen kwestie van iets verbergen dat er al is.

// Hoeveel punten een plek waard is. Plek 1 telt vijf punten, plek 5 er één —
// zo wint een foto die bij twee mensen bovenaan staat het van een foto die bij
// vijf mensen vijfde staat. Zelfde regel als op de server; die telt echt.
const EVAL_TOP = 5;

function EvaluatieTab({ trip, readOnly, currentUserId, onRefresh }) {
  // Zelf ophalen in plaats van doorgereikt krijgen: dit tabblad is het enige
  // dat álle foto's van de reis tegelijk nodig heeft, en het wordt zelden
  // geopend. Ze meeslepen door TripDetail zou elke andere tab belasten met een
  // lijst die daar niets doet.
  const [photos, setPhotos] = useState([]);
  const [data, setData] = useState(null);
  const [fout, setFout] = useState(null);
  const [antwoorden, setAntwoorden] = useState({});
  const [top, setTop] = useState([]);          // rij van photoId's, plek 1 vooraan
  const [bezig, setBezig] = useState(false);
  const [zieUitslag, setZieUitslag] = useState(false);

  const laden = useCallback(async () => {
    try {
      const d = await api.getEvaluatie(trip.id);
      setData(d);
      setAntwoorden(d.mijn.antwoorden || {});
      setTop((d.mijn.top || []).sort((a, b) => a.positie - b.positie).map((r) => r.photoId));
      setZieUitslag(!!d.mijn.ingediendOp);
    } catch (err) { setFout(err.message || "Evaluatie laden is niet gelukt"); }
  }, [trip.id]);
  useEffect(() => { laden(); }, [laden]);
  useEffect(() => {
    let vervallen = false;
    api.getPhotos(trip.id)
      .then((r) => { if (!vervallen) setPhotos(asList(r)); })
      .catch(() => {});
    return () => { vervallen = true; };
  }, [trip.id]);

  async function opslaan() {
    setBezig(true); setFout(null);
    try {
      const uit = await api.slaEvaluatieOp(trip.id, { antwoorden, top });
      setData((d) => ({ ...d, uitslag: uit.uitslag, mijn: { ...d.mijn, ingediendOp: d.mijn.ingediendOp || new Date().toISOString() } }));
      setZieUitslag(true);
      onRefresh?.();
    } catch (err) { setFout(err.message || "Opslaan is niet gelukt"); }
    finally { setBezig(false); }
  }

  function wisselFoto(id) {
    setTop((rij) => {
      if (rij.includes(id)) return rij.filter((x) => x !== id);
      if (rij.length >= EVAL_TOP) return rij;   // vol; eerst iets weghalen
      return [...rij, id];
    });
  }

  if (fout && !data) return <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{fout}</div>;
  if (!data) return <div className="text-center py-16 text-gray-400">Laden...</div>;

  const fotoOpId = new Map((photos || []).map((p) => [p.id, p]));
  const ingediend = !!data.mijn.ingediendOp;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <header>
        <h2 className="font-display text-[22px] text-gray-800 leading-snug">Hoe was de reis?</h2>
        <p className="text-sm text-gray-500 mt-1">
          {readOnly
            ? "Kies je vijf mooiste foto's. Als je klaar bent zie je wat de anderen vonden."
            : "Kies je vijf mooiste foto's en beantwoord vijf vragen. Als je klaar bent zie je wat de anderen vonden."}
        </p>
        {ingediend && (
          <p className="text-xs text-gray-400 mt-2">
            Je hebt dit al ingevuld — aanpassen mag, je nieuwe antwoorden vervangen de oude.
          </p>
        )}
      </header>

      {fout && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{fout}</div>}

      <>
        <FotoTopKiezer photos={photos || []} top={top} onWissel={wisselFoto} onLeeg={() => setTop([])} />
        {/* De vijf vragen alleen voor wie mee is geweest: "het fijnste hotel"
            kun je niet beantwoorden als je er niet geslapen hebt. De foto's zijn
            wél voor iedereen — die heeft een meekijker allemaal langs zien komen
            en daar heeft hij net zo goed een mening over. */}
        {data.magVragenBeantwoorden !== false && (
          <VragenLijst vragen={data.vragen} antwoorden={antwoorden} maxTeken={data.maxTeken}
            onWijzig={(sleutel, tekst) => setAntwoorden((a) => ({ ...a, [sleutel]: tekst }))} />
        )}

          <div className="flex items-center gap-3 flex-wrap">
            <Button onClick={opslaan} disabled={bezig}>
              {bezig ? "Opslaan…" : ingediend ? "Antwoorden bijwerken" : "Klaar — laat de uitslag zien"}
            </Button>
            <span className="text-xs text-gray-400">
              {top.length} van de {EVAL_TOP} foto's gekozen
              {data.aantalLeden > 1 && ` · ${data.uitslag?.aantalIngediend ?? 0} van de ${data.aantalLeden} hebben ingevuld`}
            </span>
          </div>
      </>

      {(zieUitslag || readOnly) && data.uitslag && (
        <Uitslag uitslag={data.uitslag} fotoOpId={fotoOpId} currentUserId={currentUserId} />
      )}
    </div>
  );
}

// Alle foto's van de reis, met een tik om ze in je top vijf te zetten. Het
// nummer op de foto is de plek: dat is de enige manier om te zien dat de
// volgorde meetelt zonder het ergens uit te hoeven leggen.
function FotoTopKiezer({ photos, top, onWissel, onLeeg }) {
  const vol = top.length >= EVAL_TOP;
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h3 className="font-display text-[18px] text-gray-800">De mooiste foto's</h3>
        {top.length > 0 && (
          <button type="button" onClick={onLeeg} className="text-xs text-gray-400 hover:text-gray-600">
            Begin opnieuw
          </button>
        )}
      </div>
      <p className="text-sm text-gray-500">
        Tik vijf foto's aan, in volgorde: de eerste die je kiest is je nummer één.
      </p>

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
              <button key={p.id} type="button" onClick={() => onWissel(p.id)} disabled={geblokkeerd}
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
    </section>
  );
}

function VragenLijst({ vragen, antwoorden, maxTeken, onWijzig }) {
  return (
    <section className="space-y-3">
      <h3 className="font-display text-[18px] text-gray-800">Vijf vragen</h3>
      <div className="space-y-3">
        {vragen.map((v) => (
          <Field key={v.sleutel} label={v.vraag}>
            <Input value={antwoorden[v.sleutel] || ""} maxLength={maxTeken}
              onChange={(e) => onWijzig(v.sleutel, e.target.value)}
              placeholder="Laat leeg als je geen voorkeur hebt" />
          </Field>
        ))}
      </div>
    </section>
  );
}

function Uitslag({ uitslag, fotoOpId, currentUserId }) {
  const podium = uitslag.fotos.slice(0, EVAL_TOP);
  return (
    <section className="space-y-6 pt-2 border-t border-gray-100">
      <div>
        <h3 className="font-display text-[18px] text-gray-800 mb-1">De uitslag</h3>
        <p className="text-sm text-gray-500">
          {uitslag.aantalIngediend === 1
            ? "Jij bent voorlopig de enige die heeft ingevuld."
            : `Van ${uitslag.aantalIngediend} mensen bij elkaar.`}
        </p>
      </div>

      {podium.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400">Mooiste foto's</div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {podium.map((r, i) => {
              const foto = fotoOpId.get(r.photoId);
              return (
                <div key={r.photoId} className={i === 0 ? "col-span-2 sm:col-span-2" : ""}>
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
      )}

      <div className="space-y-4">
        {uitslag.vragen.map((v) => (
          <div key={v.sleutel}>
            <div className="text-sm font-semibold text-gray-700 mb-1.5">{v.vraag}</div>
            {v.antwoorden.length === 0 ? (
              <div className="text-sm text-gray-400">Nog niemand ingevuld.</div>
            ) : (
              <div className="space-y-1.5">
                {v.antwoorden.map((a, i) => (
                  <div key={i} className={`rounded-lg px-3 py-2 text-sm ${a.userId === currentUserId ? "bg-sky-50 border border-sky-100" : "bg-gray-50"}`}>
                    <span className="text-gray-700">{a.tekst}</span>
                    <span className="text-xs text-gray-400 ml-2">— {a.userId === currentUserId ? "jij" : a.naam}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
