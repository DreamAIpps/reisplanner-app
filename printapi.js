// ---------- Koppeling met Print API (printapi.nl) ----------
// Voorlopig alleen prijsopgave: "wat kost het om dit fotoboek te laten
// drukken". Bestellen zit hier bewust nog niet in.
//
// LET OP — dit contract is niet tegen hun sandbox getest. De omgeving waarin
// dit geschreven is kan printapi.nl niet bereiken (het netwerkbeleid geeft 403
// op elk verzoek), dus de endpoints en veldnamen hieronder komen uit de
// documentatie zoals bekend en niet uit een geslaagde aanroep. Daarom staat
// alles wat per installatie kan verschillen in omgevingsvariabelen, zodat een
// afwijking recht te zetten is zonder deze code aan te passen:
//
//   PRINTAPI_BASE_URL            standaard https://test.printapi.nl/v2
//   PRINTAPI_CLIENT_ID           uit het Print API-portaal
//   PRINTAPI_CLIENT_SECRET       idem
//   PRINTAPI_PRODUCT_PORTRAIT    product-id voor een staand A4-boek
//   PRINTAPI_PRODUCT_LANDSCAPE   product-id voor een liggend A4-boek
//
// Zonder client-id/secret doet deze module niets en meldt de app netjes dat
// drukwerk niet is ingesteld — de rest van het fotoboek blijft gewoon werken.

const BASE_URL = (process.env.PRINTAPI_BASE_URL || "https://test.printapi.nl/v2").replace(/\/+$/, "");
const CLIENT_ID = process.env.PRINTAPI_CLIENT_ID || "";
const CLIENT_SECRET = process.env.PRINTAPI_CLIENT_SECRET || "";
const PRODUCT_PORTRAIT = process.env.PRINTAPI_PRODUCT_PORTRAIT || "";
const PRODUCT_LANDSCAPE = process.env.PRINTAPI_PRODUCT_LANDSCAPE || "";

function isConfigured() {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

function productIdFor(orientation) {
  return orientation === "landscape" ? PRODUCT_LANDSCAPE : PRODUCT_PORTRAIT;
}

// Het token is een uur geldig; opnieuw ophalen bij elke prijsopgave zou een
// extra ronde naar Print API zijn voor niets. Een marge van een minuut voorkomt
// dat we net een verlopen token meesturen.
let tokenCache = { value: null, expiresAt: 0 };

async function getAccessToken() {
  const now = Date.now();
  if (tokenCache.value && now < tokenCache.expiresAt) return tokenCache.value;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });
  const res = await fetch(`${BASE_URL}/oauth`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Print API gaf ${res.status} bij het ophalen van een token: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  if (!json.access_token) throw new Error("Print API gaf geen access_token terug");
  tokenCache = {
    value: json.access_token,
    expiresAt: now + Math.max(0, (Number(json.expires_in) || 3600) - 60) * 1000,
  };
  return tokenCache.value;
}

// Prijsopgave voor één fotoboek. Geeft een bedrag in euro terug, of gooit met
// een leesbare melding zodat de route dat kan doorgeven.
async function getQuote({ orientation, pageCount, quantity = 1, country = "NL" }) {
  if (!isConfigured()) throw new Error("Print API is niet ingesteld");
  const productId = productIdFor(orientation);
  if (!productId) {
    throw new Error(`Geen product-id ingesteld voor een ${orientation === "landscape" ? "liggend" : "staand"} boek`);
  }

  const token = await getAccessToken();
  const payload = {
    items: [{ productId, quantity, pageCount }],
    shipping: { address: { country } },
  };
  const res = await fetch(`${BASE_URL}/orders/quote`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Print API gaf ${res.status} bij de prijsopgave: ${text.slice(0, 300)}`);
  }
  const json = await res.json();

  // Print API kan het totaal op meerdere plekken zetten afhankelijk van de
  // versie; pak de eerste die er is in plaats van te vertrouwen op één vorm.
  const total = json?.payment?.total ?? json?.total ?? json?.price ?? null;
  return {
    productId,
    pageCount,
    quantity,
    country,
    total: total === null ? null : Number(total),
    currency: json?.payment?.currency || json?.currency || "EUR",
    raw: json,
  };
}

module.exports = { isConfigured, getQuote, productIdFor, BASE_URL };
