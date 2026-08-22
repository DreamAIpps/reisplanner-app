// Het fotoboek als PDF.
//
// Apart bestand omdat dit werk niet meer in de webserver hoort te gebeuren: een
// boek van twintig pagina's met echte foto's kost acht seconden rekenen en
// honderden megabytes geheugen, en zolang dat loopt staat de server stil voor
// iedereen. Gemeten op een boek van 20 pagina's met 60 foto's van samen 129 MB:
// andere verzoeken die normaal 1 ms duren liepen op tot twee seconden.
//
// De werker (werker.js) roept dit aan; de webserver zet alleen een taak klaar.
// Het schrijft naar een stroom in plaats van naar een buffer, zodat een boek van
// honderden megabytes niet eerst helemaal in het geheugen hoeft te passen.
const PDFDocument = require("pdfkit");
const { query } = require("./db");
const opslag = require("./opslag");

const PALETTE = {
  primary: "#F3C2B5",
  textPrimary: "#373432",
};

// De bytes van een foto, waar hij ook ligt: in de kolom of in de objectopslag.
// Zelfde regel als in server.js — een PDF verwijst nergens heen, dus hier moeten
// ze echt opgehaald worden.
async function fotoBytes(rij) {
  if (!rij) return null;
  if (rij.data) return rij.data;
  if (!rij.storage_key) return null;
  return opslag.haal(rij.storage_key);
}

// Een lijst afwerken met hooguit zoveel dingen tegelijk, zodat een boek van
// honderdtwintig foto's niet honderdtwintig verbindingen naar de bucket opent.
async function parallelBeperkt(lijst, tegelijk, doe) {
  let volgende = 0;
  const werkers = Array.from({ length: Math.min(tegelijk, lijst.length) }, async () => {
    while (volgende < lijst.length) {
      const i = volgende++;
      await doe(lijst[i], i);
    }
  });
  await Promise.all(werkers);
}

// A4 in PDF-punten (72 punten per inch): 210mm x 297mm.
const PDF_PAGE_WIDTH = 595.28;
const PDF_PAGE_HEIGHT = 841.89;

