export type PaymentStatus = 'paid' | 'unpaid' | 'na'

export interface DuesRecord {
  managerId: string  // matches Sleeper roster owner_id
  managerName: string
  role?: 'commissioner' | 'co-commissioner'
  payments: Record<string, PaymentStatus>
}

export interface ChampionshipRecord {
  year: number
  champion: string | null
  runnerUp: string | null
  thirdPlace: string | null
  regularSeasonWinner: string | null
}

export const DUES_YEARS = [2026, 2027, 2028, 2029, 2030]

// Per the bylaws: all 12 managers paid through 2027. 2028 and beyond unpaid.
export const duesRecords: DuesRecord[] = [
  {
    managerId: 'TBD',
    managerName: 'Andre Vallejo',
    payments: { '2026': 'paid', '2027': 'paid', '2028': 'unpaid', '2029': 'unpaid', '2030': 'unpaid' },
  },
  {
    managerId: 'TBD',
    managerName: 'Ben Jackson',
    payments: { '2026': 'paid', '2027': 'paid', '2028': 'unpaid', '2029': 'unpaid', '2030': 'unpaid' },
  },
  {
    managerId: 'TBD',
    managerName: 'Brian Shrum',
    payments: { '2026': 'paid', '2027': 'paid', '2028': 'unpaid', '2029': 'unpaid', '2030': 'unpaid' },
  },
  {
    managerId: 'TBD',
    managerName: 'Brendan Shrum',
    role: 'commissioner',
    payments: { '2026': 'paid', '2027': 'paid', '2028': 'unpaid', '2029': 'unpaid', '2030': 'unpaid' },
  },
  {
    managerId: 'TBD',
    managerName: 'Bryan Berger',
    payments: { '2026': 'paid', '2027': 'paid', '2028': 'unpaid', '2029': 'unpaid', '2030': 'unpaid' },
  },
  {
    managerId: 'TBD',
    managerName: 'Chris Book',
    payments: { '2026': 'paid', '2027': 'paid', '2028': 'unpaid', '2029': 'unpaid', '2030': 'unpaid' },
  },
  {
    managerId: 'TBD',
    managerName: 'Dylan Watson',
    payments: { '2026': 'paid', '2027': 'paid', '2028': 'unpaid', '2029': 'unpaid', '2030': 'unpaid' },
  },
  {
    managerId: 'TBD',
    managerName: 'Jake Jacob',
    payments: { '2026': 'paid', '2027': 'paid', '2028': 'unpaid', '2029': 'unpaid', '2030': 'unpaid' },
  },
  {
    managerId: 'TBD',
    managerName: 'Kyle Johnston',
    role: 'co-commissioner',
    payments: { '2026': 'paid', '2027': 'paid', '2028': 'unpaid', '2029': 'unpaid', '2030': 'unpaid' },
  },
  {
    managerId: 'TBD',
    managerName: 'Phil Husney',
    payments: { '2026': 'paid', '2027': 'paid', '2028': 'unpaid', '2029': 'unpaid', '2030': 'unpaid' },
  },
  {
    managerId: 'TBD',
    managerName: 'Ted Shang',
    role: 'co-commissioner',
    payments: { '2026': 'paid', '2027': 'paid', '2028': 'unpaid', '2029': 'unpaid', '2030': 'unpaid' },
  },
  {
    managerId: 'TBD',
    managerName: 'Wilson Boyette',
    payments: { '2026': 'paid', '2027': 'paid', '2028': 'unpaid', '2029': 'unpaid', '2030': 'unpaid' },
  },
]

export const championshipHistory: ChampionshipRecord[] = [
  {
    year: 2026,
    champion: null,
    runnerUp: null,
    thirdPlace: null,
    regularSeasonWinner: null,
  },
]

export function getChampionshipCount(managerName: string): number {
  return championshipHistory.filter((r) => r.champion === managerName).length
}
