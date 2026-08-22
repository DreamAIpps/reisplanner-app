// De goedkoopste test die er is, en die het vaakst iets vangt.
//
// De client wordt bij het opstarten van de server door Babel gehaald. Gaat dat
// mis, dan start de server wél maar krijgt elke bezoeker een lege pagina. Drie
// keer op één dag ging het op precies hetzelfde: een {/* commentaar */} midden
// in een JavaScript-uitdrukking, wat in JSX niet mag. Deze test vangt dat in
// een seconde in plaats van na een uitrol.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WORTEL = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP_DIR = path.join(WORTEL, "app");

function bronBestanden() {
  return readdirSync(APP_DIR).filter((f) => f.endsWith(".js")).sort();
}

function heleBron() {
  return bronBestanden().map((f) => readFileSync(path.join(APP_DIR, f), "utf8")).join("\n");
}

test("de client compileert", async () => {
  const babel = await import("@babel/core");
  const preset = await import("@babel/preset-react");
  const uit = babel.transformSync(heleBron(), {
    filename: "app.js",
    presets: [[preset.default ?? preset, { runtime: "classic" }]],
    configFile: false,
    babelrc: false,
  });
  assert.ok(uit.code.length > 1000, "de gecompileerde bundel is verdacht klein");
});

test("de client verwijst niet naar namen die niet bestaan, en laat niets ongebruikt achter", async () => {
  const { ESLint } = await import("eslint");
  const babel = await import("@babel/core");
  const preset = await import("@babel/preset-react");
  // Op de gecompileerde bundel, niet op de bron: de bestanden delen één scope
  // (ze worden achter elkaar geplakt), dus per bestand kijken zou elke
  // verwijzing naar een ander bestand als fout aanmerken.
  const code = babel.transformSync(heleBron(), {
    filename: "app.js",
    presets: [[preset.default ?? preset, { runtime: "classic" }]],
    configFile: false, babelrc: false,
  }).code;

  const browserGlobals = [
    "React", "ReactDOM", "window", "document", "fetch", "localStorage", "sessionStorage", "console",
    "setTimeout", "clearTimeout", "setInterval", "clearInterval", "navigator", "location", "alert",
    "confirm", "prompt", "FormData", "FileReader", "Image", "Blob", "URL", "L", "EXIF",
    "AbortController", "IntersectionObserver", "ResizeObserver", "requestAnimationFrame",
    "cancelAnimationFrame", "history", "URLSearchParams", "atob", "btoa", "structuredClone",
    "crypto", "performance", "screen", "getComputedStyle", "Event", "CustomEvent", "MutationObserver",
    "indexedDB", "IDBKeyRange", "DOMPurify", "qrcode", "matchMedia", "HTMLElement", "Node",
    "TextEncoder", "TextDecoder", "AudioContext", "webkitAudioContext", "Notification", "Response",
    "caches",
    "Request", "Headers", "queueMicrotask", "reportError", "self", "globalThis",
  ];

  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: {
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: "script",
        globals: Object.fromEntries(browserGlobals.map((g) => [g, "readonly"])),
      },
      linterOptions: { reportUnusedDisableDirectives: false },
      rules: {
        "no-undef": "error",
        // Dode code is niet alleen rommel: een functie die nergens meer wordt
        // aangeroepen is meestal het spoor van een halve verandering.
        "no-unused-vars": ["error", { args: "none", varsIgnorePattern: "^_" }],
      },
    },
  });

  const [uitslag] = await eslint.lintText(code, { filePath: "bundel.js" });
  const fouten = (uitslag.messages || []).filter((m) => m.severity === 2);
  const uitleg = fouten.slice(0, 10)
    .map((m) => `  regel ${m.line}: ${m.ruleId} — ${m.message}`).join("\n");
  assert.equal(fouten.length, 0, `${fouten.length} fout(en) in de bundel:\n${uitleg}`);
});

test("elk bronbestand heeft het nummervoorvoegsel dat de volgorde bepaalt", () => {
  // De bestanden worden op naam gesorteerd achter elkaar geplakt. Een bestand
  // zonder nummer belandt op een willekeurige plek en breekt dan iets dat er
  // eerder in de rij hoort te staan.
  const zonderNummer = bronBestanden().filter((f) => !/^\d{2}-/.test(f));
  assert.deepEqual(zonderNummer, [], `bestanden zonder nummervoorvoegsel: ${zonderNummer.join(", ")}`);
});

