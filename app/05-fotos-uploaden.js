// ---------- Photo gallery / uploader ----------
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

// Er stond nergens een grens op hóéveel foto's je in één keer kiest. Dat kon
// niet blijven: een telefoonfoto van 4032x3024 (8,3 MB) weegt na het verkleinen
// 0,8 MB, maar stond als base64-tekst met 2,1 MB in het geheugen van de pagina —
// JavaScript bewaart tekst met twee bytes per teken. Honderd foto's was ruim
// 200 MB, en daar wordt een tab op een telefoon om afgeschoten.
//
// Sinds de wachtrij hieronder staan de foto's als Blob op schijf en telt dat
// niet meer mee. Wat overblijft is de lijst zelf: één rij per foto, met een
// afbeelding erin. Vandaar dat de grens omhoog kan maar niet weg — bij duizend
// rijen is het scherm onwerkbaar, hoe zuinig het geheugen ook is. De losse
// fotostrook verwerkt foto's een voor een en heeft die grens niet nodig; die
// vraagt alleen om bevestiging boven de vijftig, want het kost tijd.
const FOTOS_MAX_TEGELIJK = 250;
const FOTOS_VEEL = 50;

// EXIF GPS coordinates come as [degrees, minutes, seconds]
function exifGpsToDecimal(dms, ref) {
  if (!dms || dms.length < 3) return null;
  let dec = dms[0] + dms[1] / 60 + dms[2] / 3600;
  if (ref === "S" || ref === "W") dec = -dec;
  return dec;
}

// EXIF dates look like "YYYY:MM:DD HH:MM:SS" with no timezone
function exifDateToIso(str) {
  const m = typeof str === "string" && str.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : null;
}

function readExif(file) {
  return new Promise((resolve) => {
    if (typeof EXIF === "undefined") { resolve({}); return; }
    try {
      EXIF.getData(file, function () {
        try {
          const lat = exifGpsToDecimal(EXIF.getTag(this, "GPSLatitude"), EXIF.getTag(this, "GPSLatitudeRef"));
          const lon = exifGpsToDecimal(EXIF.getTag(this, "GPSLongitude"), EXIF.getTag(this, "GPSLongitudeRef"));
          const taken_at = exifDateToIso(EXIF.getTag(this, "DateTimeOriginal") || EXIF.getTag(this, "DateTime"));
          resolve({ latitude: lat, longitude: lon, taken_at });
        } catch { resolve({}); }
      });
    } catch { resolve({}); }
  });
}

// Uploaden loopt vaak over een trage mobiele verbinding, dus hoe minder bytes
// de foto zelf kost hoe eerder hij aankomt. De server verkleint toch alles
// boven FULL_MAX_EDGE — door dat al in de browser te doen stuurt een 4000px
// telefoonfoto van 6 MB nog maar een paar honderd KB over de lijn in plaats
// van het volledige origineel. HEIC laat de browser meestal niet eens tekenen
// (canvas blijft leeg of faalt stil), dus die gaan ongemoeid naar de server,
// die ze al kan converteren.
const UPLOAD_MAX_EDGE = 2000;
function downscaleImage(file) {
  return new Promise((resolve) => {
    if (!/^image\/(jpe?g|png|webp)$/i.test(file.type || "")) { resolve(null); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, UPLOAD_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
      if (scale >= 1) { resolve(null); return; } // al klein genoeg — origineel is prima
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      // De Blob zoals canvas 'm geeft, niet als tekst. Wie hem als base64 wil
      // (de upload zelf) vraagt daar apart om; wie hem alleen wil tónen heeft
      // aan een object-URL genoeg en hoeft die bytes nooit in het geheugen van
      // de pagina te hebben.
      canvas.toBlob((blob) => resolve(blob ? { blob, mediaType: "image/jpeg" } : null), "image/jpeg", 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

// Als Blob. Een bestand ís al een Blob, dus wat niet verkleind kan worden
// (HEIC bijvoorbeeld) gaat gewoon zoals het is door.
async function readForUploadBlob(file) {
  return (await downscaleImage(file)) || { blob: file, mediaType: file.type };
}

// Pas op het moment van versturen naar base64, want de API verwacht JSON. Zo
// bestaat die dure tekstversie alleen tijdens het ene verzoek waar hij voor
// nodig is, in plaats van voor de hele stapel tegelijk.
function blobNaarBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Kon foto niet lezen"));
    reader.readAsDataURL(blob);
  });
}

async function readForUpload(file) {
  const { blob, mediaType } = await readForUploadBlob(file);
  return { dataUrl: `data:${mediaType};base64,${await blobNaarBase64(blob)}`, mediaType };
}

// ---------- Wachtrij voor uploads, op schijf ----------
// Foto's stonden als base64-tekst in het geheugen van de pagina te wachten tot
// ze verstuurd werden. Dat is twee keer duur: tekst kost in JavaScript twee
// bytes per teken, en base64 is zelf al een derde groter dan de bytes die het
// beschrijft. Ging de tab eraan — en dat gebeurt op een telefoon bij een paar
// honderd megabyte — dan was alles weg wat je net had ingelezen.
//
// Nu gaan ze als Blob naar IndexedDB. Die staat op schijf, telt niet mee voor
// het geheugen van de pagina, en blijft staan als de app afgeschoten wordt of
// je hem gewoon sluit: bij de volgende keer openen staat de stapel er nog.
const WACHTRIJ_DB = "reisplanner-uploads";
const WACHTRIJ_STORE = "wachtrij";
let _wachtrijDb = null;
function wachtrijDb() {
  if (_wachtrijDb) return _wachtrijDb;
  _wachtrijDb = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("Geen IndexedDB")); return; }
    const verzoek = indexedDB.open(WACHTRIJ_DB, 1);
    verzoek.onupgradeneeded = () => {
      const db = verzoek.result;
      if (!db.objectStoreNames.contains(WACHTRIJ_STORE)) {
        const store = db.createObjectStore(WACHTRIJ_STORE, { keyPath: "id", autoIncrement: true });
        store.createIndex("tripId", "tripId");
      }
    };
    verzoek.onsuccess = () => resolve(verzoek.result);
    verzoek.onerror = () => reject(verzoek.error || new Error("Wachtrij openen mislukt"));
  });
  return _wachtrijDb;
}

// Privémodus en oudere browsers kunnen IndexedDB weigeren. Dan houden we de
// Blobs gewoon in een Map: dat overleeft geen herlaad, maar het is nog altijd
// stukken zuiniger dan base64-tekst, en de app blijft werken.
const _wachtrijNood = new Map();
let _noodTeller = 0;

