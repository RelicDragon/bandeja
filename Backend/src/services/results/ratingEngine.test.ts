import { Sports } from '../../sport/sportIds';
import { getSportConfig } from '../../sport/sportRegistry';
import { EntityType } from '@prisma/client';
import { calculateEnduranceCoefficient } from './rating.service';

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
  ) === 2.25,
  'classic league endurance gain x3 sets',
);
assert(
  calculateEnduranceCoefficient([{ teamAScore: 6, teamBScore: 4 }], false, EntityType.GAME) === 0.1,
  'game endurance base',
);
assert(
  Math.abs(
    calculateEnduranceCoefficient([{ teamAScore: 6, teamBScore: 4 }], false, EntityType.LEAGUE, true) - 0.3,
  ) < 1e-9,
  'league endurance gain x3',
);
assert(
  calculateEnduranceCoefficient([{ teamAScore: 6, teamBScore: 4 }], false, EntityType.LEAGUE, false) === 0.1,
  'league endurance loss x1',
);
assert(
  calculateEnduranceCoefficient([{ teamAScore: 6, teamBScore: 4 }], true, EntityType.LEAGUE, true) === 0.75,
  'classic league endurance gain',
);
assert(
  calculateEnduranceCoefficient([{ teamAScore: 6, teamBScore: 4 }], true, EntityType.LEAGUE, false) === 0.25,
  'classic league endurance loss',
);
assert(
  calculateEnduranceCoefficient([{ teamAScore: 6, teamBScore: 4 }], false, EntityType.TOURNAMENT) === 0.2,
  'tournament endurance x2',
);

console.log('ok: ratingEngine.test.ts');
