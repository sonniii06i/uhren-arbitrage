import type { BrowserContext } from 'playwright';
import type { RawListing, Source } from '../types.js';
import { normalize } from '../shared/normalizer.js';
import { upsertListing, deactivateStale } from '../shared/supabase.js';
import { launchBrowser, politeWait } from '../shared/browser.js';

export interface ScrapeResult {
  source: Source;
  totalFound: number;
  totalRelevant: number; // nach Fast-Mover-Filter
  totalPersisted: number;
  deactivated: number;
  errors: string[];
}

export abstract class BaseScraper {
  abstract source: Source;
  abstract maxPages: number;

  // Jeder Scraper implementiert nur diese eine Methode:
  // Yield-basiert damit wir lange Läufe streamen und nicht alles in RAM halten
  abstract scrape(context: BrowserContext): AsyncGenerator<RawListing>;

  async run(): Promise<ScrapeResult> {
    const runStart = new Date();
    const result: ScrapeResult = {
      source: this.source,
      totalFound: 0,
      totalRelevant: 0,
      totalPersisted: 0,
      deactivated: 0,
      errors: [],
    };

    const { browser, context } = await launchBrowser();
    const seenIds: string[] = [];

    try {
      const dryRun = process.env.DRY_RUN === '1';
      for await (const raw of this.scrape(context)) {
        result.totalFound++;
        const normalized = normalize(raw);
        if (!normalized) continue; // keine Fast-Mover-Ref
        result.totalRelevant++;
        if (dryRun) {
          console.log(`  [dry] ${normalized.brand} ${normalized.ref}${normalized.year ? ` (${normalized.year})` : ''} — ${normalized.priceEur}€ ${normalized.hasBox?'B':''}${normalized.hasPapers?'P':''} — ${normalized.url}`);
          seenIds.push(raw.sourceListingId);
          result.totalPersisted++;
          continue;
        }
        try {
          await upsertListing(normalized);
          seenIds.push(raw.sourceListingId);
          result.totalPersisted++;
        } catch (e) {
          result.errors.push(`persist ${raw.sourceListingId}: ${(e as Error).message}`);
        }
      }
      if (!dryRun) {
        result.deactivated = await deactivateStale(this.source, seenIds, runStart);
      }
    } catch (e) {
      result.errors.push(`run: ${(e as Error).message}`);
    } finally {
      await context.close();
      await browser.close();
    }

    return result;
  }
}

export async function throttle(): Promise<void> {
  const delay = parseInt(process.env.SCRAPE_DELAY_MS ?? '2500', 10);
  await politeWait(delay, delay * 1.5);
}