async function wachtrijDoe(modus, fn) {
  const db = await wachtrijDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WACHTRIJ_STORE, modus);
    const uitkomst = fn(tx.objectStore(WACHTRIJ_STORE));
    tx.oncomplete = () => resolve(uitkomst.result !== undefined ? uitkomst.result : uitkomst);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function wachtrijToevoegen(item) {
  try {
    return await wachtrijDoe("readwrite", (store) => store.add(item));
  } catch {
    const id = `nood-${++_noodTeller}`;
    _wachtrijNood.set(id, { ...item, id });
    return id;
  }
}
async function wachtrijVoorReis(tripId) {
  try {
    const alles = await wachtrijDoe("readonly", (store) => store.index("tripId").getAll(tripId));
    return asList(alles);
  } catch {
    return [..._wachtrijNood.values()].filter((it) => it.tripId === tripId);
  }
}
async function wachtrijLezen(id) {
  if (_wachtrijNood.has(id)) return _wachtrijNood.get(id);
  try { return await wachtrijDoe("readonly", (store) => store.get(id)); }
  catch { return null; }
}
async function wachtrijBijwerken(id, patch) {
  if (_wachtrijNood.has(id)) { _wachtrijNood.set(id, { ..._wachtrijNood.get(id), ...patch }); return; }
  const bestaand = await wachtrijLezen(id);
  if (!bestaand) return;
  try { await wachtrijDoe("readwrite", (store) => store.put({ ...bestaand, ...patch })); } catch {}
}
async function wachtrijVerwijderen(id) {
  if (_wachtrijNood.delete(id)) return;
  try { await wachtrijDoe("readwrite", (store) => store.delete(id)); } catch {}
}

// Onderweg is de verbinding niet de vraag maar het probleem: van 22 foto's over
// 5G vielen er drie om met "Load failed", terwijl er met die foto's niets aan de
// hand was. Eén hapering hoorde geen verloren foto te betekenen, dus proberen we
// het nog twee keer, met een pauze ertussen die oploopt — meteen opnieuw
// aankloppen tijdens een storing helpt niemand.
//
// Alleen voor netwerkfouten zinvol; een foto die de server weigert (te groot,
// geen toegang) faalt bij poging drie net zo hard. Dat kost twee wachtjes, en
// dat is het waard tegenover het alternatief: iemand die zijn foto's kwijt is.
async function metHerkansing(fn, pogingen = 3) {
  let laatste;
  for (let poging = 0; poging < pogingen; poging++) {
    try { return await fn(); }
    catch (err) {
      laatste = err;
      if (poging < pogingen - 1) await new Promise((r) => setTimeout(r, 700 * (poging + 1)));
    }
  }
  throw laatste;
}

