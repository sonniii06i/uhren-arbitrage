export type Source =
  | 'chrono24'
  | 'ebay'
  | 'chronext'
  | 'uhren2000'
  | 'marks'
  | 'haegele';

export type Tier = 'fast_mover' | 'mid' | 'slow';

// Steuer-Schema für Weiterverkaufs-Berechnung:
// - margin = §25a Differenzbesteuerung (nur Marge wird besteuert, ~3% effektiv)
// - standard = Regelbesteuerung 19% MwSt ausweisbar (reklaimbar wenn wir Händler sind)
// - private = Privatverkäufer (keine MwSt, nicht reklaimbar)
// - unknown = nicht erkannt
export type TaxScheme = 'margin' | 'standard' | 'private' | 'unknown';

export interface RawListing {
  source: Source;
  sourceListingId: string;
  url: string;
  title: string;
  description?: string;
  priceEur: number;
  currency?: string;
  year?: number;
  ref?: string;
  brand?: string;
  model?: string;
  hasBox?: boolean;
  hasPapers?: boolean;
  condition?: string;
  sellerType?: string;
  sellerCountry?: string;
  taxScheme?: TaxScheme;
  images?: string[];
  raw?: Record<string, unknown>;
}

export interface NormalizedListing extends RawListing {
  brand: string;
  model: string;
  ref: string;
  year?: number;
  hasBox: boolean;
  hasPapers: boolean;
  taxScheme: TaxScheme;
}

export interface BrandSpec {
  brand: string;
  tier: Tier;
  models: ModelSpec[];
}

export interface ModelSpec {
  model: string;
  refs: string[]; // akzeptierte Referenznummern
  aliases?: string[]; // alternative Schreibweisen im Titel
}
