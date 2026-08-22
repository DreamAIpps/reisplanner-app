// De wachtrij: werk dat te lang duurt om een verzoek op te laten wachten.
//
// Dit bestand is de gedeelde taal tussen de webserver (die taken klaarzet en de
// stand opvraagt) en werker.js (die ze uitvoert). De uitvoering zelf staat er
// bewust niet in — die hoort bij de werker, en de webserver hoort dat werk
// juist nooit te doen.
//
// Waarom een tabel en niet een lijst in het geheugen: een taak moet een
// herstart overleven (een uitrol midden in een export van acht seconden is geen
// uitzondering), en er moeten meerdere werkers naast elkaar kunnen draaien
// zonder dat ze hetzelfde werk dubbel doen. Postgres kan dat allebei met
// FOR UPDATE SKIP LOCKED, en dat scheelt een Redis erbij.
const { query } = require("./db");

// Hoe lang een taak zonder hartslag mag stilstaan voordat een ander hem
// overneemt. Ruim boven de hartslag zelf (zie werker.js), anders pikt een
// tweede werker het werk af van eentje die gewoon even druk is.
const VASTGELOPEN_NA = "2 minutes";

// Klaar en mislukt blijven even staan zodat de client de uitslag nog kan
// ophalen, en daarna niet langer — anders groeit deze tabel net zo hard als de
// notificaties.
const BEWAAR_KLAAR = "6 hours";

// Zet een taak klaar. Staat er al eentje voor hetzelfde onderwerp te wachten of
// te draaien, dan komt die terug in plaats van een tweede: twee keer op
// "downloaden" drukken hoort niet twee keer hetzelfde boek te bouwen.
async function zetKlaar({ soort, sleutel = null, invoer = {}, gebruikerId = null, tripId = null }) {
  if (sleutel) {
    const { rows: bestaand } = await query(
      `SELECT * FROM taken WHERE soort = $1 AND sleutel = $2 AND status IN ('wachtend','bezig') LIMIT 1`,
      [soort, sleutel]
    );
    if (bestaand.length) return bestaand[0];
  }
  try {
    const { rows } = await query(
      `INSERT INTO taken (soort, sleutel, invoer, gebruiker_id, trip_id)
       VALUES ($1, $2, $3::jsonb, $4, $5) RETURNING *`,
      [soort, sleutel, JSON.stringify(invoer), gebruikerId, tripId]
    );
    return rows[0];
  } catch (err) {
    // Twee verzoeken tegelijk: de unieke index laat er één door. De ander
    // krijgt de taak die net is aangemaakt, en dat is precies wat hij wilde.
    if (err.code !== "23505" || !sleutel) throw err;
    const { rows } = await query(
      `SELECT * FROM taken WHERE soort = $1 AND sleutel = $2 AND status IN ('wachtend','bezig') LIMIT 1`,
      [soort, sleutel]
    );
    if (!rows.length) throw err;
    return rows[0];
  }
}

// Pak de volgende taak. SKIP LOCKED slaat over wat een andere werker op dit
// moment aan het pakken is, in plaats van erop te wachten — zo verdelen twee
// werkers het werk vanzelf en zonder afspraken.
//
// Vastgelopen taken (een werker die omviel) worden hier ook opgepakt: hun
// hartslag staat stil, dus ze tellen weer als beschikbaar.
async function pakVolgende(soorten) {
  const { rows } = await query(
    `UPDATE taken SET status = 'bezig', begonnen = COALESCE(begonnen, NOW()), hartslag = NOW(),
            pogingen = pogingen + 1
      WHERE id = (
        SELECT id FROM taken
         WHERE soort = ANY($1::text[])
           AND (status = 'wachtend'
                OR (status = 'bezig' AND hartslag < NOW() - INTERVAL '${VASTGELOPEN_NA}'))
         ORDER BY id
         FOR UPDATE SKIP LOCKED
         LIMIT 1
      )
      RETURNING *`,
    [soorten]
  );
  return rows[0] || null;
}

async function meldVoortgang(id, voortgang) {
  await query("UPDATE taken SET voortgang = $1, hartslag = NOW() WHERE id = $2", [Math.max(0, Math.min(1, voortgang)), id]);
}

async function klopHart(id) {
  await query("UPDATE taken SET hartslag = NOW() WHERE id = $1 AND status = 'bezig'", [id]);
}

async function meldKlaar(id, resultaat) {
  await query(
    `UPDATE taken SET status = 'klaar', voortgang = 1, resultaat = $2::jsonb, geeindigd = NOW(), fout = NULL
      WHERE id = $1`,
    [id, JSON.stringify(resultaat ?? {})]
  );
}

// Mislukt: nog een keer proberen zolang het er niet te veel worden. Een taak die
// structureel omvalt eindeloos herhalen kost alleen maar; drie keer is genoeg om
// een hapering te overleven en weinig genoeg om een echte fout te laten zien.
const MAX_POGINGEN = 3;
async function meldMislukt(id, fout) {
  const { rows } = await query(
    `UPDATE taken
        SET status = CASE WHEN pogingen >= $3 THEN 'mislukt' ELSE 'wachtend' END,
            fout = $2,
            geeindigd = CASE WHEN pogingen >= $3 THEN NOW() ELSE NULL END,
            hartslag = NULL
      WHERE id = $1
      RETURNING status, pogingen`,
    [id, String(fout).slice(0, 500), MAX_POGINGEN]
  );
  return rows[0] || null;
}

async function haal(id) {
  const { rows } = await query("SELECT * FROM taken WHERE id = $1", [id]);
  return rows[0] || null;
}

// Afgeronde taken opruimen. Draait mee met de opruimronde van de server.
async function ruimAfgerondeOp() {
  const { rows } = await query(
    `DELETE FROM taken
      WHERE geeindigd IS NOT NULL AND geeindigd < NOW() - INTERVAL '${BEWAAR_KLAAR}'
      RETURNING resultaat`
  );
  // De sleutels van de bestanden die erbij hoorden, zodat de aanroeper ze kan
  // laten opruimen — een PDF die niemand meer kan ophalen hoeft niet te blijven.
  return rows.map((r) => r.resultaat?.sleutel).filter(Boolean);
}

module.exports = {
  zetKlaar, pakVolgende, meldVoortgang, klopHart, meldKlaar, meldMislukt, haal, ruimAfgerondeOp,
  MAX_POGINGEN, VASTGELOPEN_NA,
};
