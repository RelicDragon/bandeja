/**
 * PRD 356 — `/live` output format.
 *
 * Pure: the spectator-token signer is injected, so no JWT secret and no DB.
 *
 * Run: `ts-node --transpile-only src/services/telegram/commands/live.command.test.ts`
 */
import assert from 'node:assert/strict';
import type { LiveRailGame } from '../../game/liveGames.service';
import {
  buildLiveMessage,
  escapeLiveMarkdown,
  LIVE_COMMAND_MAX_GAMES,
  LIVE_NAME_MAX_CHARS,
  startedLabel,
  truncateName,
} from './live.command';

const NOW = new Date('2026-09-20T12:00:00.000Z');

function fakePlayer(firstName: string) {
  return {
    id: `u-${firstName}`,
    firstName,
    lastName: null,
    avatar: null,
    level: 3,
    socialLevel: 0,
    gender: 'MALE',
    approvedLevel: false,
    isTrainer: false,
  };
}

function fakeGame(overrides: Partial<LiveRailGame> = {}): LiveRailGame {
  return {
    id: 'game-1',
    name: 'Evening padel',
    sport: 'PADEL' as LiveRailGame['sport'],
    entityType: 'GAME' as LiveRailGame['entityType'],
    affectsRating: true,
    startTime: '2026-09-20T11:37:00.000Z',
    cityId: 'city-1',
    cityName: 'Belgrade',
    clubId: 'club-1',
    clubName: 'Padel Centar',
    clubAvatar: null,
    courtName: 'court 3',
    viewerIsPlaying: false,
    followedSeason: false,
    followingPlaying: false,
    phase: 'live',
    finishedAt: null,
    matchPosition: null,
    isPublic: true,
    league: null,
    liveSummary: {
      matchId: 'match-1',
      courtName: 'court 3',
      currentSet: 2,
      sides: [
        {
          teamNumber: 1,
          players: [fakePlayer('Marko'), fakePlayer('Ana')],
          setScores: [6, 3],
          currentGameScore: '40',
          leading: true,
        },
        {
          teamNumber: 2,
          players: [fakePlayer('Luka'), fakePlayer('Ivan')],
          setScores: [4, 2],
          currentGameScore: '15',
          leading: false,
        },
      ],
      startedAt: '2026-09-20T11:37:00.000Z',
      revision: 11,
    },
    ...overrides,
  };
}

const signToken = (gameId: string, matchId: string) => `tok-${gameId}-${matchId}`;

/* ---------------- name truncation ---------------- */
{
  assert.equal(truncateName('Marko'), 'Marko');
  assert.equal(truncateName('Aleksandar Nikolic'), 'Aleksandar…');
  assert.ok(truncateName('Aleksandar Nikolic').length <= LIVE_NAME_MAX_CHARS);
  assert.ok(truncateName('Konstantinopolis').length <= LIVE_NAME_MAX_CHARS);
  assert.equal(truncateName(null), '?');
  assert.equal(truncateName('   '), '?');
}

/* ---------------- markdown safety ---------------- */
{
  // A backtick in a name would close the monospace score span and corrupt the
  // rest of the message; `*`/`_`/`[` are backslash-escaped as everywhere else.
  assert.equal(escapeLiveMarkdown('a`b'), 'aˋb');
  assert.equal(escapeLiveMarkdown('a*b_c[d'), 'a\\*b\\_c\\[d');
}

/* ---------------- started label ---------------- */
{
  assert.equal(startedLabel('2026-09-20T11:37:00.000Z', 'en', NOW), 'Started 23 min ago');
  assert.equal(startedLabel('2026-09-20T11:59:40.000Z', 'en', NOW), 'Just started');
  assert.equal(startedLabel(null, 'en', NOW), 'Just started');
  assert.equal(startedLabel('not-a-date', 'en', NOW), 'Just started');
}

/* ---------------- the reply, snapshotted ---------------- */
{
  const message = buildLiveMessage([fakeGame()], 'Belgrade', 'en', { now: NOW, signToken });

  assert.equal(
    message.text,
    [
      '*🔴 Live now in Belgrade*',
      '',
      'Padel Centar · court 3',
      'Marko / Ana  `6-4 3-2`  Luka / Ivan',
      '_Started 23 min ago_',
      '',
      '_Updated just now · /live to refresh_',
    ].join('\n'),
  );

  assert.equal(message.links.length, 1);
  assert.equal(message.links[0].label, '1. Watch');
  assert.equal(
    message.links[0].url.includes('/games/game-1/watch?matchId=match-1&spectatorToken=tok-game-1-match-1'),
    true,
    'the Watch button carries a freshly minted spectator token',
  );
}

/* ---------------- empty state ---------------- */
{
  const message = buildLiveMessage([], 'Belgrade', 'en', { now: NOW, signToken });
  assert.equal(
    message.text,
    '*🔴 Live now in Belgrade*\n\nNothing live right now. /games shows what’s coming up.',
  );
  assert.deepEqual(message.links, []);
}

/* ---------------- cap ---------------- */
{
  const many = Array.from({ length: 9 }, (_, i) =>
    fakeGame({ id: `game-${i}`, liveSummary: { ...fakeGame().liveSummary, matchId: `m-${i}` } }),
  );
  const message = buildLiveMessage(many, 'Belgrade', 'en', { now: NOW, signToken });
  assert.equal(message.links.length, LIVE_COMMAND_MAX_GAMES);
  assert.equal(message.text.split('Padel Centar').length - 1, LIVE_COMMAND_MAX_GAMES);
}

/* ---------------- localized ---------------- */
{
  const message = buildLiveMessage([fakeGame()], 'Beograd', 'sr', { now: NOW, signToken });
  assert.match(message.text, /Uživo u gradu Beograd/);
  assert.match(message.text, /Počelo pre 23 min/);
  assert.equal(message.links[0].label, '1. Gledaj');
}

/* ---------------- no club / no court ---------------- */
{
  const message = buildLiveMessage(
    [fakeGame({ clubName: null, courtName: null, liveSummary: { ...fakeGame().liveSummary, courtName: null } })],
    'Belgrade',
    'en',
    { now: NOW, signToken },
  );
  assert.match(message.text, /Evening padel/, 'falls back to the game name');
}

console.log('live.command.test.ts: ok');
