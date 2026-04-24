import 'dotenv/config';
import { Chrono24Scraper } from '../scrapers/chrono24.js';
import { EbayScraper } from '../scrapers/ebay.js';
import { ChronextScraper } from '../scrapers/chronext.js';
import { Uhren2000Scraper } from '../scrapers/uhren2000.js';
import { MarksScraper } from '../scrapers/marks.js';
import { HaegeleScraper } from '../scrapers/haegele.js';
import type { BaseScraper } from '../scrapers/base.js';

const SCRAPERS: Record<string, () => BaseScraper> = {
  chrono24: () => new Chrono24Scraper(),
  ebay: () => new EbayScraper(),
  chronext: () => new ChronextScraper(),
  uhren2000: () => new Uhren2000Scraper(),
  marks: () => new MarksScraper(),
  haegele: () => new HaegeleScraper(),
};

async function main() {
  const target = process.argv[2];
  const targets = target && SCRAPERS[target] ? [target] : Object.keys(SCRAPERS);

  for (const name of targets) {
    const scraper = SCRAPERS[name]!();
    console.log(`\n=== ${name} ===`);
    const t0 = Date.now();
    try {
      const result = await scraper.run();
      const sec = Math.round((Date.now() - t0) / 1000);
      console.log(`${name}: ${result.totalFound} gesehen, ${result.totalRelevant} Fast-Mover, ${result.totalPersisted} gespeichert, ${result.deactivated} deaktiviert (${sec}s)`);
      if (result.errors.length > 0) {
        console.log(`  Errors: ${result.errors.slice(0, 5).join(' | ')}${result.errors.length > 5 ? ' ...' : ''}`);
      }
    } catch (e) {
      console.error(`${name} FAILED:`, (e as Error).message);
    }
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