// Voert fn per item uit met maximaal `limit` tegelijk, zodat een batch foto's
// niet meer een voor een op elkaars volledige upload-rondje hoeft te wachten.
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Fullscreen photo viewer, shared by the dagboek strips and the Foto's grid.
// The image fills the screen; everything else floats over it, so tapping a
// photo gives you the photo rather than a boxed preview with panels under it.
function PhotoLightbox({ photos, index, onClose, onIndexChange, assign, onDelete, onRotate, onCaption, comments, slotLikes, tripId, currentUserId, isOwner, onCommentsChange }) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotated, setRotated] = useState(0);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionText, setCaptionText] = useState("");
  const [savingCaption, setSavingCaption] = useState(false);
  // De foto is nu het hele scherm: verhaal en reacties liggen er als een laag
  // overheen die je met een tik weg kan tikken, zodat de foto zelf de
  // hoofdrol houdt in plaats van een kaartje ernaast.
  const [chromeVisible, setChromeVisible] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [postingReply, setPostingReply] = useState(false);
  const [heartBurst, setHeartBurst] = useState(0);
  const touchStart = useRef(null);
  const tapTimer = useRef(null);
  const lastSwipeAt = useRef(0);

  const safeIndex = photos.length ? Math.min(index, photos.length - 1) : null;
  const viewing = safeIndex == null ? null : photos[safeIndex];

  const showNext = useCallback(() => onIndexChange((i) => (Math.min(i, photos.length - 1) + 1) % photos.length), [photos.length, onIndexChange]);
  const showPrev = useCallback(() => onIndexChange((i) => (Math.min(i, photos.length - 1) - 1 + photos.length) % photos.length), [photos.length, onIndexChange]);

  useEffect(() => { if (!photos.length) onClose(); }, [photos.length, onClose]);

  // Voorkomt dat een bijschrift of reactie die je nog aan het typen bent op de
  // verkeerde foto belandt als die intussen (via de pijltjestoetsen hieronder,
  // of anders) is doorgeschoven naar de volgende/vorige foto.
  useEffect(() => { setEditingCaption(false); setCaptionText(""); setReplyText(""); }, [viewing?.id]);

  useEffect(() => {
    function handleKey(e) {
      // Cursor verplaatsen in het bijschrift-tekstveld mag niet als foto-navigatie
      // gelden — anders springt een pijltje-tik tijdens het typen naar de
      // volgende foto en belandt de tekst straks op de verkeerde.
      const tag = document.activeElement?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if (e.key === "ArrowRight") showNext();
      else if (e.key === "ArrowLeft") showPrev();
      else if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [showNext, showPrev, onClose]);

  // Lock the page behind the viewer so a swipe doesn't scroll the dagboek.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  function handleTouchStart(e) {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY, locked: null };
    setDragging(true);
  }
  function handleTouchMove(e) {
    if (!touchStart.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    if (touchStart.current.locked === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
      touchStart.current.locked = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (touchStart.current.locked === "x") setDragX(dx);
  }
  function handleTouchCancel() {
    touchStart.current = null; setDragging(false); setDragX(0);
  }
  function handleTouchEnd(e) {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    const wasHorizontal = touchStart.current.locked === "x";
    touchStart.current = null;
    if (wasHorizontal && Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) showNext(); else showPrev();
      lastSwipeAt.current = Date.now();
      setDragX(0);
    } else {
      setDragging(false); setDragX(0);
    }
  }

  // Eén tik verbergt/toont verhaal en reacties, zodat de foto zelf even het
  // hele scherm krijgt; twee snel na elkaar waarderen de foto — net als
  // overal elders in de app is dat een duimpje, geen hartje. Kort na een
  // swipe telt een tik niet mee, anders wisselt de chrome per ongeluk mee
  // met de synthetische click die op touch-apparaten na een swipe volgt.
  function handleTap() {
    if (Date.now() - lastSwipeAt.current < 300) return;
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      handleDoubleTap();
    } else {
      tapTimer.current = setTimeout(() => {
        tapTimer.current = null;
        setChromeVisible((v) => !v);
      }, 220);
    }
  }

  async function handleDoubleTap() {
    setHeartBurst((n) => n + 1);
    if (!chromeVisible) setChromeVisible(true);
    if (canReact && currentUserId && !photoLike.liked_by_me) {
      try {
        await api.toggleJournalLike(tripId, { photo_id: viewing.id });
        await onCommentsChange();
      } catch {}
    }
  }

  async function handlePostReply(e) {
    e.preventDefault();
    if (!replyText.trim() || postingReply) return;
    setPostingReply(true);
    try {
      await api.addJournalComment(tripId, { photo_id: viewing.id, body: replyText.trim() });
      setReplyText("");
      await onCommentsChange();
    } catch (err) { alert(err.message || "Reactie plaatsen mislukt"); }
    finally { setPostingReply(false); }
  }

  if (!viewing) return null;

  const photoComments = comments ? comments.filter((c) => c.photo_id === viewing.id) : [];
  const photoLike = (slotLikes && slotLikes[`photo_id:${viewing.id}`]) || { like_count: 0, liked_by_me: false };
  const canReact = !!(comments && tripId && onCommentsChange);

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[200] bg-black select-none" style={{ height: "100dvh", touchAction: "manipulation" }}
      onClick={handleTap} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd} onTouchCancel={handleTouchCancel}>

      <img src={`${viewing.url}${rotated ? (viewing.url.includes("?") ? "&" : "?") + "r=" + rotated : ""}`} alt="" draggable={false}
        className="absolute inset-0 w-full h-full object-contain"
        style={{ transform: `translateX(${dragX}px)`, transition: dragging ? "none" : "transform 200ms ease-out", touchAction: "manipulation" }} />

      {heartBurst > 0 && (
        <div key={heartBurst} className="rp-heartpop absolute left-1/2 top-1/2 pointer-events-none z-[60] text-white">
          <Icon name="thumb" size={84} strokeWidth={1.3} style={{ filter: "drop-shadow(0 6px 18px rgba(0,0,0,.4))" }} />
        </div>
      )}

      {/* Top chrome */}
      <div className={`absolute top-0 left-0 right-0 flex items-center gap-2 px-3 pb-3 bg-gradient-to-b from-black/70 to-transparent transition-opacity duration-300 ${chromeVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
        onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose}
          className="w-9 h-9 rounded-full bg-black/50 text-white text-xl leading-none flex items-center justify-center hover:bg-black/70 transition-colors">
          ×
        </button>
        <div className="flex-1 text-center text-white/80 text-xs">
          {photos.length > 1 && <span>{safeIndex + 1} / {photos.length}</span>}
          {viewing.taken_at && <span className="ml-2 inline-flex items-center gap-1"><Icon name="clock" size={12} />{fmtDatetime(viewing.taken_at)}</span>}
        </div>
        {onRotate && (
          <button type="button" onClick={async () => { setRotating(true); try { await onRotate(viewing); setRotated(Date.now()); } finally { setRotating(false); } }}
            disabled={rotating}
            className="w-9 h-9 rounded-full bg-black/50 text-white text-base flex items-center justify-center hover:bg-black/70 transition-colors disabled:opacity-50"
            title="Kwartslag draaien">
            {rotating ? "…" : "↻"}
          </button>
        )}
        {onDelete && (
          <button type="button" onClick={() => onDelete(viewing)}
            className="w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
            title="Foto verwijderen">
            <Icon name="trash" size={16} />
          </button>
        )}
        {assign ? (
          <button type="button" onClick={() => setShowAssign((v) => !v)}
            className={`text-xs font-medium px-3 py-2 rounded-full transition-colors ${showAssign ? "bg-white text-gray-800" : "bg-black/50 text-white hover:bg-black/70"}`}>
            Toewijzen
          </button>
        ) : <span className="w-9" />}
      </div>

      {(viewing.caption || onCaption || canReact) && !showAssign && (
        <div className={`absolute left-0 right-0 bottom-0 px-4 bg-gradient-to-t from-black/85 via-black/40 to-transparent transition-all duration-300 ${chromeVisible ? "opacity-100" : "opacity-0 pointer-events-none translate-y-2"}`}
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)", paddingTop: "3rem" }}
          onClick={(e) => e.stopPropagation()}>

          {(viewing.caption || onCaption) && (
            editingCaption ? (
              <div className="space-y-2 max-w-lg mx-auto mb-3.5">
                <Textarea rows={2} autoFocus value={captionText} maxLength={500}
                  onChange={(e) => setCaptionText(e.target.value)} placeholder="Waar gaat deze foto over?" />
                <div className="flex gap-2">
                  <Button disabled={savingCaption}
                    onClick={async () => {
                      setSavingCaption(true);
                      try { await onCaption(viewing, captionText); setEditingCaption(false); }
                      finally { setSavingCaption(false); }
                    }}>{savingCaption ? "Opslaan..." : "Opslaan"}</Button>
                  <Button variant="secondary" onClick={() => setEditingCaption(false)}>Annuleren</Button>
                </div>
              </div>
            ) : viewing.caption ? (
              <p className="font-display text-white text-[17px] leading-relaxed whitespace-pre-wrap mb-3.5" style={{ textWrap: "balance", textShadow: "0 1px 8px rgba(0,0,0,.35)" }}>
                {viewing.caption}
                {onCaption && (
                  <button type="button" onClick={() => { setCaptionText(viewing.caption || ""); setEditingCaption(true); }}
                    className="ml-2 align-middle text-white/60 hover:text-white" aria-label="Bewerken"><Icon name="pen" size={14} /></button>
                )}
              </p>
            ) : onCaption ? (
              <button type="button" onClick={() => { setCaptionText(""); setEditingCaption(true); }}
                className="block text-white/70 hover:text-white text-xs mb-3.5">+ Verhaal toevoegen</button>
            ) : null
          )}

          {canReact && (
            <>
              {photoComments.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {photoComments.map((c) => (
                    <div key={c.id} className="flex items-start gap-2 rounded-2xl bg-white/15 px-3 py-1.5 max-w-[88%]" style={{ backdropFilter: "blur(6px)" }}>
                      <span className="text-[13px] text-white leading-snug break-words">
                        <b className="font-semibold">{c.author || "Iemand"}</b> {c.body}
                      </span>
                      {(c.user_id === currentUserId || isOwner) && (
                        <button type="button" onClick={async () => { if (confirm("Reactie verwijderen?")) { try { await api.deleteJournalComment(c.id); await onCommentsChange(); } catch (err) { alert(err.message || "Verwijderen mislukt"); } } }}
                          className="shrink-0 text-white/50 hover:text-white ml-auto" aria-label="Verwijderen">
                          <Icon name="trash" size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2.5">
                <button type="button" onClick={async (e) => {
                    e.stopPropagation();
                    if (!currentUserId) return;
                    try { await api.toggleJournalLike(tripId, { photo_id: viewing.id }); await onCommentsChange(); } catch (err) { alert(err.message || "Liken mislukt"); }
                  }}
                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${photoLike.liked_by_me ? "bg-sky-400 text-gray-900" : "bg-white/15 text-white hover:bg-white/25"}`}
                  title={photoLike.liked_by_me ? "Like weghalen" : "Vind ik leuk"}>
                  <Icon name="thumb" size={16} />
                </button>
                {photoLike.like_count > 0 && <span className="text-xs text-white/70 tnum shrink-0">{photoLike.like_count}</span>}
                {currentUserId && (
                  <form onSubmit={handlePostReply} className="flex-1 min-w-0">
                    <input value={replyText} onChange={(e) => setReplyText(e.target.value)} maxLength={2000}
                      placeholder="Reageer..." disabled={postingReply}
                      className="w-full h-9 rounded-full border border-white/25 bg-white/10 text-white placeholder-white/55 text-[13px] px-4 outline-none focus:border-white/50 disabled:opacity-60" />
                  </form>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {photos.length > 1 && (
        <>
          <button type="button" onClick={(e) => { e.stopPropagation(); showPrev(); }}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 text-white text-2xl flex items-center justify-center hover:bg-black/70 transition-colors">
            ‹
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); showNext(); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 text-white text-2xl flex items-center justify-center hover:bg-black/70 transition-colors">
            ›
          </button>
        </>
      )}

      {assign && showAssign && (
        <div className="absolute left-0 right-0 bottom-0 bg-white p-4 space-y-2 rounded-t-2xl"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
          onClick={(e) => e.stopPropagation()}>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Toewijzen aan</label>
          <Select value={photoTargetValue(viewing)} onChange={(e) => assign.onChange(viewing, e.target.value)}>
            <option value="">— Niet toegewezen —</option>
            {assign.dayGroups.map(({ day, transports: dayT, accommodations: dayA }) => (
              <optgroup key={day.id} label={dayOptionLabel(day)}>
                <option value={`day:${day.id}`}>Hele dag</option>
                {dayT.map((t) => (
                  <option key={"t" + t.id} value={`transport:${t.id}`}>{t.type || "Vervoer"} · {t.from_location} → {t.to_location}</option>
                ))}
                {dayA.map((a) => (
                  <option key={"a" + a.id} value={`accommodation:${a.id}`}>Verblijf · {a.name}</option>
                ))}
                {(day.activities || []).map((act) => (
                  <option key={act.id} value={`activity:${act.id}`}>{act.category || "Activiteit"} · {act.title}</option>
                ))}
              </optgroup>
            ))}
            {(assign.otherTransports.length > 0 || assign.otherAccommodations.length > 0) && (
              <optgroup label="Overig (geen datum gekoppeld)">
                {assign.otherTransports.map((t) => (
                  <option key={"t" + t.id} value={`transport:${t.id}`}>{t.type || "Vervoer"} · {t.from_location} → {t.to_location}</option>
                ))}
                {assign.otherAccommodations.map((a) => (
                  <option key={"a" + a.id} value={`accommodation:${a.id}`}>Verblijf · {a.name}</option>
                ))}
              </optgroup>
            )}
          </Select>
        </div>
      )}
    </div>,
    document.body
  );
}