// Titel, beschrijving en bijschriften komen uit de editor als een beperkte
// HTML-substring (b/i/font[face]/br/div — precies wat de contentEditable-
// opmaakknoppen produceren, zie app/03-ui-bouwstenen.js RICH_TEXT_ALLOWED_TAGS). Geen
// echte HTML-parser nodig voor zo'n kleine, vaste tagset: een simpele
// stack-based tag-walker volstaat. <br> en <div> worden allebei als
// regeleinde behandeld.
function pdfParseRichHtml(html) {
  const lines = [[]];
  const styleStack = [{ bold: false, italic: false, font: null, color: null, size: null }];
  // "br" vóór "b" — regex-alternatie kiest de eerste match, niet de langste,
  // dus "b" zou anders <br> al aftappen (met de "r" als restjunk-attribuut)
  // en het als een (nooit gesloten) <b>-tag behandelen.
  const tagRe = /<(\/?)(br|b|strong|i|em|font|div)([^>]*)>/gi;
  const decodeEntities = (s) => s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  let last = 0, m;
  const pushText = (text) => { if (text) lines[lines.length - 1].push({ text, ...styleStack[styleStack.length - 1] }); };
  while ((m = tagRe.exec(html))) {
    if (m.index > last) pushText(decodeEntities(html.slice(last, m.index)));
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    if (tag === "br") {
      lines.push([]);
    } else if (tag === "div") {
      if (!closing && lines[lines.length - 1].length > 0) lines.push([]);
    } else if (closing) {
      if (styleStack.length > 1) styleStack.pop();
    } else {
      const next = { ...styleStack[styleStack.length - 1] };
      if (tag === "b" || tag === "strong") next.bold = true;
      else if (tag === "i" || tag === "em") next.italic = true;
      else if (tag === "font") {
        const faceMatch = /face="([^"]*)"/i.exec(m[3] || "");
        if (faceMatch) next.font = faceMatch[1];
        const colorMatch = /color="([^"]*)"/i.exec(m[3] || "");
        if (colorMatch) next.color = colorMatch[1];
        // Nieuwe boeken zetten de grootte als font-size in punten; dat is
        // dezelfde eenheid als pdfkit gebruikt, dus die waarde kan er zo in.
        // Oudere tekst heeft nog size="1..7" — die schaal blijft werken.
        const ptMatch = /font-size:\s*([\d.]+)pt/i.exec(m[3] || "");
        if (ptMatch) next.sizePt = Number(ptMatch[1]);
        const sizeMatch = /size="([^"]*)"/i.exec(m[3] || "");
        if (sizeMatch) next.size = Number(sizeMatch[1]);
      }
      styleStack.push(next);
    }
    last = tagRe.lastIndex;
  }
  if (last < html.length) pushText(decodeEntities(html.slice(last)));
  return lines;
}
// pdfkit's .fill(kleur) accepteert wel een "rgba(...)"-string zonder te
// klagen, maar negeert het alpha-kanaal stilletjes (getest: geen /ca in de
// content-stream, dus altijd volledig dekkend) — het alfakanaal moet zelf
// via fillOpacity() worden toegepast, net als elders in dit bestand.
function parseRgbaColor(str) {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i.exec(str || "");
  if (!m) return { color: str, alpha: 1 };
  const [, r, g, b, a] = m;
  const hex = "#" + [r, g, b].map((v) => Number(v).toString(16).padStart(2, "0")).join("");
  return { color: hex, alpha: a !== undefined ? Number(a) : 1 };
}
// pdfkit heeft zonder embedden alleen de 14 standaard PDF-fonts (Helvetica/
// Times/Courier, elk in vet/cursief) — elke lettertype-keuze uit de editor
// valt terug op de dichtstbijzijnde van die drie. "Rond" en "Script" hebben
// geen echt serif/mono-equivalent en landen daarom bewust bij Helvetica.
function pdfBaseFontFamily(face) {
  if (!face) return "Helvetica";
  if (face.includes("mono")) return "Courier";
  if (face.includes("Iowan") || face.includes("Didot")) return "Times";
  return "Helvetica";
}
function pdfFontFor(run) {
  const base = pdfBaseFontFamily(run.font);
  if (base === "Times") return run.bold && run.italic ? "Times-BoldItalic" : run.bold ? "Times-Bold" : run.italic ? "Times-Italic" : "Times-Roman";
  if (base === "Courier") return run.bold && run.italic ? "Courier-BoldOblique" : run.bold ? "Courier-Bold" : run.italic ? "Courier-Oblique" : "Courier";
  return run.bold && run.italic ? "Helvetica-BoldOblique" : run.bold ? "Helvetica-Bold" : run.italic ? "Helvetica-Oblique" : "Helvetica";
}
// De oude HTML-schaal (<font size="N">, 1 t/m 7, 3 = standaard) omgerekend
// naar een factor t.o.v. de basisgrootte — dezelfde verhoudingen die
// browsers zelf gebruiken voor size 1..7 bij een 16px-basis.
const HTML_FONT_SIZE_RATIOS = { 1: 10 / 16, 2: 13 / 16, 3: 1, 4: 18 / 16, 5: 24 / 16, 6: 32 / 16, 7: 48 / 16 };
// pdfkit's "continued" runs laten losse stukken tekst met een eigen font achter
// elkaar doorlopen (en samen netjes binnen `width` afbreken) alsof het één
// paragraaf is — zo blijft vet/cursief/lettertype/grootte binnen dezelfde
// alinea werken.
function drawFormattedText(doc, html, x, y, opts = {}) {
  const { width, height, fontSize = 10, color = PALETTE.textPrimary, ellipsis, align } = opts;
  doc.fontSize(fontSize);
  const lines = pdfParseRichHtml(String(html || ""));
  let first = true;
  lines.forEach((lineRuns, li) => {
    const runs = lineRuns.length ? lineRuns : [{ text: "", bold: false, italic: false, font: null, color: null, size: null, sizePt: null }];
    runs.forEach((run, ri) => {
      const lastRunOfLine = ri === runs.length - 1;
      const lastRunOverall = li === lines.length - 1 && lastRunOfLine;
      // Een gekozen puntgrootte is absoluut en gaat vóór op de oude
      // verhoudingsschaal, die alleen nog voor bestaande tekst geldt.
      const runSize = run.sizePt || fontSize * (HTML_FONT_SIZE_RATIOS[run.size] || 1);
      doc.font(pdfFontFor(run)).fontSize(runSize).fillColor(run.color || color);
      const textOpts = { continued: !lastRunOfLine, width, align, ellipsis: lastRunOverall ? ellipsis : undefined };
      if (first) { doc.text(run.text, x, y, { ...textOpts, height }); first = false; }
      else doc.text(run.text, textOpts);
    });
  });
  doc.font("Helvetica").fontSize(fontSize);
}

