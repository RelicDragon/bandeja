import { bwfGameScoreCap, validateBwfRallyGameScore, validatePickleballRally11Score } from './strictValidation';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

assert(bwfGameScoreCap(21) === 30, 'BWF cap 21→30');
assert(bwfGameScoreCap(15) === 21, 'BWF cap 15→21');

assert(validateBwfRallyGameScore(21, 19, 21).ok === true, 'BWF 21-19');
assert(validateBwfRallyGameScore(30, 29, 21).ok === true, 'BWF 30-29');
assert(validateBwfRallyGameScore(30, 27, 21).ok === true, 'BWF 30-27');
assert(validateBwfRallyGameScore(22, 20, 21).ok === true, 'BWF 22-20');
assert(validateBwfRallyGameScore(21, 20, 21).ok === false, 'BWF rejects 21-20');
assert(validateBwfRallyGameScore(31, 29, 21).ok === false, 'BWF rejects over cap');
assert(validateBwfRallyGameScore(29, 29, 21).ok === false, 'BWF rejects draw below cap');

assert(validateBwfRallyGameScore(15, 13, 15).ok === true, 'BWF 15-13');
assert(validateBwfRallyGameScore(21, 20, 15).ok === true, 'BWF 21-20 at 15pt games');
assert(validateBwfRallyGameScore(15, 14, 15).ok === false, 'BWF rejects 15-14');
assert(validateBwfRallyGameScore(22, 20, 15).ok === false, 'BWF rejects over 15-game cap');

assert(validatePickleballRally11Score(11, 9).ok === true, 'pickleball 11-9');
assert(validatePickleballRally11Score(13, 11).ok === true, 'pickleball 13-11');
assert(validatePickleballRally11Score(11, 10).ok === false, 'pickleball rejects 11-10');
assert(validatePickleballRally11Score(14, 11).ok === false, 'pickleball rejects 14-11');

console.log('ok: strictValidation.test.ts');