function PhotoCaption({ photo, readOnly, onChanged, maxWidth }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(photo.caption || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!editing) setText(photo.caption || ""); }, [photo.caption, editing]);

  async function save() {
    setSaving(true);
    try { await api.setPhotoCaption(photo.id, text.trim()); setEditing(false); await onChanged(); }
    catch (err) { alert(err.message || "Opslaan mislukt"); }
    finally { setSaving(false); }
  }

  if (readOnly) {
    return photo.caption
      ? <p className="mt-1.5 text-xs text-gray-600 leading-snug whitespace-pre-wrap" style={{ maxWidth }}>{photo.caption}</p>
      : null;
  }

  if (editing) {
    return (
      <div className="mt-1.5 space-y-1.5" style={{ maxWidth }} onClick={(e) => e.stopPropagation()}>
        <Textarea rows={2} autoFocus value={text} maxLength={500}
          onChange={(e) => setText(e.target.value)} placeholder="Korte beschrijving..." />
        <div className="flex gap-2">
          <Button onClick={save} disabled={saving} className="!text-xs !px-2.5 !py-1">{saving ? "Opslaan..." : "Opslaan"}</Button>
          <Button variant="secondary" onClick={() => { setText(photo.caption || ""); setEditing(false); }} className="!text-xs !px-2.5 !py-1">Annuleren</Button>
        </div>
      </div>
    );
  }

  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      className="mt-1.5 block text-left text-xs leading-snug w-full" style={{ maxWidth }}>
      {photo.caption
        ? <span className="text-gray-600 whitespace-pre-wrap">{photo.caption}</span>
        : <span className="text-gray-400 italic hover:text-sky-600 transition-colors">+ Beschrijving</span>}
    </button>
  );
}

// Voortgang tijdens het uploaden van foto's. Uploaden duurt per foto merkbaar
// lang (verkleinen, versturen, opslaan), en een knop die alleen "Uploaden..."
// zegt geeft geen enkel houvast of er nog iets gebeurt — zeker niet bij een
// stapel foto's. Vandaar het aantal erbij en een balk die daadwerkelijk vult.
// Alleen nog de tekst; de balk zelf staat als Voortgangsbalk bij de andere
// bouwstenen, zodat het uploaden en het opzoeken van de route er hetzelfde
// uitzien in plaats van elk een eigen variant te hebben.
function UploadProgress({ done, total, className = "" }) {
  return (
    <Voortgangsbalk done={done} total={total} className={className}
      label={`${done} van ${total} ${total === 1 ? "foto" : "foto's"} geüpload`}
      ariaLabel="Voortgang uploaden" />
  );
}

// Klaarmaken is niet hetzelfde als uploaden, dus het zegt ook wat anders. Bij
// een grote stapel is dit de fase waarin je zit te wachten zonder dat er iets
// het netwerk op gaat: decoderen, verkleinen, opnamedatum uitlezen.
// Geen rood: er is niets misgegaan en er is niets kapot. Dit is een grens waar
// je tegenaan loopt, met er meteen bij wat je eraan doet.
function Grensmelding({ tekst, className = "" }) {
  return (
    <div className={`flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-900 ${className}`}>
      <Icon name="alert" size={15} className="mt-0.5 shrink-0" />
      <span>{tekst}</span>
    </div>
  );
}

function VerwerkVoortgang({ done, total, className = "" }) {
  return (
    <Voortgangsbalk done={done} total={total} className={className}
      label={`${done} van de ${total} ${total === 1 ? "foto" : "foto's"} klaargemaakt`}
      ariaLabel="Voortgang foto's klaarmaken" />
  );
}

