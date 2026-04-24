import type { BrandSpec } from '../types.js';

// Fast-Mover = liquide Top-Referenzen mit dichten Vergleichsdaten.
// Bewusst eng gehalten: nur Refs mit >20 parallelen Listings am Markt.
export const BRANDS: BrandSpec[] = [
  {
    brand: 'Rolex',
    tier: 'fast_mover',
    models: [
      { model: 'Submariner', refs: ['116610LN','116610LV','126610LN','126610LV','114060','124060'], aliases: ['sub','submariner date','hulk','kermit'] },
      { model: 'GMT-Master II', refs: ['116710LN','116710BLNR','126710BLNR','126710BLRO','126710GRNR','116718LN','126711CHNR'], aliases: ['gmt','pepsi','batman','sprite','root beer'] },
      { model: 'Daytona', refs: ['116500LN','116520','116500','116509','126500LN','116519LN','116515LN','116508'], aliases: ['daytona','cosmograph'] },
      { model: 'Datejust', refs: ['126300','126334','126333','126331','116234','116233','126200'], aliases: ['dj','datejust 41','datejust 36'] },
      { model: 'Explorer', refs: ['214270','124270','226570','216570'], aliases: ['explorer i','explorer ii'] },
      { model: 'Sea-Dweller', refs: ['126600','126603','116600'], aliases: ['sea dweller','sd43'] },
      { model: 'Yacht-Master', refs: ['116622','126622','226659','226658'], aliases: ['yacht master','ym'] },
      { model: 'Sky-Dweller', refs: ['326934','326933','336934','326135'], aliases: ['sky dweller'] },
    ],
  },
  {
    brand: 'Patek Philippe',
    tier: 'fast_mover',
    models: [
      { model: 'Nautilus', refs: ['5711/1A','5711/1A-010','5711/1A-014','5711/1A-018','5712/1A','5980/1A','5990/1A'], aliases: ['nautilus','naut'] },
      { model: 'Aquanaut', refs: ['5167A','5168G','5167/1A','5164A'], aliases: ['aquanaut'] },
      { model: 'Calatrava', refs: ['5227','6119','5196'], aliases: ['calatrava'] },
    ],
  },
  {
    brand: 'Audemars Piguet',
    tier: 'fast_mover',
    models: [
      { model: 'Royal Oak', refs: ['15202ST','15400ST','15500ST','15510ST','26331ST','15450ST','15413'], aliases: ['royal oak','ro','jumbo'] },
      { model: 'Royal Oak Offshore', refs: ['26470ST','26420SO','26237ST','15710ST'], aliases: ['offshore','roo'] },
      { model: 'Royal Oak Chrono', refs: ['26331ST','26240ST','26715ST'], aliases: ['ro chrono'] },
    ],
  },
  {
    brand: 'Omega',
    tier: 'fast_mover',
    models: [
      { model: 'Speedmaster Professional', refs: ['310.30.42.50.01.001','311.30.42.30.01.005','311.30.42.30.01.006','3570.50','145.022'], aliases: ['moonwatch','speedy','speedmaster pro'] },
      { model: 'Seamaster 300', refs: ['210.30.42.20.01.001','210.30.42.20.03.001','210.30.42.20.06.001','212.30.41.20.01.003'], aliases: ['seamaster','smp'] },
      { model: 'Seamaster Planet Ocean', refs: ['215.30.44.21.01.001','232.30.46.21.01.003'], aliases: ['planet ocean','po'] },
      { model: 'Constellation', refs: ['131.10.39','123.10.35'], aliases: ['constellation'] },
    ],
  },
  {
    brand: 'Tudor',
    tier: 'fast_mover',
    models: [
      { model: 'Black Bay 58', refs: ['79030N','79030B','79010SG','79040B'], aliases: ['bb58','black bay 58'] },
      { model: 'Black Bay', refs: ['79230N','79230R','79230B','79250BM','79730'], aliases: ['bb41','black bay'] },
      { model: 'Pelagos', refs: ['25600TN','25600TB','25610TNL','25407N'], aliases: ['pelagos','fxd'] },
      { model: 'GMT', refs: ['79830RB','79833MN'], aliases: ['bb gmt','pepsi tudor'] },
    ],
  },
  {
    brand: 'Cartier',
    tier: 'mid',
    models: [
      { model: 'Santos', refs: ['WSSA0009','WSSA0018','WSSA0030'], aliases: ['santos'] },
      { model: 'Tank', refs: ['WSTA0041','WSTA0040','W5330003'], aliases: ['tank'] },
    ],
  },
  {
    brand: 'Panerai',
    tier: 'mid',
    models: [
      { model: 'Luminor', refs: ['PAM01312','PAM00111','PAM00773'], aliases: ['luminor','pam'] },
      { model: 'Submersible', refs: ['PAM00973','PAM01389'], aliases: ['submersible'] },
    ],
  },
];

// Flache Liste aller akzeptierten Refs für schnelles Matching
export const ALL_REFS: Array<{ brand: string; model: string; ref: string; tier: string }> =
  BRANDS.flatMap(b =>
    b.models.flatMap(m =>
      m.refs.map(ref => ({ brand: b.brand, model: m.model, ref, tier: b.tier }))
    )
  );

// Brand-Aliases für Title-Matching
export const BRAND_ALIASES: Record<string, string> = {
  'rolex': 'Rolex',
  'patek': 'Patek Philippe',
  'patek philippe': 'Patek Philippe',
  'pp': 'Patek Philippe',
  'audemars': 'Audemars Piguet',
  'audemars piguet': 'Audemars Piguet',
  'ap': 'Audemars Piguet',
  'omega': 'Omega',
  'tudor': 'Tudor',
  'cartier': 'Cartier',
  'panerai': 'Panerai',
};

export function brandTier(brand: string): string | null {
  const b = BRANDS.find(x => x.brand.toLowerCase() === brand.toLowerCase());
  return b?.tier ?? null;
}
