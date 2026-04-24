import type { BrowserContext } from 'playwright';
import { BaseScraper, throttle } from './base.js';
import { parsePriceEur } from '../shared/normalizer.js';
import { launchBrowser, safeGoto, politeWait } from '../shared/browser.js';
import type { RawListing } from '../types.js';

// Chrono24 hat aggressive Anti-Bot-Logik. Ohne Proxies funktioniert nur mit:
// 1. Fresh-Context pro Brand (neue Cookies/Session)
// 2. Homepage-Warmup + zufällige Zwischen-Navigation
// 3. Randomisierte Delays 10-25s zwischen Seiten
// Selbst dann kann Chrono24 nach ein paar Läufen blocken.
const BRANDS_TO_SCRAPE = [
  { name: 'Rolex', slug: 'rolex' },
  { name: 'Patek Philippe', slug: 'patekphilippe' },
  { name: 'Audemars Piguet', slug: 'audemarspiguet' },
  { name: 'Omega', slug: 'omega' },
  { name: 'Tudor', slug: 'tudor' },
];

const DISTRACTION_URLS = [
  'https://www.chrono24.de/magazine/',
  'https://www.chrono24.de/search/browse.htm',
  'https://www.chrono24.de/info/ueber-uns.htm',
];

export class Chrono24Scraper extends BaseScraper {
  source = 'chrono24' as const;
  maxPages = parseInt(process.env.SCRAPE_MAX_PAGES ?? '5', 10);

  // Override: Wir wollen pro Brand einen eigenen Context — daher eigenes Runnen
  override async run() {
    const runStart = new Date();
    const result = {
      source: this.source,
      totalFound: 0,
      totalRelevant: 0,
      totalPersisted: 0,
      deactivated: 0,
      errors: [] as string[],
    };
    const { normalize } = await import('../shared/normalizer.js');
    const { upsertListing, deactivateStale } = await import('../shared/supabase.js');
    const dryRun = process.env.DRY_RUN === '1';
    const seenIds: string[] = [];

    for (const brand of BRANDS_TO_SCRAPE) {
      // Pro Brand: frische Browser-Instanz (neue Fingerprint-Signatur)
      const { browser, context } = await launchBrowser();
      try {
        for await (const raw of this.scrapeOneBrand(context, brand)) {
          result.totalFound++;
          const normalized = normalize(raw);
          if (!normalized) continue;
          result.totalRelevant++;
          if (dryRun) {
            console.log(`  [dry] ${normalized.brand} ${normalized.ref}${normalized.year ? ` (${normalized.year})` : ''} — ${normalized.priceEur}€ — ${normalized.url}`);
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
      } catch (e) {
        result.errors.push(`${brand.name}: ${(e as Error).message}`);
      } finally {
        await context.close();
        await browser.close();
      }
      // Pause zwischen Brands 20-40s, damit IP-Reputation sich "erholt"
      const cooldown = 20000 + Math.random() * 20000;
      console.log(`  ⏳ cooldown ${Math.round(cooldown/1000)}s vor nächstem Brand...`);
      await new Promise(r => setTimeout(r, cooldown));
    }

    if (!dryRun) {
      result.deactivated = await deactivateStale(this.source, seenIds, runStart);
    }
    return result;
  }

  // Diese Methode wird durch Override nicht genutzt, bleibt für Interface-Kompatibilität
  async *scrape(_context: BrowserContext): AsyncGenerator<RawListing> {
    // no-op — run() verwaltet eigenen Lifecycle
  }

  async *scrapeOneBrand(context: BrowserContext, brand: { name: string; slug: string }): AsyncGenerator<RawListing> {
    const page = await context.newPage();

    // 1. Homepage-Warmup
    await page.goto('https://www.chrono24.de/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await politeWait(2000, 4000);
    // Etwas scrollen → sieht menschlicher aus
    await page.mouse.move(400 + Math.random() * 200, 300 + Math.random() * 200).catch(() => {});
    await page.evaluate(() => window.scrollTo(0, 300)).catch(() => {});
    await politeWait(1000, 2000);

    // 2. Zufällige Zwischen-Navigation (mit 50% Wahrscheinlichkeit)
    if (Math.random() > 0.5) {
      const distract = DISTRACTION_URLS[Math.floor(Math.random() * DISTRACTION_URLS.length)]!;
      await page.goto(distract, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
      await politeWait(3000, 6000);
    }

    // 3. Brand-Seiten in Reihenfolge abklappern
    for (let pageNum = 1; pageNum <= this.maxPages; pageNum++) {
      const url = `https://www.chrono24.de/${brand.slug}/index.htm?sortorder=5&showpage=${pageNum}`;
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

      if (!resp || resp.status() >= 400) {
        console.log(`  ${brand.name} p${pageNum}: ${resp?.status() ?? 'fail'} → abbrechen`);
        break;
      }

      const items = await page.$$eval('.js-listing-item-container', nodes =>
        nodes.map(node => {
          const link = node.querySelector('a[href*="--id"]') as HTMLAnchorElement | null;
          const href = link?.getAttribute('href') ?? '';
          const idMatch = href.match(/--id(\d+)\.htm/);
          const id = idMatch?.[1] ?? href;
          const img = node.querySelector('img[alt]') as HTMLImageElement | null;
          const title = (img?.alt ?? '').trim();
          const imgSrc = img?.getAttribute('src') ?? '';
          const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
          const priceMatch = text.match(/(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?)\s*€/);
          const priceRaw = priceMatch?.[1] ?? '';
          const countryMatch = text.match(/Versand\s+([A-Z]{2})/);
          const country = countryMatch?.[1] ?? '';
          const certified = text.includes('Certified');
          return { id, href, title, imgSrc, priceRaw, country, text: text.slice(0, 500), certified };
        })
      ).catch(() => [] as Array<{ id: string; href: string; title: string; imgSrc: string; priceRaw: string; country: string; text: string; certified: boolean }>);

      if (items.length === 0) {
        console.log(`  ${brand.name} p${pageNum}: 0 items → ende`);
        break;
      }
      console.log(`  ${brand.name} p${pageNum}: ${items.length} items`);

      for (const it of items) {
        const price = parsePriceEur(it.priceRaw);
        if (!price || !it.id || !it.title) continue;
        const fullUrl = it.href.startsWith('http') ? it.href : `https://www.chrono24.de${it.href}`;
        yield {
          source: 'chrono24',
          sourceListingId: it.id,
          url: fullUrl,
          title: it.title,
          description: it.text,
          priceEur: price,
          currency: 'EUR',
          sellerCountry: it.country || undefined,
          sellerType: it.certified ? 'dealer' : undefined,
          images: it.imgSrc ? [it.imgSrc] : [],
          raw: { certified: it.certified, snippet: it.text },
        };
      }

      // Delay zwischen Seiten: 10-20s randomisiert
      await politeWait(10000, 20000);
    }
  }
}
