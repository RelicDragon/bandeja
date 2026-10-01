/**
 * Training permissions, proven over HTTP against a real database.
 *
 *   · POST /api/training/:id/finish — the game's trainer, owner/admin (incl. the
 *     parent game's), platform admin; ARCHIVED refused for everyone. The
 *     rating-activity stamp only when the actor may manage ratings.
 *   · POST /api/training/:id/participant/:userId/level and /undo — platform
 *     admin, or an `isTrainer` who is the game's trainer or owner/admin (incl.
 *     parent). A global trainer not in the game, and a non-trainer owner, get 403.
 *   · POST /api/games with entityType TRAINING — anyone as a playing creator
 *     (never becomes trainerId); `creatorNonPlaying` only for `isTrainer` / admin;
 *     a recurring TRAINING series keeps generating after its owner loses the flag.
 *   · POST /api/invites with asTrainer — the invitee must be `isTrainer`.
 *   · POST /api/games/:id/set-trainer — deliberately any roster member (documented).
 *
 * Every refusal is a 403 with no DB change. Safe to run against `padelpulse_dev`:
 * every row is namespaced with a run suffix and removed in `finally`.
 */
import './agentRoutesTestEnv';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import {
  EntityType,
  GameSeriesCadence,
  GameStatus,
  GameType,
  ParticipantRole,
  ParticipantStatus,
  ResultsStatus,
  Sport,
} from '@prisma/client';
import app from '../../app';
import prisma from '../../config/database';
import { generateShortAccessToken } from '../../utils/jwt';
import { GameSeriesService } from '../../services/gameSeries/gameSeries.service';

process.env.E2E_TEST = '1';

const HOURS = 60 * 60 * 1000;
const DAYS = 24 * HOURS;

