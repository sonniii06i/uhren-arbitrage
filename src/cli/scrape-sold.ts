import 'dotenv/config';
import { scrapeEbaySold } from '../scrapers/ebay-sold.js';

async function main() {
  console.log('Scrape eBay Sold-Listings...');
  const t0 = Date.now();
  const r = await scrapeEbaySold();
  const sec = Math.round((Date.now() - t0) / 1000);
  console.log(`  ${r.totalFound} gesehen, ${r.totalRelevant} Fast-Mover, ${r.totalPersisted} gespeichert (${sec}s)`);
  if (r.errors.length > 0) console.log(`  Errors: ${r.errors.slice(0, 5).join(' | ')}`);
}

main().catch(e => { console.error(e); process.exit(1); });
