// De reisduur over een tijdzonegrens.
//
// De vertrek- en aankomsttijd van vervoer zijn klokstanden op de plek zelf: je
// tikt in wat er op je ticket staat. Zonder tijdzone erbij is de duur niet uit
// te rekenen — een vlucht die om 09:00 uit Amsterdam vertrekt en om 08:15 in
// Tokio landt lijkt min een uur te duren, terwijl het er elf zijn.
//
// Deze test draait de rekenfunctie uit de client rechtstreeks, zonder browser:
// hij hangt alleen van Intl af en dat zit in Node.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WORTEL = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// De twee functies uit app/04-formulieren.js halen en in een eigen scope
// uitvoeren. Zo test dit de code die de app echt gebruikt, en niet een kopie
// die stilletjes uit de pas gaat lopen.
function laadRekenkern() {
  const bron = readFileSync(path.join(WORTEL, "app", "04-formulieren.js"), "utf8");
  const stukken = ["function verschuivingMinuten", "function reisduurMinuten", "function vluchtduur"]
    .map((naam) => {
      const begin = bron.indexOf(naam);
      if (begin === -1) throw new Error(`${naam} niet gevonden in 04-formulieren.js`);
      // Tot de sluitende accolade in de eerste kolom.
      const eind = bron.indexOf("\n}\n", begin);
      return bron.slice(begin, eind + 3);
    });
  // eslint-disable-next-line no-new-func
  return new Function(`${stukken.join("\n")}\nreturn { reisduurMinuten, vluchtduur };`)();
}

const { reisduurMinuten, vluchtduur } = laadRekenkern();

test("Amsterdam naar Tokio: de klok liegt, de duur niet", () => {
  // Vertrek 09:00 Amsterdam (zomertijd, UTC+2), aankomst de volgende ochtend
  // 08:15 Tokio (UTC+9). Naïef afgetrokken zou dit min 45 minuten zijn.
  const minuten = reisduurMinuten({
    departure_time: "2026-08-14T09:00",
    arrival_time: "2026-08-15T08:15",
    departure_tz: "Europe/Amsterdam",
    arrival_tz: "Asia/Tokyo",
  });
  assert.equal(minuten, 16 * 60 + 15);
  assert.equal(vluchtduur({
    departure_time: "2026-08-14T09:00",
    arrival_time: "2026-08-15T08:15",
    departure_tz: "Europe/Amsterdam",
    arrival_tz: "Asia/Tokyo",
  }), "16 uur 15 min");
});

test("Tokio naar Amsterdam: je landt eerder dan je vertrok", () => {
  // Vertrek 11:00 Tokio, aankomst 16:30 Amsterdam dezelfde dag. Op de klok
  // lijkt dat vijfeneenhalf uur; in werkelijkheid is het twaalfeneenhalf.
  const minuten = reisduurMinuten({
    departure_time: "2026-08-20T11:00",
    arrival_time: "2026-08-20T16:30",
    departure_tz: "Asia/Tokyo",
    arrival_tz: "Europe/Amsterdam",
  });
  assert.equal(minuten, 12 * 60 + 30);
});

test("binnen één zone klopt het gewoon", () => {
  assert.equal(reisduurMinuten({
    departure_time: "2026-08-14T09:00",
    arrival_time: "2026-08-14T12:30",
    departure_tz: "Europe/Amsterdam",
    arrival_tz: "Europe/Amsterdam",
  }), 210);
});

test("over de zomertijdovergang heen telt het echte uur mee", () => {
  // In de nacht van 24 op 25 oktober 2026 gaat de klok in Nederland een uur
  // terug. Een nachttrein van 23:00 tot 06:00 op de klok duurt dan acht uur,
  // niet zeven. Een vaste afstand tot UTC per zone zou dit mis hebben.
  const minuten = reisduurMinuten({
    departure_time: "2026-10-24T23:00",
    arrival_time: "2026-10-25T06:00",
    departure_tz: "Europe/Amsterdam",
    arrival_tz: "Europe/Amsterdam",
  });
  assert.equal(minuten, 8 * 60);
});

test("zonder zones wordt er niets beweerd", () => {
  // Zo gedraagt bestaand vervoer zich: geen zone bekend, dus geen duur. Beter
  // niets tonen dan een getal dat toevallig klopt zolang je thuis bent.
  assert.equal(reisduurMinuten({
    departure_time: "2026-08-14T09:00", arrival_time: "2026-08-14T12:00",
    departure_tz: "", arrival_tz: "",
  }), null);
  assert.equal(reisduurMinuten({
    departure_time: "2026-08-14T09:00", arrival_time: "2026-08-14T12:00",
    departure_tz: "Europe/Amsterdam", arrival_tz: "",
  }), null, "met maar één zone valt er niets te zeggen");
});

test("onzin levert geen getal op", () => {
  assert.equal(reisduurMinuten({
    departure_time: "2026-08-14T09:00", arrival_time: "2026-08-14T12:00",
    departure_tz: "Mars/Olympus_Mons", arrival_tz: "Europe/Amsterdam",
  }), null);
  // Aankomst vóór vertrek: wel een getal, maar vluchtduur toont het niet.
  assert.equal(vluchtduur({
    departure_time: "2026-08-14T12:00", arrival_time: "2026-08-14T09:00",
    departure_tz: "Europe/Amsterdam", arrival_tz: "Europe/Amsterdam",
  }), null);
});

test("korte etappes worden in minuten getoond", () => {
  assert.equal(vluchtduur({
    departure_time: "2026-08-14T09:00", arrival_time: "2026-08-14T09:40",
    departure_tz: "Europe/Amsterdam", arrival_tz: "Europe/Amsterdam",
  }), "40 min");
  assert.equal(vluchtduur({
    departure_time: "2026-08-14T09:00", arrival_time: "2026-08-14T11:00",
    departure_tz: "Europe/Amsterdam", arrival_tz: "Europe/Amsterdam",
  }), "2 uur");
});
