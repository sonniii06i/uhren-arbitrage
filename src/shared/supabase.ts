import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import 'dotenv/config';

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL und SUPABASE_SERVICE_KEY müssen in .env gesetzt sein');
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

import type { NormalizedListing } from '../types.js';

export async function upsertListing(l: NormalizedListing): Promise<void> {
  const sb = supabase();

  // 1. Watch-Eintrag sicherstellen
  const { data: watchRow } = await sb
    .from('watches')
    .upsert(
      { brand: l.brand, model: l.model, ref: l.ref, tier: 'fast_mover' },
      { onConflict: 'brand,ref', ignoreDuplicates: false }
    )
    .select('id')
    .single();

  // 2. Listing upserten — source + source_listing_id ist Unique-Key
  const { data: existing } = await sb
    .from('listings')
    .select('id, price_eur')
    .eq('source', l.source)
    .eq('source_listing_id', l.sourceListingId)
    .maybeSingle();

  const payload = {
    source: l.source,
    source_listing_id: l.sourceListingId,
    url: l.url,
    watch_id: watchRow?.id,
    brand: l.brand,
    model: l.model,
    ref: l.ref,
    year: l.year,
    has_box: l.hasBox,
    has_papers: l.hasPapers,
    condition: l.condition,
    price_eur: l.priceEur,
    currency: l.currency ?? 'EUR',
    seller_type: l.sellerType,
    seller_country: l.sellerCountry,
    tax_scheme: l.taxScheme,
    title: l.title,
    description: l.description,
    images: l.images ?? [],
    raw: l.raw ?? {},
    last_seen_at: new Date().toISOString(),
    active: true,
  };

  if (existing) {
    await sb.from('listings').update(payload).eq('id', existing.id);
    if (existing.price_eur !== l.priceEur) {
      await sb.from('price_history').insert({ listing_id: existing.id, price_eur: l.priceEur });
    }
  } else {
    const { data: inserted } = await sb.from('listings').insert(payload).select('id').single();
    if (inserted) {
      await sb.from('price_history').insert({ listing_id: inserted.id, price_eur: l.priceEur });
    }
  }
}

// Listings die nicht mehr gesehen wurden → active=false.
// Bei Dealer-Sources (chrono24, chronext, uhren2000, marks, haegele) nehmen wir an:
// Listing weg = wahrscheinlich verkauft. Wir kopieren den letzten gesehenen Preis
// als impliziten Sold-Datenpunkt in sold_listings (mit Marker 'inferred').
const DEALER_SOURCES = ['chrono24', 'chronext', 'uhren2000', 'marks', 'haegele'];

export async function deactivateStale(source: string, seenIds: string[], runStartedAt: Date): Promise<number> {
  const sb = supabase();
  const { data: stale, error } = await sb
    .from('listings')
    .select('id, source, source_listing_id, url, ref, brand, model, year, has_box, has_papers, condition, price_eur, title')
    .eq('source', source)
    .eq('active', true)
    .lt('last_seen_at', runStartedAt.toISOString());
  if (error) throw error;
  if (!stale || stale.length === 0) return 0;

  // Dealer-Sites: als impliziten Sold speichern
  if (DEALER_SOURCES.includes(source)) {
    const soldRows = stale
      .filter(r => r.ref && r.price_eur)
      .map(r => ({
        source: r.source,
        source_listing_id: `inferred_${r.source_listing_id}`,
        url: r.url,
        ref: r.ref,
        brand: r.brand,
        model: r.model,
        year: r.year,
        has_box: r.has_box,
        has_papers: r.has_papers,
        condition: r.condition,
        price_eur: r.price_eur,
        title: r.title,
        sold_at: new Date().toISOString(),
      }));
    if (soldRows.length > 0) {
      for (let i = 0; i < soldRows.length; i += 500) {
        await sb.from('sold_listings').upsert(soldRows.slice(i, i + 500), { onConflict: 'source,source_listing_id' });
      }
    }
  }

  await sb
    .from('listings')
    .update({ active: false })
    .in('id', stale.map(r => r.id));
  return stale.length;
}
