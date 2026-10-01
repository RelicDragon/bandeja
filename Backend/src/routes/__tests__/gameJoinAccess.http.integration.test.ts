/**
 * Who may join a game, and who may answer its join queue — over real HTTP through the
 * full `app` (real dev DB).
 *
 * 1. Private games follow the **direct-link model** (`docs/product/constraints.md`):
 *    `isPublic = false` keeps a game out of Find / search / the Live rail, but a
 *    signed-in user holding its link can open it (`GET /games/:id`) and use
 *    `POST /games/:id/join` like on a public game. The organizer's lever is
 *    `allowDirectJoin`: off → the link holder lands in the join queue. Shared links
 *    ("Share game", PRD 351 "Invite a friend") rely on this, including in shipped
 *    store builds, so this suite pins it.
 * 2. `accept-join-queue` / `decline-join-queue` are owner/admin only
 *    (`canManageGameRoster`), even with `anyoneCanInvite` on. A plain PLAYING
 *    participant gets 403 and the queue row is untouched; the client hides the
 *    accept/decline icons from them (`GameDetailsShell` `canManageJoinQueue`).
 * 3. A parent league-season owner answers a fixture's queue both ways (the client shows
 *    them both icons); league fixtures are `allowDirectJoin = false`, so queues are common.
 *
 * Every row carries a unique suffix and is removed in `finally`. Notifications suppressed.
 */
import './agentRoutesTestEnv';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { EntityType, GameType, ParticipantRole, ParticipantStatus, Sport } from '@prisma/client';
import app from '../../app';
import prisma from '../../config/database';
import { generateShortAccessToken } from '../../utils/jwt';

process.env.E2E_TEST = '1';

type Json = Record<string, unknown>;
type Actor = 'owner' | 'admin' | 'player' | 'stranger' | 'queued' | 'queued2' | 'seasonOwner';
const ACTORS: Actor[] = ['owner', 'admin', 'player', 'stranger', 'queued', 'queued2', 'seasonOwner'];
const HOURS = 60 * 60 * 1000;

