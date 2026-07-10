import { calculateEnduranceCoefficient, calculateRatingUpdate, calculateReliabilityChange } from './rating.service';
import { toRatingSetScores } from '@bandeja/shared/automaticRelaxedScoring';
import { getRules } from './liveScoringEngine/rulebook';
import type { GameRulesSource } from './matchStandingsPrisma';
import { Sports } from '../../sport/sportIds';
import { getSportConfig } from '../../sport/sportRegistry';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const automaticGame: GameRulesSource = {
  sport: Sports.PADEL,
  scoringPreset: 'CLASSIC_AUTOMATIC',
  winnerOfMatch: 'BY_SETS',
  fixedNumberOfSets: 3,
  ballsInGames: true,
};
const rules = getRules(automaticGame);
const engine = getSportConfig(Sports.PADEL).ratingModel.engine;

const gamesSets = toRatingSetScores(
  [
    { teamAScore: 6, teamBScore: 4, isTieBreak: false },
    { teamAScore: 6, teamBScore: 3, isTieBreak: false },
  ],
  { automaticRecordMode: 'GAMES' },
  rules,
);
const americanoTwoSets = toRatingSetScores(
  [
    { teamAScore: 24, teamBScore: 18, isTieBreak: false },
    { teamAScore: 24, teamBScore: 20, isTieBreak: false },
  ],
  { automaticRecordMode: 'AMERICANO_POINTS' },
  rules,
);
const americanoDeciderSets = toRatingSetScores(
  [
    { teamAScore: 6, teamBScore: 4, isTieBreak: false },
    { teamAScore: 4, teamBScore: 6, isTieBreak: false },
    { teamAScore: 10, teamBScore: 8, isTieBreak: true },
  ],
  { automaticRecordMode: 'GAMES' },
  rules,
);

assert(gamesSets[0]?.automaticSetKind === 'GAMES', 'games mode kind');
assert(americanoTwoSets[0]?.automaticSetKind === 'AMERICANO_POINTS', 'americano kind');
assert(americanoDeciderSets[2]?.automaticSetKind === 'SUPER_TIEBREAK', 'decider super TB kind');

const gamesReliability = calculateReliabilityChange(gamesSets, true);
const singleAmericano = toRatingSetScores(
  [{ teamAScore: 24, teamBScore: 18, isTieBreak: false }],
  { automaticRecordMode: 'AMERICANO_POINTS' },
  rules,
);
const americanoReliability = calculateReliabilityChange(singleAmericano, true);
assert(
  Math.abs(americanoReliability - 42 / 150) < 0.0001,
  'americano set avoids games reliability multiplier',
);
assert(gamesReliability > americanoReliability, 'games reliability weighted higher per set');

const gamesEndurance = calculateEnduranceCoefficient(gamesSets, true);
const americanoEndurance = calculateEnduranceCoefficient(americanoTwoSets, true);
assert(gamesEndurance === 0.5, 'games endurance uses balls-in-games base');
assert(americanoEndurance === 0.2, 'americano endurance uses points base x2 sets');

const gamesRating = calculateRatingUpdate(
  { level: 3, reliability: 50, gamesPlayed: 10 },
  { isWinner: true, ownTeamLevel: 3, opponentsLevel: 3.2, setScores: gamesSets },
  true,
  engine,
);
const americanoRating = calculateRatingUpdate(
  { level: 3, reliability: 50, gamesPlayed: 10 },
  { isWinner: true, ownTeamLevel: 3, opponentsLevel: 3.2, setScores: americanoTwoSets },
  true,
  engine,
);
const deciderRating = calculateRatingUpdate(
  { level: 3, reliability: 50, gamesPlayed: 10 },
  { isWinner: true, ownTeamLevel: 3, opponentsLevel: 3.2, setScores: americanoDeciderSets },
  true,
  engine,
);
assert(
  (gamesRating.totalPointDifferential ?? 0) === 5,
  'games margin sums game differentials',
);
assert(
  (americanoRating.totalPointDifferential ?? 0) === 10,
  'americano margin sums point differentials',
);
assert(
  (deciderRating.totalPointDifferential ?? 0) === 1,
  'super tiebreak decider counts as ±1 margin',
);

console.log('ok: automaticRelaxedRating.test.ts');
