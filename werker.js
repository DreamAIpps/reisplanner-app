// Het werkproces: alles wat te lang duurt om een verzoek op te laten wachten.
//
// Draait als een eigen proces, niet als een stuk van de webserver. Dat is het
// hele punt: pdfkit rekent synchroon, dus een fotoboek van twintig pagina's
// houdt de event loop waar hij op draait acht seconden bezet. In de webserver
// betekent dat acht seconden stilstand voor iedereen; hier betekent het acht
// seconden een druk werkproces, en blijft de app antwoorden.
//
// Twee manieren om hem te draaien:
//
//   - Standaard start server.js hem zelf op als kindproces. Eén Railway-dienst,
//     geen extra configuratie, en toch een eigen event loop.
//   - Met WERKER=uit start de server hem niet, en draai je "node werker.js" als
//     losse dienst. Dan kun je hem apart opschalen. Let op: zonder objectopslag
//     kan dat niet, want dan komt het bestand op de schijf van de werker te
//     staan en kan de webserver er niet bij — daar waarschuwt hij hieronder over.
require("dotenv").config();
const fs = require("fs");
const os = require("os");
const path = require("path");
const { query, pool } = require("./db");
const taken = require("./taken");
const opslag = require("./opslag");
const { bouwFotoboekPdf } = require("./fotoboek-pdf");

const SOORTEN = ["fotoboek-pdf"];
// Hoe lang wachten als de rij leeg is. Kort genoeg dat een gebruiker niet merkt
// dat er gewacht werd, lang genoeg dat een stille app niet de hele dag de
// database staat te bevragen.
const RUSTPAUZE_MS = Number(process.env.WERKER_PAUZE_MS) || 1500;
// De hartslag laat zien dat deze taak nog leeft. Valt het proces om, dan blijft
// hij stilstaan en mag een ander de taak overnemen (zie taken.js).
const HARTSLAG_MS = 10000;

const werkmap = path.join(os.tmpdir(), "reisplanner-taken");

function log(...stukken) {
  console.log(`[werker ${process.pid}]`, ...stukken);
}

// ---------- De taken ----------

async function fotoboekPdf(taak) {
  const boekId = taak.invoer?.photobookId;
  if (!boekId) throw new Error("Geen fotoboek meegegeven");

  fs.mkdirSync(werkmap, { recursive: true });
  const pad = path.join(werkmap, `fotoboek-${taak.id}.pdf`);
  const doel = fs.createWriteStream(pad);

  let laatstGemeld = 0;
  const uitslag = await bouwFotoboekPdf(boekId, doel, {
    // Niet bij elke pagina naar de database: bij een boek van honderd pagina's
    // is dat honderd schrijfacties voor een balk die toch maar in procenten
    // beweegt. Elke procent is genoeg, en de hartslag gaat vanzelf mee.
    opVoortgang: async (deel) => {
      if (deel - laatstGemeld < 0.01 && deel < 1) return;
      laatstGemeld = deel;
      await taken.meldVoortgang(taak.id, deel);
    },
  });

  const maat = fs.statSync(pad).size;
  log(`fotoboek ${boekId}: ${uitslag.paginas} pagina's, ${(maat / 1e6).toFixed(1)} MB`);

  // Naar de objectopslag als die er is. Dan kan de webserver het bestand ook
  // vinden als de werker ergens anders draait, en gaan de bytes rechtstreeks
  // naar de browser in plaats van via de app.
  if (opslag.actief()) {
    const sleutel = `taken/${taak.id}/${uitslag.bestandsnaam}`;
    await opslag.bewaarStroom(sleutel, pad, maat, "application/pdf");
    fs.unlink(pad, () => {});
    return { ...uitslag, sleutel, mediaType: "application/pdf", bytes: maat };
  }
  return { ...uitslag, pad, mediaType: "application/pdf", bytes: maat };
}

const UITVOERDERS = {
  "fotoboek-pdf": fotoboekPdf,
};

// ---------- De lus ----------

let stoppen = false;

async function doeEen() {
  const taak = await taken.pakVolgende(SOORTEN);
  if (!taak) return false;

  log(`taak ${taak.id} (${taak.soort}), poging ${taak.pogingen}`);
  const hart = setInterval(() => { taken.klopHart(taak.id).catch(() => {}); }, HARTSLAG_MS);
  try {
    const uitslag = await UITVOERDERS[taak.soort](taak);
    await taken.meldKlaar(taak.id, uitslag);
    log(`taak ${taak.id} klaar`);
  } catch (err) {
    const na = await taken.meldMislukt(taak.id, err?.message || String(err));
    log(`taak ${taak.id} mislukt (${na?.status}): ${err?.message || err}`);
  } finally {
    clearInterval(hart);
  }
  return true;
}

async function lus() {
  log(`begonnen, luistert op ${SOORTEN.join(", ")}`);
  if (!opslag.actief() && process.env.WERKER === "uit") {
    console.warn("[werker] Let op: geen objectopslag ingesteld. Als dit proces niet op dezelfde machine draait als de webserver, kan die de gemaakte bestanden niet vinden.");
  }
  while (!stoppen) {
    let deed = false;
    try {
      deed = await doeEen();
    } catch (err) {
      // Een fout hier gaat over de wachtrij zelf (database weg), niet over een
      // taak. Even wachten en opnieuw, in plaats van omvallen en de hele
      // wachtrij stil laten liggen.
      console.error("[werker] wachtrij niet bereikbaar:", err?.message || err);
      await pauze(5000);
    }
    if (!deed && !stoppen) await pauze(RUSTPAUZE_MS);
  }
  log("gestopt");
  await pool.end().catch(() => {});
}

function pauze(ms) {
  return new Promise((klaar) => setTimeout(klaar, ms));
}

// Netjes afsluiten: de lopende taak nog afmaken, geen nieuwe meer pakken. Doet
// de webserver bij een uitrol ook, en anders blijft er een taak op 'bezig'
// staan tot de hartslag verlopen is.
for (const sein of ["SIGTERM", "SIGINT"]) {
  process.on(sein, () => { log(`${sein} ontvangen, nog even afmaken`); stoppen = true; });
}
process.on("message", (bericht) => {
  if (bericht === "stop") { stoppen = true; }
});

// Oude werkbestanden opruimen bij het opstarten: als dit proces eerder is
// omgevallen staan er halve PDF's in de tijdelijke map die niemand meer ophaalt.
function ruimOudeBestandenOp() {
  try {
    if (!fs.existsSync(werkmap)) return;
    const grens = Date.now() - 24 * 60 * 60 * 1000;
    for (const naam of fs.readdirSync(werkmap)) {
      const p = path.join(werkmap, naam);
      if (fs.statSync(p).mtimeMs < grens) fs.unlinkSync(p);
    }
  } catch (err) {
    console.error("[werker] oude bestanden opruimen mislukt:", err.message);
  }
}

if (require.main === module) {
  ruimOudeBestandenOp();
  lus().catch((err) => {
    console.error("[werker] onherstelbaar:", err);
    process.exit(1);
  });
}

module.exports = { doeEen, UITVOERDERS, werkmap };
