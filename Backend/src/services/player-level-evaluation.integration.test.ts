import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import {
  EntityType,
  GameStatus,
  MatchSetRole,
  ParticipantRole,
  ParticipantStatus,
  PlayerLevelVerdict,
  ResultsStatus,
  Sport,
} from '@prisma/client';
import { Client } from 'pg';
import prisma from '../config/database';
import resultsRouter from '../routes/results.routes';
import { errorHandler } from '../middleware/errorHandler';
import { ApiError } from '../utils/ApiError';
import { generateShortAccessToken } from '../utils/jwt';
import {
  getGameLevelEvaluations,
  upsertGameLevelEvaluation,
} from './player-level-evaluation.service';

function expectApiStatus(statusCode: number): (error: unknown) => boolean {
  return (error) => error instanceof ApiError && error.statusCode === statusCode;
}

async function requestJson(
  port: number,
  method: 'GET' | 'PUT',
  path: string,
  token?: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const request = http.request(
      {
        hostname: '127.0.0.1',
        port,
        method,
        path,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {}),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          resolve({
            status: response.statusCode ?? 0,
            body: raw ? JSON.parse(raw) as Record<string, unknown> : {},
          });
        });
      },
    );
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

async function main(): Promise<void> {
  const connectionString = process.env.DB_URL;
  if (!connectionString) throw new Error('DB_URL is required');
  const schema = process.env.DB_SCHEMA || 'padelpulse';
  const lockClient = new Client({
    connectionString,
    options: `-c search_path=${schema}`,
  });
  await lockClient.connect();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const city = await prisma.city.create({
    data: { name: `Level feedback QA ${suffix}`, country: 'Test', timezone: 'UTC' },
  });
  const [evaluator, target] = await Promise.all([
    prisma.user.create({
      data: {
        phone: `qa-level-evaluator-${suffix}`,
        firstName: 'Evaluator',
        currentCityId: city.id,
        lastUserIP: '203.0.113.1',
      },
    }),
    prisma.user.create({
      data: {
        phone: `qa-level-target-${suffix}`,
        firstName: 'Target',
        currentCityId: city.id,
      },
    }),
  ]);
  const finishedDate = new Date();
  const game = await prisma.game.create({
    data: {
      entityType: EntityType.GAME,
      sport: Sport.PADEL,
      gameType: 'CLASSIC',
      cityId: city.id,
      startTime: new Date(finishedDate.getTime() - 90 * 60 * 1000),
      endTime: finishedDate,
      timeIsSet: true,
      status: GameStatus.FINISHED,
      resultsStatus: ResultsStatus.FINAL,
      finishedDate,
      participants: {
        create: [
          {
            userId: evaluator.id,
            role: ParticipantRole.OWNER,
            status: ParticipantStatus.PLAYING,
          },
          {
            userId: target.id,
            role: ParticipantRole.PARTICIPANT,
            status: ParticipantStatus.PLAYING,
          },
        ],
      },
      outcomes: {
        create: [evaluator.id, target.id].map((userId) => ({
          userId,
          levelBefore: 3,
          levelAfter: 3.05,
          levelChange: 0.05,
          reliabilityBefore: 0.5,
          reliabilityAfter: 0.55,
          reliabilityChange: 0.05,
        })),
      },
      rounds: {
        create: {
          roundNumber: 1,
          matches: {
            create: {
              matchNumber: 1,
              teams: {
                create: [
                  {
                    teamNumber: 1,
                    players: { create: { userId: evaluator.id } },
                  },
                  {
                    teamNumber: 2,
                    players: { create: { userId: target.id } },
                  },
                ],
              },
              sets: {
                create: {
                  setNumber: 1,
                  teamAScore: 6,
                  teamBScore: 3,
                  role: MatchSetRole.OFFICIAL,
                },
              },
            },
          },
        },
      },
    },
    select: {
      id: true,
      rounds: { select: { matches: { select: { sets: { select: { id: true } } } } } },
    },
  });
  const setId = game.rounds[0]!.matches[0]!.sets[0]!.id;

  try {
    const initial = await getGameLevelEvaluations(game.id, evaluator.id);
    assert.deepEqual(initial.players.map((player) => player.user.id), [target.id]);

    const app = express();
    app.use(express.json());
    app.use('/api/results', resultsRouter);
    app.use(errorHandler);
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as { port: number };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response('203.0.113.1', { status: 200 });
    try {
      const noAuth = await requestJson(
        port,
        'GET',
        `/api/results/game/${game.id}/level-evaluations`,
      );
      assert.equal(noAuth.status, 401, 'the endpoint requires authentication');

      const token = generateShortAccessToken({ userId: evaluator.id });
      const getResponse = await requestJson(
        port,
        'GET',
        `/api/results/game/${game.id}/level-evaluations`,
        token,
      );
      assert.equal(getResponse.status, 200);
      const responseData = getResponse.body.data as { players: Array<{ user: { id: string } }> };
      assert.deepEqual(responseData.players.map((player) => player.user.id), [target.id]);

      const invalidVerdict = await requestJson(
        port,
        'PUT',
        `/api/results/game/${game.id}/level-evaluations/${target.id}`,
        token,
        { verdict: 'CERTAINLY' },
      );
      assert.equal(invalidVerdict.status, 400, 'invalid verdicts are rejected at the API boundary');

      const invalidTarget = await requestJson(
        port,
        'PUT',
        `/api/results/game/${game.id}/level-evaluations/${'x'.repeat(65)}`,
        token,
        { verdict: PlayerLevelVerdict.HIGHER },
      );
      assert.equal(invalidTarget.status, 400, 'oversized target identifiers are rejected');

      const putResponse = await requestJson(
        port,
        'PUT',
        `/api/results/game/${game.id}/level-evaluations/${target.id}`,
        token,
        { verdict: PlayerLevelVerdict.HIGHER },
      );
      assert.equal(putResponse.status, 200);
    } finally {
      globalThis.fetch = originalFetch;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }

    await upsertGameLevelEvaluation(
      game.id,
      evaluator.id,
      target.id,
      PlayerLevelVerdict.HIGHER,
    );
    await upsertGameLevelEvaluation(
      game.id,
      evaluator.id,
      target.id,
      PlayerLevelVerdict.ABOUT_RIGHT,
    );
    const stored = await prisma.playerLevelEvaluation.findMany({ where: { gameId: game.id } });
    assert.equal(stored.length, 1, 'repeat answers update the unique vote');
    assert.equal(stored[0]!.verdict, PlayerLevelVerdict.ABOUT_RIGHT);

    await prisma.blockedUser.create({
      data: { userId: target.id, blockedUserId: evaluator.id },
    });
    assert.equal(
      (await getGameLevelEvaluations(game.id, evaluator.id)).players.length,
      0,
      'a block in either direction hides the target',
    );
    await assert.rejects(
      upsertGameLevelEvaluation(
        game.id,
        evaluator.id,
        target.id,
        PlayerLevelVerdict.LOWER,
      ),
      expectApiStatus(403),
    );
    await prisma.blockedUser.deleteMany({
      where: { userId: target.id, blockedUserId: evaluator.id },
    });

    await prisma.set.update({
      where: { id: setId },
      data: { teamAScore: 0, teamBScore: 0 },
    });
    assert.equal(
      (await getGameLevelEvaluations(game.id, evaluator.id)).players.length,
      0,
      'an unplayed 0-0 match cannot be evaluated',
    );
    await prisma.set.update({
      where: { id: setId },
      data: { teamAScore: 6, teamBScore: 3 },
    });

    await assert.rejects(
      lockClient.query(
        `INSERT INTO "PlayerLevelEvaluation"
          ("id", "gameId", "sport", "evaluatorUserId", "targetUserId", "verdict", "levelSnapshot", "createdAt", "updatedAt")
         VALUES ($1, $2, 'PADEL', $3, $3, 'HIGHER', 3, NOW(), NOW())`,
        [`qa-self-${suffix}`, game.id, evaluator.id],
      ),
      'the database constraint rejects self-evaluation',
    );

    await prisma.game.update({
      where: { id: game.id },
      data: { finishedDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) },
    });
    await assert.rejects(
      upsertGameLevelEvaluation(
        game.id,
        evaluator.id,
        target.id,
        PlayerLevelVerdict.LOWER,
      ),
      expectApiStatus(409),
    );
    await prisma.game.update({
      where: { id: game.id },
      data: { finishedDate },
    });

    let racingSave: Promise<unknown> | undefined;
    await lockClient.query('BEGIN');
    try {
      await lockClient.query('SELECT "id" FROM "Game" WHERE "id" = $1 FOR UPDATE', [game.id]);
      racingSave = upsertGameLevelEvaluation(
        game.id,
        evaluator.id,
        target.id,
        PlayerLevelVerdict.LOWER,
      );
      await new Promise((resolve) => setTimeout(resolve, 30));
      await lockClient.query(
        'UPDATE "Game" SET "resultsStatus" = \'NONE\', "finishedDate" = NULL WHERE "id" = $1',
        [game.id],
      );
      await lockClient.query('DELETE FROM "PlayerLevelEvaluation" WHERE "gameId" = $1', [game.id]);
      await lockClient.query('COMMIT');
    } catch (error) {
      await lockClient.query('ROLLBACK');
      throw error;
    }
    assert.ok(racingSave);
    await assert.rejects(racingSave, expectApiStatus(409));
    assert.equal(
      await prisma.playerLevelEvaluation.count({ where: { gameId: game.id } }),
      0,
      'a save waiting behind reset cannot recreate stale feedback',
    );

    console.log('player-level-evaluation.integration.test: ok');
  } finally {
    await prisma.game.deleteMany({ where: { id: game.id } });
    await prisma.user.deleteMany({ where: { id: { in: [evaluator.id, target.id] } } });
    await prisma.city.deleteMany({ where: { id: city.id } });
    await lockClient.end();
    await prisma.$disconnect();
  }
}

void main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