// Zelfde crop-wiskunde als de CSS object-position/transform in de editor:
// schaal de foto zodat 'm het kader precies vult ("cover"), vermenigvuldig
// met de extra inzoom, en schuif 'm zo dat het brandpunt (cropX/cropY,
// 0-1) op dezelfde relatieve plek in het kader blijft staan.
function pdfCoverPlacement(imgW, imgH, boxW, boxH, cropX, cropY, zoom) {
  const coverScale = Math.max(boxW / imgW, boxH / imgH);
  const scale = coverScale * (zoom || 1);
  const drawW = imgW * scale, drawH = imgH * scale;
  const offsetX = (drawW - boxW) * (cropX ?? 0.5);
  const offsetY = (drawH - boxH) * (cropY ?? 0.5);
  return { drawX: -offsetX, drawY: -offsetY, drawW, drawH };
}

// Bouw het boek en schrijf het naar `doel` (een schrijfbare stroom). Geeft de
// bestandsnaam terug; de aanroeper bepaalt waar de stroom heen gaat.
// `opVoortgang` krijgt een getal tussen 0 en 1 na elke pagina, zodat de
// gebruiker "pagina 7 van 20" te zien krijgt in plaats van een balk die niets
// zegt.
async function bouwFotoboekPdf(boekId, doel, { opVoortgang = null } = {}) {
  const params = { id: boekId };
  const { rows: bookRows } = await query("SELECT * FROM photobooks WHERE id = $1", [params.id]);
  if (!bookRows.length) throw new Error("Fotoboek niet gevonden");
  const book = bookRows[0];

  const { rows: pages } = await query(
    "SELECT * FROM photobook_pages WHERE photobook_id = $1 ORDER BY position ASC",
    [params.id]
  );
  const { rows: pagePhotoRows } = await query(
    `SELECT pgp.page_id, pgp.x, pgp.y, pgp.width, pgp.height, pgp.opacity, pgp.corner_radius,
            pgp.crop_x, pgp.crop_y, pgp.crop_zoom, p.data, p.storage_key, p.width AS native_width, p.height AS native_height
     FROM photobook_page_photos pgp
     JOIN photobook_pages pp ON pp.id = pgp.page_id
     JOIN photos p ON p.id = pgp.photo_id
     WHERE pp.photobook_id = $1 ORDER BY pgp.page_id ASC, pgp.position ASC`,
    [params.id]
  );
  // Foto's die in de objectopslag liggen moeten hier wel echt opgehaald worden:
  // een PDF verwijst nergens heen, die bevat de bytes zelf. Naast elkaar, want
  // achter elkaar duurt een boek van veertig pagina's onnodig lang — maar niet
  // allemaal tegelijk, want dan opent een boek van honderdtwintig foto's ook
  // honderdtwintig verbindingen naar de bucket.
  await parallelBeperkt(pagePhotoRows, 8, async (p) => { p.data = await fotoBytes(p); });
  const photosByPage = new Map();
  for (const p of pagePhotoRows) {
    if (!p.data) continue;
    if (!photosByPage.has(p.page_id)) photosByPage.set(p.page_id, []);
    photosByPage.get(p.page_id).push(p);
  }
  // Een achtergrondfoto staat los van de gewone paginafoto's (die zijn er
  // juist bewust uit gehaald toen 'm als achtergrond werd gekozen) — die
  // moeten dus apart opgehaald worden.
  const bgPhotoIds = pages.filter((p) => p.background_type === "photo" && p.background_photo_id).map((p) => p.background_photo_id);
  const bgPhotosById = new Map();
  if (bgPhotoIds.length) {
    const { rows: bgRows } = await query("SELECT id, data, storage_key FROM photos WHERE id = ANY($1)", [bgPhotoIds]);
    await parallelBeperkt(bgRows, 8, async (r) => {
      const bytes = await fotoBytes(r);
      if (bytes) bgPhotosById.set(r.id, bytes);
    });
  }
  const { rows: pageTextBoxRows } = await query(
    `SELECT tb.* FROM photobook_page_textboxes tb
     JOIN photobook_pages pp ON pp.id = tb.page_id
     WHERE pp.photobook_id = $1 ORDER BY tb.page_id ASC, tb.position ASC`,
    [params.id]
  );
  const textBoxesByPage = new Map();
  for (const t of pageTextBoxRows) {
    if (!textBoxesByPage.has(t.page_id)) textBoxesByPage.set(t.page_id, []);
    textBoxesByPage.get(t.page_id).push(t);
  }

  const filename = (book.title || "Fotoboek").replace(/[^a-z0-9 _-]/gi, "").trim() || "Fotoboek";
  // Liggend wisselt gewoon breedte/hoogte om — pdfkit's "layout"-optie doet
  // dat zelf ook zo voor de paginagrootte (zie doc/addPage hieronder).
  const landscape = book.orientation === "landscape";
  const pageW = landscape ? PDF_PAGE_HEIGHT : PDF_PAGE_WIDTH;
  const pageH = landscape ? PDF_PAGE_WIDTH : PDF_PAGE_HEIGHT;

  // Welke pagina ligt links en welke rechts in het opengeslagen boek? Dezelfde
  // indeling als in de app: de kaft staat alleen, daarna liggen ze twee aan
  // twee. Alleen nodig voor een achtergrondfoto die over beide bladzijden
  // loopt — die moet weten welke helft hij hier laat zien.
  const spreadKant = new Map();
  {
    const binnenwerk = pages.filter((p) => p.role !== "cover_front" && p.role !== "cover_back");
    // Boeken van vóór de losse kaftpagina's: pagina één stond alleen.
    const zonderKaft = binnenwerk.length === pages.length ? binnenwerk.slice(1) : binnenwerk;
    zonderKaft.forEach((p, i) => spreadKant.set(p.id, i % 2 === 0 ? "links" : "rechts"));
  }

  const doc = new PDFDocument({ size: "A4", layout: landscape ? "landscape" : "portrait", autoFirstPage: false, margin: 0 });
  // Rechtstreeks naar de stroom, niet eerst helemaal in het geheugen. Dat was
  // het oude gedrag (om een Content-Length te kunnen meesturen voor de
  // voortgangsbalk), maar een boek van twintig pagina's levert al 170 MB op en
  // dat is te veel om in één keer vast te houden. De voortgang komt nu uit de
  // taak zelf, per pagina — een eerlijker getal bovendien.
  doc.pipe(doel);

  let gedaan = 0;
  for (const page of pages) {
    doc.addPage({ size: "A4", layout: landscape ? "landscape" : "portrait", margin: 0 });

    if (page.background_type === "color" && page.background_color) {
      doc.rect(0, 0, pageW, pageH).fill(page.background_color);
    } else if (page.background_type === "photo" && page.background_photo_id) {
      const bgData = bgPhotosById.get(page.background_photo_id);
      if (bgData) {
        try {
          if (page.background_spread) {
            // Eén foto over het opengeslagen boek. Hij wordt over de dubbele
            // breedte gelegd en per pagina schuift hij op, zodat de rechterhelft
            // precies verdergaat waar de linker ophoudt. Buiten de bladzijde
            // afknippen, anders loopt de andere helft over deze pagina heen.
            // Gecentreerd, net als het "center/cover" op het scherm — anders
            // valt de vouw hier op een andere plek in de foto dan in de editor.
            const linkerpagina = spreadKant.get(page.id) !== "rechts";
            doc.save();
            doc.rect(0, 0, pageW, pageH).clip();
            doc.image(bgData, linkerpagina ? 0 : -pageW, 0, { cover: [pageW * 2, pageH], align: "center", valign: "center" });
            doc.restore();
          } else {
            doc.save();
            doc.rect(0, 0, pageW, pageH).clip();
            doc.image(bgData, 0, 0, { cover: [pageW, pageH], align: "center", valign: "center" });
            doc.restore();
          }
          if (page.background_overlay > 0) {
            doc.rect(0, 0, pageW, pageH).fillOpacity(page.background_overlay).fill("#ffffff").fillOpacity(1);
          }
        } catch (err) {
          console.error("Fotoboek-PDF: achtergrondfoto kon niet worden ingevoegd:", err?.message || err);
        }
      }
    }

    for (const ph of (photosByPage.get(page.id) || [])) {
      const x = ph.x * pageW, y = ph.y * pageH;
      const w = ph.width * pageW, h = ph.height * pageH;
      try {
        doc.save();
        // Fractie van de kortste zijde van de pagina, niet van de foto — zo is
        // de ronding op papier voor elke foto even groot, precies zoals de
        // cqmin-eenheid dat in de editor doet. De begrenzing op de halve
        // kortste fotozijde vangt alleen het randgeval af waarin een heel
        // klein fotootje anders een radius groter dan zichzelf zou krijgen.
        const radius = Math.min((ph.corner_radius || 0) * Math.min(pageW, pageH), Math.min(w, h) / 2);
        if (radius > 0) doc.roundedRect(x, y, w, h, radius).clip();
        else doc.rect(x, y, w, h).clip();
        doc.opacity(ph.opacity ?? 1);
        // Zonder bekende pixelafmetingen (oudere foto's van vóór deze kolom
        // bestond) valt terug op pdfkit's eigen gecentreerde cover-crop.
        if (ph.native_width && ph.native_height) {
          const { drawX, drawY, drawW, drawH } = pdfCoverPlacement(ph.native_width, ph.native_height, w, h, ph.crop_x, ph.crop_y, ph.crop_zoom);
          doc.image(ph.data, x + drawX, y + drawY, { width: drawW, height: drawH });
        } else {
          doc.image(ph.data, x, y, { cover: [w, h], align: "center", valign: "center" });
        }
        doc.restore();
      } catch (err) {
        console.error("Fotoboek-PDF: foto kon niet worden ingevoegd:", err?.message || err);
      }
    }

    for (const tb of (textBoxesByPage.get(page.id) || [])) {
      if (!tb.html) continue;
      const x = tb.x * pageW, y = tb.y * pageH;
      const w = tb.width * pageW, h = tb.height * pageH;
      if (tb.background_color && tb.background_color !== "transparent") {
        const { color, alpha } = parseRgbaColor(tb.background_color);
        // Zelfde afgeronde hoeken als de editor/preview (rounded-xl).
        try { doc.roundedRect(x, y, w, h, 8).fillOpacity(alpha).fill(color).fillOpacity(1); } catch { /* ongeldige kleur negeren, tekst gaat gewoon door */ }
      }
      drawFormattedText(doc, tb.html, x + 2, y + 2, { width: Math.max(1, w - 4), height: Math.max(1, h - 4), fontSize: 10, color: PALETTE.textPrimary, align: tb.align });
    }

    if (page.title) {
      // Vrij gepositioneerd zoals een tekstvak (i.p.v. een vaste band
      // bovenaan) — zelfde wit-transparante achtergrond voor leesbaarheid
      // op een drukke foto, alleen niet zelf te kiezen.
      const x = page.title_x * pageW, y = page.title_y * pageH;
      const w = page.title_width * pageW, h = page.title_height * pageH;
      doc.roundedRect(x, y, w, h, 8).fillOpacity(0.85).fill("#ffffff").fillOpacity(1);
      drawFormattedText(doc, page.title, x + 2, y + 2, { width: Math.max(1, w - 4), height: Math.max(1, h - 4), fontSize: 14, color: PALETTE.textPrimary, align: page.title_align });
    }

    gedaan += 1;
    if (opVoortgang) await opVoortgang(gedaan / pages.length, gedaan, pages.length);
  }

  doc.end();
  // Wachten tot de stroom er echt doorheen is, niet tot pdfkit klaar is met
  // schrijven: pas dan staat het bestand er compleet.
  await new Promise((klaar, mis) => {
    doel.on("finish", klaar);
    doel.on("error", mis);
    doc.on("error", mis);
  });
  return { bestandsnaam: `${filename}.pdf`, paginas: pages.length };
}

module.exports = { bouwFotoboekPdf, PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT };
