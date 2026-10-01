/**
 * League write permissions over real HTTP through the full `app` (real dev DB):
 *   - `/leagues/groups/:groupId` writes (rename, delete, add / remove participant): a stranger
 *     and a plain season participant get 403 and nothing changes in the DB; the season owner,
 *     a season admin and a platform admin succeed. The service enforces the same rule
 *     (`LeagueGroupManagementService.ensureCanEditGroup`), so non-HTTP callers are covered too;
 *   - `POST /leagues`: 403 unless `User.canCreateLeague` or platform admin.
 * Every row carries a unique suffix and is removed in `finally` (season game cascades the
 * season, groups, group chats and league participants).
 */
import './agentRoutesTestEnv';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import {
  EntityType,
  GameType,
  LeagueParticipantType,
  ParticipantRole,
  ParticipantStatus,
  Sport,
} from '@prisma/client';
import app from '../../app';
import prisma from '../../config/database';
import { generateShortAccessToken } from '../../utils/jwt';
import { LeagueGroupManagementService } from '../../services/league/groups.service';
import { ApiError } from '../../utils/ApiError';

type Json = Record<string, unknown>;
type Actor = 'owner' | 'seasonAdmin' | 'player' | 'stranger' | 'platformAdmin' | 'leagueCreator';
const ACTORS: Actor[] = ['owner', 'seasonAdmin', 'player', 'stranger', 'platformAdmin', 'leagueCreator'];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

