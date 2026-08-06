// ---------- Tips accordion ----------
const TIP_CATEGORIES = [
  { category: "Lokaal vervoer", icon: "train" },
  { category: "Taxi & apps", icon: "car" },
  { category: "Restaurants", icon: "fork" },
  { category: "Activiteiten", icon: "flag" },
  { category: "Met kinderen", icon: "family" },
  { category: "Evenementen & agenda", icon: "ticket" },
];

function TipAccordion({ tripId, category, icon, accentColor, location, cacheKeyPrefix }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const cacheKey = `${cacheKeyPrefix}_cat_${category}`;

  function load() {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { data, ts } = JSON.parse(cached);
        if (Date.now() - ts < 24 * 60 * 60 * 1000) { setItems(data); return; }
      }
    } catch {}
    setLoading(true); setError(null);
    const params = new URLSearchParams({ category });
    if (location) params.set("location", location);
    apiFetch(`/api/trips/${tripId}/tips?${params}`)
      .then((d) => {
        setItems(d.items || []);
        try { localStorage.setItem(cacheKey, JSON.stringify({ data: d.items || [], ts: Date.now() })); } catch {}
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  function handleClick() {
    if (!open) { setOpen(true); if (!items) load(); }
    else setOpen(false);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <button onClick={handleClick} className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors">
        <span className="text-lg">{icon}</span>
        <span className="font-semibold text-gray-800 text-sm flex-1">{category}</span>
        <span className="text-gray-400 text-xs" style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", display: "inline-block", transition: "transform .2s" }}>▾</span>
      </button>
      {open && (
        <div className="border-t border-gray-100">
          {loading ? (
            <div className="px-4 py-3 text-sm text-gray-400">Laden...</div>
          ) : error ? (
            <div className="px-4 py-3 text-sm text-red-500">{error} <button onClick={load} className="underline">Opnieuw</button></div>
          ) : items?.length ? (
            <ul className="divide-y divide-gray-50">
              {items.map((tip, j) => {
                const tipText = typeof tip === "string" ? tip : tip.text;
                const tipUrl = typeof tip === "object" ? tip.url : null;
                return (
                  <li key={j} className="flex items-start gap-3 px-4 py-2.5">
                    <span className="w-1.5 h-1.5 rounded-full mt-2 shrink-0" style={{ background: legibleOn(accentColor) }} />
                    <span className="text-sm text-gray-700 leading-relaxed">
                      {tipText}
                      {tipUrl && <a href={tipUrl} target="_blank" rel="noopener noreferrer" className="ml-1.5 text-sky-600 underline text-xs whitespace-nowrap">↗ website</a>}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : items ? (
            <div className="px-4 py-3 text-sm text-gray-400">Geen tips beschikbaar.</div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ---------- Tips modal (per locatie) ----------
function TipsModal({ tripId, trip, location, onClose }) {
  const [didYouKnow, setDidYouKnow] = useState(null);
  const [dykLoading, setDykLoading] = useState(true);
  const tripMonth = trip?.start_date ? String(trip.start_date).slice(0, 7) : "";
  const cacheKeyPrefix = `tips_loc_${location}_${tripMonth}`;
  const dykKey = `${cacheKeyPrefix}_dyk`;

  useEffect(() => {
    try {
      const cached = localStorage.getItem(dykKey);
      if (cached) { const { data, ts } = JSON.parse(cached); if (Date.now() - ts < 24*60*60*1000) { setDidYouKnow(data); setDykLoading(false); return; } }
    } catch {}
    // Het weetje hangt aan één plaats. Wissel je van plaats terwijl het vorige
    // verzoek nog loopt, dan kan dat antwoord ná het nieuwe binnenkomen en zet
    // het een weetje over de vorige stad onder de nieuwe naam.
    let vervallen = false;
    apiFetch(`/api/trips/${tripId}/tips?location=${encodeURIComponent(location)}`)
      .then((d) => {
        try { localStorage.setItem(dykKey, JSON.stringify({ data: d.did_you_know, ts: Date.now() })); } catch {}
        if (!vervallen) setDidYouKnow(d.did_you_know || null);
      })
      .catch(() => {})
      .finally(() => { if (!vervallen) setDykLoading(false); });
    return () => { vervallen = true; };
  }, [location]);

  return (
    <Modal title={`Tips voor ${location}`} onClose={onClose} wide>
      <div className="space-y-2">
        {dykLoading ? (
          <div className="rounded-xl p-4 bg-sky-50 border border-sky-100 mb-1 animate-pulse">
            <div className="h-3 w-20 bg-sky-200 rounded mb-2" />
            <div className="h-4 w-full bg-sky-100 rounded" />
          </div>
        ) : didYouKnow ? (
          <div className="rounded-xl p-4 bg-sky-50 border border-sky-100 mb-1">
            <div className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: PALETTE.coralDeep }}>Wist je dat?</div>
            <div className="text-sm text-gray-700 leading-relaxed">{didYouKnow}</div>
          </div>
        ) : null}
        <div className="text-xs text-gray-400 text-center pb-1">Klik op een categorie om tips te laden</div>
        {TIP_CATEGORIES.map(({ category, icon }) => (
          <TipAccordion key={category} tripId={tripId} category={category} icon={icon}
            accentColor={PALETTE.primary} location={location} cacheKeyPrefix={cacheKeyPrefix} />
        ))}
      </div>
    </Modal>
  );
}

// ---------- Tips tab ----------
function TipsTab({ trip }) {
  const [didYouKnow, setDidYouKnow] = useState(null);
  const [dykLoading, setDykLoading] = useState(true);
  const accent = trip.cover_color || PALETTE.primary;
  const tripMonth = trip.start_date ? String(trip.start_date).slice(0, 7) : "";
  const cacheKeyPrefix = `tips_${trip.id}_${trip.destination}_${tripMonth}`;
  const dykKey = `${cacheKeyPrefix}_dyk`;

  useEffect(() => {
    if (!trip.destination) { setDykLoading(false); return; }
    try {
      const cached = localStorage.getItem(dykKey);
      if (cached) { const { data, ts } = JSON.parse(cached); if (Date.now() - ts < 24*60*60*1000) { setDidYouKnow(data); setDykLoading(false); return; } }
    } catch {}
    let vervallen = false;
    apiFetch(`/api/trips/${trip.id}/tips`)
      .then((d) => {
        try { localStorage.setItem(dykKey, JSON.stringify({ data: d.did_you_know, ts: Date.now() })); } catch {}
        if (!vervallen) setDidYouKnow(d.did_you_know || null);
      })
      .catch(() => {})
      .finally(() => { if (!vervallen) setDykLoading(false); });
    return () => { vervallen = true; };
  }, [trip.id, trip.destination]);

  if (!trip.destination) return (
    <div className="text-center py-16 text-gray-400">
      <Icon name="bulb" size={34} strokeWidth={1.2} className="mx-auto mb-3 text-gray-300" />
      <div className="font-medium">Geen bestemming ingesteld</div>
      <div className="text-sm mt-1">Voeg een bestemming toe aan je reis voor AI-tips</div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-[21px] text-gray-800">Tips voor {trip.destination}</h3>
        <span className="text-xs text-gray-400 flex items-center gap-1"><Icon name="sparkle" size={12} />Gegenereerd door Claude</span>
      </div>

      {dykLoading ? (
        <div className="rounded-xl p-4 mb-4 border animate-pulse" style={{ background: accent + "10", borderColor: accent + "30" }}>
          <div className="h-3 w-20 rounded mb-2" style={{ background: accent + "40" }} />
          <div className="h-4 w-full rounded" style={{ background: accent + "20" }} />
        </div>
      ) : didYouKnow ? (
        <div className="rounded-xl p-4 mb-4 border" style={{ background: accent + "10", borderColor: accent + "30" }}>
          <div className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: legibleOn(accent) }}>Wist je dat?</div>
          <div className="text-sm text-gray-700 leading-relaxed">{didYouKnow}</div>
        </div>
      ) : null}

      <div className="text-xs text-gray-400 text-center mb-3">Klik op een categorie om tips te laden</div>

      <div className="space-y-2">
        {TIP_CATEGORIES.map(({ category, icon }) => (
          <TipAccordion key={category} tripId={trip.id} category={category} icon={icon}
            accentColor={accent} cacheKeyPrefix={cacheKeyPrefix} />
        ))}
      </div>
    </div>
  );
}

// ---------- Waar je geweest bent ----------
// De planningskaart laat zien waar je heen zóu gaan. Dit laat zien waar je
// werkelijk geweest bent, en dat weten we uit de GPS die in je foto's zit.

function numOrNull(v) {
  // pg geeft NUMERIC terug als tekst, en Number(null) is 0 — wat een geldige
  // coördinaat lijkt maar het niet is. Vandaar deze omweg.
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function photoPoint(p) {
  const lat = numOrNull(p.latitude);
  const lon = numOrNull(p.longitude);
  if (lat === null || lon === null) return null;
  // Precies 0,0 ligt in de Atlantische Oceaan voor Ghana. Dat is geen vakantie,
  // dat is een leeggelopen GPS-veld.
  if (lat === 0 && lon === 0) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { ...p, lat, lon, when: p.taken_at || p.created_at || null };
}

function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Groepeer op nabijheid, niet op tijd: kom je twee keer op hetzelfde plein, dan
// is dat één plek op de kaart en geen twee losse stippen.
function clusterPhotoPlaces(photos, radiusM = 300) {
  const pts = asList(photos).map(photoPoint).filter(Boolean)
    .sort((a, b) => String(a.when || "").localeCompare(String(b.when || "")));
  const places = [];
  for (const pt of pts) {
    let best = null;
    let bestD = Infinity;
    for (const pl of places) {
      const d = haversineMeters(pt, pl);
      if (d < bestD) { bestD = d; best = pl; }
    }
    if (best && bestD <= radiusM) {
      best.photos.push(pt);
      best.lat = best.photos.reduce((s, p) => s + p.lat, 0) / best.photos.length;
      best.lon = best.photos.reduce((s, p) => s + p.lon, 0) / best.photos.length;
    } else {
      places.push({ lat: pt.lat, lon: pt.lon, photos: [pt] });
    }
  }
  for (const pl of places) {
    const times = pl.photos.map((p) => p.when).filter(Boolean).sort();
    pl.first = times[0] || null;
    pl.last = times[times.length - 1] || null;
  }
  return places;
}

// De route is de volgorde waarin je die plekken bezocht hebt. Ga je heen en
// weer naar hetzelfde hotel, dan hoort dat als losse etappes in de lijn — maar
// twee foto's achter elkaar op dezelfde plek zijn geen etappe.
function visitRoute(places) {
  const stops = [];
  places.forEach((pl, i) => pl.photos.forEach((p) => stops.push({ when: p.when, i })));
  stops.sort((a, b) => String(a.when || "").localeCompare(String(b.when || "")));
  const route = [];
  for (const s of stops) {
    if (route.length === 0 || route[route.length - 1] !== s.i) route.push(s.i);
  }
  return route.map((i) => places[i]);
}

function routeDistanceMeters(route) {
  let total = 0;
  for (let i = 1; i < route.length; i++) total += haversineMeters(route[i - 1], route[i]);
  return total;
}

// Een boogje in plaats van een rechte lijn tussen twee punten — dezelfde
// vluchtroute-boog als op de planningskaart, hier hergebruikt voor elke etappe
// tussen twee bezochte plekken. De boog schaalt met de afstand: vlak bij elkaar
// is hij bijna recht, ver uit elkaar duidelijk gebogen, zoals een vluchtpad.
function arcLatLngs(from, to, bulge = 0.08, steps = 40) {
  const latlngs = [];
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const lat = from.lat + (to.lat - from.lat) * t;
    const lon = from.lon + (to.lon - from.lon) * t;
    const arc = Math.sin(Math.PI * t) * (Math.abs(to.lat - from.lat) + Math.abs(to.lon - from.lon)) * bulge;
    latlngs.push([lat + arc, lon]);
  }
  return latlngs;
}

function fmtDistance(m) {
  if (m < 1000) return `${Math.round(m)} m`;
  if (m < 100000) return `${(m / 1000).toFixed(1).replace(".", ",")} km`;
  return `${Math.round(m / 1000).toLocaleString("nl-NL")} km`;
}

// Een label als "14:07" oogt op een kaart alsof het naar de minuut nauwkeurig
// is gepland, wat het nooit is. Afgerond op een kwartier leest het als wat het
// is: een indicatie.
function roundTimeToQuarterHour(time) {
  const m = /^(\d{1,2}):(\d{2})/.exec(time || "");
  if (!m) return null;
  const total = (Number(m[1]) * 60 + Number(m[2]));
  const rounded = Math.round(total / 15) * 15 % (24 * 60);
  const h = Math.floor(rounded / 60);
  const min = rounded % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

// Koppelt elke foto-cluster op de dagboek-kaart aan de activiteit waar de
// meeste van zijn foto's bij horen, zodat de kaart niet alleen stippen toont
// maar ook waar je was en (afgerond) hoe laat.
function labelPlaces(places, activities) {
  places.forEach((pl) => {
    const counts = {};
    pl.photos.forEach((p) => { if (p.activity_id) counts[p.activity_id] = (counts[p.activity_id] || 0) + 1; });
    const topId = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    const act = topId && activities.find((a) => String(a.id) === topId);
    pl.label = act ? act.title : null;
    pl.time = act ? roundTimeToQuarterHour(act.time) : null;
    pl.activityId = act ? act.id : null;
  });
  return places;
}

// ---------- Kaart tab ----------
// Mapbox-tegels als er een token staat, anders de gratis CARTO-tegels. Eén keer
// ophalen per sessie; de kaart mag er niet op wachten als het misgaat.
let _mapConfig = null;
function mapConfig() {
  if (!_mapConfig) {
    _mapConfig = fetch("/api/config/map")
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
  }
  return _mapConfig;
}

function addBaseLayer(L, map, cfg) {
  if (cfg && cfg.mapboxToken) {
    // Een rustige ondergrond: het spoor is het onderwerp, niet de kaart.
    L.tileLayer(
      `https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/512/{z}/{x}/{y}@2x?access_token=${cfg.mapboxToken}`,
      { attribution: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', tileSize: 512, zoomOffset: -1, maxZoom: 20 },
    ).addTo(map);
    return;
  }
  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
    maxZoom: 19,
  }).addTo(map);
}

// v3: valt terug op Engels wanneer Nominatim geen Nederlandse naam heeft —
// zonder die fallback levert een plaats zonder nl-vertaling (bijv. Takayama)
// zijn lokale schrift op (高山市) in plaats van een Latijnse naam. Eigen
// cache-prefix, want oudere gecachte resultaten (van vóór deze fallback)
// kunnen nog zo'n onvertaalde naam bevatten.
//
// Meerdere dagkaarten met hetzelfde verblijf mounten allemaal tegelijk, en
// missen dan allemaal de (nog lege) cache — zonder deze in-flight-registratie
// vuurt dat evenveel gelijktijdige Nominatim-verzoeken af, wat de bedoelde
// snelheidslimiet van 1/sec juist doorbreekt.
const _geocodeInFlight = new Map();
async function geocode(query) {
  const key = `geocode3_${query}`;
  try {
    const c = localStorage.getItem(key);
    if (c) return JSON.parse(c);
  } catch {}
  if (_geocodeInFlight.has(query)) return _geocodeInFlight.get(query);
  const promise = (async () => {
    await new Promise((r) => setTimeout(r, 1100)); // Nominatim rate limit: 1/sec
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1`;
    const res = await fetch(url, { headers: { "Accept-Language": "nl,en;q=0.8", "User-Agent": "ReisplannerApp/1.0" } });
    const data = await res.json();
    const addr = data[0]?.address || {};
    const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || null;
    const result = data[0] ? { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), display: data[0].display_name, city } : null;
    if (result) { try { localStorage.setItem(key, JSON.stringify(result)); } catch {} }
    return result;
  })();
  _geocodeInFlight.set(query, promise);
  try {
    return await promise;
  } finally {
    _geocodeInFlight.delete(query);
  }
}

// Nominatim's addressdetails levert niet altijd het niveau dat je wilt (soms
// een wijk, soms een regio) en soms geen bruikbare naam voor een klein
// verblijfsadres. Laat Claude de plaatsnaam uit de ruwe naam/adrestekst
// destilleren; valt terug op Nominatim's eigen city-veld als dat niet lukt
// (geen API-key, netwerkfout, of een gast zonder server-sessie).
async function deriveCityName(query, fallbackCity) {
  if (_guestMode) return fallbackCity || null;
  const key = `placename_${query}`;
  try {
    const c = localStorage.getItem(key);
    if (c) return c;
  } catch {}
  try {
    const data = await apiFetch("/api/geocode/place-name", { method: "POST", body: JSON.stringify({ query }) });
    if (data?.city) {
      try { localStorage.setItem(key, data.city); } catch {}
      return data.city;
    }
  } catch {}
  return fallbackCity || null;
}

// Combineert een geocode-lookup met een schone plaatsnaam. Een compleet
// hoteladres (naam + straat + wijk) is vaak te specifiek voor Nominatim om
// coördinaten voor te vinden — een schone plaatsnaam ("Kyoto") vindt hij wél
// vrijwel altijd, dus die wordt als tweede poging gebruikt zodra de eerste
// lookup niets oplevert. Zonder deze stap kreeg zo'n dag geen kaartje én geen
// schone naam: beide vielen terug op het rauwe adres.
async function geocodePlace(query) {
  let geo = await geocode(query).catch(() => null);
  const city = await deriveCityName(query, geo?.city);
  if (city && geo?.lat == null) {
    geo = await geocode(city).catch(() => null);
  }
  if (geo) return { ...geo, city: city || geo.city };
  return city ? { city } : null;
}

// WMO-weercodes (zoals Open-Meteo ze levert) teruggebracht tot de drie dingen
// die er in een dagboek toe doen: zon, bewolking, neerslag — niet de volledige
// lijst met precieze varianten.
function weatherFromCode(code) {
  if (code === 0) return { icon: "sun", label: "Zonnig" };
  if (code === 1) return { icon: "sun", label: "Overwegend zonnig" };
  if (code === 2) return { icon: "cloudSun", label: "Half bewolkt" };
  if (code === 3) return { icon: "cloud", label: "Bewolkt" };
  if ([45, 48].includes(code)) return { icon: "fog", label: "Mist" };
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { icon: "cloudRain", label: "Regen" };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { icon: "cloudSnow", label: "Sneeuw" };
  if ([95, 96, 99].includes(code)) return { icon: "cloudLightning", label: "Onweer" };
  return { icon: "cloud", label: "Bewolkt" };
}

// Open-Meteo: gratis, geen key nodig. De forecast-endpoint dekt recent
// verleden t/m 16 dagen vooruit; voor oudere reisdagen valt dit terug op het
// archief. Buiten beide bereiken (of bij een netwerkfout) blijft het weer
// gewoon leeg — dit is een leuk detail, geen essentieel onderdeel van de app.
// v2: neemt ook de gevoelstemperatuur mee, voor het detailkaartje achter een
// klik op het weer-icoon. Eigen cache-prefix, want oudere gecachte resultaten
// (van vóór dit veld bestond) missen die waarde.
async function fetchDayWeather(lat, lon, dateStr) {
  if (lat == null || lon == null || !dateStr) return null;
  const key = `weather2_${lat.toFixed(2)}_${lon.toFixed(2)}_${dateStr}`;
  try {
    const c = localStorage.getItem(key);
    if (c) return JSON.parse(c);
  } catch {}
  const parse = async (url) => {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const d = data?.daily;
    if (!d?.weathercode?.length) return null;
    return {
      tempMax: d.temperature_2m_max[0], tempMin: d.temperature_2m_min[0], code: d.weathercode[0],
      feelsMax: d.apparent_temperature_max?.[0] ?? null, feelsMin: d.apparent_temperature_min?.[0] ?? null,
      precip: d.precipitation_sum?.[0] ?? null,
    };
  };
  const params = `daily=weathercode,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum&timezone=auto&start_date=${dateStr}&end_date=${dateStr}`;
  let result = null;
  try { result = await parse(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&${params}`); } catch {}
  if (!result) {
    try { result = await parse(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&${params}`); } catch {}
  }
  if (result) { try { localStorage.setItem(key, JSON.stringify(result)); } catch {} }
  return result;
}

// Zelfstandig badge-je: geocodeert de meegegeven locatietekst zelf en haalt er
// het weer bij, zodat elke plek in de app (dagplanning, het "Binnenkort"-
// lijstje) dit met één regel kan tonen zonder de geocode/weer-logica zelf te
// herhalen.
// Het icoontje zelf blijft bewust minimaal (icoon + max-temperatuur) — een
// klik erop laat het detail zien: gevoelstemperatuur, min/max en neerslag.
// Zo blijft het rustig in de dagkaart, maar is er meer te vinden voor wie het
// wil weten.
function WeatherBadge({ weather, size = 13, className = "" }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!weather) return null;
  const info = weatherFromCode(weather.code);

  return (
    <span className={"relative inline-flex shrink-0 " + className} ref={wrapRef}>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="flex items-center gap-1 text-gray-400 hover:text-gray-600 active:scale-95 transition-all">
        <Icon name={info.icon} size={size} />
        <span className="tnum text-gray-600 font-medium">{Math.round(weather.tempMax)}°</span>
      </button>
      {open && (
        <div onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-full mt-1.5 z-50 bg-white rounded-xl shadow-xl border border-gray-100 px-3.5 py-3 text-xs whitespace-nowrap">
          <div className="flex items-center gap-1.5 font-semibold text-gray-800 mb-1.5">
            <Icon name={info.icon} size={15} className="text-gray-400" />{info.label}
          </div>
          <div className="tnum text-gray-600">{Math.round(weather.tempMax)}° / {Math.round(weather.tempMin)}°</div>
          {weather.feelsMax != null && (
            <div className="tnum text-gray-400 mt-0.5">Voelt als {Math.round(weather.feelsMax)}°</div>
          )}
          {weather.precip != null && weather.precip > 0 && (
            <div className="tnum text-gray-400 mt-0.5">{weather.precip.toFixed(1).replace(".", ",")} mm neerslag</div>
          )}
        </div>
      )}
    </span>
  );
}

function DayWeatherBadge({ query, date, size = 13 }) {
  const [weather, setWeather] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!query || !date) { if (!cancelled) setWeather(null); return; }
      const geo = await geocodePlace(query).catch(() => null);
      if (cancelled) return;
      if (geo?.lat == null) { setWeather(null); return; }
      const w = await fetchDayWeather(geo.lat, geo.lon, date).catch(() => null);
      if (!cancelled) setWeather(w);
    })();
    return () => { cancelled = true; };
  }, [query, date]);

  return <WeatherBadge weather={weather} size={size} />;
}

function MapTab({ trip, accommodations, transports, days }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;

    async function buildMap() {
      // Collect unique locations to geocode
      const items = []; // {label, sublabel, type, query}

      accommodations.forEach((a) => {
        const q = a.address || a.name;
        if (q) items.push({ label: a.name, sublabel: a.address || "", type: "hotel", query: q });
      });

      days.forEach((day) => {
        (day.activities || []).forEach((act) => {
          if (act.location) items.push({ label: act.name || act.location, sublabel: act.location, type: "activity", query: act.location + (trip.destination ? `, ${trip.destination}` : "") });
        });
      });

      // Transport: unique cities from origin/destination
      // Use airport codes or city names — append country context from trip destination if short
      const transportPairs = [];
      transports.forEach((t) => {
        if (t.from_location && t.to_location) {
          const fromQ = t.from_location;
          const toQ = t.to_location;
          transportPairs.push({ from: fromQ, to: toQ, type: t.type });
          if (!items.find((i) => i.query === fromQ)) items.push({ label: t.from_location, sublabel: "", type: "transport", query: fromQ });
          if (!items.find((i) => i.query === toQ)) items.push({ label: t.to_location, sublabel: "", type: "transport", query: toQ });
        }
      });

      if (items.length === 0) { setStatus("empty"); return; }
      setTotal(items.length);

      // Geocode sequentially (Nominatim rate limit)
      const coordMap = {};
      for (let i = 0; i < items.length; i++) {
        if (cancelled) return;
        const item = items[i];
        if (coordMap[item.query] === undefined) {
          const geo = await geocode(item.query);
          coordMap[item.query] = geo;
        }
        setProgress(i + 1);
      }

      if (cancelled) return;

      const validItems = items.filter((item) => coordMap[item.query]);
      if (validItems.length === 0) { setStatus("error"); return; }

      // Init Leaflet map
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
      // Leaflet komt uit een los <script> in index.html. Laadt dat er om wat
      // voor reden dan ook niet bij (haperend netwerk op de eerste start,
      // blokkade onderweg), dan is window.L er niet en liep dit blok stuk op
      // "Cannot read properties of undefined" — een onafgevangen rejection
      // binnen de async-IIFE, dus zonder foutscherm maar wel met een halve
      // opruiming. Alle vijf de kaarten in dit bestand hebben dezelfde
      // afhankelijkheid en daarom dezelfde controle; zonder kaartbibliotheek
      // blijft het kaartvlak gewoon leeg, net als voorheen, maar de rest van
      // het scherm blijft heel.
      const L = window.L;
      if (!L) return;
      const map = L.map(mapRef.current);
      mapInstanceRef.current = map;
      addBaseLayer(L, map, await mapConfig());

      const bounds = [];

      // Draw transport lines first (below markers)
      transportPairs.forEach((pair) => {
        const fromGeo = coordMap[pair.from];
        const toGeo = coordMap[pair.to];
        if (!fromGeo || !toGeo) return;
        const isAir = (pair.type || "").toLowerCase().includes("vlieg") || (pair.type || "").toLowerCase().includes("fly") || (pair.type || "").toLowerCase().includes("air") || !pair.type;
        if (isAir) {
          L.polyline(arcLatLngs(fromGeo, toGeo), { color: PALETTE.info, weight: 2.5, opacity: 0.7, dashArray: "8 5" }).addTo(map);
        } else {
          L.polyline([[fromGeo.lat, fromGeo.lon], [toGeo.lat, toGeo.lon]], { color: PALETTE.success, weight: 2, opacity: 0.6 }).addTo(map);
        }
      });

      // Add markers. Leaflet wil ruwe HTML, dus deze drie iconen staan hier als
      // padstring in plaats van als JSX — het zijn dezelfde tekeningen.
      const iconSvg = (paths, color) => L.divIcon({
        className: "leaflet-reisplanner-icon",
        html: `<div style="background:${color};border:2.5px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);width:34px;height:34px;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center">`
          + `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(45deg);display:block">${paths}</svg></div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 34],
        popupAnchor: [0, -36],
      });

      // Op een kaart wint onderscheidbaarheid het van kleurzuiverheid: drie
      // duidelijk verschillende, diepe tinten die naast het oranje kunnen staan.
      const typeConfig = {
        hotel: { paths: '<path d="M3 18v-8"/><path d="M3 13h18v5"/><path d="M21 18v-4.5a2.5 2.5 0 0 0-2.5-2.5H10v2.5"/><circle cx="6.9" cy="11" r="1.9"/>', color: PALETTE.coralDeep },
        activity: { paths: '<path d="M6 21V4"/><path d="M6 5h10.5l-1.8 3.6 1.8 3.6H6"/>', color: PALETTE.success },
        transport: { paths: '<path d="M3 13.5 21 7l-4.5 12-3.2-5.1z"/><path d="M13.3 13.9 21 7"/>', color: PALETTE.info },
      };

      // Deduplicate markers by query
      const seen = new Set();
      validItems.forEach((item) => {
        if (seen.has(item.query)) return;
        seen.add(item.query);
        const geo = coordMap[item.query];
        const cfg = typeConfig[item.type] || typeConfig.activity;
        const marker = L.marker([geo.lat, geo.lon], { icon: iconSvg(cfg.paths, cfg.color) }).addTo(map);
        // item.label/sublabel komen uit vrij in te vullen tekst (activiteit-,
        // verblijf- en vervoernamen) — ongefilterd in deze HTML-string plakken
        // zou opgeslagen XSS zijn, dus escapen vóór het aan bindPopup te geven.
        const popup = `<div style="font-family:system-ui;min-width:140px">
          <div style="font-weight:600;font-size:13px;color:${PALETTE.textPrimary}">${escapeHtml(item.label)}</div>
          ${item.sublabel && item.sublabel !== item.label ? `<div style="font-size:11px;color:${PALETTE.textSecondary};margin-top:2px">${escapeHtml(item.sublabel)}</div>` : ""}
        </div>`;
        marker.bindPopup(popup);
        bounds.push([geo.lat, geo.lon]);
      });

      if (bounds.length > 0) map.fitBounds(bounds, { padding: [40, 40] });
      setStatus("ready");
    }

    buildMap().catch(() => setStatus("error"));
    return () => { cancelled = true; };
  }, [trip.id]);

  useEffect(() => {
    return () => { if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; } };
  }, []);

  const hasLocations = accommodations.some((a) => a.address || a.name) ||
    transports.some((t) => t.from_location && t.to_location) ||
    days.some((d) => (d.activities || []).some((a) => a.location));

  if (!hasLocations) return (
    <div className="text-center py-16 text-gray-400">
      <Icon name="map" size={34} strokeWidth={1.2} className="mx-auto mb-3 text-gray-300" />
      <div className="font-medium">Geen locaties om te tonen</div>
      <div className="text-sm mt-1">Voeg hotels, activiteiten of vervoer toe met locatiegegevens</div>
    </div>
  );

  return (
    <div>
      <div className="flex gap-3 text-xs text-gray-500 mb-3 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: PALETTE.coralDeep }} />Verblijf</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: PALETTE.success }} />Activiteit</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: PALETTE.info }} />Vervoer</span>
      </div>
      <div className="rounded-3xl overflow-hidden border border-gray-200 shadow-sm relative z-0" style={{ height: 480 }}>
        {status === "loading" && (
          <div className="absolute inset-0 bg-white/90 z-[1000] flex flex-col items-center justify-center gap-3">
            <Icon name="map" size={30} strokeWidth={1.2} className="animate-pulse text-gray-300" />
            <div className="text-sm text-gray-600 font-medium">Locaties ophalen…</div>
            {total > 0 && (
              <div className="w-48">
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-sky-500 rounded-full transition-all" style={{ width: `${(progress / total) * 100}%` }} />
                </div>
                <div className="text-xs text-gray-400 text-center mt-1">{progress} / {total}</div>
              </div>
            )}
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 bg-white/90 z-[1000] flex items-center justify-center">
            <div className="text-center text-gray-400">
              <Icon name="alert" size={30} strokeWidth={1.3} className="mx-auto mb-2 text-gray-300" />
              <div className="text-sm">Kaart kon niet worden geladen</div>
            </div>
          </div>
        )}
        <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
      </div>
      <div className="text-xs text-gray-400 text-center mt-2">© OpenStreetMap contributors</div>
    </div>
  );
}

// Het spoor dat je zelf hebt achtergelaten: elke foto met GPS is een bewijsstuk
// dat je daar stond. Geen geocoding nodig, dus deze kaart staat er meteen.
function VisitedMap({ trip }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [photos, setPhotos] = useState(null);
  const [failed, setFailed] = useState(false);
  const [viewing, setViewing] = useState(null); // { photos, index }

  useEffect(() => {
    let cancelled = false;
    api.getPhotos(trip.id)
      .then((list) => { if (!cancelled) setPhotos(asList(list)); })
      .catch(() => { if (!cancelled) { setPhotos([]); setFailed(true); } });
    return () => { cancelled = true; };
  }, [trip.id]);

  const places = React.useMemo(() => clusterPhotoPlaces(photos || []), [photos]);
  const route = React.useMemo(() => visitRoute(places), [places]);
  const withoutGps = (photos || []).length - places.reduce((n, p) => n + p.photos.length, 0);

  useEffect(() => {
    if (!mapRef.current || places.length === 0) return;
    let cancelled = false;

    (async () => {
      const cfg = await mapConfig();
      if (cancelled || !mapRef.current) return;
      const L = window.L;
      if (!L) return;
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
      const map = L.map(mapRef.current, { scrollWheelZoom: false });
      mapInstanceRef.current = map;
      addBaseLayer(L, map, cfg);

      if (route.length > 1) {
        L.polyline(route.map((p) => [p.lat, p.lon]),
          { color: PALETTE.coralDeep, weight: 2.5, opacity: 0.75 }).addTo(map);
      }

      // De stip groeit met het aantal foto's, zodat je in één oogopslag ziet
      // waar je lang gebleven bent.
      //
      // Genummerd op eerste bezoek, niet op positie in de route: kom je 's avonds
      // terug in hetzelfde hotel, dan houdt die stip zijn eigen nummer 1 en telt
      // de reeks netjes door zonder gaten. De lijn laat het heen en weer al zien.
      const order = new Map();
      route.forEach((p) => { if (!order.has(p)) order.set(p, order.size + 1); });
      places.forEach((pl) => {
        const size = Math.min(46, 24 + Math.round(Math.sqrt(pl.photos.length) * 5));
        const nr = order.get(pl);
        const marker = L.marker([pl.lat, pl.lon], {
          icon: L.divIcon({
            className: "leaflet-reisplanner-icon",
            html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${PALETTE.coralDeep};border:2.5px solid #fff;box-shadow:0 2px 8px rgba(55,52,50,.35);color:#fff;display:flex;align-items:center;justify-content:center;font-size:${size < 30 ? 10 : 12}px;font-weight:700;font-variant-numeric:tabular-nums">${nr || ""}</div>`,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          }),
        }).addTo(map);
        const when = pl.first ? fmt(pl.first.slice(0, 10)) : "";
        marker.bindTooltip(
          `${pl.photos.length} foto${pl.photos.length === 1 ? "" : "'s"}${when ? ` · ${when}` : ""}`,
          { direction: "top", offset: [0, -size / 2] },
        );
        marker.on("click", () => setViewing({ photos: pl.photos, index: 0 }));
      });

      const bounds = places.map((p) => [p.lat, p.lon]);
      if (bounds.length === 1) map.setView(bounds[0], 13);
      else map.fitBounds(bounds, { padding: [45, 45] });
    })();

    return () => { cancelled = true; };
  }, [places, route]);

  useEffect(() => () => {
    if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
  }, []);

  if (photos === null) return <div className="text-center py-16 text-gray-400 text-sm">Foto's ophalen…</div>;

  if (places.length === 0) return (
    <div className="text-center py-14 text-gray-400">
      <Icon name="pin" size={34} strokeWidth={1.2} className="mx-auto mb-3 text-gray-300" />
      <div className="font-medium text-gray-600">Nog geen plekken om te tonen</div>
      <div className="text-sm mt-1 max-w-sm mx-auto leading-relaxed">
        {failed
          ? "De foto's konden niet worden opgehaald. Probeer het zo nog eens."
          : withoutGps > 0
            ? `Er ${withoutGps === 1 ? "is 1 foto" : `zijn ${withoutGps} foto's`} in deze reis, maar zonder locatie. Foto's die via WhatsApp of een screenshot binnenkomen hebben hun GPS verloren; die rechtstreeks vanaf de camera-rol komen meestal wel.`
            : "Zodra je foto's uploadt die met locatie zijn genomen, tekent deze kaart je route."}
      </div>
    </div>
  );

  const days = new Set(places.flatMap((p) => p.photos.map((x) => (x.when || "").slice(0, 10))).filter(Boolean));
  const distance = routeDistanceMeters(route);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mb-3 text-sm">
        <span className="flex items-center gap-1.5 text-gray-700">
          <Icon name="pin" size={14} className="text-sky-700" />
          <span className="font-semibold tnum">{places.length}</span> {places.length === 1 ? "plek" : "plekken"}
        </span>
        {distance > 0 && (
          <span className="flex items-center gap-1.5 text-gray-700">
            <Icon name="route" size={14} className="text-sky-700" />
            <span className="font-semibold tnum">{fmtDistance(distance)}</span>
            <span className="text-gray-400 text-xs">in vogelvlucht</span>
          </span>
        )}
        {days.size > 0 && (
          <span className="flex items-center gap-1.5 text-gray-700">
            <Icon name="calendar" size={14} className="text-sky-700" />
            <span className="font-semibold tnum">{days.size}</span> {days.size === 1 ? "dag" : "dagen"}
          </span>
        )}
      </div>

      <div className="rounded-3xl overflow-hidden border border-gray-200 shadow-sm relative z-0" style={{ height: 480 }}>
        <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
      </div>

      <div className="text-xs text-gray-400 mt-2 leading-relaxed">
        De cijfers volgen de volgorde waarin je er was. Tik op een stip voor de foto's van die plek.
        {withoutGps > 0 && ` ${withoutGps} ${withoutGps === 1 ? "foto heeft" : "foto's hebben"} geen locatie en staan hier dus niet op.`}
      </div>

      {viewing && (
        <PhotoLightbox photos={viewing.photos} index={viewing.index}
          onClose={() => setViewing(null)}
          onIndexChange={(i) => setViewing((v) => ({ ...v, index: i }))} />
      )}
    </div>
  );
}

// Een klein, ingezoomd kaartje in het dagboek zelf: alleen voor vandaag en
// gisteren (de dagen die je nog vers bijhoudt), en alleen als er genoeg
// plekken zijn om een kaartje ook echt iets te laten zien. Places komen al
// geclusterd binnen (clusterPhotoPlaces) — hier alleen tonen en fitBounds.
// Het verblijf van die nacht komt er als startpunt bij: dat heeft geen GPS,
// dus wordt (eenmalig, met caching) geocodeerd op zijn adres.
function DayMiniMap({ places, accommodation }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    if (!mapRef.current || places.length === 0) return;
    let cancelled = false;

    (async () => {
      const cfg = await mapConfig();
      const accQuery = accommodation?.address || accommodation?.name;
      const accGeo = accQuery ? await geocode(accQuery).catch(() => null) : null;
      if (cancelled || !mapRef.current) return;
      const L = window.L;
      if (!L) return;
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
      const map = L.map(mapRef.current, {
        scrollWheelZoom: false, dragging: false, zoomControl: false,
        attributionControl: false, tap: false,
      });
      mapInstanceRef.current = map;
      addBaseLayer(L, map, cfg);

      places.forEach((pl) => {
        const marker = L.marker([pl.lat, pl.lon], {
          icon: L.divIcon({
            className: "leaflet-reisplanner-icon",
            html: `<div style="width:14px;height:14px;border-radius:50%;background:${PALETTE.coralDeep};border:2px solid #fff;box-shadow:0 1px 4px rgba(55,52,50,.4)"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          }),
        }).addTo(map);
        // Heeft de stip een activiteit als label, dan ga je daar naartoe — dat is
        // waar iemand op tikt. Alleen bij een plek zonder activiteit (losse
        // dagfoto's) blijft de oude foto-preview over als enige zinvolle actie.
        marker.on("click", () => {
          if (pl.activityId) document.getElementById(`journal-activity-${pl.activityId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
          else setViewing({ photos: pl.photos, index: 0 });
        });
        if (pl.label) {
          const shortLabel = pl.label.length > 20 ? pl.label.slice(0, 19) + "…" : pl.label;
          const timeSuffix = pl.time ? ` · ${escapeHtml(pl.time)}` : "";
          marker.bindTooltip(`<span style="font-weight:600">${escapeHtml(shortLabel)}</span>${timeSuffix}`, {
            permanent: true, direction: "top", offset: [0, -8], opacity: 0.95,
            className: "leaflet-reisplanner-tooltip",
          });
        }
      });

      // Een huisje in plaats van de oranje foto-stippen, zodat meteen duidelijk
      // is dat dit het startpunt (verblijf) is en niet nog een bezochte plek.
      // Geen naamlabel erbij — het icoon alleen zegt al genoeg.
      if (accGeo) {
        L.marker([accGeo.lat, accGeo.lon], {
          icon: L.divIcon({
            className: "leaflet-reisplanner-icon",
            html: `<div style="width:18px;height:18px;border-radius:50%;background:${PALETTE.textPrimary};border:2px solid #fff;box-shadow:0 1px 4px rgba(55,52,50,.4);display:flex;align-items:center;justify-content:center">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-9"/>
              </svg></div>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
          }),
        }).addTo(map);
      }

      // Iets ruimer uitgezoomd dan strikt nodig — met de naam-labels erbij oogt
      // een kaartje dat precies om de stippen sluit al snel te vol.
      const bounds = places.map((p) => [p.lat, p.lon]);
      if (accGeo) bounds.push([accGeo.lat, accGeo.lon]);
      if (bounds.length === 1) map.setView(bounds[0], 13);
      else map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
    })();

    return () => { cancelled = true; };
  }, [places, accommodation]);

  useEffect(() => () => {
    if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
  }, []);

  return (
    <div className="rounded-2xl overflow-hidden border border-gray-100 relative z-0" style={{ height: 190 }}>
      <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
      {viewing && (
        <PhotoLightbox photos={viewing.photos} index={viewing.index}
          onClose={() => setViewing(null)}
          onIndexChange={(i) => setViewing((v) => ({ ...v, index: i }))} />
      )}
    </div>
  );
}

