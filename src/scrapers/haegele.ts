import type { BrowserContext } from 'playwright';
import { BaseScraper, throttle } from './base.js';
import { parsePriceEur } from '../shared/normalizer.js';
import { safeGoto } from '../shared/browser.js';
import type { RawListing } from '../types.js';

// Juwelier Hägele — deutscher Händler mit Pre-Owned-Sortiment.
// TODO: Kategorie-URLs live verifizieren beim ersten Lauf
const CATEGORY_URLS = [
  'https://www.juwelier-haegele.de/pre-owned-uhren',
];

export class HaegeleScraper extends BaseScraper {
  source = 'haegele' as const;
  maxPages = parseInt(process.env.SCRAPE_MAX_PAGES ?? '5', 10);

  async *scrape(context: BrowserContext): AsyncGenerator<RawListing> {
    const page = await context.newPage();

    for (const baseUrl of CATEGORY_URLS) {
      for (let pageNum = 1; pageNum <= this.maxPages; pageNum++) {
        const url = pageNum === 1 ? baseUrl : `${baseUrl}?p=${pageNum}`;
        const ok = await safeGoto(page, url);
        if (!ok) break;
        await throttle();

        const items = await page.$$eval('.product-item, article.product, .product--box', (nodes) => {
          return nodes.map(node => {
            const a = node.querySelector('a') as HTMLAnchorElement | null;
            const url = a?.getAttribute('href') ?? '';
            const id = url.split('/').filter(Boolean).pop() ?? url;
            const title = node.querySelector('h2, h3, .product-title, .product--title')?.textContent?.trim() ?? '';
            const priceRaw = node.querySelector('.price, .product--price')?.textContent?.trim() ?? '';
            const img = node.querySelector('img')?.getAttribute('src') ?? '';
            const info = node.querySelector('.description, .product--description')?.textContent?.trim() ?? '';
            return { id, url, title, priceRaw, img, info };
          });
        }).catch(() => [] as Array<{ id: string; url: string; title: string; priceRaw: string; img: string; info: string }>);

        if (items.length === 0) break;

        for (const it of items) {
          const price = parsePriceEur(it.priceRaw);
          if (!price) continue;
          const fullUrl = it.url.startsWith('http') ? it.url : `https://www.juwelier-haegele.de${it.url}`;
          yield {
            source: 'haegele',
            sourceListingId: it.id,
            url: fullUrl,
            title: it.title,
            description: it.info,
            priceEur: price,
            sellerType: 'dealer',
            sellerCountry: 'DE',
            images: it.img ? [it.img] : [],
            raw: it,
          };
        }
      }
    }
  }
}