void (async () => {
  let exitCode = 0;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const city = await prisma.city.create({
    data: { name: `League permissions ${suffix}`, country: 'Test', timezone: 'UTC' },
  });
  const userIds = {} as Record<Actor, string>;
  let seasonId = '';
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}/api/leagues`;

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

  try {
    for (const actor of ACTORS) {
      const user = await prisma.user.create({
        data: {
          phone: `qa-league-perm-${actor}-${suffix}`,
          firstName: actor,
          currentCityId: city.id,
          isAdmin: actor === 'platformAdmin',
          canCreateLeague: actor === 'leagueCreator',
          // authenticate() geolocates new client IPs; pre-set loopback so the test stays offline.
          lastUserIP: '::ffff:127.0.0.1',
        },
      });
      userIds[actor] = user.id;
    }

    const startTime = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    const season = await prisma.game.create({
      data: {
        entityType: EntityType.LEAGUE_SEASON,
        sport: Sport.PADEL,
        gameType: GameType.CLASSIC,
        cityId: city.id,
        startTime,
        endTime: new Date(startTime.getTime() + 90 * 60 * 1000),
        isPublic: true,
        participants: {
          create: [
            { userId: userIds.owner, role: ParticipantRole.OWNER, status: ParticipantStatus.NON_PLAYING },
            { userId: userIds.seasonAdmin, role: ParticipantRole.ADMIN, status: ParticipantStatus.PLAYING },
            { userId: userIds.player, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.PLAYING },
          ],
        },
      },
      select: { id: true },
    });
    seasonId = season.id;
    const league = await prisma.league.create({ data: { name: `League perm ${suffix}`, cityId: city.id } });
    await prisma.leagueSeason.create({ data: { id: seasonId, leagueId: league.id, orderIndex: 0 } });

    const makeGroup = (name: string) =>
      prisma.leagueGroup.create({ data: { leagueSeasonId: seasonId, name: `${name} ${suffix}` } });
    const makeParticipant = (groupId: string | null) =>
      prisma.leagueParticipant.create({
        data: {
          leagueId: league.id,
          leagueSeasonId: seasonId,
          participantType: LeagueParticipantType.USER,
          userId: userIds.player,
          currentGroupId: groupId,
        },
      });

    // Fresh state per write: group A holds `assigned`, `unassigned` has no group.
    const setup = async () => {
      const group = await makeGroup('A');
      const assigned = await makeParticipant(group.id);
      const unassigned = await makeParticipant(null);
      return { group, assigned, unassigned };
    };

    type State = Awaited<ReturnType<typeof setup>>;
    const writes: {
      name: string;
      run: (actor: Actor, st: State) => ReturnType<typeof call>;
      /** DB fingerprint the write would change. */
      snapshot: (st: State) => Promise<unknown>;
      applied: (st: State) => Promise<boolean>;
    }[] = [
      {
        name: 'PATCH /groups/:groupId (rename)',
        run: (actor, st) => call(actor, 'PATCH', `/groups/${st.group.id}`, { name: `Renamed by ${actor}` }),
        snapshot: async (st) => (await prisma.leagueGroup.findUnique({ where: { id: st.group.id } }))?.name,
        applied: async (st) =>
          ((await prisma.leagueGroup.findUnique({ where: { id: st.group.id } }))?.name ?? '').startsWith('Renamed by'),
      },
      {
        name: 'DELETE /groups/:groupId',
        run: (actor, st) => call(actor, 'DELETE', `/groups/${st.group.id}`),
        snapshot: async (st) => [
          await prisma.leagueGroup.count({ where: { id: st.group.id } }),
          (await prisma.leagueParticipant.findUnique({ where: { id: st.assigned.id } }))?.currentGroupId,
        ],
        applied: async (st) => (await prisma.leagueGroup.count({ where: { id: st.group.id } })) === 0,
      },
      {
        name: 'POST /groups/:groupId/participants',
        run: (actor, st) => call(actor, 'POST', `/groups/${st.group.id}/participants`, { participantId: st.unassigned.id }),
        snapshot: async (st) => (await prisma.leagueParticipant.findUnique({ where: { id: st.unassigned.id } }))?.currentGroupId,
        applied: async (st) =>
          (await prisma.leagueParticipant.findUnique({ where: { id: st.unassigned.id } }))?.currentGroupId === st.group.id,
      },
      {
        name: 'DELETE /groups/:groupId/participants/:participantId',
        run: (actor, st) => call(actor, 'DELETE', `/groups/${st.group.id}/participants/${st.assigned.id}`),
        snapshot: async (st) => (await prisma.leagueParticipant.findUnique({ where: { id: st.assigned.id } }))?.currentGroupId,
        applied: async (st) =>
          (await prisma.leagueParticipant.findUnique({ where: { id: st.assigned.id } }))?.currentGroupId === null,
      },
    ];

    const resetSeason = async () => {
      await prisma.leagueParticipant.deleteMany({ where: { leagueSeasonId: seasonId } });
      await prisma.leagueGroup.deleteMany({ where: { leagueSeasonId: seasonId } });
    };

    let checks = 0;
    for (const write of writes) {
      for (const actor of ['stranger', 'player'] as Actor[]) {
        await resetSeason();
        const st = await setup();
        const before = await write.snapshot(st);
        const res = await write.run(actor, st);
        assert.equal(res.status, 403, `${write.name}: ${actor} = 403 (got ${res.status} ${JSON.stringify(res.body)})`);
        assert.equal(res.body.success, false, `${write.name}: ${actor} error shape`);
        assert.equal(typeof res.body.message, 'string', `${write.name}: ${actor} error message`);
        assert.deepEqual(await write.snapshot(st), before, `${write.name}: ${actor} changed nothing`);
        checks++;
      }
      for (const actor of ['owner', 'seasonAdmin', 'platformAdmin'] as Actor[]) {
        await resetSeason();
        const st = await setup();
        const res = await write.run(actor, st);
        assert.equal(res.status, 200, `${write.name}: ${actor} = 200 (got ${res.status} ${JSON.stringify(res.body)})`);
        assert.equal(res.body.success, true);
        assert.ok(await write.applied(st), `${write.name}: ${actor} write applied`);
        checks++;
      }
    }

    // Missing group stays 404 (existence first, like canEditGame on a missing game).
    assert.equal((await call('stranger', 'PATCH', `/groups/missing-${suffix}`, { name: 'x' })).status, 404);

    // Service layer enforces the same rule for non-HTTP callers.
    await resetSeason();
    const st = await setup();
    await assert.rejects(
      LeagueGroupManagementService.renameGroup(st.group.id, 'Sneaky', { userId: userIds.stranger, isAdmin: false }),
      (e: unknown) => e instanceof ApiError && e.statusCode === 403,
    );
    await assert.rejects(
      LeagueGroupManagementService.reorderGroups(seasonId, [st.group.id], { userId: userIds.player, isAdmin: false }),
      (e: unknown) => e instanceof ApiError && e.statusCode === 403,
    );
    assert.equal((await prisma.leagueGroup.findUnique({ where: { id: st.group.id } }))?.name, `A ${suffix}`);

    // --- POST /leagues: canCreateLeague -----------------------------------------------------------
    const leaguePayload = (actor: Actor) => ({
      name: `Created by ${actor} ${suffix}`,
      cityId: city.id,
      season: { name: 'S1', startDate: startTime.toISOString(), maxParticipants: 8 },
    });
    const leaguesInCity = () => prisma.league.count({ where: { cityId: city.id } });
    const leagueCountBefore = await leaguesInCity();
    for (const actor of ['stranger', 'owner', 'player'] as Actor[]) {
      const res = await call(actor, 'POST', '', leaguePayload(actor));
      assert.equal(res.status, 403, `POST /leagues without canCreateLeague: ${actor} = 403 (got ${res.status})`);
      assert.equal(res.body.success, false);
      checks++;
    }
    assert.equal(await leaguesInCity(), leagueCountBefore, 'no league created without the flag');
    for (const actor of ['leagueCreator', 'platformAdmin'] as Actor[]) {
      const res = await call(actor, 'POST', '', leaguePayload(actor));
      assert.equal(res.status, 201, `POST /leagues: ${actor} = 201 (got ${res.status} ${JSON.stringify(res.body)})`);
      checks++;
    }
    assert.equal(await leaguesInCity(), leagueCountBefore + 2);

    console.log(`league.routes.permissions.http.integration.test.ts: ok (${checks} checks)`);
  } catch (error) {
    exitCode = 1;
    console.error(error);
  } finally {
    server.close();
    // Let the debounced league-group-chat reconcile settle before deleting its season.
    await sleep(2000);
    await prisma.game
      .deleteMany({ where: { cityId: city.id, entityType: EntityType.LEAGUE_SEASON } })
      .catch((e) => console.error(e));
    await prisma.user.deleteMany({ where: { id: { in: Object.values(userIds) } } }).catch((e) => console.error(e));
    await prisma.city.deleteMany({ where: { id: city.id } }).catch((e) => console.error(e));
    await prisma.$disconnect();
    process.exit(exitCode);
  }
})();
