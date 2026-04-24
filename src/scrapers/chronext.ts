import type { BrowserContext } from 'playwright';
import { BaseScraper, throttle } from './base.js';
import { parsePriceEur } from '../shared/normalizer.js';
import { safeGoto } from '../shared/browser.js';
import type { RawListing } from '../types.js';

// Chronext: URL = /{brand-slug}, Container = .product-tile
// Text-Format: "GutRolexCosmograph Daytona1651825.500 €26.990 €- 1.490 €Mo., 27.04."
// (Condition)(Brand)(Model)(Ref)(Price)[strike-through Original-Preis][Einlieferung]
const BRAND_SLUGS = ['rolex', 'patek-philippe', 'audemars-piguet', 'omega', 'tudor'];

export class ChronextScraper extends BaseScraper {
  source = 'chronext' as const;
  maxPages = parseInt(process.env.SCRAPE_MAX_PAGES ?? '5', 10);

  async *scrape(context: BrowserContext): AsyncGenerator<RawListing> {
    const page = await context.newPage();

    for (const brand of BRAND_SLUGS) {
      for (let pageNum = 1; pageNum <= this.maxPages; pageNum++) {
        const url = `https://www.chronext.de/${brand}?page=${pageNum}`;
        const ok = await safeGoto(page, url);
        if (!ok) break;
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        await throttle();

        const items = await page.$$eval('.product-tile', nodes =>
          nodes.map(node => {
            const link = node.tagName === 'A' ? (node as HTMLAnchorElement) : node.querySelector('a') as HTMLAnchorElement | null;
            const href = link?.getAttribute('href') ?? '';
            const id = href.split('/').filter(Boolean).pop() ?? href;
            const img = node.querySelector('img') as HTMLImageElement | null;
            const imgSrc = img?.getAttribute('src') ?? '';
            const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
            return { id, href, text: text.slice(0, 600), imgSrc };
          }).filter(x => x.id && x.text.includes('€'))
        ).catch(() => [] as Array<{ id: string; href: string; text: string; imgSrc: string }>);

        if (items.length === 0) break;

        for (const it of items) {
          // Preis: erster "XXX €"-Match (strike-through UVP kommt danach)
          const priceMatch = it.text.match(/(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*€/);
          if (!priceMatch) continue;
          const price = parsePriceEur(priceMatch[1]!);
          if (!price) continue;

          // Condition vor dem Brand-Namen: "Sehr Gut", "Gut", "Wie Neu", "Vintage"
          const condMatch = it.text.match(/^(Sehr Gut|Wie Neu|Vintage|Gut|Neu)(?=[A-Z])/);
          const condition = condMatch?.[1];

          const fullUrl = it.href.startsWith('http') ? it.href : `https://www.chronext.de${it.href}`;
          yield {
            source: 'chronext',
            sourceListingId: it.id,
            url: fullUrl,
            title: it.text.slice(0, 200),
            description: it.text,
            priceEur: price,
            condition,
            sellerType: 'dealer',
            sellerCountry: 'CH',
            images: it.imgSrc ? [it.imgSrc] : [],
            raw: { snippet: it.text },
          };
        }
      }
    }
  }
}
