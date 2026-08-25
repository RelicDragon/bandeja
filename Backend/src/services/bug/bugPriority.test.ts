import assert from 'node:assert/strict';
import { BugType } from '@prisma/client';
import { resolveCreatePriority, resolveUpdatePriority } from './bugPriority';

assert.deepEqual(resolveCreatePriority(BugType.BUG, undefined), { ok: true, priority: 0 });
assert.deepEqual(resolveCreatePriority(BugType.BUG, 2), { ok: true, priority: 2 });
assert.deepEqual(resolveCreatePriority(BugType.BUG, 9), { ok: true, priority: 2 });
assert.deepEqual(resolveCreatePriority(BugType.BUG, -9), { ok: true, priority: -2 });

assert.deepEqual(resolveCreatePriority(BugType.REVIEW, undefined), {
  ok: false,
  code: 'errors.bugs.ratingRequired',
});
assert.deepEqual(resolveCreatePriority(BugType.REVIEW, 0), {
  ok: false,
  code: 'errors.bugs.ratingInvalid',
});
assert.deepEqual(resolveCreatePriority(BugType.REVIEW, 6), {
  ok: false,
  code: 'errors.bugs.ratingInvalid',
});
assert.deepEqual(resolveCreatePriority(BugType.REVIEW, 5), { ok: true, priority: 5 });
assert.deepEqual(resolveCreatePriority(BugType.REVIEW, 1), { ok: true, priority: 1 });

assert.deepEqual(
  resolveUpdatePriority({
    existingType: BugType.BUG,
    nextType: BugType.REVIEW,
    raw: undefined,
  }),
  { ok: true, priority: 3 },
);
assert.deepEqual(
  resolveUpdatePriority({
    existingType: BugType.BUG,
    nextType: BugType.REVIEW,
    raw: 4,
  }),
  { ok: true, priority: 4 },
);
assert.deepEqual(
  resolveUpdatePriority({
    existingType: BugType.REVIEW,
    nextType: BugType.REVIEW,
    raw: undefined,
  }),
  { ok: true, priority: undefined },
);
assert.deepEqual(
  resolveUpdatePriority({
    existingType: BugType.REVIEW,
    nextType: BugType.BUG,
    raw: undefined,
  }),
  { ok: true, priority: 0 },
);
assert.deepEqual(
  resolveUpdatePriority({
    existingType: BugType.BUG,
    nextType: BugType.BUG,
    raw: undefined,
  }),
  { ok: true, priority: undefined },
);

console.log('bugPriority tests passed');
