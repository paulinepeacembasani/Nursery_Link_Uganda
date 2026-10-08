import type { CertificationStatus, NurseryType } from '@nurserylink/shared';

export interface SeedNursery {
  name: string;
  type: NurseryType;
  /** [lng, lat]; the sub-county is looked up from the boundary polygon that contains this point */
  location: [number, number];
  operatorName: string;
  /** Fictional numbers in E.164 */
  contactPhone: string;
  payoutPhone: string;
  annualCapacity: number;
  seedSource: string;
  certificationStatus: CertificationStatus;
  /** [species slug, quantity available, unit price in UGX] */
  inventory: [string, number, number][];
}

/**
 * Where these sample nurseries were seeded before the official UBOS boundaries replaced the hand-drawn
 * ones (October 2026). The seed moves a nursery still at its old point into the sub-county its name
 * refers to; one an admin has moved since is left alone.
 */
export const PREVIOUS_SEED_LOCATIONS: Record<string, [number, number]> = {
  'Kimenyedde Green Nursery': [32.745, 0.56],
  'Kyampisi Agroforestry Group': [32.7, 0.27],
  "Mpatta Women's Nursery": [32.87, 0.21],
  'Mpunge Riverside Nursery': [32.905, 0.265],
  'Nabbaale Tree Hub': [32.67, 0.5],
  'Nagojje Seedling Centre': [32.89, 0.52],
  'Ntunda Hills Nursery': [32.87, 0.64],
  'Seeta-Namuganga Nursery': [32.815, 0.47],
};

/**
 * Stock added to existing sample nurseries after they were first seeded. Each batch is applied once
 * per database (recorded as a `seed.stock_added` audit entry with its key), so a database seeded
 * earlier gets it too, and an admin's later changes to these lines are never undone.
 * [nursery name, species slug, quantity available, unit price in UGX]
 */
export const STOCK_ADDITIONS: { key: string; lines: [string, string, number, number][] }[] = [
  {
    // Coffee and cocoa categories (October 2026). Mukono grows Robusta and some cocoa, not Arabica.
    key: '2026-10-coffee-cocoa',
    lines: [
      ['Kyampisi Agroforestry Group', 'robusta-coffee', 5000, 700],
      ['Kyampisi Agroforestry Group', 'cocoa', 1500, 1000],
      ["Kasawo Farmers' Nursery", 'robusta-coffee', 8000, 650],
      ['Nabbaale Tree Hub', 'robusta-coffee', 6000, 700],
      ['Nabbaale Tree Hub', 'cocoa', 2000, 1000],
    ],
  },
];

