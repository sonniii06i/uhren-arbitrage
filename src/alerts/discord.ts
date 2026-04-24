import 'dotenv/config';

// Discord-Webhook-Integration. Postet einen Deal als Embed mit:
// - Titel (Ref + Kurzinfo)
// - EK / VK / Profit prominently
// - Bis zu 5 vergleichbare verkaufte Uhren als Belege

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL ?? '';

export interface DiscordDeal {
  brand: string;
  model: string;
  ref: string;
  year?: number | null;
  hasBox: boolean;
  hasPapers: boolean;
  fullSet: boolean;
  taxScheme?: string | null;
  askPriceEur: number;
  referencePriceEur: number;
  estimatedProfitEur: number;
  discountPct: number;
  confidence: string;
  source: string;
  url: string;
  imageUrl?: string;
  comparables: Array<{
    url?: string | null;
    price_eur: number;
    year?: number | null;
    full_set: boolean;
    source: string;
    title?: string | null;
    condition?: string | null;
  }>;
}

function fmtEur(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

function describeSet(hasBox: boolean, hasPapers: boolean): string {
  if (hasBox && hasPapers) return 'Full Set';
  if (hasBox) return 'mit Box (ohne Papers)';
  if (hasPapers) return 'mit Papers (ohne Box)';
  return 'ohne Box/Papers';
}

function describeTax(scheme?: string | null): string {
  switch (scheme) {
    case 'margin': return '§25a Differenzbesteuert (keine MwSt-Reklaim)';
    case 'standard': return 'MwSt. ausweisbar (19% reklaimbar ✅)';
    case 'private': return 'Privatverkäufer (Resale nur §25a)';
    default: return 'Steuerschema unklar';
  }
}

// Discord-Embed-Felder sind auf 1024 Zeichen limitiert, deshalb kompakt halten.
function buildComparablesField(comparables: DiscordDeal['comparables']): string {
  if (comparables.length === 0) return '_keine Vergleichs-Verkäufe gefunden_';
  const lines = comparables.slice(0, 5).map((c, i) => {
    const year = c.year ? ` (${c.year})` : '';
    const fs = c.full_set ? ' FS' : '';
    const price = fmtEur(c.price_eur);
    const label = `${i + 1}. ${price}${year}${fs} · ${c.source}`;
    return c.url ? `[${label}](${c.url})` : label;
  });
  return lines.join('\n');
}

export async function postDeal(deal: DiscordDeal): Promise<void> {
  if (!WEBHOOK_URL) throw new Error('DISCORD_WEBHOOK_URL nicht gesetzt');

  const yearPart = deal.year ? ` · ${deal.year}` : '';
  const title = `${deal.brand} ${deal.model} ${deal.ref}${yearPart}`;
  const setDesc = describeSet(deal.hasBox, deal.hasPapers);

  // Farbkodierung nach Discount
  const color =
    deal.discountPct >= 25 ? 0x2ecc71 :
    deal.discountPct >= 15 ? 0xf1c40f :
    0xe67e22;

  const embed = {
    title: `🔔 ${title}`,
    url: deal.url,
    color,
    description: `**${deal.discountPct.toFixed(1)}% unter Marktpreis** · ${setDesc} · ${deal.source.toUpperCase()} · Confidence: ${deal.confidence}\n🧾 ${describeTax(deal.taxScheme)}`,
    fields: [
      { name: '💰 EK (Ask)', value: fmtEur(deal.askPriceEur), inline: true },
      { name: '📈 Potentieller VK', value: fmtEur(deal.referencePriceEur), inline: true },
      { name: '✅ Potentieller Gewinn', value: `**${fmtEur(deal.estimatedProfitEur)}**`, inline: true },
      { name: '📊 Vergleichbare verkaufte Uhren (gleiche Ref, ähnliche Condition)', value: buildComparablesField(deal.comparables), inline: false },
    ],
    ...(deal.imageUrl ? { thumbnail: { url: deal.imageUrl } } : {}),
    footer: { text: `uhren-arbitrage · ${new Date().toLocaleString('de-DE')}` },
  };

  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Discord-POST ${res.status}: ${txt.slice(0, 200)}`);
  }
  // Discord Rate-Limit: 5 msg/2s. Wir sind konservativ.
  await new Promise(r => setTimeout(r, 1500));
}

export async function postSummary(summary: string): Promise<void> {
  if (!WEBHOOK_URL) return;
  await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: summary }),
  }).catch(() => {});
}
