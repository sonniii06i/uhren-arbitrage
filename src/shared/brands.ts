import type { BrandSpec } from '../types.js';

// Fast-Mover = liquide Top-Referenzen mit dichten Vergleichsdaten.
// Erweiterter Scope: ~150 Refs über 7 Brands, deckt die liquidesten Uhren
// in den Preisklassen 2k-50k ab die regelmäßig auf eBay/Chrono24 gehandelt werden.
export const BRANDS: BrandSpec[] = [
  {
    brand: 'Rolex',
    tier: 'fast_mover',
    models: [
      { model: 'Submariner', refs: ['116610LN','116610LV','126610LN','126610LV','114060','124060','116618LN','116619LB','14060M','14060','16610','16610LV','16613','16618','16800','5513','5512','16808','126619LB'], aliases: ['sub','submariner date','hulk','kermit','starbucks'] },
      { model: 'GMT-Master II', refs: ['116710LN','116710BLNR','126710BLNR','126710BLRO','126710GRNR','116718LN','126711CHNR','116759SA','16710','16760','116713LN','126713GRNR','126719BLRO','16700','16718','16800','126719'], aliases: ['gmt','pepsi','batman','sprite','root beer','coke'] },
      { model: 'Daytona', refs: ['116500LN','116520','116500','116509','126500LN','116519LN','116515LN','116508','116523','126515LN','126519LN','116519LN','116576TBR','116505','16528','16520','16523','16518','6263','6265','16519','126503','126505','126508'], aliases: ['daytona','cosmograph'] },
      { model: 'Datejust', refs: ['126300','126334','126333','126331','116234','116233','126200','126233','116200','179174','178274','116244','116201','178240','126234','126231','178271','116203','16233','126303','126301','16200','116231','179179'], aliases: ['dj','datejust 41','datejust 36','datejust 31'] },
      { model: 'Day-Date', refs: ['228238','228239','228348','118238','118348','128238','128239','228235','228206','128235'], aliases: ['day-date','president'] },
      { model: 'Explorer', refs: ['214270','124270','226570','216570','14270','114270','14270','214270M'], aliases: ['explorer i','explorer ii'] },
      { model: 'Sea-Dweller', refs: ['126600','126603','116600','16660','16600','126660'], aliases: ['sea dweller','sd43','deepsea','sd4000'] },
      { model: 'Yacht-Master', refs: ['116622','126622','226659','226658','16622','116655','16628','116681','268622','268655','226655'], aliases: ['yacht master','ym'] },
      { model: 'Sky-Dweller', refs: ['326934','326933','336934','326135','326939','326138','326139','336235','326938'], aliases: ['sky dweller'] },
      { model: 'Oyster Perpetual', refs: ['124300','124200','126000','124273','124273','114300','116000','116034','114200','114234','114300','77080','67180'], aliases: ['op','oyster perpetual','oyster'] },
      { model: 'Air-King', refs: ['116900','126900','14000','14010','5500'], aliases: ['air king','airking'] },
      { model: 'Milgauss', refs: ['116400','116400GV','116400V'], aliases: ['milgauss','z-blue'] },
    ],
  },
  {
    brand: 'Patek Philippe',
    tier: 'fast_mover',
    models: [
      { model: 'Nautilus', refs: ['5711/1A','5711/1A-010','5711/1A-014','5711/1A-018','5712/1A','5980/1A','5990/1A','5740/1G','5711R','5711G','5811/1G','5811G','5740','5990R','5726/1A','5724'], aliases: ['nautilus','naut'] },
      { model: 'Aquanaut', refs: ['5167A','5168G','5167/1A','5164A','5167R','5068','5968A','5167A-001','5167A-010','5164A-001','5168G-001','5968'], aliases: ['aquanaut'] },
      { model: 'Calatrava', refs: ['5227','6119','5196','5226','5296','5227G','5227R','6006','6000','5196P','5116','6007','5227J'], aliases: ['calatrava'] },
      { model: 'Complications', refs: ['5905','5960','5905P','5930','5935','5961'], aliases: ['complication'] },
      { model: 'Grand Complications', refs: ['5270','5970','5271','5327','5204'], aliases: ['grand complication','perpetual calendar'] },
    ],
  },
  {
    brand: 'Audemars Piguet',
    tier: 'fast_mover',
    models: [
      { model: 'Royal Oak', refs: ['15202ST','15400ST','15500ST','15510ST','26331ST','15450ST','15413','15500OR','15400OR','15202IP','15410ST','15202BA','26239ST','15450OR','15400BA','15500BC','15300ST','15202ST.OO.1240ST.01'], aliases: ['royal oak','ro','jumbo'] },
      { model: 'Royal Oak Offshore', refs: ['26470ST','26420SO','26237ST','15710ST','26238OR','26420IO','26238ST','26238CE','26239CE','26400','26401','26405','26420TI'], aliases: ['offshore','roo'] },
      { model: 'Royal Oak Chrono', refs: ['26331ST','26240ST','26715ST','26715ST.OO.1356ST.01','26331IP','26314ST','26331ST.OO.1220ST.01','26574ST','26574OR'], aliases: ['ro chrono'] },
      { model: 'Royal Oak Concept', refs: ['26579CB','26589IO','26630ST'], aliases: ['ro concept'] },
      { model: 'Code 11.59', refs: ['15210CR','15210BC','15210OR','26393CR','26393BC','26395BC'], aliases: ['code 1159','code 11.59'] },
    ],
  },
  {
    brand: 'Omega',
    tier: 'fast_mover',
    models: [
      { model: 'Speedmaster Professional', refs: ['310.30.42.50.01.001','310.30.42.50.01.002','311.30.42.30.01.005','311.30.42.30.01.006','3570.50','145.022','311.33.42.30.01.002','310.30.42','311.30.42.30.01.001','310.60.42','310.60.42.50.01.001','321.30.42','310.32.42.50.02.001'], aliases: ['moonwatch','speedy','speedmaster pro'] },
      { model: 'Seamaster 300', refs: ['210.30.42.20.01.001','210.30.42.20.03.001','210.30.42.20.06.001','212.30.41.20.01.003','210.30.42.20.04.001','210.30.42.20.10.001','234.30.41.21.01.001','234.30.41.21.01.002','212.30.41','210.32.42.20.04.001'], aliases: ['seamaster 300','smp','seamaster diver'] },
      { model: 'Seamaster Planet Ocean', refs: ['215.30.44.21.01.001','232.30.46.21.01.003','215.30.44.21.01.002','215.33.44.21.01.001','215.30.46.51.01.001'], aliases: ['planet ocean','po'] },
      { model: 'Seamaster Aqua Terra', refs: ['220.10.41.21.03.001','220.10.41.21.03.004','220.10.41.21.10.001','220.10.38.20.01.001','220.10.38.20.01.002','220.10.38.20.03.001','220.10.41.21.01.001','220.10.41.21.06.001'], aliases: ['aqua terra','at'] },
      { model: 'Constellation', refs: ['131.10.39.20.08.001','131.10.39','123.10.35','131.33.41.21.02.001','131.20.39.20.08.001','131.13.39.20.03.001'], aliases: ['constellation'] },
      { model: 'De Ville', refs: ['435.13.41.21.03.001','435.13.40.21.02.001','434.10.40.21.02.001'], aliases: ['de ville','prestige'] },
    ],
  },
  {
    brand: 'Tudor',
    tier: 'fast_mover',
    models: [
      { model: 'Black Bay 58', refs: ['79030N','79030B','79010SG','79040B','79060B','79065B','M79030N','M79030B','79010','M79060B','79030SG','M79065B'], aliases: ['bb58','black bay 58'] },
      { model: 'Black Bay', refs: ['79230N','79230R','79230B','79250BM','79730','79220N','79220R','M79230N','M79230R','M79230B','M79250BM','M79730','79320','M79220','79240','79250BB','79360N'], aliases: ['bb41','black bay','bb'] },
      { model: 'Pelagos', refs: ['25600TN','25600TB','25610TNL','25407N','25600','M25600TB','M25600TN','M25610TNL','M25407N','25010TN','25707B','25807KN'], aliases: ['pelagos','fxd'] },
      { model: 'GMT', refs: ['79830RB','79833MN','M79830RB','M79833MN','79833'], aliases: ['bb gmt','pepsi tudor','tudor gmt'] },
      { model: 'Royal', refs: ['M28600','M28602','M28303','M28600-0007','M28600-0001'], aliases: ['royal tudor'] },
      { model: 'Ranger', refs: ['M79950','79950'], aliases: ['ranger'] },
    ],
  },
  {
    brand: 'Cartier',
    tier: 'mid',
    models: [
      { model: 'Santos', refs: ['WSSA0009','WSSA0018','WSSA0030','WSSA0006','WSSA0029','WSSA0010','WSSA0013','WSSA0017','W2SA0006','WSSA0007'], aliases: ['santos'] },
      { model: 'Tank', refs: ['WSTA0041','WSTA0040','W5330003','W1560017','WGTA0030','WSTA0067','WGTA0029','W1560002'], aliases: ['tank'] },
      { model: 'Ballon Bleu', refs: ['WE902039','W69017Z4','WSBB0025','WSBB0050'], aliases: ['ballon bleu','bb cartier'] },
    ],
  },
  {
    brand: 'Panerai',
    tier: 'mid',
    models: [
      { model: 'Luminor', refs: ['PAM01312','PAM00111','PAM00773','PAM01316','PAM00372','PAM00682','PAM00915','PAM01561','PAM01562','PAM00974','PAM00976','PAM01661','PAM01664','PAM00675'], aliases: ['luminor','pam'] },
      { model: 'Submersible', refs: ['PAM00973','PAM01389','PAM01115','PAM00682','PAM01055','PAM02683','PAM00024','PAM00683','PAM01074'], aliases: ['submersible'] },
      { model: 'Radiomir', refs: ['PAM00210','PAM00753','PAM00578','PAM00685','PAM01388','PAM01349'], aliases: ['radiomir'] },
    ],
  },
  {
    brand: 'IWC',
    tier: 'mid',
    models: [
      { model: 'Portugieser', refs: ['IW500705','IW500712','IW500107','IW358303','IW371480','IW500713','IW500716','IW503401','IW371446','IW390503','IW390701'], aliases: ['portugieser','portuguese'] },
      { model: 'Portofino', refs: ['IW356502','IW356523','IW458107','IW458110','IW391025'], aliases: ['portofino'] },
      { model: 'Pilot', refs: ['IW377709','IW377714','IW388103','IW388111','IW389105','IW389106','IW387901','IW388007','IW371807'], aliases: ['pilot','fliegeruhr'] },
      { model: 'Ingenieur', refs: ['IW328901','IW328902','IW328905','IW500502'], aliases: ['ingenieur'] },
    ],
  },
];

export const ALL_REFS: Array<{ brand: string; model: string; ref: string; tier: string }> =
  BRANDS.flatMap(b =>
    b.models.flatMap(m =>
      m.refs.map(ref => ({ brand: b.brand, model: m.model, ref, tier: b.tier }))
    )
  );

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
  'iwc': 'IWC',
  'international watch company': 'IWC',
};

export function brandTier(brand: string): string | null {
  const b = BRANDS.find(x => x.brand.toLowerCase() === brand.toLowerCase());
  return b?.tier ?? null;
}
