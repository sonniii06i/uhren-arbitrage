import 'dotenv/config';
import { supabase } from '../shared/supabase.js';
import { postDeal, postSummary, type DiscordDeal } from '../alerts/discord.js';

async function main() {
  const minScore = parseInt(process.argv[2] ?? '60', 10);
  const maxPosts = parseInt(process.argv[3] ?? '25', 10);
  const sb = supabase();

  // Nur der NEUESTE Deal pro Listing. Wir posten nur wenn genau dieser
  // neueste Deal-Snapshot noch nicht gepostet wurde (latest_deals-View
  // liefert genau den zuletzt berechneten Score).
  const { data: latest, error } = await sb
    .from('latest_deals')
    .select('*')
    .gte('score', minScore)
    .is('discord_posted_at', null)
    .order('score', { ascending: false })
    .limit(maxPosts);
  if (error) throw error;
  const deals = latest ?? [];

  if (error) throw error;
  if (!deals || deals.length === 0) {
    console.log(`Keine neuen Deals mit score >= ${minScore}`);
    return;
  }

  console.log(`${deals.length} Deals zum Posten gefunden (score >= ${minScore})`);

  let posted = 0;
  for (const deal of deals) {
    const { data: listing } = await sb
      .from('listings')
      .select('*')
      .eq('id', deal.listing_id)
      .single();

    if (!listing || !listing.active) continue;

    const firstImage = Array.isArray(listing.images) && listing.images.length > 0 ? listing.images[0] : undefined;
    const comparables = (deal.comparables as { items?: Array<unknown> } | null)?.items ?? [];

    const discordDeal: DiscordDeal = {
      brand: listing.brand ?? '',
      model: listing.model ?? '',
      ref: listing.ref ?? '',
      year: listing.year,
      hasBox: listing.has_box ?? false,
      hasPapers: listing.has_papers ?? false,
      fullSet: listing.full_set ?? false,
      taxScheme: listing.tax_scheme,
      askPriceEur: Number(deal.ask_price_eur),
      referencePriceEur: Number(deal.reference_price_eur),
      estimatedProfitEur: Number(deal.estimated_profit_eur),
      discountPct: Number(deal.discount_pct),
      confidence: deal.confidence,
      source: listing.source,
      url: listing.url,
      imageUrl: typeof firstImage === 'string' ? firstImage : undefined,
      comparables: comparables as DiscordDeal['comparables'],
    };

    try {
      await postDeal(discordDeal);
      await sb.from('deals').update({ discord_posted_at: new Date().toISOString() }).eq('id', deal.id);
      posted++;
      console.log(`  ✓ ${listing.brand} ${listing.ref} — ${deal.discount_pct}% — ${deal.estimated_profit_eur}€`);
    } catch (e) {
      console.log(`  ✗ ${listing.ref}: ${(e as Error).message}`);
    }
  }

  await postSummary(`✅ ${posted} neue Deals gepostet (aus ${deals.length} Kandidaten)`).catch(() => {});
  console.log(`\n${posted}/${deals.length} erfolgreich gepostet`);
}

main().catch(e => { console.error(e); process.exit(1); });
