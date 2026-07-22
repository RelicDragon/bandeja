import { Sports } from '../../sport/sportIds';
import { getSportConfig } from '../../sport/sportRegistry';
import { EntityType } from '@prisma/client';
import { calculateEnduranceCoefficient, calculateRatingUpdate } from './rating.service';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const padel = getSportConfig(Sports.PADEL).ratingModel.engine;
assert(padel.ballsInGamesMargin === true, 'padel ballsInGamesMargin');
assert(padel.useScoreMargin === true, 'padel useScoreMargin');
assert(padel.maxDeltaPerEvent === 0.2, 'padel maxDelta');

for (const sport of [
  Sports.TENNIS,
  Sports.PICKLEBALL,
  Sports.BADMINTON,
  Sports.TABLE_TENNIS,
  Sports.SQUASH,
] as const) {
  const engine = getSportConfig(sport).ratingModel.engine;
  assert(engine.useScoreMargin === true, `${sport} useScoreMargin`);
  assert(engine.ballsInGamesMargin !== true, `${sport} no ballsInGamesMargin`);
  assert(engine.maxDeltaPerEvent === 0.2, `${sport} maxDelta`);
}

assert(
  calculateEnduranceCoefficient([{ teamAScore: 6, teamBScore: 4 }], true, EntityType.GAME) === 0.25,
  'classic endurance halved',
);
assert(
  calculateEnduranceCoefficient(
    [
      { teamAScore: 6, teamBScore: 4 },
      { teamAScore: 6, teamBScore: 3 },
    ],
    true,
    EntityType.GAME,
  ) === 0.5,
  'classic endurance x set count (2 sets)',
);
assert(
  calculateEnduranceCoefficient(
    [
      { teamAScore: 6, teamBScore: 4 },
      { teamAScore: 4, teamBScore: 6 },
      { teamAScore: 6, teamBScore: 2 },
    ],
    true,
    EntityType.LEAGUE,
    true,
  ) === 1.5,
  'classic league endurance gain x2 sets',
);
assert(
  calculateEnduranceCoefficient([{ teamAScore: 6, teamBScore: 4 }], false, EntityType.GAME) === 0.1,
  'game endurance base',
);
assert(
  Math.abs(
    calculateEnduranceCoefficient([{ teamAScore: 6, teamBScore: 4 }], false, EntityType.LEAGUE, true) - 0.2,
  ) < 1e-9,
  'league endurance gain x2',
);
assert(
  calculateEnduranceCoefficient([{ teamAScore: 6, teamBScore: 4 }], false, EntityType.LEAGUE, false) === 0.1,
  'league endurance loss x1',
);
assert(
  calculateEnduranceCoefficient([{ teamAScore: 6, teamBScore: 4 }], true, EntityType.LEAGUE, true) === 0.5,
  'classic league endurance gain',
);
assert(
  calculateEnduranceCoefficient([{ teamAScore: 6, teamBScore: 4 }], true, EntityType.LEAGUE, false) === 0.25,
  'classic league endurance loss',
);
assert(
  Math.abs(
    calculateEnduranceCoefficient([{ teamAScore: 6, teamBScore: 4 }], false, EntityType.TOURNAMENT) - 0.15,
  ) < 1e-9,
  'tournament endurance x1.5',
);
assert(
  Math.abs(
    calculateEnduranceCoefficient(
      [
        { teamAScore: 6, teamBScore: 4, isTieBreak: false },
        { teamAScore: 4, teamBScore: 6, isTieBreak: false },
        { teamAScore: 10, teamBScore: 5, isTieBreak: true },
      ],
      true,
      EntityType.GAME,
    ) - 0.6,
  ) < 1e-9,
  'classic STB endurance = 2 games + 1 points set',
);
assert(
  Math.abs(
    calculateEnduranceCoefficient(
      [
        { teamAScore: 6, teamBScore: 4, isTieBreak: false },
        { teamAScore: 4, teamBScore: 6, isTieBreak: false },
        { teamAScore: 10, teamBScore: 5, isTieBreak: true },
      ],
      true,
      EntityType.LEAGUE,
      true,
    ) - 1.2,
  ) < 1e-9,
  'league STB endurance gain = (0.25+0.25+0.1)*2',
);

const reportedLeagueWinnerSets = [
  { teamAScore: 0, teamBScore: 6, isTieBreak: false },
  { teamAScore: 6, teamBScore: 4, isTieBreak: false },
  { teamAScore: 10, teamBScore: 5, isTieBreak: true },
];
const reportedLeagueWinner = calculateRatingUpdate(
  { level: 2.17519939799681, reliability: 39.220570936512026, gamesPlayed: 41 },
  {
    isWinner: true,
    ownTeamLevel: 2.230466437566073,
    opponentsLevel: 2.1263551644171343,
    setScores: reportedLeagueWinnerSets,
  },
  true,
  padel,
  EntityType.LEAGUE,
);
assert(reportedLeagueWinner.totalPointDifferential === -3, 'reported league winner differential');
assert(reportedLeagueWinner.marginLabel === 'veryClose', 'non-positive winner differential is very close');
assert(
  Math.abs((reportedLeagueWinner.multiplier ?? 0) - 0.36600592981575897) < 1e-9,
  'non-positive winner differential uses minimum margin impact',
);
assert(
  Math.abs(reportedLeagueWinner.levelChange - 0.03786054030764673) < 1e-9,
  'reported league winner gain includes STB weighting and close-win impact',
);

console.log('ok: ratingEngine.test.ts');
