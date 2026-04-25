import { supabase } from '../shared/supabase.js';
import { findReferencePrice, findComparables } from './reference-price.js';

// Bis 12% Verkaufskosten-Annahme (Chrono24 6.5% Provision + 1.9% Payment; eBay ~11%)
const SELL_FEE_PCT = 0.12;

// Effektive Steuerlast beim Wiederverkauf (relativ zum Verkaufspreis).
// Beim Reverkauf müssen wir das gleiche Schema verwenden wie beim Einkauf:
// - margin (§25a): 19% MwSt NUR auf die Marge. Bei typisch 15-30% Marge ≈ 3-6% des VK
//   → konservativ 4.5% Steuerlast relativ zum VK
// - private: wenn wir als Privatperson weiterverkaufen: 0% (aber gewerblich wäre ja Regel- oder Margin)
//   → private Käufe sind für uns typisch Margin-Resale: 4.5%
// - standard (MwSt ausweisbar): wir können 19% Input-MwSt reklaimen, aber auch 19% MwSt auf VK abführen.
//   Netto-Steuerlast ~0% weil sich Input/Output ausgleicht — KLARER FINANZIERUNGSVORTEIL hier
// - unknown: wir nehmen konservativ Margin an
const TAX_LOAD_PCT: Record<string, number> = {
  standard: 0,       // MwSt ausgewiesen + reklaimbar
  margin: 0.045,     // ~3-6% effektiv auf Marge
  private: 0.045,    // muss Margin-Resale sein
  unknown: 0.045,
};

// Schwelle damit kein Mikro-Deal den Channel zuspammt, aber kleinere Deals mitnimmt
const MIN_PROFIT_EUR = 300;

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
    .select('id, ref, year, full_set, price_eur, has_box, has_papers, tax_scheme')
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
    if (ref.sampleSize < 5) continue;

    const discountPct = ((ref.median - ask) / ref.median) * 100;
    if (discountPct <= 0) continue;

    // Sanity 1: extreme Discounts = Fake/Zubehör
    if (discountPct > 60) continue;

    // Sanity 2: Preis-Streuung der Vergleichsdaten zu groß → Referenz unzuverlässig.
    if (ref.p75 > 0 && ref.p25 > 0) {
      const spreadRatio = ref.p75 / ref.p25;
      if (spreadRatio > 1.6) continue;
    }

    // Sanity 3: Asking-Fallback bei <8 Samples = zu wenig Belastbarkeit
    if (ref.source === 'asking' && ref.sampleSize < 8) continue;

    // Sanity 4: Wenn es BILLIGERE aktive Listings für die gleiche Ref gibt,
    // ist das hier kein echter Deal (User könnte günstiger woanders kaufen).
    // Strict-FS-Match: nur Listings mit gleichem Set-Status & ähnlichem Jahr berücksichtigen.
    let cheaperQuery = sb
      .from('listings')
      .select('price_eur')
      .eq('ref', l.ref)
      .eq('full_set', l.full_set)
      .eq('active', true)
      .neq('id', l.id)
      .gt('price_eur', 500)
      .lt('price_eur', ask)
      .order('price_eur', { ascending: true })
      .limit(1);
    if (l.year) cheaperQuery = cheaperQuery.gte('year', l.year - 1).lte('year', l.year + 1);
    const { data: cheaperRows } = await cheaperQuery;
    if (cheaperRows && cheaperRows.length > 0) continue;

    const taxLoad = TAX_LOAD_PCT[l.tax_scheme ?? 'unknown'] ?? TAX_LOAD_PCT.unknown!;
    const netSaleProceeds = ref.median * (1 - SELL_FEE_PCT - taxLoad);
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
      comparables: {
        items: comparables,
        ref_source: ref.source,
        match_tier: ref.matchTier,
        p25: ref.p25,
        p75: ref.p75,
      },
    });
  }

  if (deals.length === 0) return { evaluated, dealsWritten: 0 };

  for (let i = 0; i < deals.length; i += 500) {
    const { error: insErr } = await sb.from('deals').insert(deals.slice(i, i + 500));
    if (insErr) throw insErr;
  }

  return { evaluated, dealsWritten: deals.length };
}
