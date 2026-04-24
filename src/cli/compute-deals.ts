import 'dotenv/config';
import { computeReferencePrices } from '../engine/reference-price.js';
import { scoreAllListings } from '../engine/deal-scorer.js';

async function main() {
  console.log('Berechne Referenzpreise...');
  const refCount = await computeReferencePrices();
  console.log(`  ${refCount} Referenzpreis-Buckets aktualisiert`);

  console.log('Score alle aktiven Listings...');
  const { evaluated, dealsWritten } = await scoreAllListings();
  console.log(`  ${evaluated} Listings bewertet, ${dealsWritten} Deals geschrieben`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
