import type { BrowserContext } from 'playwright';
import { BaseScraper, throttle } from './base.js';
import { parsePriceEur } from '../shared/normalizer.js';
import { safeGoto } from '../shared/browser.js';
import type { RawListing } from '../types.js';

// eBay.de Suche, Kategorie Armbanduhren (31387), nur Sofortkauf (LH_BIN=1),
// 60 pro Seite (_ipg=60), sortiert nach "Neueingänge" (_sop=10).
// Neue eBay-Struktur: Container = [data-listingid], erstes Item = "Shop on eBay" Promo (skip).
const BRAND_QUERIES = [
  'rolex',
  'patek philippe',
  'audemars piguet',
  'omega speedmaster',
  'omega seamaster',
  'tudor black bay',
  'tudor pelagos',
];

export class EbayScraper extends BaseScraper {
  source = 'ebay' as const;
  maxPages = parseInt(process.env.SCRAPE_MAX_PAGES ?? '5', 10);

  async *scrape(context: BrowserContext): AsyncGenerator<RawListing> {
    const page = await context.newPage();

    for (const query of BRAND_QUERIES) {
      for (let pageNum = 1; pageNum <= this.maxPages; pageNum++) {
        const url = `https://www.ebay.de/sch/i.html?_nkw=${encodeURIComponent(query)}&_sacat=31387&LH_BIN=1&_ipg=60&_pgn=${pageNum}&_sop=10`;
        const ok = await safeGoto(page, url);
        if (!ok) break;
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        await throttle();

        const items = await page.$$eval('[data-listingid]', nodes =>
          nodes.map(node => {
            const listingId = node.getAttribute('data-listingid') ?? '';
            const link = node.querySelector('a[href*="/itm/"]') as HTMLAnchorElement | null;
            const href = link?.href ?? '';
            const img = node.querySelector('img[alt]') as HTMLImageElement | null;
            const title = (img?.alt ?? '').trim();
            const imgSrc = img?.getAttribute('src') ?? '';
            const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();

            // Preis: "EUR 9.900,00" oder "EUR 12.300" — erster Hit nach "EUR"
            const priceMatch = text.match(/EUR\s*(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?)/);
            const priceRaw = priceMatch?.[1] ?? '';

            const isPrivate = /\bPrivat\b/i.test(text);
            const isDealer = /\bGewerblich\b/i.test(text);
            const isAuction = /Preisvorschlag/i.test(text) && !/Sofort-Kaufen/i.test(text);

            return { listingId, href, title, imgSrc, priceRaw, text: text.slice(0, 500), isPrivate, isDealer, isAuction };
          }).filter(x => x.title && x.title.toLowerCase() !== 'shop on ebay' && x.href)
        ).catch(() => [] as Array<{ listingId: string; href: string; title: string; imgSrc: string; priceRaw: string; text: string; isPrivate: boolean; isDealer: boolean; isAuction: boolean }>);

        if (items.length === 0) break;

        for (const it of items) {
          const price = parsePriceEur(it.priceRaw);
          if (!price || !it.listingId) continue;

          // URL-Parameter kürzen: /itm/123456?... → nur ID-Teil
          const cleanUrl = it.href.replace(/\?.*$/, '');
          yield {
            source: 'ebay',
            sourceListingId: it.listingId,
            url: cleanUrl,
            title: it.title,
            description: it.text,
            priceEur: price,
            sellerType: it.isDealer ? 'dealer' : it.isPrivate ? 'private' : undefined,
            sellerCountry: 'DE',
            images: it.imgSrc ? [it.imgSrc] : [],
            raw: { snippet: it.text, isAuction: it.isAuction },
          };
        }
      }
    }
  }
}
