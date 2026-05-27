// Canonical manager list for SDFF. managerId = Sleeper owner_id (user_id).
// TODO: Update managerId values after the league is live on Sleeper — run GET /v1/league/{id}/users
// to retrieve the user_id for each manager and fill in below.
export interface Manager {
  managerId: string
  managerName: string
  role?: 'commissioner' | 'co-commissioner'
  phone: string
  venmo?: string
}

export const MANAGERS: Manager[] = [
  {
    managerId: 'TBD',
    managerName: 'Andre Vallejo',
    phone: '972-832-1702',
  },
  {
    managerId: 'TBD',
    managerName: 'Ben Jackson',
    phone: '270-293-2437',
  },
  {
    managerId: 'TBD',
    managerName: 'Brian Shrum',
    phone: '678-314-7655',
  },
  {
    managerId: 'TBD',
    managerName: 'Brendan Shrum',
    role: 'commissioner',
    phone: '678-733-5223',
    venmo: '@Brendan-Shrum',
  },
  {
    managerId: 'TBD',
    managerName: 'Bryan Berger',
    phone: '678-994-6536',
  },
  {
    managerId: 'TBD',
    managerName: 'Chris Book',
    phone: '602-329-1537',
  },
  {
    managerId: 'TBD',
    managerName: 'Dylan Watson',
    phone: '602-326-1363',
  },
  {
    managerId: 'TBD',
    managerName: 'Jake Jacob',
    phone: '678-848-1318',
  },
  {
    managerId: 'TBD',
    managerName: 'Kyle Johnston',
    role: 'co-commissioner',
    phone: '678-591-3703',
  },
  {
    managerId: 'TBD',
    managerName: 'Phil Husney',
    phone: '678-849-1890',
  },
  {
    managerId: 'TBD',
    managerName: 'Ted Shang',
    role: 'co-commissioner',
    phone: '678-548-8210',
  },
  {
    managerId: 'TBD',
    managerName: 'Wilson Boyette',
    phone: '404-345-2069',
  },
]

export function getManagerByName(name: string): Manager | undefined {
  return MANAGERS.find((m) => m.managerName === name)
}

export function getManagerById(id: string): Manager | undefined {
  return MANAGERS.find((m) => m.managerId === id)
}
