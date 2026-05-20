import type { BylawsSection } from '@/types/domain'

export const bylawsSections: BylawsSection[] = [
  {
    id: 'scoring',
    title: 'Scoring',
    items: [
      {
        question: 'How much does a 40+ yard touchdown score?',
        answer: '9 points total: 6 base TD points + 1 big play bonus (40+ yards) + 2 big TD bonus. These bonuses stack.',
      },
      {
        question: 'Do the 40-yard bonuses apply to both the thrower and the receiver?',
        answer: 'Yes. A 50-yard TD pass earns the QB the big play + big TD bonus AND the receiver earns the same bonuses. They stack independently.',
      },
      {
        question: 'How does the WR/TE reception bonus work?',
        answer: 'WRs receive 1.0 PPR (0.5 base + 0.5 WR bonus). TEs receive 1.5 PPR (0.5 base + 1.0 TE premium). This makes TEs more valuable than in standard leagues.',
      },
      {
        question: 'How does a pick-6 score for the QB?',
        answer: '-3 points total: -2 for the interception + -1 additional pick-6 penalty.',
      },
      {
        question: 'What is the SuperFlex slot?',
        answer: 'The SuperFlex slot can be filled by any QB, RB, WR, or TE. Starting a second QB is almost always optimal, which dramatically increases QB value in this league.',
      },
    ],
  },
  {
    id: 'roster-taxi',
    title: 'Roster & Taxi Squad',
    items: [
      {
        question: 'Can I put a player I received in a trade on my taxi squad?',
        answer: 'No. Only the manager who originally drafted the player can place them on the taxi squad. This rule exists even if the player was later traded.',
      },
      {
        question: 'What happens if I activate someone off taxi mid-season?',
        answer: 'Once activated, that player cannot return to the taxi squad — ever. You also cannot place a different player on taxi during the season (taxi only adjusts during the offseason).',
      },
      {
        question: 'How long can a player stay on taxi?',
        answer: 'Up to 2 years from their draft year. Year 1: drafted and placed on taxi. Year 2: can remain on taxi. After Year 2 (or if ever activated), they are no longer taxi-eligible.',
      },
      {
        question: 'When does the taxi squad lock?',
        answer: 'Taxi squads lock before the first NFL game kickoff of the regular season. No taxi changes are permitted after that point.',
      },
      {
        question: 'How many IR spots are there?',
        answer: '2 IR spots. Players must have an official injury designation to be placed on IR.',
      },
    ],
  },
  {
    id: 'trading',
    title: 'Trading',
    items: [
      {
        question: 'Is there a trade deadline?',
        answer: 'There is no traditional trade deadline, but playoff teams (seeds 1–6) cannot make trades from Week 15 through the end of the championship game.',
      },
      {
        question: 'Can I trade FAAB?',
        answer: 'Yes, but only the FAAB pool for the current period (offseason or regular season). You cannot trade FAAB across periods.',
      },
      {
        question: 'Do we have a veto system?',
        answer: 'No. Collusion is addressed separately: it requires 8/12 votes to confirm, and results in removal from the league with no dues refund.',
      },
      {
        question: 'What does trading a future pick cost?',
        answer: 'Both managers involved in the trade must have paid their dues for the year of the traded pick before the trade is approved by the commissioner.',
      },
      {
        question: 'How far in advance can picks be traded?',
        answer: 'Up to 3 years in advance. Picks beyond 3 years cannot be traded.',
      },
      {
        question: 'Is there a review period for trades?',
        answer: 'There is a 1-day waiting period for all trades. However, the commissioner approves trades immediately if no draft picks are involved. During Year 1 (Training Wheels, if voted in), a 48-hour review window applies.',
      },
    ],
  },
  {
    id: 'draft',
    title: 'Draft Order',
    items: [
      {
        question: 'How is the rookie draft order determined?',
        answer: 'Picks 1–9: Reverse Max Points For (MPF) — the team with the lowest MPF gets the first pick. Picks 10–12: Reverse payout order (3rd place picks 10th, runner-up picks 11th, champion picks 12th).',
      },
      {
        question: 'Why reverse MPF instead of reverse record?',
        answer: 'MPF counts your best possible score each week, not your actual score. This prevents tanking — deliberately benching starters does not help your draft position because MPF is calculated from your optimal lineup.',
      },
      {
        question: 'Can picks be traded in Year 1?',
        answer: 'Startup picks cannot be traded in Year 1 (Training Wheels rule). Rookie picks in Year 1 cannot be traded either, if that option was voted in. Both restrictions lift in Year 2.',
      },
      {
        question: 'How many rounds is the rookie draft?',
        answer: '4 rounds. Order follows the reverse MPF structure above for each round.',
      },
    ],
  },
  {
    id: 'median',
    title: 'League Median Scoring',
    items: [
      {
        question: 'What is a median win?',
        answer: 'Each week, every team also gets a bonus win or loss based on whether their score is above or below the league median score that week. A team can go 1-1 in a single week (won their matchup but scored below median).',
      },
      {
        question: 'Does the median record affect playoff seeding?',
        answer: 'Yes. Your overall record (H2H wins + median wins) determines seeds 1–5. A manager who consistently scores above the median benefits even when their matchup opponent also scores well.',
      },
      {
        question: 'What if my score ties the median exactly?',
        answer: 'Ties against the median are resolved as losses (below median = loss). The median win requires strictly beating the median.',
      },
    ],
  },
  {
    id: 'playoffs',
    title: 'Playoffs & Toilet Bowl',
    items: [
      {
        question: 'How are the 6 playoff teams determined?',
        answer: 'Seeds 1–5 go to the top 5 teams by overall record (H2H + median wins), with Points For as a tiebreaker. Seed 6 goes to the team with the highest Points For among teams not in seeds 1–5 — regardless of their record.',
      },
      {
        question: 'What is the Toilet Bowl?',
        answer: 'The Toilet Bowl is a consolation bracket for the bottom teams. The last-place finisher must present a rookie draft scouting report on the night of the rookie draft.',
      },
      {
        question: 'When do playoffs start?',
        answer: 'NFL Week 15. The championship is played in Week 17.',
      },
    ],
  },
  {
    id: 'squad-pot',
    title: 'Squad Pot',
    items: [
      {
        question: 'What is the Squad Pot?',
        answer: 'A growing jackpot funded by $100 per year from league dues. The pot is claimed by the first manager to either: (1) win back-to-back championships, or (2) win 3 total championships all-time.',
      },
      {
        question: 'What if neither condition is met for many years?',
        answer: 'The pot keeps growing. There is no time limit — it will keep accumulating until a manager hits one of the two unlock conditions.',
      },
      {
        question: 'What if the league dissolves before anyone wins the pot?',
        answer: 'The pot splits evenly among all remaining league members at the time of dissolution.',
      },
    ],
  },
  {
    id: 'waivers',
    title: 'Waivers & FAAB',
    items: [
      {
        question: 'How does FAAB work?',
        answer: 'Each manager gets $100 for the offseason period and a separate $100 for the regular season. Bids are blind — you submit your bid without knowing what others are bidding. Highest bid wins.',
      },
      {
        question: 'When do waivers run?',
        answer: 'Offseason: Wednesdays at 9am EST. Regular season: Daily at 9am EST, except Tuesdays.',
      },
      {
        question: 'Does unused FAAB carry over?',
        answer: 'No. Offseason FAAB expires after the last preseason game. Regular season FAAB does not carry over year to year.',
      },
    ],
  },
]
