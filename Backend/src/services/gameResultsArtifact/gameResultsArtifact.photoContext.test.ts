import assert from 'node:assert/strict';
import { Sport } from '@prisma/client';
import { buildResultsPhotoPrompt } from './gameResultsArtifact.photoContext';

const game = {
  id: 'g1',
  sport: Sport.PADEL,
  name: 'Friday ladder',
  clubId: null,
  cityId: 'c1',
  club: { name: 'Padel Club' },
  court: null,
  city: { name: 'Prague' },
  outcomes: [
    { userId: 'u1', isWinner: true, position: 1 },
    { userId: 'u2', isWinner: false, position: 2 },
  ],
  participants: [
    {
      userId: 'u1',
      user: { id: 'u1', firstName: 'Alex', lastName: 'K', avatar: null, originalAvatar: null },
    },
    {
      userId: 'u2',
      user: { id: 'u2', firstName: 'Sam', lastName: 'R', avatar: null, originalAvatar: null },
    },
  ],
};

const prompt = buildResultsPhotoPrompt(
  game as Parameters<typeof buildResultsPhotoPrompt>[0]
);

assert.match(prompt, /Padel Club/);
assert.match(prompt, /Alex K/);
assert.doesNotMatch(prompt, /Hello,/i);
assert.doesNotMatch(prompt, /summary/i);

console.log('gameResultsArtifact.photoContext.test.ts: ok');
