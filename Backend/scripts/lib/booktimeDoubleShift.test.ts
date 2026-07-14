import { correctDoubleShiftedStoredUtc, isDoubleShiftPattern } from './booktimeDoubleShift';

const TZ = 'Europe/Belgrade';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

assert(
  correctDoubleShiftedStoredUtc('2026-06-15T14:00:00.000Z', TZ) === '2026-06-15T16:00:00.000Z',
  'afternoon double-shift corrects via belgrade wall +2h',
);
assert(
  correctDoubleShiftedStoredUtc('2026-06-19T05:00:00.000Z', TZ) === '2026-06-19T07:00:00.000Z',
  'morning double-shifted UTC corrects via belgrade wall +2h',
);
assert(
  isDoubleShiftPattern('2026-06-15T14:00:00.000Z', '2026-06-15T16:00:00.000Z', TZ),
  'detects double-shift vs expected',
);
assert(
  isDoubleShiftPattern('2026-06-19T05:00:00.000Z', '2026-06-19T07:00:00.000Z', TZ),
  'detects morning double-shift vs expected',
);

console.log('booktimeDoubleShift tests: OK');
