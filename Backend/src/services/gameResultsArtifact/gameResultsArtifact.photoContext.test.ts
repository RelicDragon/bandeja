import assert from 'node:assert/strict';
import { Sport } from '@prisma/client';
import {
  buildResultsPhotoPrompt,
  collectParticipantAvatarSources,
} from './gameResultsArtifact.photoContext';

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
      user: { id: 'u1', firstName: 'Alex', lastName: 'K', avatar: null },
    },
    {
      userId: 'u2',
      user: { id: 'u2', firstName: 'Sam', lastName: 'R', avatar: null },
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

const standardAvatar =
  'https://cdn.example.com/uploads/avatars/circular/abc_avatar.jpg';
const withAvatars = {
  ...game,
  participants: [
    {
      userId: 'u1',
      user: {
        id: 'u1',
        firstName: 'Alex',
        lastName: 'K',
        avatar: standardAvatar,
      },
    },
    {
      userId: 'u2',
      user: { id: 'u2', firstName: 'Sam', lastName: 'R', avatar: null },
    },
  ],
};
assert.deepEqual(
  collectParticipantAvatarSources(
    withAvatars as Parameters<typeof collectParticipantAvatarSources>[0]
  ),
  [
    {
      primary: 'https://cdn.example.com/uploads/avatars/circular/abc_avatar.tiny.jpg',
      fallback: standardAvatar,
    },
  ]
);

console.log('gameResultsArtifact.photoContext.test.ts: ok');
