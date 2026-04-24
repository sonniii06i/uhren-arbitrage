# uhren-arbitrage

Findet unterbewertete Luxusuhren-Angebote auf Chrono24, eBay, Chronext, Uhren2000, Marks-Uhren und Juwelier Hägele. Bewertung: Referenzpreis als Rolling-Median über alle Quellen + Jahres-Bucket + Full-Set-Status. Deal-Score = Discount × Sample-Confidence. KI-Enricher (Claude Haiku) extrahiert nicht-triviale Felder aus Freitext.

## Stack
- TypeScript + Node 20+
- Playwright (Scraping)
- Supabase (Datenhaltung)
- Anthropic SDK (KI-Enrichment)

## Setup

```bash
cd /Users/sonnibuttke/uhren-arbitrage
npm install
npx playwright install chromium
cp .env.example .env    # dann Werte eintragen
```

Supabase-Projekt anlegen, `supabase/schema.sql` im SQL-Editor ausführen, URL + Service-Role-Key in `.env` eintragen.

## Ablauf

```bash
# 1. Scraping — pro Quelle oder alle
npm run scrape:chrono24
npm run scrape              # alle 6 Quellen nacheinander

# 2. Referenzpreise + Deal-Scores berechnen
npm run compute-deals

# 3. Top-Deals enrichen (Claude extrahiert Ref/Jahr/Flags aus Freitext)
npm run enrich 100

# 4. Top-Deals anzeigen
npm run list-deals 25
```

Empfohlener Rhythmus: Scraping 2× täglich (morgens/abends), danach compute-deals, dann enrich für die Top 100. Über cron oder Fly.io-Scheduled-Machine.

## Fast-Mover-Scope

Nur Referenzen mit dichter Vergleichsbasis werden gescraped und bewertet. Aktuell:

- **Rolex** — Submariner, GMT-Master II, Daytona, Datejust 41, Explorer, Sea-Dweller, Yacht-Master, Sky-Dweller
- **Patek Philippe** — Nautilus, Aquanaut, Calatrava
- **Audemars Piguet** — Royal Oak, Royal Oak Offshore
- **Omega** — Speedmaster Pro, Seamaster 300, Planet Ocean
- **Tudor** — Black Bay 58/41, Pelagos, GMT

Erweiterung: `src/shared/brands.ts` — Refs dort pflegen.

## Preis-Engine — so funktioniert das Scoring

1. **Referenzpreis** pro `(ref, year_bucket, full_set)` = Median aller aktiven Listings, quellen-gewichtet. eBay-Preise werden ×1.15 hochgezogen bevor sie in den Median eingehen (sonst verzerrt eBays strukturelle Untermarktpreise den Referenzwert).
2. **Mindest-Stichprobe 3 Listings** sonst kein Referenzpreis. Bei <6 ist Confidence "low", ab 15 "high".
3. **Discount** = (Median − Ask) / Median
4. **Net-Profit** = Median × (1 − 12% Verkaufskosten) − Ask
5. **Score (0–100)** = Discount×2 + log₂(Sample+1)×10. Ein 30%-Deal mit 20 Vergleichslistings schlägt 40% mit 3.
6. **MIN_PROFIT_EUR = 500** — darunter fliegt das Listing aus dem Deal-Report.

Adjustments für Full-Set/Papers-only stecken im Bucket-Key selbst — Vergleich nur gegen gleichen Set-Status.

## Wichtige Limitierungen (bitte beim ersten Lauf prüfen)

1. **Selektoren sind best-guess** basierend auf typischer Shop-Struktur (Shopware/Magento/React). Jede Quelle kann das HTML ändern. Im ersten Lauf einen Scraper mit `SCRAPE_HEADLESS=false` starten und schauen ob Daten kommen. Selector-Fixes sind lokal pro Scraper-Datei (`src/scrapers/*.ts`).
2. **Chrono24 ToS** verbietet Scraping. Rate ist auf `SCRAPE_DELAY_MS=2500` (ein Request alle 2.5s) eingestellt. Bei IP-Block: `PROXY_URL` in `.env` setzen (Residential-Proxy, z.B. Bright Data/Oxylabs).
3. **eBay-Selektoren** variieren je nach Rollout. Wenn `li.s-item` leer bleibt, statt dessen `ul.srp-results > li` probieren.
4. **Hägele-URL** (juwelier-haegele.de/pre-owned-uhren) live verifizieren — kann sich ändern.
5. **Jahresdetektion** ist Regex-basiert und übersieht manchmal das Jahr. Der KI-Enricher fängt die Top-100 Deals zurück.

## Projektstruktur

```
src/
├── types.ts
├── shared/
│   ├── brands.ts          # Fast-Mover-Datenbank (Refs + Aliases)
│   ├── normalizer.ts      # Ref/Jahr/Box/Papers-Extraktion
│   ├── browser.ts         # Playwright-Factory
│   └── supabase.ts        # DB-Client + Upsert-Logik
├── scrapers/
│   ├── base.ts            # gemeinsame Run-Logik
│   └── {chrono24,ebay,chronext,uhren2000,marks,haegele}.ts
├── engine/
│   ├── reference-price.ts # Rolling-Median pro Ref/Jahr/Set
│   └── deal-scorer.ts     # Discount + Confidence → Score
├── ai/
│   └── listing-enricher.ts # Claude Haiku: Freitext-Parsing
└── cli/
    ├── scrape.ts
    ├── compute-deals.ts
    ├── enrich.ts
    └── list-deals.ts
```

## Deployment (später)

Fly.io Scheduled Machine alle 6h: `npm run scrape && npm run compute-deals && npm run enrich 50`. Dashboard kann als Next.js-App auf Supabase draufgesetzt werden — `latest_deals` View ist dafür da.
