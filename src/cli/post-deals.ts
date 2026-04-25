import 'dotenv/config';
import { supabase } from '../shared/supabase.js';
import { postDeal, postSummary, type DiscordDeal } from '../alerts/discord.js';

async function main() {
  const minScore = parseInt(process.argv[2] ?? '60', 10);
  const maxPosts = parseInt(process.argv[3] ?? '25', 10);
  const sb = supabase();

  // Re-Post-Guard: ein Listing wird nur dann nochmal gepostet wenn
  // (a) es seit 72h keinen Discord-Post mehr gab UND
  // (b) die neue Discount-% mindestens 5 Prozentpunkte besser ist als beim letzten Post.
  // Das verhindert Spam wenn die gleichen Listings jede 30min neu gescort werden.
  const RE_POST_COOLDOWN_HOURS = 72;
  const MIN_DISCOUNT_IMPROVEMENT = 5;

  // Cooldown wird über listings.discord_last_posted_at getrackt (nicht via deal-rows)
  // → vermeidet den Bug wo "skipped, mark posted" alle nachfolgenden Deals blockt.
  const cooldownCutoff = new Date(Date.now() - RE_POST_COOLDOWN_HOURS * 3600 * 1000).toISOString();
  const { data: recentlyPostedListings } = await sb
    .from('listings')
    .select('id, discord_last_posted_at, discord_last_posted_disc')
    .gte('discord_last_posted_at', cooldownCutoff);
  const recentByListing = new Map<string, number>();
  for (const l of recentlyPostedListings ?? []) {
    if (l.discord_last_posted_disc != null) recentByListing.set(l.id, Number(l.discord_last_posted_disc));
  }

  const { data: latest, error } = await sb
    .from('latest_deals')
    .select('*')
    .gte('score', minScore)
    .order('score', { ascending: false })
    .limit(maxPosts * 3);
  if (error) throw error;

  const deals = (latest ?? []).filter(d => {
    const lastPostedDisc = recentByListing.get(d.listing_id);
    if (lastPostedDisc == null) return true;
    const newDisc = Number(d.discount_pct);
    return newDisc - lastPostedDisc >= MIN_DISCOUNT_IMPROVEMENT;
  }).slice(0, maxPosts);

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
      const now = new Date().toISOString();
      await sb.from('deals').update({ discord_posted_at: now }).eq('id', deal.id);
      // Cooldown-Tracking auf Listing-Ebene: erfasst tatsächlichen Send-Zeitpunkt
      await sb.from('listings').update({
        discord_last_posted_at: now,
        discord_last_posted_disc: deal.discount_pct,
      }).eq('id', deal.listing_id);
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
