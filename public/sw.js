// Service worker: pushmeldingen én de offline-schil.
//
// Tot voor kort cachte deze service worker niets. Dat betekende dat de app op
// een vliegveld zonder wifi, in het vliegtuig of bij een weggevallen verbinding
// helemaal niet meer opende — je kreeg een leeg scherm, precies op het moment
// dat je je reisschema nodig hebt. Nu wordt de app-schil bij de installatie
// weggeschreven zodat de app altijd start, en worden de reisgegevens die je al
// eens hebt opgehaald bewaard zodat je ze onderweg kunt terugzien.
//
// VERSIE wordt door de server ingevuld met een hash van de daadwerkelijk
// uitgeleverde app (zie de /sw.js-route in server.js). Zo krijgt elke uitrol
// vanzelf een nieuwe cache en kan er geen oude versie blijven plakken — de
// klassieke service-worker-valkuil.
const VERSIE = "__ASSET_VERSIE__";
const SCHIL_CACHE = `rp-schil-${VERSIE}`;
const DATA_CACHE = `rp-data-${VERSIE}`;

// Alles wat nodig is om de app te laten stárten. Zonder deze bestanden is er
// geen scherm om ook maar een foutmelding op te tonen, dus die gaan er allemaal in.
const SCHIL = [
  "/",
  "/app.js",
  "/app.css",
  "/vendor/react.js",
  "/vendor/react-dom.js",
  "/vendor/leaflet.js",
  "/vendor/leaflet.css",
  "/vendor/purify.js",
  "/vendor/exif.js",
  "/vendor/qrcode.js",
  "/vendor/font-400.woff2",
  "/vendor/font-500.woff2",
  "/vendor/font-600.woff2",
  "/vendor/font-700.woff2",
  "/manifest.json",
  "/icon-192.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SCHIL_CACHE);
    // Per bestand, niet met addAll: die faalt in zijn geheel zodra één icoon
    // ontbreekt, en dan is er helemaal geen offline-schil.
    await Promise.all(SCHIL.map((url) =>
      cache.add(new Request(url, { cache: "reload" })).catch((err) =>
        console.warn("Service worker kon niet cachen:", url, err.message))));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Caches van vorige uitrollen opruimen.
    const namen = await caches.keys();
    await Promise.all(namen
      .filter((n) => (n.startsWith("rp-schil-") || n.startsWith("rp-data-")) && n !== SCHIL_CACHE && n !== DATA_CACHE)
      .map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

// Alleen GET onderscheppen. Een POST/PUT/DELETE hoort nooit uit een cache te
// komen, en offline mag die gewoon falen zodat de app het kan melden.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Bladeren naar een pagina: eerst het net op (dan zie je meteen een nieuwe
  // uitrol), maar valt dat weg, dan de opgeslagen app-schil. Dit is wat maakt
  // dat de app offline überhaupt opent.
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try { return await fetch(req); }
      catch { return (await caches.match("/")) || Response.error(); }
    })());
    return;
  }

  // App-schil: eerst uit de cache, dat scheelt wachten bij elke start. De
  // bestanden hangen aan een versie in de cachenaam, dus oud spul blijft niet
  // hangen — bij een nieuwe uitrol is de hele cache nieuw.
  const isSchil = url.pathname === "/app.js" || url.pathname === "/app.css" ||
    url.pathname.startsWith("/vendor/") || url.pathname === "/manifest.json";
  if (isSchil) {
    event.respondWith((async () => {
      const cached = await caches.match(url.pathname);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok) (await caches.open(SCHIL_CACHE)).put(url.pathname, res.clone());
      return res;
    })());
    return;
  }

  // Reisgegevens: eerst het net op zodat je altijd het actuele schema ziet;
  // lukt dat niet, dan wat we de vorige keer hebben opgehaald. Zo staat je
  // dagindeling er ook zonder bereik. Foto-bytes slaan we hier bewust niet op —
  // die zouden de opslag laten vollopen en hebben hun eigen browsercache.
  //
  // /auth/me hoort er nadrukkelijk bij: zonder dat antwoord concludeert de app
  // dat je uitgelogd bent en valt hij terug op de gastmodus, waarin je je eigen
  // reizen niet ziet. Offline zag je dan "Nog geen reizen" terwijl alles
  // gewoon in de cache stond. Wordt gewist bij uitloggen (zie handleLogout).
  const isData = url.pathname === "/auth/me" ||
    (url.pathname.startsWith("/api/") && !/\/(raw|thumb)$/.test(url.pathname));
  if (isData) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(DATA_CACHE)).put(req, res.clone());
        return res;
      } catch (err) {
        const cached = await caches.match(req);
        if (cached) return cached;
        throw err;
      }
    })());
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title || "Reisplanner", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { tripId: data.tripId || null },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
    })
  );
});