// Sample nurseries for development. Names, people and phone numbers are fictional.
export const NURSERIES: SeedNursery[] = [
  {
    name: 'Kasangalabi Tree Nursery',
    type: 'commercial',
    location: [32.748, 0.408],
    operatorName: 'Ronald Ssemakula',
    contactPhone: '+256700100101',
    payoutPhone: '+256700100101',
    annualCapacity: 250000,
    seedSource: 'NFA Tree Seed Centre and own seed orchard',
    certificationStatus: 'certified',
    inventory: [['eucalyptus-grandis', 85000, 400], ['caribbean-pine', 40000, 500], ['musizi', 12000, 900], ['grevillea', 9500, 700]],
  },
  {
    name: 'Seeta Fruit & Tree Seedlings',
    type: 'private',
    location: [32.69, 0.361],
    operatorName: 'Sarah Nakato',
    contactPhone: '+256700100102',
    payoutPhone: '+256772100102',
    annualCapacity: 40000,
    seedSource: 'Grafted from registered mother trees',
    certificationStatus: 'certified',
    inventory: [['hass-avocado', 2400, 6000], ['mango', 1800, 5000], ['jackfruit', 900, 2500], ['mutuba', 600, 1500]],
  },
  {
    name: 'Nakisunga Community Nursery',
    type: 'community',
    location: [32.835, 0.33],
    operatorName: 'Grace Nalubega',
    contactPhone: '+256700100103',
    payoutPhone: '+256700100103',
    annualCapacity: 30000,
    seedSource: 'Seed collected from local mother trees',
    certificationStatus: 'pending',
    inventory: [['grevillea', 6000, 600], ['mugavu', 3500, 900], ['mukebu', 2800, 1000], ['calliandra', 4000, 400]],
  },
  {
    name: 'Katosi Lakeshore Seedlings',
    type: 'private',
    location: [32.8, 0.205],
    operatorName: 'Joseph Kiwanuka',
    contactPhone: '+256700100104',
    payoutPhone: '+256700100104',
    annualCapacity: 25000,
    seedSource: 'Local collection along the lakeshore',
    certificationStatus: 'unverified',
    inventory: [['mvule', 2500, 2000], ['musizi', 5000, 800], ['nsambya', 3000, 800], ['mutuba', 900, 1200], ['bottlebrush', 400, 3000]],
  },
  {
    name: 'Kyampisi Agroforestry Group',
    type: 'community',
    location: [32.7046, 0.5012],
    operatorName: 'Harriet Nabukenya',
    contactPhone: '+256700100105',
    payoutPhone: '+256700100105',
    annualCapacity: 35000,
    seedSource: 'Farmer-group seed stands',
    certificationStatus: 'certified',
    inventory: [['calliandra', 8000, 350], ['grevillea', 7000, 600], ['mugavu', 2500, 900], ['moringa', 1500, 1000]],
  },
  {
    name: 'Namilyango Tree Growers',
    type: 'private',
    location: [32.72, 0.34],
    operatorName: 'Brian Tumwesigye',
    contactPhone: '+256700100106',
    payoutPhone: '+256700100106',
    annualCapacity: 50000,
    seedSource: 'NFA Tree Seed Centre',
    certificationStatus: 'certified',
    inventory: [['mvule', 3500, 1800], ['african-mahogany', 1500, 1800], ['musizi', 6000, 850], ['teak', 4000, 700], ['jacaranda', 800, 2500]],
  },
  {
    name: "Mpatta Women's Nursery",
    type: 'community',
    location: [32.6913, 0.2072],
    operatorName: 'Esther Namukasa',
    contactPhone: '+256700100107',
    payoutPhone: '+256700100107',
    annualCapacity: 15000,
    seedSource: 'Seed collected by group members',
    certificationStatus: 'unverified',
    inventory: [['nsambya', 2000, 700], ['mutuba', 700, 1200], ['jackfruit', 500, 2000]],
  },
  {
    name: "Kasawo Farmers' Nursery",
    type: 'community',
    location: [32.825, 0.61],
    operatorName: 'Moses Ssali',
    contactPhone: '+256700100108',
    payoutPhone: '+256700100108',
    annualCapacity: 20000,
    seedSource: 'Local mother trees',
    certificationStatus: 'pending',
    inventory: [['mango', 1200, 4500], ['jackfruit', 800, 2000], ['eucalyptus-grandis', 15000, 350]],
  },
  {
    name: 'Nagojje Seedling Centre',
    type: 'commercial',
    location: [32.9026, 0.4422],
    operatorName: 'Denis Mukasa',
    contactPhone: '+256700100109',
    payoutPhone: '+256700100109',
    annualCapacity: 120000,
    seedSource: 'Certified seed from NFA and imported pine seed',
    certificationStatus: 'certified',
    inventory: [['caribbean-pine', 30000, 450], ['eucalyptus-grandis', 45000, 380], ['teak', 6000, 700], ['neem', 1500, 1200]],
  },
  {
    name: 'Ntunda Hills Nursery',
    type: 'private',
    location: [32.9352, 0.5832],
    operatorName: 'Annet Nansubuga',
    contactPhone: '+256700100110',
    payoutPhone: '+256700100110',
    annualCapacity: 12000,
    seedSource: 'Own collection',
    certificationStatus: 'unverified',
    inventory: [['grevillea', 3000, 600], ['prunus-africana', 800, 2000], ['calliandra', 2500, 400]],
  },
  {
    name: 'Kimenyedde Green Nursery',
    type: 'private',
    location: [32.8437, 0.5296],
    operatorName: 'Isaac Wasswa',
    contactPhone: '+256700100111',
    payoutPhone: '+256700100111',
    annualCapacity: 18000,
    seedSource: 'Local and NFA seed',
    certificationStatus: 'pending',
    inventory: [['musizi', 4000, 800], ['mvule', 1200, 2000], ['hass-avocado', 600, 6500]],
  },
  {
    name: 'Nabbaale Tree Hub',
    type: 'commercial',
    location: [32.7549, 0.5662],
    operatorName: 'Peter Kato',
    contactPhone: '+256700100112',
    payoutPhone: '+256700100112',
    annualCapacity: 90000,
    seedSource: 'NFA Tree Seed Centre and registered orchards',
    certificationStatus: 'certified',
    inventory: [['eucalyptus-grandis', 40000, 400], ['grevillea', 10000, 650], ['hass-avocado', 1500, 6000], ['mango', 1000, 5000], ['moringa', 2000, 900], ['neem', 1200, 1100]],
  },
  {
    name: 'Seeta-Namuganga Nursery',
    type: 'community',
    location: [32.8078, 0.7418],
    operatorName: 'Christine Nanyonga',
    contactPhone: '+256700100113',
    payoutPhone: '+256700100113',
    annualCapacity: 22000,
    seedSource: 'Community seed collection',
    certificationStatus: 'certified',
    inventory: [['mukebu', 2000, 1000], ['mugavu', 2200, 900], ['nsambya', 2500, 750], ['nandi-flame', 600, 2000]],
  },
  {
    name: 'Mukono Town Nursery',
    type: 'commercial',
    location: [32.757, 0.358],
    operatorName: 'Julius Wasswa',
    contactPhone: '+256700100114',
    payoutPhone: '+256772100114',
    annualCapacity: 60000,
    seedSource: 'Registered orchards and NFA seed',
    certificationStatus: 'certified',
    inventory: [['jacaranda', 1500, 2500], ['bottlebrush', 1200, 3000], ['nandi-flame', 800, 2000], ['hass-avocado', 900, 6500], ['musizi', 3000, 900]],
  },
  {
    name: 'Mpunge Riverside Nursery',
    type: 'private',
    location: [32.7196, 0.1146],
    operatorName: 'Rose Nakimuli',
    contactPhone: '+256700100115',
    payoutPhone: '+256700100115',
    annualCapacity: 10000,
    seedSource: 'Own collection along the river',
    certificationStatus: 'unverified',
    inventory: [['african-mahogany', 900, 1600], ['mutuba', 500, 1200], ['nsambya', 1500, 700]],
  },
];