// Een venster hoort altijd bovenop te liggen. Sinds Modal en BottomSheet naar
// document.body gaan, delen ze hun stapelcontext niet meer met de laag
// waaruit ze geopend worden — en dan is de z-index het enige dat hen nog
// boven een volscherm houdt. Een nieuwe volschermlaag met een hoger getal zou
// het venster onzichtbaar maken zonder dat er iets stukgaat, dus dat is precies
// het soort fout waar een test voor is.
test("vensters gaan naar document.body en liggen boven elke andere laag", () => {
  const bronnen = bronBestanden().map((f) => ({ naam: f, code: readFileSync(path.join(APP_DIR, f), "utf8") }));
  const alles = bronnen.map((b) => b.code).join("\n");

  const vensterLagen = [];
  for (const naam of ["Modal", "BottomSheet"]) {
    const begin = alles.indexOf(`function ${naam}(`);
    assert.ok(begin !== -1, `${naam} niet gevonden`);
    const romp = alles.slice(begin, begin + 2000);
    assert.match(romp, /ReactDOM\.createPortal\(/,
      `${naam} rendert niet via een portal — dan bepaalt zijn plek in de boom of hij zichtbaar is`);
    assert.match(romp, /document\.body/, `${naam} portaleert niet naar document.body`);
    const eigenZ = romp.match(/fixed inset-0 z-\[(\d+)\]/);
    assert.ok(eigenZ, `${naam} heeft geen eigen hoge z-index — zonder gedeelde stapelcontext valt hij achter een volscherm`);
    vensterLagen.push(Number(eigenZ[1]));
  }

  // De laagste van de twee is de grens: alles daarboven zou een venster bedekken.
  const vensterLaag = Math.min(...vensterLagen);
  assert.ok(vensterLaag >= 1000, `de vensterlaag (${vensterLaag}) ligt te laag om boven de volschermlagen te blijven`);

  // Alles wat verder een eigen laag opspant. Tailwind schrijft dat als z-40 of
  // z-[70]; beide vormen tellen mee.
  const anderen = [];
  for (const { naam, code } of bronnen) {
    for (const m of code.matchAll(/\bz-(?:\[(\d+)\]|(\d+))\b/g)) {
      const waarde = Number(m[1] ?? m[2]);
      if (waarde >= vensterLaag) anderen.push(`${naam}: z-${waarde}`);
    }
  }
  const teHoog = anderen.filter((r) => !/03-ui-bouwstenen/.test(r));
  assert.deepEqual(teHoog, [],
    `deze lagen komen boven of gelijk met een venster (${vensterLaag}) en zouden het bedekken:\n  ${teHoog.join("\n  ")}`);
});

test("de service worker laat downloads met rust", () => {
  // Een klaargezet bestand (een fotoboek-PDF is al gauw honderden megabytes)
  // hoort niet in de cache voor reisgegevens te belanden, en al helemaal niet
  // door de fetch-handler te lopen: dan komt het niet als download aan maar als
  // een gewoon antwoord, en dan gebeurt er bij de gebruiker niets.
  const sw = readFileSync(path.join(APP_DIR, "..", "public", "sw.js"), "utf8");
  const regel = sw.split("\n").find((l) => l.includes('startsWith("/api/")'));
  assert.ok(regel, "de regel die bepaalt wat er gecachet wordt is niet gevonden");
  const patroon = /!\/\\\/\(([^)]+)\)\$\//.exec(regel);
  assert.ok(patroon, `kon de uitzonderingen niet uit de regel halen: ${regel.trim()}`);

  const uitzondering = new RegExp(`/(${patroon[1]})$`);
  for (const pad of ["/api/photos/12/raw", "/api/photos/12/thumb", "/api/taken/12/bestand"]) {
    assert.ok(uitzondering.test(pad), `${pad} hoort de cache niet in te gaan`);
  }
  // En gewone reisgegevens juist wél, anders werkt de app niet meer offline.
  assert.equal(uitzondering.test("/api/trips/12/days"), false);
});
