/**
 * PRD 361 — "Played with" in the invite picker, proven against a real database.
 *
 * `coPlay.rank.test.ts` covers the pure ordering. What only Postgres can
 * answer is here, through the real `GET /users/invitable-players` handler:
 *   · a co-player via a FINAL game ranks above a heavily tapped non-co-player;
 *   · queued-only and invited-only pairs are not co-players;
 *   · a shared game older than the 12-month window does not count;
 *   · a blocked pair is absent in both directions;
 *   · EVENT (and an unfinished game) never count;
 *   · the empty query carries `lastPlayedTogetherAt` and lists co-players first;
 *   · a top-ten co-player outside the Browse city is still returned, and the
 *     eleventh is not (the "at least the top ten before city fill" rule);
 *   · a co-player already seated in the target game is excluded.
 *
 * Safe to run against `padelpulse_dev`: every row is namespaced with a run
 * suffix and removed in `finally`.
 */
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import {
  EntityType,
  GameType,
  ParticipantRole,
  ParticipantStatus,
  ResultsStatus,
  Sport,
} from '@prisma/client';
import prisma from '../../config/database';
import { getInvitablePlayers } from './social.controller';

process.env.E2E_TEST = '1';

const DAYS = 24 * 60 * 60 * 1000;

type Row = {
  id: string;
  firstName?: string | null;
  interactionCount: number;
  gamesTogetherCount: number;
  lastPlayedTogetherAt: string | null;
};
type Payload = { success: boolean; data: { players: Row[]; cityId?: string } };

