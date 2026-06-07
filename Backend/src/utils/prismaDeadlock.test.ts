import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { isPrismaDeadlockError } from './prismaDeadlock';

assert.equal(
  isPrismaDeadlockError(
    new Prisma.PrismaClientKnownRequestError('serialization', {
      code: 'P2034',
      clientVersion: 'test',
    })
  ),
  true
);

assert.equal(
  isPrismaDeadlockError(new Error('deadlock detected while locking tuple')),
  true
);

assert.equal(isPrismaDeadlockError(new Error('40P01')), true);
assert.equal(isPrismaDeadlockError(new Error('connection refused')), false);

console.log('prismaDeadlock.test.ts: ok');
