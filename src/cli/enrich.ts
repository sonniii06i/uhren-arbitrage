import 'dotenv/config';
import { enrichTopDeals } from '../ai/listing-enricher.js';

async function main() {
  const limit = parseInt(process.argv[2] ?? '100', 10);
  console.log(`Enriche Top ${limit} Deals via Claude Haiku...`);
  const n = await enrichTopDeals(limit);
  console.log(`  ${n} Listings enriched`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
