import assert from 'node:assert/strict';
import { Sport } from '@prisma/client';
import {
  buildResultsSummaryPrompt,
  resolveParticipantRatingContext,
} from './resultsSummaryPrompt.util';

const userWithProfile = {
  sportProfiles: [
    {
      sport: Sport.PADEL,
      level: 3.52,
      reliability: 45,
      gamesPlayed: 11,
      gamesWon: 6,
    },
  ],
};

const outcome = {
  userId: 'u1',
  levelBefore: 3.45,
  levelAfter: 3.52,
  reliabilityBefore: 42,
  isWinner: true,
  metadata: { ratingStatsApplied: true },
};

async function run(): Promise<void> {
  const withOutcome = resolveParticipantRatingContext(
    { userId: 'u1', user: userWithProfile },
    Sport.PADEL,
    new Map([['u1', outcome]]),
    true,
  );

  assert.equal(withOutcome.level, '3.45 -> 3.52');
  assert.equal(withOutcome.reliability, '42.00');
  assert.equal(withOutcome.sportRecord, '5-5 in 10 rated games');

  const withoutOutcome = resolveParticipantRatingContext(
    { userId: 'u2', user: userWithProfile },
    Sport.PADEL,
    new Map(),
    true,
  );

  assert.equal(withoutOutcome.level, '3.52');
  assert.equal(withoutOutcome.reliability, '45.00');
  assert.equal(withoutOutcome.sportRecord, '6-5 in 11 rated games');

  const prompt = await buildResultsSummaryPrompt(
    {
      sport: Sport.PADEL,
      affectsRating: true,
      city: { name: 'Test City' },
      participants: [
        {
          userId: 'u1',
          status: 'PLAYING',
          user: { firstName: 'Alex', lastName: 'Test', sportProfiles: userWithProfile.sportProfiles },
        },
      ],
      outcomes: [outcome],
      rounds: [],
    },
    'en-GB',
  );

  assert.match(prompt, /level: 3\.45 -> 3\.52/);
  assert.match(prompt, /reliability: 42\.00/);
  assert.match(prompt, /5-5 in 10 rated games/);

  console.log('resultsSummaryPrompt.util.test.ts: ok');
}

void run();
