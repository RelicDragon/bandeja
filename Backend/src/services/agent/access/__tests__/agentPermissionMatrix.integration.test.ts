/**
 * Phase-0 permission matrix for the AI agent access guards (real dev DB).
 *
 * Row letters, actor order:
 *   stranger invited queued player gameAdmin owner leagueOwner globalAdmin
 * A = allow, N = 404 (same as a missing id), F = 403, B = 400.
 */
import assert from 'node:assert/strict';
import { ParticipantRole } from '@prisma/client';
import prisma from '../../../../config/database';
import { ApiError } from '../../../../utils/ApiError';
import { canEditGame, canManageGameRoster, type AuthRequest } from '../../../../middleware/auth';
import { assertGamePermission } from '../../../game/gamePermission';
import {
  agentVisibleGamesWhere,
  assertAgentCanInviteToGame,
  assertAgentCanViewGame,
  assertAgentGamePermission,
} from '../agentGameAccess';
import { loadAgentPrincipal } from '../agentPrincipal';
import {
  AGENT_MATRIX_ACTORS,
  AGENT_MATRIX_GAMES,
  assertMatrixReport,
  createAgentPermissionFixture,
  matrixRow,
  runAgentPermissionMatrix,
  type AgentMatrixExpectations,
  type AgentMatrixReport,
} from './agentPermissionMatrix';

const OWNER_ADMIN = [ParticipantRole.OWNER, ParticipantRole.ADMIN];

//                                 str inv que ply gAd own lOw adm
// League content (the season and its fixtures) is visible to everyone: leagues are for everyone.
const VIEW: AgentMatrixExpectations = {
  public: /*          */ matrixRow('A A A A A A A A'),
  private: /*         */ matrixRow('N A A A A A N A'),
  archived: /*        */ matrixRow('A A A A A A A A'),
  resultsLocked: /*   */ matrixRow('A A A A A A A A'),
  pendingEvent: /*    */ matrixRow('N N N N N A N A'),
  privateSeason: /*   */ matrixRow('A A A A A A A A'),
  leagueFixture: /*   */ matrixRow('A A A A A A A A'),
};

/** Raw `assertGamePermission([OWNER, ADMIN])` — HTTP `canEditGame` parity (403 leaks existence). */
const GAME_PERMISSION: AgentMatrixExpectations = {
  public: /*          */ matrixRow('F F F F A A F A'),
  private: /*         */ matrixRow('F F F F A A F A'),
  archived: /*        */ matrixRow('B B B B B B B B'),
  resultsLocked: /*   */ matrixRow('F F F F A A F A'),
  pendingEvent: /*    */ matrixRow('F F F F A A F A'),
  privateSeason: /*   */ matrixRow('F F F F F F A A'),
  leagueFixture: /*   */ matrixRow('F F F F A A A A'),
};

/** `assertAgentGamePermission([OWNER, ADMIN], { requireRosterMutable })` — the `update_game` guard. */
const AGENT_MANAGE: AgentMatrixExpectations = {
  public: /*          */ matrixRow('F F F F A A F A'),
  private: /*         */ matrixRow('N F F F A A N A'),
  archived: /*        */ matrixRow('B B B B B B B B'),
  resultsLocked: /*   */ matrixRow('B B B B B B B B'),
  pendingEvent: /*    */ matrixRow('N N N N N A N A'),
  privateSeason: /*   */ matrixRow('F F F F F F A A'),
  leagueFixture: /*   */ matrixRow('F F F F A A A A'),
};

/**
 * `assertAgentCanInviteToGame` (anyoneCanInvite = false everywhere). A global admin
 * with no roster row cannot invite — same as HTTP `assertCanInviteToGame`. Archived /
 * results-started / EVENT are rejected later inside `sendInviteAsUser`.
 */
const AGENT_INVITE: AgentMatrixExpectations = {
  public: /*          */ matrixRow('F F F F A A F F'),
  private: /*         */ matrixRow('N F F F A A N F'),
  archived: /*        */ matrixRow('F F F F A A F F'),
  resultsLocked: /*   */ matrixRow('F F F F A A F F'),
  pendingEvent: /*    */ matrixRow('N N N N N A N F'),
  privateSeason: /*   */ matrixRow('F F F F F F A F'),
  leagueFixture: /*   */ matrixRow('F F F F A A A F'),
};