// Toont waar je die nacht sliep, met een schone plaatsnaam (geocodeerd, net als
// het huisje op de dag-kaart) in plaats van het rauwe adres. Verandert het
// verblijf ten opzichte van de vorige dag — een reisdag — dan komt er ook een
// klein kaartje bij met beide plekken, verbonden met hetzelfde boogje als de
// andere kaarten in de app.
function AccommodationTransition({ current, previous, date }) {
  const [currentGeo, setCurrentGeo] = useState(null);
  const [previousGeo, setPreviousGeo] = useState(null);
  const [weather, setWeather] = useState(null);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const isTravelDay = !!(current && previous && current.id !== previous.id);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const q = current?.address || current?.name;
      if (!q) { if (!cancelled) setCurrentGeo(null); return; }
      const geo = await geocodePlace(q);
      if (!cancelled) setCurrentGeo(geo);
    })();
    return () => { cancelled = true; };
  }, [current?.id]);

  useEffect(() => {
    if (!isTravelDay) { setPreviousGeo(null); return; }
    let cancelled = false;
    (async () => {
      const q = previous.address || previous.name;
      if (!q) { if (!cancelled) setPreviousGeo(null); return; }
      const geo = await geocodePlace(q);
      if (!cancelled) setPreviousGeo(geo);
    })();
    return () => { cancelled = true; };
  }, [isTravelDay, previous?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (currentGeo?.lat == null || !date) { if (!cancelled) setWeather(null); return; }
      const w = await fetchDayWeather(currentGeo.lat, currentGeo.lon, date).catch(() => null);
      if (!cancelled) setWeather(w);
    })();
    return () => { cancelled = true; };
  }, [currentGeo?.lat, currentGeo?.lon, date]);

  // currentGeo/previousGeo kunnen alsnog city-only zijn (geen lat/lon) als
  // zelfs de schone plaatsnaam niet te geocoden viel — dan is er wel een
  // naam om te tonen, maar geen kaartje om te tekenen.
  const hasCoords = currentGeo?.lat != null && previousGeo?.lat != null;

  useEffect(() => {
    if (!isTravelDay || !mapRef.current || !hasCoords) return;
    let cancelled = false;

    (async () => {
      const cfg = await mapConfig();
      if (cancelled || !mapRef.current) return;
      const L = window.L;
      if (!L) return;
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
      const map = L.map(mapRef.current, {
        scrollWheelZoom: false, dragging: false, zoomControl: false,
        attributionControl: false, tap: false,
      });
      mapInstanceRef.current = map;
      addBaseLayer(L, map, cfg);

      L.polyline(arcLatLngs(previousGeo, currentGeo), { color: PALETTE.coralDeep, weight: 2.5, opacity: 0.75 }).addTo(map);

      const dotIcon = () => L.divIcon({
        className: "leaflet-reisplanner-icon",
        html: `<div style="width:14px;height:14px;border-radius:50%;background:${PALETTE.coralDeep};border:2px solid #fff;box-shadow:0 1px 4px rgba(55,52,50,.4)"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      L.marker([previousGeo.lat, previousGeo.lon], { icon: dotIcon() }).addTo(map);
      L.marker([currentGeo.lat, currentGeo.lon], { icon: dotIcon() }).addTo(map);

      map.fitBounds([[previousGeo.lat, previousGeo.lon], [currentGeo.lat, currentGeo.lon]], { padding: [36, 36] });
    })();

    return () => { cancelled = true; };
  }, [isTravelDay, hasCoords, currentGeo, previousGeo]);

  useEffect(() => () => {
    if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
  }, []);

  if (!current) return null;

  const currentLabel = currentGeo?.city || current.address || current.name;
  const previousLabel = previousGeo?.city || previous?.address || previous?.name;

  return (
    <div>
      <span className="text-xs text-gray-500 flex items-center gap-1.5 min-w-0">
        <Icon name="bed" size={12} className="text-gray-400 shrink-0" />
        <span className="truncate">{isTravelDay ? `Van ${previousLabel} naar ${currentLabel}` : currentLabel}</span>
        <WeatherBadge weather={weather} className="ml-auto" />
      </span>
      {isTravelDay && hasCoords && (
        <>
          <div className="text-xs text-gray-400 flex items-center gap-1.5 mt-1">
            <Icon name="route" size={11} />
            <span className="tnum font-medium text-gray-600">{fmtDistance(haversineMeters(previousGeo, currentGeo))}</span>
            <span>in vogelvlucht</span>
          </div>
          <div className="rounded-xl overflow-hidden border border-gray-100 relative z-0 mt-1.5" style={{ height: 140 }}>
            <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
          </div>
        </>
      )}
    </div>
  );
}

// De kaart waar het dagboek nu mee opent: één stip per dag — de eerst
// bezochte plek van die dag — genummerd op het dagnummer en verbonden met
// speelse boogjes, dezelfde vluchtroute-boog als op de planningskaart, in
// plaats van rechte lijnen. Een tik op een dagnummer springt direct naar dat
// dagkaartje verderop in het dagboek, zodat de kaart een navigatiemiddel is,
// niet alleen een plaatje.
function JournalOverviewMap({ trip, days, photos, accommodations }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [upcomingGeo, setUpcomingGeo] = useState([]);

  const dayInfoByDate = React.useMemo(() => {
    const m = new Map();
    days.forEach((d, i) => { if (d.date) m.set(String(d.date).slice(0, 10), { number: i + 1, id: d.id }); });
    return m;
  }, [days]);

  // clusterPhotoPlaces levert de plekken al in de volgorde waarin ze voor het
  // eerst voorkwamen (chronologisch) — de eerste plek per dagnummer die we
  // tegenkomen is dus meteen de eerst bezochte plek van die dag.
  const dayMarkers = React.useMemo(() => {
    const places = clusterPhotoPlaces(photos || []);
    const seen = new Set();
    const markers = [];
    places.forEach((pl) => {
      const dayIso = pl.first ? String(pl.first).slice(0, 10) : null;
      const info = dayIso ? dayInfoByDate.get(dayIso) : null;
      if (!info || seen.has(info.number)) return;
      seen.add(info.number);
      markers.push({ ...pl, dayNumber: info.number, dayId: info.id });
    });
    return markers;
  }, [photos, dayInfoByDate]);

  const visitedDayNumbers = React.useMemo(() => new Set(dayMarkers.map((m) => m.dayNumber)), [dayMarkers]);

  // Dagen die nog moeten komen (of vandaag, zolang daar nog geen foto van is):
  // de eerste geplande activiteit met een locatie, anders het verblijf van die
  // nacht. Zo toont de kaart in één oogopslag de hele route, niet alleen het
  // deel dat al bezocht is.
  const upcomingItems = React.useMemo(() => {
    const todayStr = todayIso(trip?.timezone);
    if (!todayStr) return [];
    const isoDateLocal = (dt) => dt ? String(dt).slice(0, 10) : null;
    const nightAccommodationOn = (ds) => ds ? (accommodations || []).find((a) => {
      if (!a.check_in || !a.check_out) return false;
      return isoDateLocal(a.check_in) <= ds && isoDateLocal(a.check_out) > ds;
    }) : null;
    const items = [];
    (days || []).forEach((day, i) => {
      const dayStr = isoDateLocal(day.date);
      const dayNumber = i + 1;
      if (!dayStr || dayStr < todayStr || visitedDayNumbers.has(dayNumber)) return;
      const firstActivity = (day.activities || []).find((a) => a.location);
      const acc = nightAccommodationOn(dayStr);
      const query = firstActivity ? firstActivity.location : (acc ? (acc.address || acc.name) : null);
      if (query) items.push({ dayNumber, dayId: day.id, query });
    });
    return items;
  }, [days, accommodations, trip?.timezone, visitedDayNumbers]);

  // Sequentieel i.p.v. Promise.all: dit kan een handvol nog niet eerder
  // opgezochte plekken zijn, en geocode()'s ingebouwde Nominatim-pacing is
  // per aanroep — parallel zou dat alsnog als een burst afvuren.
  useEffect(() => {
    if (!upcomingItems.length) { setUpcomingGeo([]); return; }
    let cancelled = false;
    (async () => {
      const resolved = [];
      for (const item of upcomingItems) {
        const geo = await geocodePlace(item.query).catch(() => null);
        if (cancelled) return;
        if (geo?.lat != null) resolved.push({ ...item, lat: geo.lat, lon: geo.lon });
      }
      if (!cancelled) setUpcomingGeo(resolved);
    })();
    return () => { cancelled = true; };
  }, [upcomingItems]);

  useEffect(() => {
    if (!mapRef.current || (dayMarkers.length === 0 && upcomingGeo.length === 0)) return;
    let cancelled = false;

    (async () => {
      const cfg = await mapConfig();
      if (cancelled || !mapRef.current) return;
      const L = window.L;
      if (!L) return;
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
      // dragging/tap uit: dit kaartje staat ingebed in een scrollende pagina, en
      // een sleepgebaar dat wordt onderbroken (bv. door een tik die de kaart
      // opnieuw opbouwt) kan Leaflet's touch-afhandeling in de war laten, met
      // als gevolg dat de pagina daarna niet meer wil scrollen. Pinch-zoom en de
      // zoomknoppen blijven gewoon werken, alleen slepen niet.
      const map = L.map(mapRef.current, { scrollWheelZoom: false, dragging: false, tap: false });
      mapInstanceRef.current = map;
      addBaseLayer(L, map, cfg);

      for (let i = 1; i < dayMarkers.length; i++) {
        L.polyline(arcLatLngs(dayMarkers[i - 1], dayMarkers[i]), { color: PALETTE.coralDeep, weight: 2.5, opacity: 0.75 }).addTo(map);
      }
      // Route die nog moet komen: lichter en gestippeld — nog niet gelopen,
      // in tegenstelling tot de dikke ononderbroken lijn hierboven.
      const futureChain = [...(dayMarkers.length ? [dayMarkers[dayMarkers.length - 1]] : []), ...upcomingGeo];
      for (let i = 1; i < futureChain.length; i++) {
        L.polyline(arcLatLngs(futureChain[i - 1], futureChain[i]), { color: PALETTE.coralDeep, weight: 2, opacity: 0.45, dashArray: "2 8" }).addTo(map);
      }

      dayMarkers.forEach((pl) => {
        const marker = L.marker([pl.lat, pl.lon], {
          icon: L.divIcon({
            className: "leaflet-reisplanner-icon",
            html: `<div style="width:30px;height:30px;border-radius:50%;background:${PALETTE.coralDeep};border:2.5px solid #fff;box-shadow:0 2px 8px rgba(55,52,50,.35);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;cursor:pointer">${pl.dayNumber}</div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          }),
          // Twee dagen op (bijna) dezelfde plek vallen bij een uitgezoomde reis
          // al snel samen tot één stip. Leaflet tekent dan standaard de laatst
          // toegevoegde — dus de laatste dag — bovenop; met deze offset wint
          // altijd de vroegste dag, want dat is de dag waarop je er aankwam.
          zIndexOffset: 100000 - pl.dayNumber * 100,
        }).addTo(map);
        marker.bindTooltip(`Dag ${pl.dayNumber}`, { direction: "top", offset: [0, -16] });
        marker.on("click", () => {
          document.getElementById(`journal-day-${pl.dayId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });

      // Nog te gaan: hol en gestippeld omlijnd i.p.v. gevuld, zodat in één
      // oogopslag duidelijk is wat al gedaan is en wat nog moet komen.
      upcomingGeo.forEach((pl) => {
        const marker = L.marker([pl.lat, pl.lon], {
          icon: L.divIcon({
            className: "leaflet-reisplanner-icon",
            html: `<div style="width:26px;height:26px;border-radius:50%;background:#fff;border:2.5px dashed ${PALETTE.coralDeep};box-shadow:0 2px 6px rgba(55,52,50,.2);color:${PALETTE.coralDeep};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;cursor:pointer">${pl.dayNumber}</div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13],
          }),
          zIndexOffset: 50000 - pl.dayNumber * 100,
        }).addTo(map);
        marker.bindTooltip(`Dag ${pl.dayNumber} · nog te gaan`, { direction: "top", offset: [0, -14] });
        marker.on("click", () => {
          document.getElementById(`journal-day-${pl.dayId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });

      const bounds = [...dayMarkers, ...upcomingGeo].map((p) => [p.lat, p.lon]);
      if (bounds.length === 1) map.setView(bounds[0], 13);
      else map.fitBounds(bounds, { padding: [36, 36] });
    })();

    return () => { cancelled = true; };
  }, [dayMarkers, upcomingGeo]);

  useEffect(() => () => {
    if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
  }, []);

  if (dayMarkers.length === 0 && upcomingItems.length === 0) return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 text-center py-8 px-4 mb-6 text-sm text-gray-400">
      Zodra je foto's uploadt, of een verblijf/activiteit met locatie plant, verschijnt hier de kaart van je reis.
    </div>
  );

  return (
    <div className="rounded-3xl overflow-hidden border border-gray-200 shadow-sm relative z-0 mb-6" style={{ height: 280 }}>
      <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

// Twee kaarten met dezelfde ondergrond, maar met een andere vraag: waar ga ik
// heen, en waar ben ik geweest.
function TripMapTab({ trip, accommodations, transports, days }) {
  const [mode, setMode] = useState("visited");
  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h3 className="font-display text-[21px] text-gray-800">Reiskaart</h3>
        <div className="flex gap-1 bg-gray-100 rounded-full p-1">
          {[["visited", "Geweest"], ["planned", "Planning"]].map(([key, label]) => (
            <button key={key} onClick={() => setMode(key)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${mode === key ? "bg-white shadow-sm text-gray-800 font-semibold" : "text-gray-500 hover:text-gray-700"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {mode === "visited"
        ? <VisitedMap trip={trip} />
        : <MapTab trip={trip} accommodations={accommodations} transports={transports} days={days} />}
    </div>
  );
}
