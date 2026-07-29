import assert from 'node:assert/strict';
import {
  GameInviteOutcomeType,
  ParticipantStatus,
} from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { PlayIntentGameLifecycleService } from './playIntentGameLifecycle.service';
import { PlayIntentGameCreationService } from './playIntentGameCreation.service';

function transactionClient(
  updateCounts: number[],
  intent = {
    status: 'MATCHED',
    expiresAt: new Date('2099-01-01T00:00:00Z'),
    dateKeys: ['2098-12-31'],
    timeOfDay: 'ANYTIME',
    startTime: null,
    endTime: null,
    city: { timezone: 'UTC' },
  },
) {
  const calls: string[] = [];
  return {
    calls,
    client: {
      playIntent: {
        findUnique: async () => {
          calls.push('findIntent');
          return intent;
        },
        updateMany: async () => {
          calls.push('intent');
          return { count: updateCounts.shift() ?? 0 };
        },
      },
      gameInviteOutcome: {
        upsert: async () => {
          calls.push('outcome');
          return {
            id: 'outcome',
            gameId: 'game',
            userId: 'user',
            outcome: GameInviteOutcomeType.DECLINED,
            invitedByUserId: 'host',
            playIntentId: 'intent',
            closedAt: new Date(0),
          };
        },
      },
      gameParticipant: {
        deleteMany: async () => {
          calls.push('participant');
          return { count: 1 };
        },
      },
    },
  };
}

void (async () => {
  {
    const participants = PlayIntentGameCreationService.participantCreates({
      source: {
        type: 'DIRECT',
        hostIntentId: 'host-intent',
        invitees: [],
      },
      host: { id: 'host-intent', userId: 'host' },
      invitees: [],
      proposalId: null,
    } as never);
    assert.equal(participants?.[0]?.status, ParticipantStatus.PLAYING);
  }

  {
    const tx = transactionClient([1]);
    await PlayIntentGameLifecycleService.consume(
      tx.client as never,
      'intent',
      'user',
      new Date(),
    );
    assert.deepEqual(tx.calls, ['intent']);
  }

  {
    const tx = transactionClient([0]);
    await assert.rejects(
      PlayIntentGameLifecycleService.consume(
        tx.client as never,
        'intent',
        'user',
        new Date(),
      ),
      (error) =>
        error instanceof ApiError &&
        error.statusCode === 409 &&
        error.data?.code === 'playIntent.unavailable',
    );
  }

  {
    const tx = transactionClient(
      [1],
      {
        status: 'MATCHED',
        expiresAt: new Date(0),
        dateKeys: ['1970-01-01'],
        timeOfDay: 'ANYTIME',
        startTime: null,
        endTime: null,
        city: { timezone: 'UTC' },
      },
    );
    const status = await PlayIntentGameLifecycleService.release(
      tx.client as never,
      'intent',
      new Date(),
    );
    assert.equal(status, 'EXPIRED');
    assert.deepEqual(tx.calls, ['findIntent', 'intent']);
  }

  {
    const tx = transactionClient([1]);
    await PlayIntentGameLifecycleService.closeLinkedInvite(
      tx.client as never,
      {
        id: 'participant',
        gameId: 'game',
        userId: 'user',
        invitedByUserId: 'host',
        playIntentId: 'intent',
      },
      GameInviteOutcomeType.DECLINED,
      new Date(),
    );
    assert.deepEqual(tx.calls, ['findIntent', 'intent', 'outcome', 'participant']);
  }
})();
