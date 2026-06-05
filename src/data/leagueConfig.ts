export const LEAGUE_CONFIG = {
  leagueId: '', // SERVER ONLY — set via LEAGUE_ID env var. Never reference this client-side.
  totalManagers: 12,
  faabBudget: 100,
  duesPerYear: 100,
  squadPotContributionPerYear: 100,
  payouts: {
    champion: 600,
    runnerUp: 300,
    thirdPlace: 100,
    regularSeasonWinner: 100,
  },
  roster: {
    starters: 10,
    bench: 18,
    ir: 2,
    taxiSquad: 4,
  },
  scoring: {
    passingTD: 6,
    passYardsPer: 0.04,          // 25 yds = 1 pt
    interception: -2,
    pickSixBonus: -1,            // -3 total for pick-6 thrown
    rushRecTD: 6,
    rushRecYardsPer: 0.1,        // 10 yds = 1 pt
    reception: 0.5,              // base (half PPR)
    wrReceptionBonus: 0.5,       // WR total = 1.0 PPR
    teReceptionBonus: 1.0,       // TE total = 1.5 PPR (TE premium)
    firstDown: 0.5,
    twoPointConversion: 2,
    fumbleLost: -2,
    bigPlayYardage: 1,           // +1 for 40+ yard play
    bigPlayTdYardage: 2,         // +2 for 40+ yard TD (stacks: 40yd TD = 9 pts)
  },
  trainingWheels: {
    active: true,                // set to false after 2027 rookie draft (end of Year 2)
    expiresAfter: '2027 rookie draft',
    maxAssetsPerSide: 3,         // FAAB doesn't count toward cap
    tradeReviewWindowHours: 48,
    rookiePickTradingAllowed: false,   // no rookie pick trading until after 2027 draft
    startupPickTradingAllowed: false,
  },
  playoffFormat: {
    teams: 6,
    startWeek: 15,
    championshipWeek: 17,
    byeSeeds: [1, 2],
    toiletBowlTeams: 6,
    toiletBowlByeSeeds: [11, 12],
  },
  waiver: {
    offseasonRunDay: 'Wednesday',
    offseasonRunTime: '9:00 AM EST',
    regularSeasonRunTime: '9:00 AM EST',
    regularSeasonNoRunDay: 'Tuesday',
  },
  draft: {
    format: 'snake',
    thirdRoundReversal: true,
    startupDraftDate: '2026-05-30',
    firstRookieDraftYear: 2027,
    rookieDraftTiming: 'One week after the NFL Draft',
    rookieDraftRounds: 4,
  },
} as const