void (async () => {
  let exitCode = 0;
  let checks = 0;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const city = await prisma.city.create({
    data: { name: `Game join access ${suffix}`, country: 'Test', timezone: 'UTC' },
  });
  const userIds = {} as Record<Actor, string>;
  const createdGameIds: string[] = [];
  let slot = 0;
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}/api/games`;

  const call = async (actor: Actor, method: string, path: string, body?: Json) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${generateShortAccessToken({ userId: userIds[actor] })}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: (text ? JSON.parse(text) : {}) as Json };
  };

  /** Each game gets its own day so no join trips the slot-overlap confirm. */
  const makeGame = async (
    flags: { isPublic: boolean; allowDirectJoin: boolean; anyoneCanInvite?: boolean; entityType?: EntityType; parentId?: string },
    roster: { userId: string; role: ParticipantRole; status: ParticipantStatus }[],
  ) => {
    slot += 1;
    const startTime = new Date(Date.now() + slot * 24 * HOURS);
    const game = await prisma.game.create({
      data: {
        entityType: flags.entityType ?? EntityType.GAME,
        parentId: flags.parentId,
        sport: Sport.PADEL,
        gameType: GameType.CLASSIC,
        cityId: city.id,
        startTime,
        endTime: new Date(startTime.getTime() + 90 * 60 * 1000),
        timeIsSet: true,
        maxParticipants: 4,
        isPublic: flags.isPublic,
        allowDirectJoin: flags.allowDirectJoin,
        anyoneCanInvite: flags.anyoneCanInvite ?? false,
        participants: { create: roster },
      },
      select: { id: true },
    });
    createdGameIds.push(game.id);
    return game.id;
  };

  const statusOf = async (gameId: string, actor: Actor) =>
    (
      await prisma.gameParticipant.findFirst({
        where: { gameId, userId: userIds[actor] },
        select: { status: true },
      })
    )?.status ?? null;

  try {
    for (const actor of ACTORS) {
      const user = await prisma.user.create({
        data: {
          phone: `qa-game-join-access-${actor}-${suffix}`,
          firstName: actor,
          currentCityId: city.id,
          primarySport: Sport.PADEL,
          // authenticate() geolocates new client IPs; pre-set loopback so the test stays offline.
          lastUserIP: '::ffff:127.0.0.1',
        },
      });
      userIds[actor] = user.id;
    }
    const ownerRow = { userId: userIds.owner, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING };

    // --- 1. Direct-link join on a private game ------------------------------------------------
    const privateOpen = await makeGame({ isPublic: false, allowDirectJoin: true }, [ownerRow]);
    const read = await call('stranger', 'GET', `/${privateOpen}`);
    assert.equal(read.status, 200, `link holder reads a private game (got ${read.status})`);
    checks++;
    const join = await call('stranger', 'POST', `/${privateOpen}/join`);
    assert.equal(join.status, 200, `link holder joins a private game (got ${join.status} ${JSON.stringify(join.body)})`);
    assert.equal(join.body.message, 'games.joinedSuccessfully');
    assert.equal(await statusOf(privateOpen, 'stranger'), ParticipantStatus.PLAYING);
    checks++;

    const privateQueued = await makeGame({ isPublic: false, allowDirectJoin: false }, [ownerRow]);
    const queueJoin = await call('stranger', 'POST', `/${privateQueued}/join`);
    assert.equal(queueJoin.status, 200, `link holder requests a private game (got ${queueJoin.status})`);
    assert.equal(
      await statusOf(privateQueued, 'stranger'),
      ParticipantStatus.IN_QUEUE,
      'allowDirectJoin = false puts the link holder in the queue, never on the roster',
    );
    checks++;

    // --- 2. Queue answers are owner/admin only, even with anyoneCanInvite ---------------------
    const queueGame = await makeGame({ isPublic: true, allowDirectJoin: false, anyoneCanInvite: true }, [
      ownerRow,
      { userId: userIds.admin, role: ParticipantRole.ADMIN, status: ParticipantStatus.PLAYING },
      { userId: userIds.player, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.PLAYING },
      { userId: userIds.queued, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.IN_QUEUE },
      { userId: userIds.queued2, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.IN_QUEUE },
    ]);
    for (const path of ['accept-join-queue', 'decline-join-queue']) {
      for (const actor of ['player', 'stranger', 'queued2'] as Actor[]) {
        const res = await call(actor, 'POST', `/${queueGame}/${path}`, { userId: userIds.queued });
        assert.equal(res.status, 403, `${path} by ${actor} = 403 (got ${res.status})`);
        assert.equal(await statusOf(queueGame, 'queued'), ParticipantStatus.IN_QUEUE, `${path} by ${actor} changed nothing`);
        checks++;
      }
    }
    const accepted = await call('owner', 'POST', `/${queueGame}/accept-join-queue`, { userId: userIds.queued });
    assert.equal(accepted.status, 200, `owner accepts (got ${accepted.status} ${JSON.stringify(accepted.body)})`);
    assert.equal(await statusOf(queueGame, 'queued'), ParticipantStatus.PLAYING);
    checks++;
    const declined = await call('admin', 'POST', `/${queueGame}/decline-join-queue`, { userId: userIds.queued2 });
    assert.equal(declined.status, 200, `game admin declines (got ${declined.status} ${JSON.stringify(declined.body)})`);
    assert.equal(await statusOf(queueGame, 'queued2'), null, 'declined queue row removed');
    checks++;

    // --- 3. Parent-season owner answers a league fixture's queue ------------------------------
    const season = await makeGame({ isPublic: false, allowDirectJoin: false, entityType: EntityType.LEAGUE_SEASON }, [
      { userId: userIds.seasonOwner, role: ParticipantRole.OWNER, status: ParticipantStatus.NON_PLAYING },
    ]);
    const fixture = await makeGame({ isPublic: false, allowDirectJoin: false, entityType: EntityType.LEAGUE, parentId: season }, [
      { userId: userIds.player, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.PLAYING },
      { userId: userIds.queued, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.IN_QUEUE },
      { userId: userIds.queued2, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.IN_QUEUE },
    ]);
    const fixtureDecline = await call('player', 'POST', `/${fixture}/decline-join-queue`, { userId: userIds.queued2 });
    assert.equal(fixtureDecline.status, 403, `fixture player declines = 403 (got ${fixtureDecline.status})`);
    checks++;
    const seasonDeclined = await call('seasonOwner', 'POST', `/${fixture}/decline-join-queue`, { userId: userIds.queued2 });
    assert.equal(seasonDeclined.status, 200, `season owner declines on a fixture (got ${seasonDeclined.status} ${JSON.stringify(seasonDeclined.body)})`);
    assert.equal(await statusOf(fixture, 'queued2'), null, 'season-owner decline removes the queue row');
    checks++;
    const seasonAccepted = await call('seasonOwner', 'POST', `/${fixture}/accept-join-queue`, { userId: userIds.queued });
    assert.equal(seasonAccepted.status, 200, `season owner accepts on a fixture (got ${seasonAccepted.status} ${JSON.stringify(seasonAccepted.body)})`);
    assert.equal(await statusOf(fixture, 'queued'), ParticipantStatus.PLAYING);
    checks++;

    console.log(`gameJoinAccess.http.integration.test.ts: ok (${checks} checks)`);
  } catch (error) {
    exitCode = 1;
    console.error(error);
  } finally {
    server.close();
    // `ChatMessage` and `ChatSyncEvent` hold the game id as a plain column, not an FK.
    await prisma.chatMessage.deleteMany({ where: { gameId: { in: createdGameIds } } }).catch((e) => console.error(e));
    await prisma.chatSyncEvent.deleteMany({ where: { contextId: { in: createdGameIds } } }).catch((e) => console.error(e));
    await prisma.game.deleteMany({ where: { id: { in: createdGameIds } } }).catch((e) => console.error(e));
    await prisma.user.deleteMany({ where: { id: { in: Object.values(userIds) } } }).catch((e) => console.error(e));
    await prisma.city.deleteMany({ where: { id: city.id } }).catch((e) => console.error(e));
    await prisma.$disconnect();
    process.exit(exitCode);
  }
})();