function PhotoStrip({ photos, tripId, dayId, activityId, transportId, accommodationId, onChange, readOnly, days, transports, accommodations, large, comments, slotLikes, currentUserId, isOwner, onCommentsChange }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [viewingIndex, setViewingIndex] = useState(null);
  // Verhouding van foto's die hem niet in de database hebben staan, gemeten
  // zodra de browser ze geladen heeft. Zie beeldVerhouding hieronder.
  const [gemetenRatio, setGemetenRatio] = useState({});
  // Los in het dagverhaal geüploade foto (nog aan geen activiteit gekoppeld)
  // krijgt meteen de vraag of hij tot een activiteit gepromoveerd moet worden.
  // Alleen zinvol op dat dagniveau — een foto die al bij een activiteit hoort
  // is al "van" iets, en buiten het dagboek (large=false, bijv. de foto's-tab)
  // is er geen losse dag-context om dit aan te bieden.
  // De hele upload, niet één foto: maak je er een activiteit van, dan horen ze
  // er allemaal onder te komen. Wie acht foto's van dezelfde tempel uploadt
  // bedoelt één activiteit met acht foto's, niet één met één en zeven zwervers.
  const [activityPromptPhotos, setActivityPromptPhotos] = useState([]);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const canAssign = !readOnly && !!days;
  const canOfferActivity = large && !readOnly && !!dayId && !activityId && !transportId && !accommodationId && !!days;
  const { dayGroups, otherTransports, otherAccommodations } = canAssign
    ? computeDayGroups(days, transports || [], accommodations || [])
    : { dayGroups: [], otherTransports: [], otherAccommodations: [] };

  async function handleFiles(e) {
    const files = [...e.target.files];
    e.target.value = "";
    if (!files.length) return;
    // Deze strook verwerkt en verstuurt foto's een paar tegelijk en houdt ze
    // daarna niet vast, dus het geheugen loopt hier niet vol — het kost alleen
    // tijd, en die tijd moet je willen. Vandaar vragen in plaats van weigeren.
    if (files.length > FOTOS_VEEL && !confirm(
      `Je hebt ${files.length} foto's gekozen. Dat duurt een paar minuten en de app moet ondertussen open blijven staan. Doorgaan?`
    )) return;
    setUploading(true);
    setProgress({ done: 0, total: files.length });
    // Each file stands alone: one failure used to abort the whole batch AND skip
    // the refresh, so already-uploaded photos stayed invisible and the rest were
    // never attempted. Uploads run a few at a time instead of strictly one after
    // another — a batch of ten photos no longer waits for nine full round-trips
    // before the tenth even starts.
    const failed = [];
    const uploaded = [];
    await mapWithConcurrency(files, 3, async (file) => {
      try {
        const [image, exif] = await Promise.all([readForUpload(file), readExif(file)]);
        const base64 = image.dataUrl.split(",")[1];
        // Pas ná het eventueel verkleinen checken: anders werd precies de grote
        // telefoonfoto die downscaleImage moest redden alsnog geweigerd.
        if ((base64.length * 3) / 4 > MAX_PHOTO_BYTES) { failed.push(`${file.name} (te groot, max 8 MB)`); return; }
        const saved = await api.addPhoto(tripId, {
          day_id: dayId || null, activity_id: activityId || null, transport_id: transportId || null, accommodation_id: accommodationId || null,
          image: { data: base64, mediaType: image.mediaType },
          taken_at: exif.taken_at || null, latitude: exif.latitude ?? null, longitude: exif.longitude ?? null,
        });
        uploaded.push(saved);
      } catch (err) {
        failed.push(`${file.name} (${err.message || "mislukt"})`);
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    });
    setUploading(false);
    onChange();
    // Eén vraag voor de hele stapel — niet één per foto.
    if (canOfferActivity && uploaded.length) setActivityPromptPhotos(uploaded);
    if (failed.length) {
      alert(`${files.length - failed.length} van ${files.length} foto's geüpload.\n\nNiet gelukt:\n${failed.join("\n")}`);
    }
  }

  // De foto hing al ergens (los in het dagverhaal) toen de activiteit nog
  // niet bestond — na het aanmaken hoeft dus alleen de koppeling verlegd te
  // worden, niet opnieuw geüpload.
  async function handleActivityCreated(activity) {
    // Achter elkaar en niet tegelijk: het gaat om een handvol foto's, en een
    // stortvloed parallelle verzoeken vlak na een upload is precies waar de
    // verbinding onderweg op stukloopt. Mislukt er één, dan blijft die gewoon
    // los in de dag staan — beter dan de hele koppeling laten klappen.
    for (const foto of activityPromptPhotos) {
      try {
        await api.updatePhoto(foto.id, { day_id: activity.day_id, activity_id: activity.id, transport_id: null, accommodation_id: null });
      } catch {}
    }
    setShowActivityForm(false);
    setActivityPromptPhotos([]);
    onChange();
  }

  async function handleDelete(id) {
    if (!confirm("Foto verwijderen?")) return;
    await api.deletePhoto(id);
    onChange();
  }

  async function handleAssign(photo, value) {
    await api.updatePhoto(photo.id, assignPhotoPayload(days, value));
    setViewingIndex(null);
    onChange();
  }

  // "Veel groter" is bewust ook hier doorgevoerd, niet alleen in de
  // volledig-scherm-viewer erachter: de foto vult de hele strook.
  //
  // Dat ging eerst met 88vw, en dat is net iets anders dan "zo breed als er
  // ruimte is": vw rekent met het hele scherm, terwijl deze strook in een
  // dagblok binnen een kaart staat, met marges aan beide kanten. Gemeten op een
  // scherm van 402 pixels bleef er 322 over voor de strook, terwijl elk fotoblok
  // er 354 opeiste. Alles stak dus ruim dertig pixels buiten beeld. Bij de foto
  // zelf zie je dat nauwelijks — een randje eraf oogt gewoon als uitsnede — maar
  // de beschrijving en de reactieknoppen eronder hielden diezelfde breedte aan,
  // en dáár viel het meteen op: een zin die halverwege een woord begon en een
  // duimpje dat maar half in beeld stond.
  //
  // Een percentage rekent wél met de ruimte die er werkelijk is: als flex-item
  // is 100% precies de breedte van de strook. Eén foto is dan exact één
  // "pagina" van de veeg-beweging, wat ook het vastklikken (snap-center) rond
  // maakt. De hoogte volgt via aspect-square de breedte, in plaats van los van
  // elkaar op dezelfde vw-waarde te leunen.
  // In het dagboek zijn de foto's de hoofdzaak, dus krijgen ze hun eigen
  // verhouding in plaats van een vierkant. Een staande foto werd door dat
  // vierkant boven- en onderaan weggesneden én bleef klein; met de echte
  // verhouding is hij hoger, dus groter, en zie je hem helemaal.
  //
  // Wel geklemd: een panorama van 3:1 zou een velletje worden en een extreem
  // staande foto zou het hele scherm vullen en de rest van de dag wegduwen.
  // De ondergrens ligt op 0,7 en niet op 0,8, omdat 3:4 (0,75) de gewone stand
  // van een telefoonfoto is — die hoort er juist helemaal op te staan. Een
  // filmische 9:16 wordt wél iets bijgesneden.
  const thumbClass = large ? "w-full h-auto" : "w-24 h-24";
  const beeldVerhouding = (p) => {
    if (!large) return undefined;
    // De kolommen width/height zijn er pas later bij gekomen, dus foto's van
    // vóór die tijd hebben ze niet. Voor die groep meten we de verhouding aan
    // de foto zelf zodra de browser hem geladen heeft.
    const w = Number(p.width) || 0, h = Number(p.height) || 0;
    const ratio = w && h ? w / h : gemetenRatio[p.id];
    if (!ratio) return 1;
    return Math.min(Math.max(ratio, 0.7), 1.5);
  };
  function onthoudRatio(p, img) {
    if (!large || Number(p.width) > 0 || gemetenRatio[p.id]) return;
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return;
    setGemetenRatio((vorige) => ({ ...vorige, [p.id]: w / h }));
  }
  // De beschrijving en de reacties eronder horen even breed te zijn als het
  // fotoblok waar ze bij staan — dat is nu gewoon "de volle breedte".
  const largeMaxWidth = "100%";

  return (
    <div onClick={(e) => e.stopPropagation()}>
      {/* rp-fotobreed haalt de foto's uit de binnenmarge van de dagkaart, zodat
          ze de volle breedte pakken. De tekst eronder — beschrijving, duimpje,
          reacties — krijgt die marge via rp-fototekst weer terug, want een zin
          die tegen de rand van de kaart begint leest niet. Buiten het dagboek
          staan de variabelen op nul en verandert er dus niets. */}
      <div className={`flex ${large ? "gap-4 snap-x snap-mandatory rp-fotobreed" : "gap-2"} overflow-x-auto pb-1`}>
        {/* De breedte hoort op het blok hieronder (het flex-item) en niet op de
            <img>: een percentage op de foto zou zich richten naar zijn ouder, en
            die is juist zo breed als zijn inhoud — een kringetje. Op het item
            zelf rekent 100% met de strook eromheen, en dat is wél een vaste
            maat. Op een breed scherm zou één foto anders de hele strook vullen,
            vandaar de bovengrens. */}
        {/* De bovengrens van 420 pixels was er voor brede schermen, zodat één
            foto niet de hele strook opslokt. Op een telefoon zat hij in de weg:
            daar is de strook zelf al smaller dan dat. Nu 560, wat op een telefoon
            niets afknijpt en op een breed scherm nog steeds remt. */}
        {photos.map((p, i) => (
          <div key={p.id} className={`relative shrink-0 group ${large ? "snap-center w-full max-w-[560px]" : ""}`}>
            <img src={p.thumb_url || p.url} alt={p.caption || ""} loading="lazy" decoding="async" onClick={() => setViewingIndex(i)}
              onLoad={(e) => onthoudRatio(p, e.currentTarget)}
              style={large ? { aspectRatio: beeldVerhouding(p) } : undefined}
              className={`${thumbClass} ${large ? "rounded-2xl" : "rounded-lg"} object-cover cursor-pointer border border-gray-100`} />
            {large && (
              <div className="rp-fototekst">
                <PhotoCaption photo={p} readOnly={readOnly} onChanged={onChange} maxWidth={largeMaxWidth} />
              </div>
            )}
            {large && comments && (
              <div className="mt-1.5 rp-fototekst" style={{ maxWidth: largeMaxWidth }} onClick={(e) => e.stopPropagation()}>
                <JournalComments slot={{ photo_id: p.id }}
                  comments={comments.filter((c) => c.photo_id === p.id)}
                  like={(slotLikes && slotLikes[`photo_id:${p.id}`]) || { like_count: 0, liked_by_me: false }}
                  tripId={tripId} currentUserId={currentUserId} isOwner={isOwner} onChanged={onCommentsChange} />
              </div>
            )}
            {/* In het dagboek staat dit kruisje binnen de hoek van de foto in
                plaats van er net buiten. De foto is daar nu precies zo breed als
                de strook, dus een knop die naar buiten steekt valt half achter de
                rand — en liet de strook bovendien zes pixels meescrollen, wat het
                vastklikken per foto net niet rond maakte. In de compacte grid is
                er wél ruimte naast de tegel, dus daar blijft hij staan waar hij
                stond. */}
            {/* Welke foto vooraan staat. Alleen zinvol bij meer dan één foto, en
                niet op de eerste: die stáát al vooraan. De volgorde is verder de
                opnametijd; dit zet er één bovenop zonder de rest te verschuiven. */}
            {!readOnly && large && photos.length > 1 && i > 0 && (
              <button type="button" onClick={async () => { await api.zetFotoVoorop(p.id); await onChange(); }}
                title="Deze foto vooraan zetten" aria-label="Deze foto vooraan zetten"
                className="absolute top-1.5 left-1.5 h-8 px-2.5 rounded-full bg-white/95 backdrop-blur shadow text-[11px] font-semibold text-gray-600 hover:text-sky-700 flex items-center gap-1 transition-colors">
                <Icon name="arrowLeft" size={13} />Vooraan
              </button>
            )}
            {!readOnly && (
              <button type="button" onClick={() => handleDelete(p.id)}
                className={`absolute rounded-full bg-white shadow text-red-500 leading-none opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity flex items-center justify-center ${large ? "top-1.5 right-1.5 w-8 h-8 text-base" : "-top-1.5 -right-1.5 w-6 h-6 text-sm"}`}>
                ×
              </button>
            )}
          </div>
        ))}
        {/* In de compacte grid (foto's-tab) blijft de "+"-tegel gewoon in de
            scrollende rij staan — de tegels zijn klein genoeg om zichtbaar te
            blijven. In het dagboek (large) duwden de nu veel bredere foto's
            'm daar helemaal buiten beeld: bij één foto van bijna schermbreed
            stond de knop achter de rand, onbereikbaar zonder te weten dat je
            opzij moest vegen. Die staat daarom hieronder, los van de
            scrollende rij, altijd zichtbaar. */}
        {!readOnly && !large && (
          <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()}
            className="shrink-0 w-24 h-24 rounded-lg border-2 border-dashed border-gray-200 hover:border-gray-300 flex items-center justify-center text-gray-400 hover:text-gray-500 text-2xl transition-colors">
            {uploading ? "…" : "＋"}
          </button>
        )}
      </div>
      {!readOnly && large && !uploading && (
        <button type="button" onClick={() => fileRef.current?.click()}
          className="mt-2 inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-gray-200 bg-white text-xs font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-colors">
          <span className="text-base leading-none">＋</span>
          Foto toevoegen
        </button>
      )}
      {!readOnly && uploading && (
        <div className="mt-2" style={large ? { maxWidth: largeMaxWidth } : undefined}>
          <UploadProgress done={progress.done} total={progress.total} />
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
      {/* Deze vraag stond als een dun regeltje van 12px met "Ja" als tekstlink
          en een kruisje ernaast — te makkelijk over het hoofd te zien, en het
          was niet duidelijk dat je hier iets kon kiezen. Nu een echte kaart met
          de foto erbij (zodat zichtbaar is wélke foto het betreft) en twee
          even grote knoppen met een duidelijk ja en nee. */}
      {canOfferActivity && activityPromptPhotos.length > 0 && (
        <div className="rp-rise mt-3 p-3 rounded-2xl border border-sky-200 bg-sky-50 shadow-sm" style={{ maxWidth: largeMaxWidth }}>
          <div className="flex items-center gap-3">
            {/* Een stapeltje in plaats van één foto, zodat je vóór het antwoorden
                al ziet dat het over de hele upload gaat en niet over die ene. */}
            <div className="relative w-14 h-14 shrink-0">
              {activityPromptPhotos.slice(0, 3).reverse().map((f, i, rij) => (
                <img key={f.id} src={f.thumb_url || f.url} alt=""
                  className="absolute w-14 h-14 rounded-xl object-cover border-2 border-sky-50"
                  style={{ left: (rij.length - 1 - i) * 4, top: (rij.length - 1 - i) * -2, zIndex: i }} />
              ))}
            </div>
            <div className="min-w-0">
              <div className="font-display text-[17px] text-gray-800 leading-snug">
                {activityPromptPhotos.length === 1
                  ? "Activiteit van deze foto maken?"
                  : `Activiteit van deze ${activityPromptPhotos.length} foto's maken?`}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {activityPromptPhotos.length === 1
                  ? "Dan komt hij op de planning te staan met een naam en tijd."
                  : "Dan komen ze samen op de planning te staan, met een naam en tijd."}
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={() => setActivityPromptPhotos([])}
              className="rp-press flex-1 h-11 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-600 hover:border-gray-300 transition-colors">
              Nee
            </button>
            <button type="button" onClick={() => setShowActivityForm(true)}
              className="rp-press flex-1 h-11 rounded-xl bg-sky-300 text-sm font-semibold text-gray-800 hover:bg-sky-400 transition-colors">
              Ja
            </button>
          </div>
        </div>
      )}
      {showActivityForm && (
        <ActivityForm dayId={dayId} tripId={tripId} days={days}
          onSaved={handleActivityCreated}
          onClose={() => { setShowActivityForm(false); setActivityPromptPhotos([]); }} />
      )}
      {viewingIndex != null && (
        <PhotoLightbox photos={photos} index={viewingIndex}
          onClose={() => setViewingIndex(null)} onIndexChange={setViewingIndex}
          assign={canAssign ? { dayGroups, otherTransports, otherAccommodations, onChange: handleAssign } : null}
          onDelete={readOnly ? null : (p) => handleDelete(p.id)}
          onRotate={readOnly ? null : async (p) => { await api.rotatePhoto(p.id); await onChange(); }}
          onCaption={readOnly ? null : async (p, text) => { await api.setPhotoCaption(p.id, text); await onChange(); }}
          comments={comments} slotLikes={slotLikes} tripId={tripId} currentUserId={currentUserId} isOwner={isOwner} onCommentsChange={onCommentsChange} />
      )}
    </div>
  );
}

// ---------- Bulk photo upload with automatic day allocation ----------
function dayOptionLabel(day) {
  if (!day.date) return "Dag zonder datum";
  return new Date(day.date).toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

function BulkPhotoUpload({ tripId, days, onClose, onUploaded }) {
  const [items, setItems] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  // Het uploaden had al een balk, het inlezen niet — terwijl dát bij een hele
  // kaartlezer de lange wacht is: elke foto wordt gedecodeerd, verkleind en op
  // zijn Exif nagekeken vóórdat er ook maar iets verstuurd wordt. Bij tweehonderd
  // vakantiefoto's stond er minutenlang "Foto's verwerken..." zonder dat iets
  // liet zien of het opschoot of vastliep.
  const [verwerken, setVerwerken] = useState({ done: 0, total: 0 });
  const [grensmelding, setGrensmelding] = useState(null);
  const [uploadMelding, setUploadMelding] = useState(null);
  const [hervat, setHervat] = useState(0);
  const fileRef = useRef(null);
  // Object-URL's zijn verwijzingen naar de Blobs op schijf; zolang je ze niet
  // intrekt houdt de browser die bytes vast. Bijhouden welke er open staan is
  // dus geen boekhoudkundige netheid maar precies waar dit hele verhaal om
  // begonnen is.
  const urlsRef = useRef(new Set());
  function maakUrl(blob) {
    const url = URL.createObjectURL(blob);
    urlsRef.current.add(url);
    return url;
  }
  function trekUrlIn(url) {
    if (!url) return;
    URL.revokeObjectURL(url);
    urlsRef.current.delete(url);
  }
  useEffect(() => () => { urlsRef.current.forEach((u) => URL.revokeObjectURL(u)); urlsRef.current.clear(); }, []);

  // Wat er van een vorige keer nog klaarstaat. Sloot de app halverwege — of
  // schoot de telefoon hem af — dan hoef je niet opnieuw te beginnen.
  useEffect(() => {
    let vervallen = false;
    wachtrijVoorReis(tripId).then((rijen) => {
      if (vervallen || !rijen.length) return;
      setItems(rijen.map((r) => ({
        id: r.id, name: r.name, mediaType: r.mediaType, exif: r.exif || {},
        dayId: r.dayId || "", thumbUrl: maakUrl(r.blob),
      })));
      setHervat(rijen.length);
    }).catch(() => {});
    return () => { vervallen = true; };
  }, [tripId]);

  function matchDay(takenAt) {
    if (!takenAt) return "";
    const dateStr = takenAt.slice(0, 10);
    const match = days.find((d) => d.date && d.date.slice(0, 10) === dateStr);
    return match ? String(match.id) : "";
  }

  async function handleSelectFiles(e) {
    let files = [...e.target.files];
    e.target.value = "";
    if (!files.length) return;
    // Snijden en zeggen wat er afvalt, niet stilzwijgend weigeren: wie er 150
    // koos wil weten dat er 100 doorgaan en de rest een tweede ronde is.
    const ruimte = FOTOS_MAX_TEGELIJK - items.length;
    if (files.length > ruimte) {
      setGrensmelding(ruimte <= 0
        ? `Er staan al ${items.length} foto's klaar — meer dan ${FOTOS_MAX_TEGELIJK} tegelijk gaat niet goed. Upload deze eerst en kies daarna de rest.`
        : `Je koos ${files.length} foto's; hier gaan er ${ruimte} van mee. Meer dan ${FOTOS_MAX_TEGELIJK} tegelijk gaat niet goed — upload deze eerst en kies daarna de rest.`);
      files = files.slice(0, Math.max(0, ruimte));
      if (!files.length) return;
    } else {
      setGrensmelding(null);
    }
    setProcessing(true);
    setHervat(0);
    // Optellen bij wat er al stond: kiest iemand er halverwege nog een map bij,
    // dan hoort de balk dóór te lopen en niet terug te springen naar nul.
    setVerwerken((v) => ({ done: v.done, total: v.total + files.length }));
    const newItems = await mapWithConcurrency(files, 4, async (file) => {
      try {
        const [image, exif] = await Promise.all([readForUploadBlob(file), readExif(file)]);
        // Pas ná het eventueel verkleinen checken: anders werd precies de grote
        // telefoonfoto die downscaleImage moest redden alsnog geweigerd. Op de
        // Blob zelf, want die kent zijn omvang zonder dat er iets omgezet hoeft.
        if (image.blob.size > MAX_PHOTO_BYTES) return { id: `fout-${file.name}-${file.lastModified}`, name: file.name, error: "Te groot (max 8 MB)" };
        const dayId = matchDay(exif.taken_at);
        const id = await wachtrijToevoegen({
          tripId, name: file.name, blob: image.blob, mediaType: image.mediaType, exif, dayId,
        });
        return { id, name: file.name, mediaType: image.mediaType, exif, dayId, thumbUrl: maakUrl(image.blob) };
      } catch {
        return { id: `fout-${file.name}-${file.lastModified}`, name: file.name, error: "Kon foto niet lezen" };
      } finally {
        // In finally, niet na de return: een foto die niet te lezen is telt ook
        // als afgehandeld, anders bleef de balk bij een rotte foto hangen.
        setVerwerken((v) => ({ ...v, done: v.done + 1 }));
      }
    });
    setItems((prev) => [...prev, ...newItems]);
    setProcessing(false);
  }

  function setItemDay(id, dayId) {
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, dayId } : it));
    // Ook op schijf, anders is de dagkeuze na een herlaad weer weg terwijl de
    // foto er nog staat.
    wachtrijBijwerken(id, { dayId });
  }
  function removeItem(id) {
    setItems((prev) => {
      trekUrlIn(prev.find((it) => it.id === id)?.thumbUrl);
      return prev.filter((it) => it.id !== id);
    });
    wachtrijVerwijderen(id);
  }

  const uploadable = items.filter((it) => !it.error);
  const matchedCount = uploadable.filter((it) => it.dayId).length;

  async function handleUploadAll() {
    if (!uploadable.length) return;
    setUploading(true); setProgress(0); setUploadMelding(null);
    const gelukt = new Set();
    const redenen = new Map();
    await mapWithConcurrency(uploadable, 3, async (it) => {
      try {
        // De Blob pas hier van schijf halen en pas hier naar base64 omzetten:
        // met drie tegelijk bestaan er dus nooit meer dan drie dure tekstversies,
        // hoe lang de stapel ook is.
        const rij = await wachtrijLezen(it.id);
        if (!rij?.blob) throw new Error("Foto niet meer gevonden");
        const base64 = await blobNaarBase64(rij.blob);
        await metHerkansing(() => api.addPhoto(tripId, {
          day_id: it.dayId || null, activity_id: null,
          image: { data: base64, mediaType: it.mediaType },
          taken_at: it.exif.taken_at || null, latitude: it.exif.latitude ?? null, longitude: it.exif.longitude ?? null,
        }));
        await wachtrijVerwijderen(it.id);
        gelukt.add(it.id);
      } catch (err) {
        redenen.set(it.id, err.message || "mislukt");
      }
      setProgress((p) => p + 1);
    });
    setUploading(false);
    onUploaded();
    if (!redenen.size) {
      setItems((prev) => { prev.forEach((it) => trekUrlIn(it.thumbUrl)); return []; });
      onClose();
      return;
    }
    // Wat gelukt is verdwijnt uit de lijst, wat niet gelukt is blijft staan met
    // de reden erbij. Het scherm sloot voorheen hoe dan ook, en dan waren die
    // foto's weg: opnieuw opzoeken in je fotorol, opnieuw inlezen, opnieuw een
    // dag kiezen. Terwijl er niets mis is met de foto — het netwerk hikte even.
    setItems((prev) => {
      prev.forEach((it) => { if (gelukt.has(it.id)) trekUrlIn(it.thumbUrl); });
      return prev
        .filter((it) => !gelukt.has(it.id))
        .map((it) => redenen.has(it.id) ? { ...it, uploadFout: redenen.get(it.id) } : it);
    });
    setUploadMelding(`${gelukt.size} van de ${uploadable.length} foto's geüpload. ${redenen.size === 1 ? "Deze bleef" : `Deze ${redenen.size} bleven`} achter — meestal een haperende verbinding.`);
  }

  return (
    // Niet te sluiten zolang er foto's klaargemaakt of verstuurd worden: half
    // ingelezen werk weggooien of een upload afbreken is nooit wat iemand
    // bedoelt met een tik naast het venster.
    <Modal title="Foto's uploaden" onClose={() => { if (!processing && !uploading) onClose(); }} wide>
      {items.length === 0 ? (
        <div>
          <p className="text-sm text-gray-500 mb-4">
            Selecteer meerdere foto's tegelijk — maximaal {FOTOS_MAX_TEGELIJK} per keer. Ze worden automatisch aan de juiste reisdag gekoppeld op basis van de datum waarop de foto is gemaakt.
          </p>
          {grensmelding && <Grensmelding tekst={grensmelding} className="mb-4" />}
          <button type="button" onClick={() => fileRef.current?.click()} disabled={processing}
            className="w-full border-2 border-dashed border-gray-200 rounded-xl py-10 text-sm text-gray-400 hover:border-gray-300 hover:text-gray-500 transition-colors">
            {processing ? "Foto's verwerken..." : <><Icon name="camera" size={15} className="mr-1.5" />Klik om foto's te kiezen</>}
          </button>
          {processing && <VerwerkVoortgang {...verwerken} className="mt-3" />}
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleSelectFiles} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm text-gray-500">
              {matchedCount} van de {uploadable.length} foto's automatisch gekoppeld aan een dag.
            </p>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={processing || uploading}
              className="text-xs font-medium text-sky-600 hover:text-sky-700 disabled:opacity-50">+ Meer foto's</button>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleSelectFiles} />
          </div>
          {grensmelding && <Grensmelding tekst={grensmelding} />}
          {uploadMelding && <Grensmelding tekst={uploadMelding} />}
          {!uploadMelding && hervat > 0 && (
            <Grensmelding tekst={`${hervat === 1 ? "Deze foto stond" : `Deze ${hervat} foto's stonden`} nog klaar van de vorige keer — je hoeft ze niet opnieuw te kiezen.`} />
          )}
          {processing && <VerwerkVoortgang {...verwerken} />}
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {items.map((it) => (
              <div key={it.id} className="flex items-center gap-3 border border-gray-100 rounded-lg p-2">
                {it.thumbUrl ? (
                  // lazy: bij een lijst van honderden zou de browser anders elke
                  // foto op volle grootte decoderen om 'm 80 bij 80 te tonen.
                  <img src={it.thumbUrl} alt="" loading="lazy" decoding="async" className="w-20 h-20 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-red-50 flex items-center justify-center text-red-400 shrink-0"><Icon name="alert" size={22} /></div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-700 truncate">{it.name}</div>
                  {it.error ? (
                    <div className="text-xs text-red-500">{it.error}</div>
                  ) : it.uploadFout ? (
                    <div className="text-xs text-amber-700">Niet gelukt: {it.uploadFout}</div>
                  ) : (
                    <div className="text-xs text-gray-400">{it.exif?.taken_at ? fmtDatetime(it.exif.taken_at) : "Geen datum gevonden"}</div>
                  )}
                </div>
                {!it.error && (
                  <Select value={it.dayId} onChange={(e) => setItemDay(it.id, e.target.value)} className="!w-40 shrink-0">
                    <option value="">Geen dag</option>
                    {days.map((d) => <option key={d.id} value={d.id}>{dayOptionLabel(d)}</option>)}
                  </Select>
                )}
                <button type="button" onClick={() => removeItem(it.id)} className="text-gray-300 hover:text-red-500 p-1 shrink-0" aria-label="Verwijderen"><Icon name="trash" size={15} /></button>
              </div>
            ))}
          </div>
          {uploading && <UploadProgress done={progress} total={uploadable.length} />}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={uploading || processing}>Annuleren</Button>
            <Button type="button" onClick={handleUploadAll} disabled={uploading || processing || !uploadable.length}>
              {uploading ? "Uploaden..."
                : uploadMelding ? `Opnieuw proberen (${uploadable.length})`
                : `Uploaden (${uploadable.length})`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
