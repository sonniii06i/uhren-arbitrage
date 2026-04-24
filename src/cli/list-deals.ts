import 'dotenv/config';
import { supabase } from '../shared/supabase.js';

async function main() {
  const limit = parseInt(process.argv[2] ?? '25', 10);
  const sb = supabase();

  const { data, error } = await sb
    .from('latest_deals')
    .select('*')
    .order('score', { ascending: false })
    .limit(limit);
  if (error) throw error;
  if (!data || data.length === 0) {
    console.log('Keine Deals gefunden. Läuft `compute-deals` schon?');
    return;
  }

  console.log(`\nTop ${data.length} Deals:\n`);
  console.log('Score | Brand         | Ref          | Jahr | Ask€      | Ref€      | Discount | Profit€   | Source    | Conf   | URL');
  console.log('------+---------------+--------------+------+-----------+-----------+----------+-----------+-----------+--------+-----');
  for (const d of data) {
    const brand = String(d.brand ?? '').padEnd(13);
    const ref = String(d.ref ?? '').padEnd(12);
    const year = String(d.year ?? '---').padEnd(4);
    const ask = String(d.ask_price_eur).padStart(9);
    const refPrice = String(d.reference_price_eur).padStart(9);
    const disc = `${d.discount_pct}%`.padStart(8);
    const profit = String(d.estimated_profit_eur).padStart(9);
    const src = String(d.source).padEnd(9);
    const conf = String(d.confidence).padEnd(6);
    console.log(`${String(d.score).padStart(5)} | ${brand} | ${ref} | ${year} | ${ask} | ${refPrice} | ${disc} | ${profit} | ${src} | ${conf} | ${d.url}`);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
