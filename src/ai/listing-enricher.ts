import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../shared/supabase.js';
import 'dotenv/config';

// Claude extrahiert aus Titel + Description strukturierte Felder die der Regex-Parser
// nicht zuverlässig trifft (Ref in Freitext, Jahr-Andeutungen, Full-Set-Hinweise).
// Bewusst kein Originalitäts-Check — nur Profitabilitäts-relevante Flags.

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Du bist ein Spezialist für Luxusuhren-Arbitrage.
Deine Aufgabe: Aus Titel und Beschreibung eines Uhren-Listings strukturierte Daten extrahieren
und Profitabilitäts-Risiken flaggen.

Achte auf:
- Ref-Nr (auch wenn im Fließtext versteckt)
- Baujahr / Produktionsjahr
- Box + Papers: explizit ("mit Box und Papieren"), implizit ("Full Set"), oder Negation ("ohne Papiere")
- Revision/Service-Historie
- Zustand (NOS, neu, gebraucht, Tragespuren)

Profit-Risiko-Flags (nur wenn RELEVANT FÜR DEN WIEDERVERKAUFSPREIS):
- "afterset_dial": Ziffernblatt/Zeiger nicht-original (reduziert Wert ~40%)
- "service_needed": Revision nötig (Abzug 500-2000€)
- "damaged": sichtbare Schäden (Kratzer, Dellen am Gehäuse)
- "import_duty_risk": Verkäufer außerhalb EU (Zoll beim Kauf)
- "auction_only": Auktion statt Sofortkauf
- "price_on_request": Preis auf Anfrage, nicht scoreable

Antworte NUR mit JSON, keine Erklärung.`;

interface EnrichmentResult {
  ref?: string | null;
  year?: number | null;
  hasBox?: boolean | null;
  hasPapers?: boolean | null;
  serviceHistory?: string | null;
  condition?: string | null;
  flags: string[];
}

export async function enrichListing(title: string, description: string | null): Promise<EnrichmentResult> {
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001', // günstig, für simple Extraktion ausreichend
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `TITEL: ${title}\n\nBESCHREIBUNG: ${description ?? '(leer)'}\n\nExtrahiere als JSON mit Feldern: ref, year, hasBox, hasPapers, serviceHistory, condition, flags (Array aus obigen Keys).`,
      },
    ],
  });

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();

  // Claude antwortet manchmal mit ```json...``` — die Fences strippen
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { flags: [] };
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      ref: parsed.ref ?? null,
      year: parsed.year ?? null,
      hasBox: parsed.hasBox ?? null,
      hasPapers: parsed.hasPapers ?? null,
      serviceHistory: parsed.serviceHistory ?? null,
      condition: parsed.condition ?? null,
      flags: Array.isArray(parsed.flags) ? parsed.flags : [],
    };
  } catch {
    return { flags: [] };
  }
}

// Enricht nur die Top-N Deals nach Score — Kostenbremse.
// Bei 500 Top-Deals × Haiku-Cost ≈ 0.50€ pro Lauf.
export async function enrichTopDeals(limit = 100): Promise<number> {
  const sb = supabase();
  const { data: topDeals } = await sb
    .from('latest_deals')
    .select('listing_id, title, discount_pct')
    .order('score', { ascending: false })
    .limit(limit);

  if (!topDeals) return 0;

  let enrichedCount = 0;
  for (const deal of topDeals) {
    const { data: listing } = await sb
      .from('listings')
      .select('title, description, enriched_at')
      .eq('id', deal.listing_id)
      .single();
    if (!listing) continue;
    if (listing.enriched_at) continue; // schon enriched

    const result = await enrichListing(listing.title, listing.description);
    await sb
      .from('listings')
      .update({
        enriched_at: new Date().toISOString(),
        ...(result.ref ? { ref: result.ref } : {}),
        ...(result.year ? { year: result.year } : {}),
        ...(result.hasBox != null ? { has_box: result.hasBox } : {}),
        ...(result.hasPapers != null ? { has_papers: result.hasPapers } : {}),
      })
      .eq('id', deal.listing_id);

    if (result.flags.length > 0) {
      await sb
        .from('deals')
        .update({ ai_flags: result.flags })
        .eq('listing_id', deal.listing_id)
        .order('computed_at', { ascending: false })
        .limit(1);
    }
    enrichedCount++;
  }
  return enrichedCount;
}