void (async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const createdUserIds: string[] = [];
  const createdGameIds: string[] = [];
  const createdCityIds: string[] = [];

  const makeCity = async (name: string) => {
    const city = await prisma.city.create({
      data: { name: `${name} ${suffix}`, country: 'Test', timezone: 'UTC' },
    });
    createdCityIds.push(city.id);
    return city;
  };

  const homeCity = await makeCity('CoPlay home');
  const awayCity = await makeCity('CoPlay away');

  const makeUser = async (name: string, cityId: string = homeCity.id) => {
    const user = await prisma.user.create({
      data: {
        phone: `qa-coplay-${name}-${suffix}`,
        firstName: name,
        lastName: 'CoPlay',
        currentCityId: cityId,
        primarySport: Sport.PADEL,
        sportsEnabled: [Sport.PADEL],
      },
    });
    createdUserIds.push(user.id);
    return user;
  };

  const makeGame = async (input: {
    daysAgo: number;
    resultsStatus?: ResultsStatus;
    entityType?: EntityType;
    participants: Array<{ userId: string; status: ParticipantStatus }>;
  }) => {
    const startTime = new Date(Date.now() - input.daysAgo * DAYS);
    const game = await prisma.game.create({
      data: {
        entityType: input.entityType ?? EntityType.GAME,
        sport: Sport.PADEL,
        gameType: GameType.CLASSIC,
        cityId: homeCity.id,
        startTime,
        endTime: new Date(startTime.getTime() + 90 * 60 * 1000),
        timeIsSet: true,
        isPublic: true,
        maxParticipants: 4,
        resultsStatus: input.resultsStatus ?? ResultsStatus.FINAL,
      },
    });
    createdGameIds.push(game.id);
    await prisma.gameParticipant.createMany({
      data: input.participants.map((p, index) => ({
        gameId: game.id,
        userId: p.userId,
        role: index === 0 ? ParticipantRole.OWNER : ParticipantRole.PARTICIPANT,
        status: p.status,
      })),
    });
    return game;
  };

  const playing = (userId: string) => ({ userId, status: ParticipantStatus.PLAYING });

  const call = (query: Record<string, string>, userId: string) =>
    new Promise<Payload>((resolve, reject) => {
      getInvitablePlayers(
        { userId, query } as unknown as Request,
        { json: resolve } as unknown as Response,
        reject,
      );
    });

  try {
    const viewer = await makeUser('viewer');
    const recent = await makeUser('recent');
    const older = await makeUser('older');
    const queued = await makeUser('queued');
    const invited = await makeUser('invited');
    const blocked = await makeUser('blocked');
    const blocker = await makeUser('blocker');
    const eventMate = await makeUser('eventmate');
    const unfinished = await makeUser('unfinished');
    const tapped = await makeUser('tapped');
    const awayMate = await makeUser('awaymate', awayCity.id);
    const awayEleventh = await makeUser('awayeleventh', awayCity.id);

    // Recent: two shared FINAL games, the latest 3 days ago.
    const recentGame = await makeGame({ daysAgo: 3, participants: [playing(viewer.id), playing(recent.id)] });
    await makeGame({ daysAgo: 40, participants: [playing(viewer.id), playing(recent.id)] });
    // Older: a shared FINAL game 13 months ago — outside the window.
    await makeGame({ daysAgo: 13 * 31, participants: [playing(viewer.id), playing(older.id)] });
    // Queued-only / invited-only in a FINAL game: not co-players.
    await makeGame({
      daysAgo: 5,
      participants: [
        playing(viewer.id),
        { userId: queued.id, status: ParticipantStatus.IN_QUEUE },
        { userId: invited.id, status: ParticipantStatus.INVITED },
      ],
    });
    // Blocked both directions, each with a genuine shared FINAL game.
    await makeGame({ daysAgo: 1, participants: [playing(viewer.id), playing(blocked.id)] });
    await makeGame({ daysAgo: 1, participants: [playing(viewer.id), playing(blocker.id)] });
    await prisma.blockedUser.createMany({
      data: [
        { userId: viewer.id, blockedUserId: blocked.id },
        { userId: blocker.id, blockedUserId: viewer.id },
      ],
    });
    // EVENT never counts, even when FINAL with both PLAYING.
    await makeGame({
      daysAgo: 2,
      entityType: EntityType.EVENT,
      participants: [playing(viewer.id), playing(eventMate.id)],
    });
    // Unfinished game (results NONE) never counts.
    await makeGame({
      daysAgo: 2,
      resultsStatus: ResultsStatus.NONE,
      participants: [playing(viewer.id), playing(unfinished.id)],
    });
    // Tapped a lot, never played.
    await prisma.userInteraction.create({
      data: { fromUserId: viewer.id, toUserId: tapped.id, count: 500 },
    });
    // Away co-player, second most recent — must be loaded from outside the city.
    await makeGame({ daysAgo: 4, participants: [playing(viewer.id), playing(awayMate.id)] });
    // Eight more home-city co-players (days 10..17) push the away eleventh past the top ten.
    const fillers: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      const filler = await makeUser(`filler${i}`);
      fillers.push(filler.id);
      await makeGame({ daysAgo: 10 + i, participants: [playing(viewer.id), playing(filler.id)] });
    }
    // Eleventh most recent co-player, outside the city: beyond the guaranteed ten.
    await makeGame({ daysAgo: 30, participants: [playing(viewer.id), playing(awayEleventh.id)] });

    const empty = await call({}, viewer.id);
    const players = empty.data.players;
    const ids = players.map((p) => p.id);
    const byId = new Map(players.map((p) => [p.id, p]));

    // Co-players first, most recent first, then the never-played city fill.
    assert.equal(ids[0], recent.id, 'most recent co-player leads the empty-query list');
    assert.equal(ids[1], awayMate.id, 'away co-player (4 days ago) ranks second despite living elsewhere');
    assert.deepEqual(ids.slice(2, 10), fillers, 'fillers follow in recency order');
    assert.equal(byId.get(recent.id)?.gamesTogetherCount, 2);
    assert.equal(byId.get(recent.id)?.lastPlayedTogetherAt, recentGame.startTime.toISOString());
    assert.ok(ids.includes(tapped.id), 'tapped non-co-player is still listed');
    assert.ok(
      ids.indexOf(tapped.id) > ids.indexOf(fillers[fillers.length - 1]),
      'a 500-tap non-co-player never outranks a co-player',
    );
    assert.equal(byId.get(tapped.id)?.lastPlayedTogetherAt, null);

    // Exclusions from co-play (still invitable, but not "played with").
    for (const [label, user] of [
      ['older than 12 months', older],
      ['queued-only', queued],
      ['invited-only', invited],
      ['EVENT', eventMate],
      ['unfinished', unfinished],
    ] as const) {
      const row = byId.get(user.id);
      assert.ok(row, `${label} user is still an invitable city user`);
      assert.equal(row.gamesTogetherCount, 0, `${label} pair is not a co-play`);
      assert.equal(row.lastPlayedTogetherAt, null, `${label} pair has no recency`);
    }

    // Blocked pairs are absent entirely, both directions.
    assert.ok(!ids.includes(blocked.id), 'user the viewer blocked is absent');
    assert.ok(!ids.includes(blocker.id), 'user who blocked the viewer is absent');

    // Only the top ten co-players are pulled in from outside the city.
    assert.ok(!ids.includes(awayEleventh.id), 'eleventh co-player outside the city is not loaded');

    // The blocked user must not appear in the other direction either.
    const fromBlocker = await call({}, blocker.id);
    assert.ok(!fromBlocker.data.players.some((p) => p.id === viewer.id), 'viewer is absent from the blocker list');

    // Typing still searches everyone, and an away co-player is reachable by name.
    const searched = await call({ search: 'awaymate' }, viewer.id);
    assert.deepEqual(
      searched.data.players.map((p) => p.id),
      [awayMate.id],
      'name search finds the away co-player',
    );

    // A co-player already seated in the target game is excluded from its picker.
    const upcoming = await makeGame({
      daysAgo: -2,
      resultsStatus: ResultsStatus.NONE,
      participants: [playing(viewer.id), playing(recent.id)],
    });
    const forGame = await call({ gameId: upcoming.id }, viewer.id);
    const forGameIds = forGame.data.players.map((p) => p.id);
    assert.ok(!forGameIds.includes(recent.id), 'seated co-player is not offered again');
    assert.equal(forGameIds[0], awayMate.id, 'next most recent co-player leads the game picker');

    console.log('invitable-players co-play: ranking, window, exclusions, blocks, top-ten load, search passed');
  } finally {
    if (createdGameIds.length) await prisma.game.deleteMany({ where: { id: { in: createdGameIds } } });
    if (createdUserIds.length) await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    if (createdCityIds.length) await prisma.city.deleteMany({ where: { id: { in: createdCityIds } } });
    await prisma.$disconnect();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
