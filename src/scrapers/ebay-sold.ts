import type { BrowserContext } from 'playwright';
import { parsePriceEur, normalize } from '../shared/normalizer.js';
import { safeGoto, launchBrowser, politeWait } from '../shared/browser.js';
import { supabase } from '../shared/supabase.js';
import type { RawListing } from '../types.js';

// eBay Sold-Listings liefern ECHTE Verkaufspreise (letzte ~90 Tage).
// URL-Params: LH_Sold=1 & LH_Complete=1 — nur erfolgreich verkaufte Listings
const BRAND_QUERIES = [
  'rolex',
  'patek philippe',
  'audemars piguet',
  'omega speedmaster',
  'omega seamaster',
  'omega constellation',
  'tudor black bay',
  'tudor pelagos',
  'cartier santos',
  'cartier tank',
  'panerai luminor',
  'iwc portugieser',
  'iwc pilot',
];

export interface SoldScrapeResult {
  totalFound: number;
  totalRelevant: number;
  totalPersisted: number;
  errors: string[];
}

export async function scrapeEbaySold(): Promise<SoldScrapeResult> {
  const maxPages = parseInt(process.env.SCRAPE_MAX_PAGES ?? '5', 10);
  const result: SoldScrapeResult = { totalFound: 0, totalRelevant: 0, totalPersisted: 0, errors: [] };
  const { browser, context } = await launchBrowser();
  const page = await context.newPage();

  try {
    for (const query of BRAND_QUERIES) {
      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        const url = `https://www.ebay.de/sch/i.html?_nkw=${encodeURIComponent(query)}&_sacat=31387&LH_Sold=1&LH_Complete=1&_ipg=60&_pgn=${pageNum}&_sop=13`;
        const ok = await safeGoto(page, url);
        if (!ok) break;
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        await politeWait(2000, 3500);

        const items = await page.$$eval('[data-listingid]', nodes =>
          nodes.map(node => {
            const listingId = node.getAttribute('data-listingid') ?? '';
            const link = node.querySelector('a[href*="/itm/"]') as HTMLAnchorElement | null;
            const href = link?.href ?? '';
            const img = node.querySelector('img[alt]') as HTMLImageElement | null;
            const title = (img?.alt ?? '').trim();
            const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();

            // Bei Sold-Listings ist der "Verkaufspreis" der letzte angezeigte Preis
            const priceMatch = text.match(/EUR\s*(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?)/);
            const priceRaw = priceMatch?.[1] ?? '';

            // Verkaufsdatum: "Verkauft: 15. Apr. 2026"
            const soldMatch = text.match(/Verkauft[:\s]+(\d{1,2}\.\s*\w+\s*\d{0,4})/i);
            const soldDateRaw = soldMatch?.[1] ?? '';

            return { listingId, href, title, priceRaw, text: text.slice(0, 500), soldDateRaw };
          }).filter(x => x.title && x.title.toLowerCase() !== 'shop on ebay' && x.listingId)
        ).catch(() => [] as Array<{ listingId: string; href: string; title: string; priceRaw: string; text: string; soldDateRaw: string }>);

        if (items.length === 0) break;

        for (const it of items) {
          result.totalFound++;
          const price = parsePriceEur(it.priceRaw);
          if (!price) continue;
          const raw: RawListing = {
            source: 'ebay',
            sourceListingId: `sold_${it.listingId}`,
            url: it.href.replace(/\?.*$/, ''),
            title: it.title,
            description: it.text,
            priceEur: price,
            sellerCountry: 'DE',
          };
          const normalized = normalize(raw);
          if (!normalized) continue;
          result.totalRelevant++;

          try {
            const sb = supabase();
            await sb.from('sold_listings').upsert({
              source: 'ebay',
              source_listing_id: raw.sourceListingId,
              url: raw.url,
              ref: normalized.ref,
              brand: normalized.brand,
              model: normalized.model,
              year: normalized.year ?? null,
              has_box: normalized.hasBox,
              has_papers: normalized.hasPapers,
              price_eur: price,
              title: it.title,
              sold_at: parseSoldDate(it.soldDateRaw),
            }, { onConflict: 'source,source_listing_id' });
            result.totalPersisted++;
          } catch (e) {
            result.errors.push(`persist ${raw.sourceListingId}: ${(e as Error).message}`);
          }
        }
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }

  return result;
}

const MONTHS_DE: Record<string, number> = {
  jan: 0, feb: 1, mär: 2, maer: 2, mar: 2, apr: 3, mai: 4, jun: 5, jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, dez: 11,
};

function parseSoldDate(raw: string): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{1,2})\.\s*(\w+)\s*(\d{4})?/);
  if (!m) return null;
  const day = parseInt(m[1]!, 10);
  const monKey = m[2]!.toLowerCase().slice(0, 3);
  const mon = MONTHS_DE[monKey] ?? MONTHS_DE[m[2]!.toLowerCase()];
  if (mon == null) return null;
  const year = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();
  return new Date(year, mon, day).toISOString();
}
