import { supabase } from '../shared/supabase.js';

// Mehrstufiges Matching mit Fallback:
// 1. Sold, exakt Full-Set-Status + Jahr±1         → beste Qualität
// 2. Sold, exakt Full-Set-Status, alle Jahre
// 3. Sold, ANY Full-Set-Status, mit Price-Adjustment (Full-Set +12%, no-FS -12%)
// 4. Active asking prices × 0.93 als letzte Rettung

const ASKING_TO_SOLD_RATIO = 0.93;
const FULL_SET_PREMIUM = 0.12;
const MIN_SAMPLE = 5;
// IQR-Outlier-Filter: alles außerhalb [Q1 - 1.5·IQR, Q3 + 1.5·IQR] fliegt raus.
// Eliminert Diamant-Versionen, Auktions-Snipes, Fakes mit gleicher Ref-Nr.
function rejectOutliersIQR(values: number[]): number[] {
  if (values.length < 5) return values;
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)]!;
  const q3 = sorted[Math.floor(sorted.length * 0.75)]!;
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;
  return sorted.filter(v => v >= lower && v <= upper);
}

interface ReferenceResult {
  median: number;
  p25: number;
  p75: number;
  sampleSize: number;
  source: 'sold' | 'asking';
  matchTier: 'exact' | 'year-relaxed' | 'set-relaxed' | 'asking-fallback';
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[idx]!;
}

function summarize(prices: number[], source: 'sold' | 'asking', matchTier: ReferenceResult['matchTier']): ReferenceResult {
  // IQR-Filter vor Median: typisch eliminiert 10-25% extreme Werte
  const filtered = rejectOutliersIQR(prices);
  const sorted = [...filtered].sort((a, b) => a - b);
  return {
    median: Math.round(percentile(sorted, 0.5)),
    p25: Math.round(percentile(sorted, 0.25)),
    p75: Math.round(percentile(sorted, 0.75)),
    sampleSize: sorted.length,
    source,
    matchTier,
  };
}

export async function findReferencePrice(
  ref: string,
  year: number | null,
  fullSet: boolean
): Promise<ReferenceResult | null> {
  const sb = supabase();

  // Sold-Listings holen (eine Query, dann im RAM filtern)
  const { data: soldData } = await sb
    .from('sold_listings')
    .select('price_eur, year, full_set')
    .eq('ref', ref)
    .gt('price_eur', 500);
  const sold = (soldData ?? []).map(r => ({
    price_eur: Number(r.price_eur),
    year: r.year as number | null,
    full_set: r.full_set as boolean,
  }));

  // Tier 1: strict FS match + ±1 Jahr
  if (year && sold.length > 0) {
    const t1 = sold.filter(s => s.full_set === fullSet && s.year != null && Math.abs(s.year - year) <= 1);
    if (t1.length >= MIN_SAMPLE) return summarize(t1.map(s => s.price_eur), 'sold', 'exact');
  }

  // Tier 2: strict FS match, alle Jahre
  const t2 = sold.filter(s => s.full_set === fullSet);
  if (t2.length >= MIN_SAMPLE) return summarize(t2.map(s => s.price_eur), 'sold', 'year-relaxed');

  // Tier 3: mixed FS, aber mit Price-Adjustment je nach Set-Status
  // Wenn Target full_set=true und Sample ist no-FS → +12% (Full-Set-Aufschlag)
  // Wenn Target full_set=false und Sample ist Full-Set → -12%
  if (sold.length >= MIN_SAMPLE) {
    const adjusted = sold.map(s => {
      if (s.full_set === fullSet) return s.price_eur;
      if (fullSet && !s.full_set) return s.price_eur * (1 + FULL_SET_PREMIUM);
      return s.price_eur * (1 - FULL_SET_PREMIUM);
    });
    return summarize(adjusted, 'sold', 'set-relaxed');
  }

  // Tier 4: Asking-Preis-Fallback
  const { data: activeData } = await sb
    .from('listings')
    .select('price_eur, year, full_set')
    .eq('active', true)
    .eq('ref', ref)
    .not('price_eur', 'is', null)
    .gt('price_eur', 500);
  const active = (activeData ?? []).map(r => ({
    price_eur: Number(r.price_eur) * ASKING_TO_SOLD_RATIO,
    year: r.year as number | null,
    full_set: r.full_set as boolean,
  }));

  // Mit FS-Adjustment falls nötig
  const activeAdjusted = active.map(a => {
    if (a.full_set === fullSet) return a.price_eur;
    if (fullSet && !a.full_set) return a.price_eur * (1 + FULL_SET_PREMIUM);
    return a.price_eur * (1 - FULL_SET_PREMIUM);
  });
  if (activeAdjusted.length >= MIN_SAMPLE) {
    return summarize(activeAdjusted, 'asking', 'asking-fallback');
  }

  return null;
}

export async function findComparables(
  ref: string,
  year: number | null,
  fullSet: boolean,
  limit = 5
): Promise<Array<{ url: string | null; price_eur: number; year: number | null; full_set: boolean; source: string; title: string | null; condition: string | null }>> {
  const sb = supabase();

  // Priorität 1: Sold mit gleichem Set-Status
  const { data: soldSame } = await sb
    .from('sold_listings')
    .select('url, price_eur, year, full_set, title, condition')
    .eq('ref', ref)
    .eq('full_set', fullSet)
    .order('sold_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  const mapped = (soldSame ?? []).map(r => ({
    url: r.url,
    price_eur: Number(r.price_eur),
    year: r.year,
    full_set: r.full_set,
    source: 'ebay sold',
    title: r.title,
    condition: r.condition,
  }));

  if (mapped.length >= limit) return mapped;

  // Priorität 2: Sold mit anderem Set-Status (dann sehen wir noch Preisniveaus)
  const { data: soldOther } = await sb
    .from('sold_listings')
    .select('url, price_eur, year, full_set, title, condition')
    .eq('ref', ref)
    .neq('full_set', fullSet)
    .order('sold_at', { ascending: false, nullsFirst: false })
    .limit(limit - mapped.length);
  for (const r of soldOther ?? []) {
    mapped.push({
      url: r.url,
      price_eur: Number(r.price_eur),
      year: r.year,
      full_set: r.full_set,
      source: 'ebay sold*',
      title: r.title,
      condition: r.condition,
    });
  }

  if (mapped.length >= limit) return mapped;

  // Priorität 3: Aktive Listings
  const { data: active } = await sb
    .from('listings')
    .select('url, price_eur, year, full_set, title, condition, source')
    .eq('active', true)
    .eq('ref', ref)
    .order('last_seen_at', { ascending: false })
    .limit(limit - mapped.length);
  for (const a of active ?? []) {
    mapped.push({
      url: a.url,
      price_eur: Number(a.price_eur),
      year: a.year,
      full_set: a.full_set,
      source: `${a.source} (aktiv)`,
      title: a.title,
      condition: a.condition,
    });
  }
  return mapped;
}

export async function computeReferencePrices(): Promise<number> {
  return 0;
}
