import { supabase } from '../shared/supabase.js';
import { findReferencePrice, findComparables } from './reference-price.js';

// Bis 12% Verkaufskosten-Annahme (Chrono24 6.5% Provision + 1.9% Payment; eBay ~11%)
const SELL_FEE_PCT = 0.12;

// Wenn Referenz aus Asking-Preisen kommt statt Sold-Preisen, Confidence runter
const MIN_PROFIT_EUR = 500;

function confidenceFromSample(n: number, source: 'sold' | 'asking'): 'low' | 'medium' | 'high' {
  if (source === 'asking') {
    // Asking-Preise sind immer weniger verlässlich — max "medium"
    return n >= 10 ? 'medium' : 'low';
  }
  if (n >= 15) return 'high';
  if (n >= 6) return 'medium';
  return 'low';
}

function computeScore(discountPct: number, sampleSize: number, source: 'sold' | 'asking'): number {
  const discountScore = Math.min(60, Math.max(0, discountPct) * 2);
  const confidenceScore = Math.min(40, Math.log2(sampleSize + 1) * 10);
  const sourcePenalty = source === 'asking' ? 0.85 : 1.0; // asking-basierte Scores sinken 15%
  return Math.round((discountScore + confidenceScore) * sourcePenalty);
}

export async function scoreAllListings(): Promise<{ evaluated: number; dealsWritten: number }> {
  const sb = supabase();

  const { data: listings, error } = await sb
    .from('listings')
    .select('id, ref, year, full_set, price_eur, has_box, has_papers')
    .eq('active', true)
    .not('ref', 'is', null)
    .not('price_eur', 'is', null)
    .gt('price_eur', 500);
  if (error) throw error;
  if (!listings) return { evaluated: 0, dealsWritten: 0 };

  const deals: Array<Record<string, unknown>> = [];
  let evaluated = 0;

  for (const l of listings) {
    if (!l.ref || l.price_eur == null) continue;
    evaluated++;

    const ask = Number(l.price_eur);
    const ref = await findReferencePrice(l.ref, l.year, l.full_set);
    if (!ref) continue;
    if (ref.sampleSize < 3) continue;

    const discountPct = ((ref.median - ask) / ref.median) * 100;
    if (discountPct <= 0) continue;

    // Sanity: Ask-Preis unter 40% der Referenz → Fake/Zubehör/Scam. Wir skippen.
    // Echte Arbitrage-Deals liegen typisch bei 10-35% Discount, nicht 70%+
    if (discountPct > 55) continue;

    const netSaleProceeds = ref.median * (1 - SELL_FEE_PCT);
    const estimatedProfit = netSaleProceeds - ask;
    if (estimatedProfit < MIN_PROFIT_EUR) continue;

    const score = computeScore(discountPct, ref.sampleSize, ref.source);
    const confidence = confidenceFromSample(ref.sampleSize, ref.source);

    const comparables = await findComparables(l.ref, l.year, l.full_set, 5);

    deals.push({
      listing_id: l.id,
      reference_price_eur: ref.median,
      ask_price_eur: ask,
      discount_pct: Math.round(discountPct * 100) / 100,
      estimated_profit_eur: Math.round(estimatedProfit),
      score,
      sample_size: ref.sampleSize,
      confidence,
      ai_flags: null,
      comparables: { items: comparables, ref_source: ref.source, match_tier: ref.matchTier },
    });
  }

  if (deals.length === 0) return { evaluated, dealsWritten: 0 };

  for (let i = 0; i < deals.length; i += 500) {
    const { error: insErr } = await sb.from('deals').insert(deals.slice(i, i + 500));
    if (insErr) throw insErr;
  }

  return { evaluated, dealsWritten: deals.length };
}
