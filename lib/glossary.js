"use strict";

// Turns Bemba and Nyanja crop and unit words into the English word we store.
// Numbers are never changed here. Unknown words are left as written.

const fs = require("fs");

const FILLER_WORDS = new Set([
  "ya", "wa", "za", "of", "the", "a", "an", "na", "ku", "pa", "mu", "for", "per",
]);

function loadGlossary(file) {
  if (!file || !fs.existsSync(file)) return compile({ crops: [], units: [], yes: {}, no: {} });
  return compile(JSON.parse(fs.readFileSync(file, "utf8")));
}

function compile(data) {
  const cropMap = new Map();
  const unitMap = new Map();
  for (const row of data.crops || []) addRow(cropMap, row);
  for (const row of data.units || []) addRow(unitMap, row);
  return {
    raw: data,
    cropMap,
    unitMap,
    yesWords: wordSet(data.yes),
    noWords: wordSet(data.no),
  };
}

function addRow(map, row) {
  const english = String(row.english || "").trim();
  if (!english) return;
  const forms = [english, ...(row.nyanja || []), ...(row.bemba || [])];
  for (const form of forms) {
    const raw = String(form || "").trim().toLowerCase();
    if (!raw) continue;
    map.set(raw, english);
    const stemmed = stem(raw);
    if (stemmed) map.set(stemmed, english);
  }
}

function wordSet(group) {
  const words = new Set();
  for (const list of Object.values(group || {})) {
    for (const word of list || []) words.add(String(word).trim().toLowerCase());
  }
  return words;
}

function normaliseTerm(glossary, kind, value) {
  const given = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  if (!given) return { given: "", english: "", known: false };
  const map = kind === "unit" ? glossary.unitMap : glossary.cropMap;
  const direct = lookup(map, given);
  if (direct) return { given, english: direct, known: true };

  const words = (given.toLowerCase().match(/[a-z]+/g) || []).filter((word) => !FILLER_WORDS.has(word));
  words.sort((a, b) => b.length - a.length);
  for (const word of words) {
    const hit = lookup(map, word);
    if (hit) return { given, english: hit, known: true };
  }
  return { given, english: given, known: false };
}

function lookup(map, value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  return map.get(raw) || map.get(stem(raw)) || "";
}

function normaliseLocation(value) {
  const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  const stripped = text.replace(/^(ku|kuli|pa|mu)\s+/i, "");
  return stripped || text;
}

function glossaryLines(glossary) {
  const lines = [];
  for (const row of (glossary.raw && glossary.raw.crops) || []) {
    lines.push(formatRow(row));
  }
  for (const row of (glossary.raw && glossary.raw.units) || []) {
    lines.push(formatRow(row));
  }
  const yes = glossary.raw && glossary.raw.yes;
  const no = glossary.raw && glossary.raw.no;
  if (yes) lines.push(`Yes: Nyanja ${(yes.nyanja || []).join(", ")}; Bemba ${(yes.bemba || []).join(", ")}`);
  if (no) lines.push(`No: Nyanja ${(no.nyanja || []).join(", ")}; Bemba ${(no.bemba || []).join(", ")}`);
  return lines.join("\n");
}

function formatRow(row) {
  const nyanja = (row.nyanja || []).join(", ") || "—";
  const bemba = (row.bemba || []).join(", ") || "—";
  return `${row.english}: Nyanja ${nyanja}; Bemba ${bemba}`;
}

function stem(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  if (text.endsWith("oes") && text.length > 4) return text.slice(0, -2);
  if (/(ses|xes|ches|shes)$/.test(text) && text.length > 4) return text.slice(0, -2);
  if (text.endsWith("s") && !text.endsWith("ss") && text.length > 3) return text.slice(0, -1);
  return text;
}

module.exports = {
  loadGlossary,
  normaliseTerm,
  normaliseLocation,
  glossaryLines,
  stem,
};
