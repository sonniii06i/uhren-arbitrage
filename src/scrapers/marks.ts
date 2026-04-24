import type { BrowserContext } from 'playwright';
import { BaseScraper, throttle } from './base.js';
import { parsePriceEur } from '../shared/normalizer.js';
import { safeGoto } from '../shared/browser.js';
import type { RawListing } from '../types.js';

// marks-uhren.de: Startseite ist der Feed. Container = .m-product-card
// Text-Format: "RolexDatejust 36 Ref. 126234 Wimbledon Stahl/Weißgold 2026 Full Set UNWORN 12.950,00 €"
// Ref ist explizit als "Ref. XXXX" ausgeschrieben, Jahr 4-stellig, "Full Set" als Marker.
const CATEGORY_URLS = ['https://marks-uhren.de/'];

export class MarksScraper extends BaseScraper {
  source = 'marks' as const;
  maxPages = parseInt(process.env.SCRAPE_MAX_PAGES ?? '3', 10);

  async *scrape(context: BrowserContext): AsyncGenerator<RawListing> {
    const page = await context.newPage();

    for (const baseUrl of CATEGORY_URLS) {
      for (let pageNum = 1; pageNum <= this.maxPages; pageNum++) {
        const url = pageNum === 1 ? baseUrl : `${baseUrl}?page=${pageNum}`;
        const ok = await safeGoto(page, url);
        if (!ok) break;
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        await throttle();

        const items = await page.$$eval('.m-product-card', nodes =>
          nodes.map(node => {
            const link = node.querySelector('a[href*="/uhr/"]') as HTMLAnchorElement | null;
            const href = link?.getAttribute('href') ?? '';
            const id = href.split('/').filter(Boolean).pop() ?? href;
            const img = node.querySelector('img') as HTMLImageElement | null;
            const imgSrc = img?.getAttribute('src') ?? '';
            const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
            return { id, href, text: text.slice(0, 400), imgSrc };
          }).filter(x => x.id && x.href.includes('/uhr/'))
        ).catch(() => [] as Array<{ id: string; href: string; text: string; imgSrc: string }>);

        if (items.length === 0) break;

        for (const it of items) {
          const priceMatch = it.text.match(/(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*€/);
          if (!priceMatch) continue;
          const price = parsePriceEur(priceMatch[1]!);
          if (!price) continue;

          // Marks nennt die Ref explizit: "Ref. 126234"
          const refMatch = it.text.match(/Ref\.\s*([A-Z0-9-]+)/);
          const ref = refMatch?.[1];
          const yearMatch = it.text.match(/\b(19[5-9]\d|20[0-2]\d)\b/);
          const year = yearMatch ? parseInt(yearMatch[1]!, 10) : undefined;

          const fullUrl = it.href.startsWith('http') ? it.href : `https://marks-uhren.de${it.href}`;
          yield {
            source: 'marks',
            sourceListingId: it.id,
            url: fullUrl,
            title: it.text.slice(0, 200),
            description: it.text,
            priceEur: price,
            ref,
            year,
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
