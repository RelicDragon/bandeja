import assert from 'node:assert/strict';
import { shouldRouteCustomBetToNeedsReview, shouldVoidBetDueToMissingTarget } from './betResolutionRouting';

function makeBet(overrides: Record<string, unknown> = {}) {
  return {
    type: 'SOCIAL',
    creatorId: 'creator',
    acceptedBy: null,
    condition: { type: 'CUSTOM', customText: 'Buy drinks', entityType: 'USER', entityId: 'u1' },
    participants: [],
    ...overrides,
  } as Parameters<typeof shouldRouteCustomBetToNeedsReview>[0];
}

async function run() {
  {
    assert.equal(
      shouldRouteCustomBetToNeedsReview(makeBet({ acceptedBy: 'acceptor' })),
      true,
      'accepted SOCIAL custom bet routes to NEEDS_REVIEW',
    );
  }

  {
    assert.equal(
      shouldRouteCustomBetToNeedsReview(makeBet({ acceptedBy: null })),
      false,
      'open SOCIAL custom bet does not route to NEEDS_REVIEW',
    );
  }

  {
    assert.equal(
      shouldRouteCustomBetToNeedsReview(makeBet({
        type: 'POOL',
        participants: [{ userId: 'creator' }],
      })),
      false,
      'creator-only POOL custom bet does not route to NEEDS_REVIEW',
    );
  }

  {
    assert.equal(
      shouldRouteCustomBetToNeedsReview(makeBet({
        type: 'POOL',
        participants: [
          { userId: 'creator' },
          { userId: 'joiner' },
        ],
      })),
      true,
      'POOL custom bet with joiners routes to NEEDS_REVIEW',
    );
  }

  {
    assert.equal(
      shouldRouteCustomBetToNeedsReview(makeBet({
        condition: { type: 'PREDEFINED', predefined: 'WIN_GAME', entityType: 'USER', entityId: 'u1' },
        acceptedBy: 'acceptor',
      })),
      false,
      'PREDEFINED bets never route via custom path',
    );
  }

  {
    assert.equal(
      shouldVoidBetDueToMissingTarget({ won: false, reason: 'User did not participate' }),
      true,
      'void when condition user absent from outcomes',
    );
    assert.equal(
      shouldVoidBetDueToMissingTarget({ won: false, reason: 'Fixed pair not in outcomes' }),
      true,
      'void when fixed pair absent from outcomes',
    );
    assert.equal(
      shouldVoidBetDueToMissingTarget({ won: false, reason: 'Entity not in outcomes' }),
      true,
      'void when entity absent from outcomes',
    );
    assert.equal(
      shouldVoidBetDueToMissingTarget({ won: false, reason: 'Fixed pair not found' }),
      true,
      'void when fixed pair id invalid',
    );
    assert.equal(
      shouldVoidBetDueToMissingTarget({ won: false, reason: 'Invalid condition' }),
      false,
      'do not void generic evaluation failures',
    );
    assert.equal(
      shouldVoidBetDueToMissingTarget({ won: true }),
      false,
      'do not void winning evaluations',
    );
  }

  console.log('ok: betResolution');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