async function main(): Promise<void> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const userIds: string[] = [];
  const gameIds: string[] = [];
  const seriesIds: string[] = [];
  const city = await prisma.city.create({
    data: { name: `Training perms ${suffix}`, country: 'Test', timezone: 'UTC' },
  });
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;

  const makeUser = async (name: string, flags: { isTrainer?: boolean; isAdmin?: boolean } = {}) => {
    const user = await prisma.user.create({
      data: {
        phone: `qa-training-perm-${name}-${suffix}`,
        firstName: name,
        lastName: 'Test',
        currentCityId: city.id,
        primarySport: Sport.PADEL,
        // authenticate() geolocates new client IPs; loopback keeps the test offline.
        lastUserIP: '::ffff:127.0.0.1',
        isTrainer: flags.isTrainer ?? false,
        isAdmin: flags.isAdmin ?? false,
      },
    });
    userIds.push(user.id);
    return user.id;
  };

  const call = async (method: 'POST', userId: string, path: string, body: unknown = {}) => {
    const res = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method,
      headers: { Authorization: `Bearer ${generateShortAccessToken({ userId })}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text };
  };

  try {
    const owner = await makeUser('owner', { isTrainer: true });
    const trainer = await makeUser('trainer', { isTrainer: true });
    const student = await makeUser('student');
    const stranger = await makeUser('stranger');
    const randomTrainer = await makeUser('randomTrainer', { isTrainer: true });
    const platformAdmin = await makeUser('platformAdmin', { isAdmin: true });
    const parentOwner = await makeUser('parentOwner', { isTrainer: true });
    const plainOwner = await makeUser('plainOwner');

    const parent = await prisma.game.create({
      data: {
        entityType: EntityType.GAME,
        sport: Sport.PADEL,
        gameType: GameType.CLASSIC,
        cityId: city.id,
        startTime: new Date(Date.now() + 2 * DAYS),
        endTime: new Date(Date.now() + 2 * DAYS + 2 * HOURS),
        timeIsSet: true,
        participants: {
          create: [{ userId: parentOwner, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING }],
        },
      },
    });
    gameIds.push(parent.id);

    /** OWNER (PLAYING), trainer (ADMIN, NON_PLAYING, `trainerId`), one PLAYING student. */
    const makeTraining = async (
      opts: { resultsStatus?: ResultsStatus; status?: GameStatus; withTrainer?: boolean; ownerId?: string } = {},
    ) => {
      const withTrainer = opts.withTrainer ?? true;
      const game = await prisma.game.create({
        data: {
          entityType: EntityType.TRAINING,
          sport: Sport.PADEL,
          gameType: GameType.CLASSIC,
          cityId: city.id,
          startTime: new Date(Date.now() - 3 * HOURS),
          endTime: new Date(Date.now() - 2 * HOURS),
          timeIsSet: true,
          maxParticipants: 8,
          minParticipants: 1,
          resultsStatus: opts.resultsStatus ?? ResultsStatus.NONE,
          status: opts.status ?? GameStatus.STARTED,
          parentId: parent.id,
          trainerId: withTrainer ? trainer : null,
        },
      });
      gameIds.push(game.id);
      await prisma.gameParticipant.createMany({
        data: [
          { gameId: game.id, userId: opts.ownerId ?? owner, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING },
          { gameId: game.id, userId: student, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.PLAYING },
          ...(withTrainer
            ? [{ gameId: game.id, userId: trainer, role: ParticipantRole.ADMIN, status: ParticipantStatus.NON_PLAYING }]
            : []),
        ],
      });
      return game.id;
    };

    const outsiders = [
      ['stranger', stranger],
      ['plain participant', student],
      ['global trainer not in the game', randomTrainer],
    ] as const;

    // -------------------------------------------------------------------------
    // 1. Finish training
    // -------------------------------------------------------------------------
    {
      const gameId = await makeTraining();
      for (const [label, userId] of outsiders) {
        const res = await call('POST', userId, `/training/${gameId}/finish`);
        assert.equal(res.status, 403, `finish: ${label} → 403 (${res.text})`);
        const row = await prisma.game.findUniqueOrThrow({ where: { id: gameId }, select: { resultsStatus: true, status: true, finishedDate: true } });
        assert.deepEqual(row, { resultsStatus: ResultsStatus.NONE, status: GameStatus.STARTED, finishedDate: null }, `finish: ${label} changed nothing`);
      }
      for (const [label, userId] of [
        ['trainer', trainer],
        ['owner', owner],
        ['parent owner', parentOwner],
        ['platform admin', platformAdmin],
      ] as const) {
        await prisma.game.update({ where: { id: gameId }, data: { resultsStatus: ResultsStatus.NONE, status: GameStatus.STARTED, finishedDate: null } });
        const res = await call('POST', userId, `/training/${gameId}/finish`);
        assert.equal(res.status, 200, `finish: ${label} → 200 (${res.text})`);
        const row = await prisma.game.findUniqueOrThrow({ where: { id: gameId }, select: { resultsStatus: true, status: true } });
        assert.deepEqual(row, { resultsStatus: ResultsStatus.FINAL, status: GameStatus.FINISHED }, `finish: ${label} finished it`);
      }

      const archivedId = await makeTraining({ status: GameStatus.ARCHIVED });
      for (const [label, userId] of [['trainer', trainer], ['owner', owner], ['platform admin', platformAdmin]] as const) {
        const res = await call('POST', userId, `/training/${archivedId}/finish`);
        assert.equal(res.status, 403, `finish archived: ${label} → 403`);
      }
      const archived = await prisma.game.findUniqueOrThrow({ where: { id: archivedId }, select: { resultsStatus: true } });
      assert.equal(archived.resultsStatus, ResultsStatus.NONE, 'archived training untouched');

      // The rating-activity stamp is a rating effect: only for actors who may manage ratings.
      const activityOf = async () =>
        (
          await prisma.userSportProfile.findUnique({
            where: { userId_sport: { userId: student, sport: Sport.PADEL } },
            select: { lastRatingActivityAt: true },
          })
        )?.lastRatingActivityAt ?? null;
      await prisma.userSportProfile.deleteMany({ where: { userId: student } });
      const plainId = await makeTraining({ ownerId: plainOwner, withTrainer: false });
      const plainFinish = await call('POST', plainOwner, `/training/${plainId}/finish`);
      assert.equal(plainFinish.status, 200, `finish: non-trainer owner → 200 (${plainFinish.text})`);
      assert.equal(await activityOf(), null, 'finish by a non-trainer owner stamps no rating activity');
      const coachedId = await makeTraining();
      const coachedFinish = await call('POST', trainer, `/training/${coachedId}/finish`);
      assert.equal(coachedFinish.status, 200);
      assert.ok(await activityOf(), 'finish by the trainer stamps rating activity');

      // `resultsByAnyone` lets a PLAYING participant finish — same as the button.
      const anyoneId = await makeTraining();
      await prisma.game.update({ where: { id: anyoneId }, data: { resultsByAnyone: true } });
      const res = await call('POST', student, `/training/${anyoneId}/finish`);
      assert.equal(res.status, 200, `finish: participant with resultsByAnyone → 200 (${res.text})`);
      console.log('finish training: ok');
    }

    // -------------------------------------------------------------------------
    // 2. Participant level + undo
    // -------------------------------------------------------------------------
    {
      const gameId = await makeTraining({ resultsStatus: ResultsStatus.FINAL, status: GameStatus.FINISHED });
      const profileOf = () =>
        prisma.userSportProfile.findUnique({
          where: { userId_sport: { userId: student, sport: Sport.PADEL } },
          select: { level: true, reliability: true, approvedLevel: true },
        });
      const before = await profileOf();
      for (const [label, userId] of outsiders) {
        const res = await call('POST', userId, `/training/${gameId}/participant/${student}/level`, { level: 6.5, reliability: 90 });
        assert.equal(res.status, 403, `level: ${label} → 403 (${res.text})`);
        assert.equal(await prisma.gameOutcome.count({ where: { gameId } }), 0, `level: ${label} wrote no outcome`);
        assert.deepEqual(await profileOf(), before, `level: ${label} left the profile alone`);
      }
      // A non-trainer owner (trainee rematch) cannot edit or confirm levels.
      const plainId = await makeTraining({ ownerId: plainOwner, resultsStatus: ResultsStatus.FINAL, status: GameStatus.FINISHED, withTrainer: false });
      const plainLevel = await call('POST', plainOwner, `/training/${plainId}/participant/${student}/level`, { level: 6.5, reliability: 90 });
      assert.equal(plainLevel.status, 403, `level: non-trainer owner → 403 (${plainLevel.text})`);
      assert.equal(await prisma.gameOutcome.count({ where: { gameId: plainId } }), 0, 'level: non-trainer owner wrote no outcome');
      assert.deepEqual(await profileOf(), before, 'level: non-trainer owner left the profile alone');
      // The game's trainer who lost the global flag is refused as well.
      await prisma.user.update({ where: { id: trainer }, data: { isTrainer: false } });
      const unflagged = await call('POST', trainer, `/training/${gameId}/participant/${student}/level`, { level: 6.5, reliability: 90 });
      assert.equal(unflagged.status, 403, `level: game trainer without isTrainer → 403 (${unflagged.text})`);
      await prisma.user.update({ where: { id: trainer }, data: { isTrainer: true } });

      for (const [label, userId, level] of [
        ['trainer', trainer, 3.5],
        ['owner', owner, 3.6],
        ['parent owner', parentOwner, 3.7],
        ['platform admin', platformAdmin, 3.8],
      ] as const) {
        const res = await call('POST', userId, `/training/${gameId}/participant/${student}/level`, { level, reliability: 50 });
        assert.equal(res.status, 200, `level: ${label} → 200 (${res.text})`);
        const profile = await profileOf();
        assert.equal(profile?.level, level, `level: ${label} set the level`);
        assert.equal(profile?.approvedLevel, true, `level: ${label} confirms the level`);
      }

      const outcomesBefore = await prisma.gameOutcome.count({ where: { gameId } });
      assert.equal(outcomesBefore, 1);
      const levelBeforeUndo = (await profileOf())?.level;
      await prisma.gameOutcome.create({
        data: {
          gameId: plainId, userId: student, levelBefore: 3, levelAfter: 3.5, levelChange: 0.5,
          reliabilityBefore: 10, reliabilityAfter: 10, reliabilityChange: 0, pointsEarned: 0, isWinner: false,
        },
      });
      const plainUndo = await call('POST', plainOwner, `/training/${plainId}/undo`);
      assert.equal(plainUndo.status, 403, `undo: non-trainer owner → 403 (${plainUndo.text})`);
      assert.equal(await prisma.gameOutcome.count({ where: { gameId: plainId } }), 1, 'undo: non-trainer owner kept outcomes');

      for (const [label, userId] of outsiders) {
        const res = await call('POST', userId, `/training/${gameId}/undo`);
        assert.equal(res.status, 403, `undo: ${label} → 403 (${res.text})`);
        assert.equal(await prisma.gameOutcome.count({ where: { gameId } }), outcomesBefore, `undo: ${label} kept outcomes`);
        assert.equal((await profileOf())?.level, levelBeforeUndo, `undo: ${label} kept the level`);
      }
      for (const [label, userId] of [
        ['trainer', trainer],
        ['owner', owner],
        ['parent owner', parentOwner],
        ['platform admin', platformAdmin],
      ] as const) {
        await call('POST', trainer, `/training/${gameId}/participant/${student}/level`, { level: 4, reliability: 60 });
        const res = await call('POST', userId, `/training/${gameId}/undo`);
        assert.equal(res.status, 200, `undo: ${label} → 200 (${res.text})`);
        assert.equal(await prisma.gameOutcome.count({ where: { gameId } }), 0, `undo: ${label} removed outcomes`);
      }
      console.log('level + undo: ok');
    }

    // -------------------------------------------------------------------------
    // 3. Creating a TRAINING over HTTP
    // -------------------------------------------------------------------------
    {
      const start = new Date(Date.now() + 3 * DAYS);
      const body = {
        entityType: 'TRAINING',
        sport: 'PADEL',
        cityId: city.id,
        startTime: start.toISOString(),
        endTime: new Date(start.getTime() + 90 * 60 * 1000).toISOString(),
        maxParticipants: 6,
        participants: [],
        name: `Perm training ${suffix}`,
      };
      const created = async (res: { status: number; text: string }) => {
        const id = (JSON.parse(res.text) as { data?: { id?: string } }).data?.id;
        assert.ok(id, `created game id in ${res.text.slice(0, 200)}`);
        gameIds.push(id);
        return prisma.game.findUniqueOrThrow({
          where: { id },
          select: { entityType: true, trainerId: true, participants: { select: { userId: true, role: true, status: true } } },
        });
      };
      const countTrainings = () => prisma.game.count({ where: { cityId: city.id, entityType: EntityType.TRAINING, name: body.name } });

      // A non-trainer creates as a playing creator (trainee rematch) and does not become the trainer.
      const asPlayer = await call('POST', stranger, '/games', { ...body, participants: [stranger] });
      assert.equal(asPlayer.status, 201, `create TRAINING: non-trainer as player → 201 (${asPlayer.text})`);
      const playerGame = await created(asPlayer);
      assert.equal(playerGame.entityType, EntityType.TRAINING);
      assert.equal(playerGame.trainerId, null, 'a non-trainer creator never becomes trainerId');
      assert.ok(playerGame.participants.some((p) => p.userId === stranger && p.role === ParticipantRole.OWNER && p.status === ParticipantStatus.PLAYING));

      // "I coach, I don't play" would make a non-trainer the trainer: refused.
      const baseline = await countTrainings();
      const nonPlaying = await call('POST', student, '/games', { ...body, creatorNonPlaying: true });
      assert.equal(nonPlaying.status, 403, `create TRAINING: non-trainer creatorNonPlaying → 403 (${nonPlaying.text})`);
      assert.match(nonPlaying.text, /Only trainers can coach a training without playing/);
      assert.equal(await countTrainings(), baseline, 'create TRAINING: refused create wrote nothing');

      for (const [label, userId] of [['trainer', randomTrainer], ['platform admin', platformAdmin]] as const) {
        const res = await call('POST', userId, '/games', { ...body, creatorNonPlaying: true });
        assert.equal(res.status, 201, `create TRAINING: ${label} creatorNonPlaying → 201 (${res.text})`);
        const game = await created(res);
        assert.equal(game.trainerId, userId, `create TRAINING: ${label} coaches it`);
      }
      console.log('create TRAINING gate: ok');
    }

    // -------------------------------------------------------------------------
    // 3b. A TRAINING series keeps generating after its owner loses isTrainer
    // -------------------------------------------------------------------------
    {
      const seriesOwner = await makeUser('seriesOwner', { isTrainer: true });
      const seedStart = new Date(Date.now() + 2 * DAYS);
      const seed = await prisma.game.create({
        data: {
          entityType: EntityType.TRAINING,
          sport: Sport.PADEL,
          gameType: GameType.CLASSIC,
          cityId: city.id,
          startTime: seedStart,
          endTime: new Date(seedStart.getTime() + 90 * 60 * 1000),
          timeIsSet: true,
          isPublic: true,
          maxParticipants: 6,
          minParticipants: 1,
          trainerId: seriesOwner,
        },
      });
      gameIds.push(seed.id);
      await prisma.gameParticipant.createMany({
        data: [{ gameId: seed.id, userId: seriesOwner, role: ParticipantRole.OWNER, status: ParticipantStatus.NON_PLAYING }],
      });
      await prisma.user.update({ where: { id: seriesOwner }, data: { isTrainer: false } });
      const { seriesId } = await GameSeriesService.createSeriesFromGame(seed.id, seriesOwner, {
        cadence: GameSeriesCadence.WEEKLY,
        name: `Perm series ${suffix}`,
        horizonDays: 21,
      });
      seriesIds.push(seriesId);
      const occurrences = await prisma.game.findMany({ where: { seriesId }, select: { id: true, entityType: true, trainerId: true } });
      for (const o of occurrences) if (!gameIds.includes(o.id)) gameIds.push(o.id);
      assert.ok(occurrences.length > 1, 'series generated TRAINING occurrences for an owner without isTrainer');
      assert.ok(occurrences.every((o) => o.entityType === EntityType.TRAINING && o.trainerId === seriesOwner));
      console.log('series generation after losing isTrainer: ok');
    }

    // -------------------------------------------------------------------------
    // 4. Trainer invite requires an isTrainer invitee
    // -------------------------------------------------------------------------
    {
      const gameId = await makeTraining({ withTrainer: false, status: GameStatus.ANNOUNCED });
      await prisma.game.update({
        where: { id: gameId },
        data: { startTime: new Date(Date.now() + 2 * DAYS), endTime: new Date(Date.now() + 2 * DAYS + 2 * HOURS) },
      });
      const nonTrainer = await makeUser('inviteeNonTrainer');
      const res = await call('POST', owner, '/invites', { gameId, receiverId: nonTrainer, asTrainer: true });
      assert.equal(res.status, 403, `asTrainer invite of a non-trainer → 403 (${res.text})`);
      assert.match(res.text, /Only trainers can be invited as trainer/);
      assert.equal(await prisma.gameParticipant.count({ where: { gameId, userId: nonTrainer } }), 0, 'no invite row');

      const ok = await call('POST', owner, '/invites', { gameId, receiverId: randomTrainer, asTrainer: true });
      assert.ok(ok.status === 200 || ok.status === 201, `asTrainer invite of a trainer → 2xx (${ok.status} ${ok.text})`);
      const row = await prisma.gameParticipant.findFirst({ where: { gameId, userId: randomTrainer } });
      assert.equal(row?.status, ParticipantStatus.INVITED);
      assert.equal(row?.role, ParticipantRole.ADMIN);
      console.log('trainer invite gate: ok');
    }

    // -------------------------------------------------------------------------
    // 5. set-trainer: owner may mark any roster member (documented); others may not
    // -------------------------------------------------------------------------
    {
      const gameId = await makeTraining({ withTrainer: false, status: GameStatus.ANNOUNCED });
      await prisma.game.update({
        where: { id: gameId },
        data: { startTime: new Date(Date.now() + 2 * DAYS), endTime: new Date(Date.now() + 2 * DAYS + 2 * HOURS) },
      });
      for (const [label, userId] of [['stranger', stranger], ['plain participant', student], ['global trainer not in the game', randomTrainer]] as const) {
        const res = await call('POST', userId, `/games/${gameId}/set-trainer`, { userId: student, isTrainer: true });
        assert.equal(res.status, 403, `set-trainer: ${label} → 403 (${res.text})`);
        const game = await prisma.game.findUniqueOrThrow({ where: { id: gameId }, select: { trainerId: true } });
        assert.equal(game.trainerId, null, `set-trainer: ${label} changed nothing`);
      }
      const res = await call('POST', owner, `/games/${gameId}/set-trainer`, { userId: student, isTrainer: true });
      assert.equal(res.status, 200, `set-trainer: owner marks a non-trainer roster member (${res.text})`);
      const game = await prisma.game.findUniqueOrThrow({ where: { id: gameId }, select: { trainerId: true } });
      assert.equal(game.trainerId, student);
      console.log('set-trainer: ok');
    }

    console.log('trainingPermissions.http.integration.test.ts: ok');
  } finally {
    server.close();
    await prisma.gameSeries.deleteMany({ where: { id: { in: seriesIds } } }).catch((e) => console.error('series cleanup failed', e));
    await prisma.game.deleteMany({ where: { id: { in: gameIds } } }).catch((e) => console.error('game cleanup failed', e));
    await prisma.game.deleteMany({ where: { cityId: city.id } }).catch((e) => console.error('game cleanup failed', e));
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch((e) => console.error('user cleanup failed', e));
    await prisma.city.delete({ where: { id: city.id } }).catch((e) => console.error('city cleanup failed', e));
  }
}

main().then(
  async () => {
    await prisma.$disconnect();
    process.exit(0);
  },
  async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  },
);
