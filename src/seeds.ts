// Regional viral health-misinformation seeds.
// Used to (a) pre-load the "Check a claim" box with realistic examples,
// (b) hint at future locale-aware harvest (lang field for Tavily).
// These are common real-world claims from the listed regions — NOT
// endorsed facts, just examples of what circulates.

export interface RegionSeed {
  region: string;
  regionName: string;
  lang: string; // ISO 639-1 for future locale-aware harvest
  claims: string[];
}

const MAX_CLAIM_LEN = 500;

function clip(s: string): string {
  return s.length > MAX_CLAIM_LEN ? s.slice(0, MAX_CLAIM_LEN) : s;
}

export const REGION_SEEDS: RegionSeed[] = [
  {
    region: 'pk',
    regionName: 'Pakistan',
    lang: 'ur',
    claims: [
      'Haldi wala doodh prevents and cures dengue fever',
      'Drinking bleach or disinfectant protects you from the coronavirus',
      'The polio vaccine causes paralysis and should be avoided',
      'Black seed oil cures cancer if taken daily for a month',
    ].map(clip),
  },
  {
    region: 'in',
    regionName: 'India',
    lang: 'hi',
    claims: [
      'The DPT vaccine causes permanent brain damage in children',
      'Drinking cow urine cures diabetes and arthritis',
      'Coronavirus is a hoax spread by 5G mobile towers',
      'Turmeric and honey completely cure high blood pressure in 7 days',
    ].map(clip),
  },
  {
    region: 'bd',
    regionName: 'Bangladesh',
    lang: 'bn',
    claims: [
      'The measles vaccine causes autism in young children',
      'Eating raw garlic cures all viral fevers instantly',
      'COVID-19 does not exist in Bangladesh, it is a foreign hoax',
    ].map(clip),
  },
  {
    region: 'np',
    regionName: 'Nepal',
    lang: 'ne',
    claims: [
      'Drinking warm water with lemon in the morning cures arthritis',
      'The COVID vaccine changes human DNA permanently',
      'Snake-bite patients should drink urine as a first aid remedy',
    ].map(clip),
  },
  {
    region: 'mena',
    regionName: 'Middle East & North Africa',
    lang: 'ar',
    claims: [
      'Drinking black seed oil five drops a day cures all chronic diseases',
      'The MMR vaccine causes autism in Arab children born after 2015',
      'Honey and black seed abolish every type of cancer cell',
    ].map(clip),
  },
  {
    region: 'eu',
    regionName: 'Europe',
    lang: 'en',
    claims: [
      '5G towers transmit the coronavirus in airborne droplets',
      'Vitamin C megadoses prevent ageing and stroke completely',
      'The seasonal flu shot caused a new wave of heart attacks',
    ].map(clip),
  },
  {
    region: 'na',
    regionName: 'North America',
    lang: 'en',
    claims: [
      'Chloroquine taken early cured the virus in 100% of patients',
      'Bleach baths treat COVID and reduce viral load by 90%',
      'The bivalent booster is less safe than the original shot',
    ].map(clip),
  },
  {
    region: 'global',
    regionName: 'Global / unspecified',
    lang: 'en',
    claims: [
      'Drinking lemon water every morning cures cancer in two weeks',
      'Vaccines cause autism in children',
      'Warm milk with turmeric cures all seasonal allergies',
    ].map(clip),
  },
];

export function seedClaimsFor(region?: string): RegionSeed {
  const match = region ? REGION_SEEDS.find((r) => r.region === region) : undefined;
  return match ?? REGION_SEEDS[REGION_SEEDS.length - 1]; // fallback to global
}

export function allSeedClaims(): string[] {
  return REGION_SEEDS.flatMap((r) => r.claims);
}