import assert from 'node:assert/strict';
import { Gender, Sport } from '@prisma/client';
import {
  buildParticipantReferenceOrderBlock,
  buildResultsPhotoPrompt,
  buildResultsPhotoScene,
  collectParticipantAvatarSources,
  getRankedPhotoParticipants,
  getUserInitials,
} from './gameResultsArtifact.photoContext';
import {
  pickResultsPhotoStyle,
  RESULTS_PHOTO_STYLES,
} from './gameResultsArtifact.photoStyles';

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
      user: {
        id: 'u1',
        firstName: 'Alex',
        lastName: 'K',
        avatar: null,
        gender: Gender.MALE,
      },
    },
    {
      userId: 'u2',
      user: {
        id: 'u2',
        firstName: 'Sam',
        lastName: 'R',
        avatar: null,
        gender: Gender.FEMALE,
      },
    },
  ],
};

const typedGame = game as Parameters<typeof buildResultsPhotoPrompt>[0];
const slots = getRankedPhotoParticipants(typedGame);
const loadedBySlot = [false, false];
const goldenAge = RESULTS_PHOTO_STYLES.find((s) => s.id === 'golden_age_cel')!;
const lunar = RESULTS_PHOTO_STYLES.find((s) => s.id === 'lunar_apollo_victory')!;

assert.equal(getUserInitials('Alex', 'K'), 'AK');
assert.equal(slots.length, 2);
assert.equal(slots[0]?.position, 1);
assert.equal(slots[1]?.position, 2);

const illustrationPrompt = buildResultsPhotoPrompt(
  typedGame,
  goldenAge,
  slots,
  loadedBySlot
);
assert.match(illustrationPrompt, /Padel Club/);
assert.match(illustrationPrompt, /Alex K/);
assert.match(illustrationPrompt, /finishing-order/i);
assert.match(illustrationPrompt, /Exactly 2 distinct people/i);
assert.match(illustrationPrompt, /through 2nd/i);
assert.doesNotMatch(illustrationPrompt, /through 8th/i);
assert.match(illustrationPrompt, /balloon displaying the initials "AK"/i);
assert.match(illustrationPrompt, /stylized female character.*"SR"/i);
assert.doesNotMatch(illustrationPrompt, /photorealistic/i);
assert.match(illustrationPrompt, /casual sportswear appropriate for Padel/i);

const lunarScene = buildResultsPhotoScene(typedGame, lunar);
assert.doesNotMatch(lunarScene, /game at .+Padel Club/i);
assert.match(lunarScene, /Celebrating a win they earned at Padel Club/);

const lunarPrompt = buildResultsPhotoPrompt(typedGame, lunar, slots, loadedBySlot);
assert.doesNotMatch(lunarPrompt, /photorealistic/i);
assert.match(lunarPrompt, /open visors/i);

const picked = pickResultsPhotoStyle('g1:1');
const pickedPrompt = buildResultsPhotoPrompt(typedGame, picked, slots, loadedBySlot);
assert.doesNotMatch(pickedPrompt, /photorealistic/i);

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
        gender: Gender.MALE,
      },
    },
    {
      userId: 'u2',
      user: {
        id: 'u2',
        firstName: 'Sam',
        lastName: 'R',
        avatar: null,
        gender: Gender.FEMALE,
      },
    },
  ],
};
const avatarTyped = withAvatars as Parameters<typeof collectParticipantAvatarSources>[0];
assert.deepEqual(collectParticipantAvatarSources(avatarTyped), [
  { primary: standardAvatar, fallback: null },
]);

const orderBlock = buildParticipantReferenceOrderBlock(
  getRankedPhotoParticipants(avatarTyped),
  [true, false]
);
assert.match(orderBlock, /reference image 1/);
assert.match(orderBlock, /Position 2.*balloon.*"SR"/i);

const manyOutcomes = {
  ...game,
  outcomes: Array.from({ length: 10 }, (_, i) => ({
    userId: `u${i + 1}`,
    isWinner: i === 0,
    position: i + 1,
  })),
  participants: Array.from({ length: 10 }, (_, i) => ({
    userId: `u${i + 1}`,
    user: {
      id: `u${i + 1}`,
      firstName: `P${i + 1}`,
      lastName: 'X',
      avatar: null,
      gender: Gender.MALE,
    },
  })),
};
const topEight = getRankedPhotoParticipants(
  manyOutcomes as Parameters<typeof getRankedPhotoParticipants>[0]
);
assert.equal(topEight.length, 8);
assert.equal(topEight[0]?.position, 1);
assert.equal(topEight[7]?.position, 8);
assert.equal(topEight.some((s) => s.position === 9), false);

const sevenOutcomesFourPlaying = {
  ...game,
  outcomes: Array.from({ length: 7 }, (_, i) => ({
    userId: `u${i + 1}`,
    isWinner: i === 0,
    position: i + 1,
  })),
  participants: Array.from({ length: 4 }, (_, i) => ({
    userId: `u${i + 1}`,
    user: {
      id: `u${i + 1}`,
      firstName: `P${i + 1}`,
      lastName: 'X',
      avatar: null,
      gender: Gender.MALE,
    },
  })),
};
const fourSlots = getRankedPhotoParticipants(
  sevenOutcomesFourPlaying as Parameters<typeof getRankedPhotoParticipants>[0]
);
assert.equal(fourSlots.length, 4);
assert.deepEqual(
  fourSlots.map((s) => s.userId),
  ['u1', 'u2', 'u3', 'u4']
);
assert.deepEqual(
  fourSlots.map((s) => s.position),
  [1, 2, 3, 4]
);
const fourPlayingPrompt = buildResultsPhotoPrompt(
  sevenOutcomesFourPlaying as Parameters<typeof buildResultsPhotoPrompt>[0],
  goldenAge,
  fourSlots,
  [false, false, false, false]
);
assert.match(fourPlayingPrompt, /Exactly 4 distinct people/i);
assert.match(fourPlayingPrompt, /through 4th/i);
assert.doesNotMatch(fourPlayingPrompt, /through 8th/i);

console.log('gameResultsArtifact.photoContext.test.ts: ok');
