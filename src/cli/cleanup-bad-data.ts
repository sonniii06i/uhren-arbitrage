import 'dotenv/config';
import { supabase } from '../shared/supabase.js';
import { detectRef } from '../shared/normalizer.js';

// Re-validiert alle aktiven listings + sold_listings mit der neuen,
// strikteren detectRef-Logik. Datensätze die jetzt nicht mehr matchen
// werden gelöscht/deaktiviert (Brand-Mismatch durch lockere Substring-Suche).

async function main() {
  const sb = supabase();

  // Aktive Listings prüfen
  const { data: active } = await sb
    .from('listings')
    .select('id, ref, brand, title, description')
    .eq('active', true);

  let activeBad = 0;
  const badActiveIds: string[] = [];
  for (const l of active ?? []) {
    if (!l.ref || !l.brand) continue;
    const haystack = [l.title ?? '', l.description ?? '', l.ref].join(' ');
    const detected = detectRef(haystack);
    if (!detected) {
      activeBad++;
      badActiveIds.push(l.id);
      continue;
    }
    // Brand-Mismatch: erkanntes Brand passt nicht zum gespeicherten
    if (detected.brand !== l.brand) {
      activeBad++;
      badActiveIds.push(l.id);
    }
  }
  console.log(`Active listings: ${active?.length} total, ${activeBad} now invalid`);
  if (badActiveIds.length > 0) {
    for (let i = 0; i < badActiveIds.length; i += 200) {
      await sb.from('listings').update({ active: false }).in('id', badActiveIds.slice(i, i + 200));
    }
    console.log(`  → ${badActiveIds.length} deaktiviert`);
  }

  // Sold listings prüfen — DELETE statt deaktivieren weil sie pure Datenpollution sind
  const { data: sold } = await sb
    .from('sold_listings')
    .select('id, ref, brand, title');

  let soldBad = 0;
  const badSoldIds: string[] = [];
  for (const s of sold ?? []) {
    if (!s.ref || !s.brand) continue;
    const haystack = [s.title ?? '', s.ref].join(' ');
    const detected = detectRef(haystack);
    if (!detected || detected.brand !== s.brand) {
      soldBad++;
      badSoldIds.push(s.id);
    }
  }
  console.log(`Sold listings: ${sold?.length} total, ${soldBad} now invalid`);
  if (badSoldIds.length > 0) {
    for (let i = 0; i < badSoldIds.length; i += 200) {
      await sb.from('sold_listings').delete().in('id', badSoldIds.slice(i, i + 200));
    }
    console.log(`  → ${badSoldIds.length} gelöscht`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
