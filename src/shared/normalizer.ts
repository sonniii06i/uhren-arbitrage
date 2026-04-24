import { ALL_REFS, BRAND_ALIASES } from './brands.js';
import type { RawListing, NormalizedListing } from '../types.js';

const CURRENT_YEAR = new Date().getFullYear();

// Extrahiert Ref-Nr durch direkten Treffer auf unsere Fast-Mover-Liste.
// Wir matchen bewusst nur bekannte Refs — unbekannte Refs lassen sich
// nicht fair bepreisen und landen auf dem Ignorieren-Stapel.
export function detectRef(text: string): { brand: string; model: string; ref: string; tier: string } | null {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ');
  // Längste Refs zuerst matchen (verhindert dass "15400" vor "15400ST" trifft)
  const sorted = [...ALL_REFS].sort((a, b) => b.ref.length - a.ref.length);
  for (const entry of sorted) {
    const needle = entry.ref.toLowerCase();
    if (normalized.includes(needle)) return entry;
  }
  return null;
}

export function detectBrand(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [alias, canonical] of Object.entries(BRAND_ALIASES)) {
    if (lower.includes(alias)) return canonical;
  }
  return null;
}

// "Baujahr 2021", "Year 2019", "aus 2018", "Bj. 2020", " 2022 " — alle gültig
export function detectYear(text: string): number | undefined {
  const patterns = [
    /\b(?:baujahr|year|bj\.?|jahr|aus|from|circa|ca\.?)\s*:?\s*(19[5-9]\d|20[0-2]\d)\b/gi,
    /\b(19[5-9]\d|20[0-2]\d)\b/g,
  ];
  for (const re of patterns) {
    const matches = [...text.matchAll(re)];
    for (const m of matches) {
      const y = parseInt(m[1] ?? m[0], 10);
      if (y >= 1950 && y <= CURRENT_YEAR) return y;
    }
  }
  return undefined;
}

// Papers/Box Heuristik — bewusst konservativ: nur explizite Erwähnung zählt.
// "ohne box" → false, "mit box" → true, nichts → undefined
export function detectBoxPapers(text: string): { hasBox?: boolean; hasPapers?: boolean } {
  const lower = text.toLowerCase();

  // Full-Set-Indikatoren: "full set", "FS" (nur als Wort), "Komplettset"
  if (/\b(full[\s-]?set|fullset|komplett(?:set)?|vollst[äa]ndig|complete\s+set|\bfs\b(?!\d))/i.test(lower)) {
    return { hasBox: true, hasPapers: true };
  }
  // "box & papers", "b&p", "B+P"
  if (/\b(box\s*(?:and|und|&|\+)\s*pap[ei]r|b\s*[&+]\s*p\b|bo[xs]\s*\+?\s*pap[ei]r)/i.test(lower)) {
    return { hasBox: true, hasPapers: true };
  }

  let hasBox: boolean | undefined;
  let hasPapers: boolean | undefined;

  if (/\b(ohne\s+(box|karton|etui)|no\s+box|without\s+box)\b/.test(lower)) hasBox = false;
  else if (/\b(mit\s+(box|karton|etui)|with\s+box|original\s*box|inkl\.?\s*box|boxed\b)\b/.test(lower)) hasBox = true;

  if (/\b(ohne\s+papiere|ohne\s+papers|no\s+papers|keine\s+papiere|without\s+papers)\b/.test(lower)) hasPapers = false;
  else if (/\b(mit\s+papieren|with\s+papers|original\s*papers|zertifikat|garantiekarte|papers\s*present|punz[ei]erung|warranty\s*card)\b/.test(lower)) hasPapers = true;

  return { hasBox, hasPapers };
}

export function parsePriceEur(raw: string): number | null {
  // "EUR 12.500,00", "12,500 €", "€ 12.500", "12.500,-"
  const cleaned = raw
    .replace(/[^\d.,\s]/g, '')
    .replace(/\s/g, '')
    .trim();
  if (!cleaned) return null;

  // Deutsche Notation: 12.500,00 / 12.500,-
  // Englische: 12,500.00
  let normalized: string;
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  if (lastComma > lastDot) {
    // Komma ist Dezimaltrenner
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    normalized = cleaned.replace(/,/g, '');
  } else {
    normalized = cleaned.replace(/[.,]/g, '');
  }
  const n = parseFloat(normalized);
  return Number.isFinite(n) && n > 100 ? Math.round(n) : null;
}

// Keywords die auf Zubehör/Ersatzteile hindeuten, NICHT auf die Uhr selbst.
// Wenn der Titel eines davon enthält, ist es höchstwahrscheinlich kein Uhren-Listing.
const ACCESSORY_KEYWORDS = [
  'lünette', 'lunette', 'bezel', 'inlay', 'einlage',
  'zifferblatt', 'dial',
  'zeiger', 'hands',
  'armband', 'strap', 'band', 'bracelet',
  'glas', 'crystal', 'sapphire glass',
  'krone', 'crown',
  'schließe', 'clasp', 'buckle',
  'werk', 'movement', 'kaliber',
  'etui', 'box only', 'nur box', 'nur papers', 'papers only',
  'handbuch', 'booklet', 'manual',
  'ersatzteil', 'spare part', 'part',
  'aufkleber', 'sticker', 'hangtag',
];

function looksLikeAccessory(title: string): boolean {
  const lower = title.toLowerCase();
  return ACCESSORY_KEYWORDS.some(kw => lower.includes(kw));
}

export function normalize(raw: RawListing): NormalizedListing | null {
  const haystack = [raw.title, raw.description ?? '', raw.ref ?? ''].join(' ');
  const detected = raw.ref ? null : detectRef(haystack);
  const refInfo = raw.ref
    ? ALL_REFS.find(r => r.ref.toLowerCase() === raw.ref!.toLowerCase()) ?? detectRef(haystack)
    : detected;

  if (!refInfo) return null; // keine bekannte Fast-Mover-Ref

  // Zubehör filtern — Title-Based nur, da Description oft Zubehör-Verweise enthält
  if (looksLikeAccessory(raw.title)) return null;

  const brand = raw.brand ?? refInfo.brand;
  const model = raw.model ?? refInfo.model;
  const year = raw.year ?? detectYear(haystack);
  const bp = detectBoxPapers(haystack);

  return {
    ...raw,
    brand,
    model,
    ref: refInfo.ref,
    year,
    hasBox: raw.hasBox ?? bp.hasBox ?? false,
    hasPapers: raw.hasPapers ?? bp.hasPapers ?? false,
  };
}