type MiddlewareOutcome = { statusCode: number; message: string; data?: Record<string, unknown> } | 'next';

async function runMiddleware(
  middleware: typeof canEditGame,
  req: Partial<AuthRequest>,
): Promise<MiddlewareOutcome> {
  return new Promise((resolve) => {
    void middleware(
      { params: {}, body: {}, ...req } as AuthRequest,
      {} as Parameters<typeof canEditGame>[1],
      (error?: unknown) => {
        if (!error) return resolve('next');
        assert.ok(error instanceof ApiError, 'middleware must forward ApiError');
        resolve({ statusCode: error.statusCode, message: error.message, data: error.data });
      },
    );
  });
}

async function serviceOutcome(run: () => Promise<void>): Promise<MiddlewareOutcome> {
  try {
    await run();
    return 'next';
  } catch (error) {
    assert.ok(error instanceof ApiError);
    return { statusCode: error.statusCode, message: error.message, data: error.data };
  }
}

void (async () => {
  let exitCode = 0;
  const fixture = await createAgentPermissionFixture();
  const inactiveUser = await prisma.user.create({
    data: { phone: `qa-agent-matrix-inactive-${fixture.suffix}`, firstName: 'inactive', isActive: false },
  });
  try {
    // --- loadAgentPrincipal ---------------------------------------------------------
    assert.equal(fixture.principals.globalAdmin.isAdmin, true);
    assert.equal(fixture.principals.owner.isAdmin, false);
    assert.equal(fixture.principals.owner.currentCityId, fixture.cityId);
    await assert.rejects(loadAgentPrincipal(inactiveUser.id), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.statusCode, 401);
      assert.equal(error.data?.code, 'auth.userInactive');
      return true;
    });
    await assert.rejects(loadAgentPrincipal(`missing-${fixture.suffix}`), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.statusCode, 401);
      assert.equal(error.data?.code, 'auth.userNotFound');
      return true;
    });
    console.log('loadAgentPrincipal: ok');

    // --- no existence oracle ----------------------------------------------------------
    const missing = await serviceOutcome(() =>
      assertAgentCanViewGame(fixture.principals.stranger, `missing-${fixture.suffix}`),
    );
    const hidden = await serviceOutcome(() =>
      assertAgentCanViewGame(fixture.principals.stranger, fixture.games.private),
    );
    assert.deepEqual(hidden, missing, 'hidden game must be indistinguishable from a missing id');
    console.log('no existence oracle: ok');

    // --- matrices -----------------------------------------------------------------------
    const reports: AgentMatrixReport[] = [
      await runAgentPermissionMatrix({
        label: 'assertAgentCanViewGame',
        fixture,
        expectations: VIEW,
        run: (principal, gameId) => assertAgentCanViewGame(principal, gameId),
      }),
      await runAgentPermissionMatrix({
        label: 'assertGamePermission[OWNER,ADMIN]',
        fixture,
        expectations: GAME_PERMISSION,
        run: (principal, gameId) => assertGamePermission(principal, gameId, OWNER_ADMIN),
      }),
      await runAgentPermissionMatrix({
        label: 'assertAgentGamePermission[OWNER,ADMIN]+rosterMutable',
        fixture,
        expectations: AGENT_MANAGE,
        run: (principal, gameId) =>
          assertAgentGamePermission(principal, gameId, OWNER_ADMIN, { requireRosterMutable: true }),
      }),
      await runAgentPermissionMatrix({
        label: 'assertAgentCanInviteToGame',
        fixture,
        expectations: AGENT_INVITE,
        run: (principal, gameId) => assertAgentCanInviteToGame(principal, gameId),
      }),
    ];
    const failures: string[] = [];
    for (const report of reports) {
      try {
        assertMatrixReport(report);
      } catch (error) {
        failures.push((error as Error).message);
      }
    }

    // --- agentVisibleGamesWhere agrees with assertAgentCanViewGame -------------------
    const fixtureGameIds = Object.values(fixture.games);
    for (const actor of AGENT_MATRIX_ACTORS) {
      const rows = await prisma.game.findMany({
        where: { AND: [agentVisibleGamesWhere(fixture.principals[actor]), { id: { in: fixtureGameIds } }] },
        select: { id: true },
      });
      const actual = new Set(rows.map((row) => row.id));
      for (const game of AGENT_MATRIX_GAMES) {
        const expected = VIEW[game][actor] === 'allow';
        if (actual.has(fixture.games[game]) !== expected) {
          failures.push(`agentVisibleGamesWhere: ${actor} × ${game} expected visible=${expected}`);
        }
      }
    }
    console.log(`agentVisibleGamesWhere: ${AGENT_MATRIX_ACTORS.length * AGENT_MATRIX_GAMES.length} cells checked`);

    // --- requireGamePermission middleware delegates byte-identically -----------------
    const p = fixture.principals;
    const middlewareCases: Array<{
      name: string;
      middleware: typeof canEditGame;
      req: Partial<AuthRequest>;
      expected: MiddlewareOutcome;
    }> = [
      {
        name: 'no user',
        middleware: canEditGame,
        req: { params: { id: fixture.games.public } },
        expected: { statusCode: 401, message: 'User not authenticated', data: { code: 'auth.notAuthenticated' } },
      },
      {
        name: 'no game id',
        middleware: canEditGame,
        req: { userId: p.owner.userId, user: { isAdmin: false } },
        expected: { statusCode: 400, message: 'Game ID is required', data: undefined },
      },
      {
        name: 'missing game',
        middleware: canEditGame,
        req: { userId: p.owner.userId, user: { isAdmin: false }, params: { id: `missing-${fixture.suffix}` } },
        expected: await serviceOutcome(() => assertGamePermission(p.owner, `missing-${fixture.suffix}`, OWNER_ADMIN)),
      },
      {
        name: 'stranger on private',
        middleware: canEditGame,
        req: { userId: p.stranger.userId, user: { isAdmin: false }, params: { id: fixture.games.private } },
        expected: {
          statusCode: 403,
          message: 'Only game owner or admins can perform this action',
          data: undefined,
        },
      },
      {
        name: 'archived',
        middleware: canEditGame,
        req: { userId: p.owner.userId, user: { isAdmin: false }, params: { gameId: fixture.games.archived } },
        expected: { statusCode: 400, message: 'Cannot modify archived games', data: undefined },
      },
      {
        name: 'results locked roster',
        middleware: canManageGameRoster,
        req: { userId: p.owner.userId, user: { isAdmin: false }, params: { id: fixture.games.resultsLocked } },
        expected: { statusCode: 400, message: 'errors.games.cannotEditResultsStarted', data: undefined },
      },
      {
        name: 'owner on public',
        middleware: canEditGame,
        req: { userId: p.owner.userId, user: { isAdmin: false }, body: { gameId: fixture.games.public } },
        expected: 'next',
      },
      {
        name: 'league owner via leagueSeasonId',
        middleware: canEditGame,
        req: {
          userId: p.leagueOwner.userId,
          user: { isAdmin: false },
          params: { leagueSeasonId: fixture.games.leagueFixture },
        },
        expected: 'next',
      },
    ];
    for (const testCase of middlewareCases) {
      const actual = await runMiddleware(testCase.middleware, testCase.req);
      try {
        assert.deepEqual(actual, testCase.expected);
      } catch {
        failures.push(
          `requireGamePermission ${testCase.name}: expected ${JSON.stringify(testCase.expected)}, got ${JSON.stringify(actual)}`,
        );
      }
    }
    console.log(`requireGamePermission middleware: ${middlewareCases.length} cases checked`);

    if (failures.length > 0) {
      throw new Error(`\n${failures.join('\n')}`);
    }
    console.log('agentPermissionMatrix.integration.test.ts: ok');
  } catch (error) {
    console.error(error);
    exitCode = 1;
  } finally {
    await prisma.user.deleteMany({ where: { id: inactiveUser.id } });
    await fixture.cleanup();
    await prisma.$disconnect();
    process.exit(exitCode);
  }
})();
