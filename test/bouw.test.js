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
