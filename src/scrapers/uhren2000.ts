import type { BrowserContext } from 'playwright';
import { BaseScraper, throttle } from './base.js';
import { parsePriceEur } from '../shared/normalizer.js';
import { safeGoto } from '../shared/browser.js';
import type { RawListing } from '../types.js';

// Uhren2000 (Shopify): URL = /collections/{brand}, Container = .product-card.has-form
// Text-Format: "Neu eingetroffen Rolex Datejust 41 Edelstahl Weißgold 126334 Weiß Jubile-Band Sofort versandfertig, Lieferzeit 3 - 5 Tage 10.590,00€"
const CATEGORY_URLS = [
  'https://www.uhren2000.de/collections/rolex',
  'https://www.uhren2000.de/collections/patek-philippe',
  'https://www.uhren2000.de/collections/audemars-piguet',
  'https://www.uhren2000.de/collections/omega',
  'https://www.uhren2000.de/collections/tudor',
];

export class Uhren2000Scraper extends BaseScraper {
  source = 'uhren2000' as const;
  maxPages = parseInt(process.env.SCRAPE_MAX_PAGES ?? '5', 10);

  async *scrape(context: BrowserContext): AsyncGenerator<RawListing> {
    const page = await context.newPage();

    for (const baseUrl of CATEGORY_URLS) {
      for (let pageNum = 1; pageNum <= this.maxPages; pageNum++) {
        const url = pageNum === 1 ? baseUrl : `${baseUrl}?page=${pageNum}`;
        const ok = await safeGoto(page, url);
        if (!ok) break;
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        await throttle();

        const items = await page.$$eval('.product-card', nodes =>
          nodes.map(node => {
            const link = node.querySelector('a') as HTMLAnchorElement | null;
            const href = link?.getAttribute('href') ?? '';
            const id = href.split('/').filter(Boolean).pop() ?? href;
            const img = node.querySelector('img') as HTMLImageElement | null;
            const imgSrc = img?.getAttribute('src') ?? '';
            const title = (node.querySelector('.product-card__title, .card__heading, h3, h2')?.textContent ?? '').trim();
            const priceEl = node.querySelector('.price, [class*="price"]');
            const priceText = (priceEl?.textContent ?? '').trim();
            const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
            return { id, href, title, priceText, imgSrc, text: text.slice(0, 500) };
          }).filter(x => x.id && x.text.includes('€'))
        ).catch(() => [] as Array<{ id: string; href: string; title: string; priceText: string; imgSrc: string; text: string }>);

        if (items.length === 0) break;

        for (const it of items) {
          const priceMatch = (it.priceText || it.text).match(/(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*€/);
          if (!priceMatch) continue;
          const price = parsePriceEur(priceMatch[1]!);
          if (!price) continue;

          const fullUrl = it.href.startsWith('http') ? it.href : `https://www.uhren2000.de${it.href}`;
          yield {
            source: 'uhren2000',
            sourceListingId: it.id,
            url: fullUrl,
            title: it.title || it.text.slice(0, 150),
            description: it.text,
            priceEur: price,
            sellerType: 'dealer',
            sellerCountry: 'DE',
            images: it.imgSrc ? [it.imgSrc] : [],
            raw: { snippet: it.text },
          };
        }
      }
    }
  }
}
