import { Sports } from '../../sport/sportIds';
import { getSportConfig } from '../../sport/sportRegistry';

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

console.log('ok: ratingEngine.test.ts');
