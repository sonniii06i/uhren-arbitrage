import * as cheerio from 'cheerio';
import type { Source, RawListing } from '../types.js';
import { normalize, parsePriceEur } from '../shared/normalizer.js';
import { upsertListing, deactivateStale } from '../shared/supabase.js';
import type { ScrapeResult } from './base.js';

// Chrono24 via FlareSolverr (Cloudflare-Bypass).
//
// Zwei-Stufen-Strategie:
// 1. Brand-Landing (/{brand}/index.htm) → extract sub-model URLs mit /--mod{id}.htm
//    (echte Listings werden auf Brand-Landing erst per JS nachgeladen, davor nur Model-Cards)
// 2. Für jede Sub-Model-URL → individuelle Listings (hier steht die Ref-Nr im Titel)
//
// FlareSolverr läuft als Docker-Sidecar, Standard-URL http://localhost:8191/v1

const FLARESOLVERR_URL = process.env.FLARESOLVERR_URL ?? 'http://localhost:8191/v1';
const SESSION_ID = 'uhren-arbitrage-chrono24';

const BRANDS_TO_SCRAPE = [
  { name: 'Rolex', slug: 'rolex' },
  { name: 'Patek Philippe', slug: 'patekphilippe' },
  { name: 'Audemars Piguet', slug: 'audemarspiguet' },
  { name: 'Omega', slug: 'omega' },
  { name: 'Tudor', slug: 'tudor' },
];

interface FlareSolverrResponse {
  status: string;
  message?: string;
  solution?: {
    url: string;
    status: number;
    response: string;
    cookies: unknown[];
  };
}

async function flareSolverrGet(url: string): Promise<string | null> {
  const body = {
    cmd: 'request.get',
    url,
    session: SESSION_ID,
    maxTimeout: 60000,
  };
  const res = await fetch(FLARESOLVERR_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const json = (await res.json().catch(() => null)) as FlareSolverrResponse | null;
  if (!json || json.status !== 'ok' || !json.solution) return null;
  if (json.solution.status >= 400) return null;
  return json.solution.response;
}

async function createSession(): Promise<void> {
  await fetch(FLARESOLVERR_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cmd: 'sessions.create', session: SESSION_ID }),
  }).catch(() => {});
}

async function destroySession(): Promise<void> {
  await fetch(FLARESOLVERR_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cmd: 'sessions.destroy', session: SESSION_ID }),
  }).catch(() => {});
}

// Extrahiert Sub-Model-URLs aus der Brand-Landing-Page.
// Format: /{brand}/{slug}--mod{id}.htm oder /{brand}/{slug}--imod{id}.htm
function extractSubModelUrls(html: string, brandSlug: string): string[] {
  const $ = cheerio.load(html);
  const urls = new Set<string>();
  $('a[href*="--mod"], a[href*="--imod"]').each((_, node) => {
    const href = $(node).attr('href') ?? '';
    // Nur URLs die zum aktuellen Brand gehören
    if (!href.includes(`/${brandSlug}/`)) return;
    // Einzel-Listings (enthalten --id) rausfiltern
    if (/--id\d+\.htm/.test(href)) return;
    const fullUrl = href.startsWith('http') ? href : `https://www.chrono24.de${href}`;
    urls.add(fullUrl);
  });
  return Array.from(urls);
}

function parseListingsFromHtml(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const results: RawListing[] = [];

  $('.js-listing-item-container').each((_, node) => {
    const el = $(node);
    const href = el.find('a[href*="--id"]').first().attr('href') ?? '';
    const idMatch = href.match(/--id(\d+)\.htm/);
    const id = idMatch?.[1];
    if (!id) return;

    const img = el.find('img[alt]').first();
    const title = (img.attr('alt') ?? '').trim();
    const imgSrc = img.attr('src') ?? '';
    const text = el.text().replace(/\s+/g, ' ').trim();

    const priceMatch = text.match(/(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?)\s*€/);
    const price = priceMatch ? parsePriceEur(priceMatch[1]!) : null;
    if (!price || !title) return;

    const countryMatch = text.match(/Versand\s+([A-Z]{2})/);
    const country = countryMatch?.[1];
    const certified = text.includes('Certified');

    const fullUrl = href.startsWith('http') ? href : `https://www.chrono24.de${href}`;

    results.push({
      source: 'chrono24',
      sourceListingId: id,
      url: fullUrl,
      title,
      description: text.slice(0, 500),
      priceEur: price,
      currency: 'EUR',
      sellerCountry: country,
      sellerType: certified ? 'dealer' : undefined,
      images: imgSrc ? [imgSrc] : [],
      raw: { certified, snippet: text.slice(0, 500) },
    });
  });

  return results;
}

export class Chrono24Scraper {
  source: Source = 'chrono24';
  // Wir skippen hier Pagination pro Sub-Model — stattdessen breite Abdeckung:
  // viele Sub-Models × 1 Seite jedes. Gibt bessere Streuung als tief-vertikal.
  maxSubModelsPerBrand = parseInt(process.env.CHRONO24_SUBMODELS ?? '20', 10);

  async run(): Promise<ScrapeResult> {
    const runStart = new Date();
    const result: ScrapeResult = {
      source: 'chrono24',
      totalFound: 0,
      totalRelevant: 0,
      totalPersisted: 0,
      deactivated: 0,
      errors: [],
    };

    const dryRun = process.env.DRY_RUN === '1';
    const seenIds: string[] = [];

    const hc = await fetch(FLARESOLVERR_URL.replace('/v1', '/health')).catch(() => null);
    if (!hc || !hc.ok) {
      result.errors.push(`FlareSolverr nicht erreichbar auf ${FLARESOLVERR_URL}. Docker: docker run -d --name flaresolverr -p 8191:8191 ghcr.io/flaresolverr/flaresolverr:latest`);
      return result;
    }

    await createSession();
    try {
      for (const brand of BRANDS_TO_SCRAPE) {
        // Stufe 1: Sub-Model-URLs entdecken
        const landingUrl = `https://www.chrono24.de/${brand.slug}/index.htm`;
        const landingHtml = await flareSolverrGet(landingUrl);
        if (!landingHtml) {
          result.errors.push(`${brand.name}: Brand-Landing nicht ladbar`);
          continue;
        }
        const subModels = extractSubModelUrls(landingHtml, brand.slug).slice(0, this.maxSubModelsPerBrand);
        console.log(`  ${brand.name}: ${subModels.length} Sub-Models gefunden`);

        // Stufe 2: Pro Sub-Model-Seite die Listings scrapen
        for (const modUrl of subModels) {
          const modHtml = await flareSolverrGet(modUrl);
          if (!modHtml) {
            result.errors.push(`sub-model ${modUrl}: load failed`);
            continue;
          }
          const items = parseListingsFromHtml(modHtml);
          if (items.length === 0) continue;
          console.log(`    ${modUrl.split('/').pop()}: ${items.length} listings`);

          for (const raw of items) {
            result.totalFound++;
            const normalized = normalize(raw);
            if (!normalized) continue;
            result.totalRelevant++;
            if (dryRun) {
              console.log(`    [dry] ${normalized.brand} ${normalized.ref} — ${normalized.priceEur}€`);
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
          await new Promise(r => setTimeout(r, 800 + Math.random() * 800));
        }
      }

      if (!dryRun) {
        result.deactivated = await deactivateStale('chrono24', seenIds, runStart);
      }
    } finally {
      await destroySession();
    }

    return result;
  }
}
