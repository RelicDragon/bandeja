/**
 * §12 backend QA (API / services). Run: DB_URL=... npx ts-node scripts/qa-allowUserInMultipleTeams.ts
 */
import {
  EntityType,
  LeagueParticipantType,
  ParticipantRole,
  PrismaClient,
  UserTeamMemberStatus,
  type PrismaClient as PrismaClientType,
} from '@prisma/client';
import { ApiError } from '../src/utils/ApiError';

function ensureDbUrl() {
  let url = process.env.DB_URL;
  if (!url) {
    throw new Error('Set DB_URL (e.g. postgresql://user:pass@host:5432/db?schema=padelpulse)');
  }
  if (!/[?&]schema=/.test(url)) {
    url += (url.includes('?') ? '&' : '?') + 'schema=padelpulse';
    process.env.DB_URL = url;
  }
}

async function expectApiError(
  p: Promise<unknown>,
  status: number,
  msgIncludes?: string,
): Promise<void> {
  try {
    await p;
    throw new Error(`expected ApiError ${status}, succeeded`);
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.statusCode !== status) {
        throw new Error(`expected status ${status}, got ${e.statusCode}: ${e.message}`);
      }
      if (msgIncludes && !e.message.includes(msgIncludes)) {
        throw new Error(`expected message containing "${msgIncludes}", got: ${e.message}`);
      }
      return;
    }
    throw e;
  }
}

function sortedRosterKey(userIds: string[]) {
  return [...userIds].sort().join(':');
}

function overlapGenGame(u1: string, u2: string, u3: string, u4: string) {
  const mkU = (id: string) => ({ id, level: 4, gender: 'MALE', firstName: 'T' });
  return {
    id: 'qa-gen-overlap',
    entityType: 'GAME',
    hasFixedTeams: true,
    allowUserInMultipleTeams: true,
    participants: [u1, u2, u3, u4].map((uid) => ({
      userId: uid,
      status: 'PLAYING',
      user: mkU(uid),
    })),
    fixedTeams: [
      {
        id: 'qa-ft1',
        teamNumber: 1,
        players: [
          { userId: u1, user: mkU(u1) },
          { userId: u2, user: mkU(u2) },
        ],
      },
      {
        id: 'qa-ft2',
        teamNumber: 2,
        players: [
          { userId: u1, user: mkU(u1) },
          { userId: u3, user: mkU(u3) },
        ],
      },
      {
        id: 'qa-ft3',
        teamNumber: 3,
        players: [
          { userId: u3, user: mkU(u3) },
          { userId: u4, user: mkU(u4) },
        ],
      },
    ],
    gameCourts: [{ courtId: 'qa-court', order: 0 }],
    genderTeams: 'ANY',
    ballsInGames: false,
    fixedNumberOfSets: 1,
    winnerOfGame: 'BY_SCORES_DELTA' as const,
    winnerOfMatch: 'BY_SCORES' as const,
    pointsPerWin: 1,
    pointsPerTie: 0,
    pointsPerLoose: 0,
  };
}

async function cleanupLeagueBranch(
  prisma: PrismaClientType,
  leagueId: string,
  seasonGameId: string,
  childGameIds: string[],
) {
  for (const gid of childGameIds) {
    await prisma.game.delete({ where: { id: gid } }).catch(() => undefined);
  }
  const rounds = await prisma.leagueRound.findMany({
    where: { leagueSeasonId: seasonGameId },
    select: { id: true },
  });
  for (const r of rounds) {
    await prisma.game.deleteMany({ where: { leagueRoundId: r.id } });
  }
  await prisma.leagueRound.deleteMany({ where: { leagueSeasonId: seasonGameId } });
  await prisma.leagueGroup.deleteMany({ where: { leagueSeasonId: seasonGameId } });
  await prisma.game.delete({ where: { id: seasonGameId } }).catch(() => undefined);
  await prisma.league.delete({ where: { id: leagueId } }).catch(() => undefined);
}

async function main() {
  ensureDbUrl();

  const { default: prisma } = await import('../src/config/database');
  const { GameTeamService } = await import('../src/services/gameTeam.service');
  const { GameUpdateService } = await import('../src/services/game/update.service');
  const { GameCreateService } = await import('../src/services/game/create.service');
  const { LeagueSyncService } = await import('../src/services/league/sync.service');
  const { createLeagueGame, createLeaguePlayoffGame } = await import('../src/services/league/gameCreation.util');
  const { TeamForRoundGeneration } = await import('../src/services/league/generation/TeamForRoundGeneration');
  const { applyUserTeamToFixedTeamsIfReady } = await import('../src/services/game/userTeamFixedTeams.service');
  const { removeUserFromGameFixedTeams } = await import('../src/services/game/fixedTeamsCleanup');
  const { calculateGameStandings } = await import('../src/services/results/generation/gameStandings');
  const { buildOpponentCounts } = await import('../src/services/results/generation/matchUtils');
  const { prismaGameToGenGame } = await import('../src/services/results/mapPrismaForGeneration');
  const { gameIncludeForRoundGeneration } = await import('../src/services/results/roundGenerationGameInclude');
  const { generateRatingRound } = await import('../src/services/results/generation/rating');
  const { generateEscaleraRound } = await import('../src/services/results/generation/escalera');
  const { generateWinnersCourtRound } = await import('../src/services/results/generation/winnersCourt');
  const { RoundGenerator } = await import('../src/services/results/generation/roundGenerator');
  const { GameReadinessService } = await import('../src/services/game/readiness.service');

  const city = await prisma.city.findFirst({ select: { id: true } });
  if (!city) throw new Error('no City row');

  const users = await prisma.user.findMany({ take: 4, select: { id: true } });
  if (users.length < 4) throw new Error('need at least 4 User rows');

  const [u1, u2, u3, u4] = users.map((u) => u.id);
  const ownerId = u1;

  const start = new Date(Date.now() + 86_400_000);
  const end = new Date(start.getTime() + 7_200_000);
  const createdGameIds: string[] = [];
  const userTeamIds: string[] = [];
  const leagueBranches: { leagueId: string; seasonGameId: string; childGameIds: string[] }[] = [];

  const mkGame = async (allowMulti: boolean) => {
    const g = await prisma.game.create({
      data: {
        entityType: EntityType.GAME,
        gameType: 'CLASSIC',
        cityId: city.id,
        startTime: start,
        endTime: end,
        maxParticipants: 4,
        minParticipants: 2,
        allowUserInMultipleTeams: allowMulti,
        hasFixedTeams: false,
        timeIsSet: true,
        participants: {
          create: [
            { userId: u1, role: ParticipantRole.OWNER },
            { userId: u2, role: ParticipantRole.PARTICIPANT },
            { userId: u3, role: ParticipantRole.PARTICIPANT },
            { userId: u4, role: ParticipantRole.PARTICIPANT },
          ],
        },
      },
    });
    createdGameIds.push(g.id);
    return g;
  };

  try {
    const gameFlagOff = await mkGame(false);
    await expectApiError(
      GameTeamService.setGameTeams(gameFlagOff.id, [
        { teamNumber: 1, playerIds: [u1, u2] },
        { teamNumber: 2, playerIds: [u1, u3] },
      ]),
      400,
      'multiple teams',
    );
    console.log('ok: setGameTeams overlap + flag off -> 400');

    const gameFlagOn = await mkGame(true);
    await GameTeamService.setGameTeams(gameFlagOn.id, [
      { teamNumber: 1, playerIds: [u1, u2] },
      { teamNumber: 2, playerIds: [u1, u3] },
    ]);
    console.log('ok: setGameTeams overlap + flag on -> 200');

    await expectApiError(
      GameTeamService.setGameTeams(gameFlagOn.id, [
        { teamNumber: 1, playerIds: [u1, u1] },
        { teamNumber: 2, playerIds: [u3, u4] },
      ]),
      400,
      'twice on the same team',
    );
    console.log('ok: same user twice on one team -> 400');

    await expectApiError(
      GameUpdateService.updateGame(
        gameFlagOn.id,
        { allowUserInMultipleTeams: false },
        ownerId,
        false,
      ),
      400,
      'Cannot require one team per player',
    );
    console.log('ok: toggle flag off while overlap -> 400');

    const g2 = await GameCreateService.createGame(
      {
        entityType: 'GAME',
        gameType: 'CLASSIC',
        cityId: city.id,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        maxParticipants: 2,
        allowUserInMultipleTeams: true,
        timeIsSet: true,
        participants: [],
      },
      ownerId,
      false,
    );
    createdGameIds.push(g2!.id);
    const g2db = await prisma.game.findUnique({
      where: { id: g2!.id },
      select: { allowUserInMultipleTeams: true, maxParticipants: true },
    });
    if (g2db?.allowUserInMultipleTeams !== false || g2db.maxParticipants !== 2) {
      throw new Error('create maxParticipants=2 should force allowUserInMultipleTeams false');
    }
    console.log('ok: create maxParticipants=2 forces flag false');

    const gameTwoSlots = await prisma.game.create({
      data: {
        entityType: EntityType.GAME,
        gameType: 'CLASSIC',
        cityId: city.id,
        startTime: start,
        endTime: end,
        maxParticipants: 4,
        minParticipants: 2,
        allowUserInMultipleTeams: true,
        hasFixedTeams: false,
        timeIsSet: true,
        participants: {
          create: [
            { userId: u1, role: ParticipantRole.OWNER },
            { userId: u2, role: ParticipantRole.PARTICIPANT },
          ],
        },
      },
    });
    createdGameIds.push(gameTwoSlots.id);
    await GameUpdateService.updateGame(
      gameTwoSlots.id,
      { maxParticipants: 2, allowUserInMultipleTeams: true },
      ownerId,
      false,
    );
    const mp2 = await prisma.game.findUnique({
      where: { id: gameTwoSlots.id },
      select: { allowUserInMultipleTeams: true, maxParticipants: true, hasFixedTeams: true },
    });
    if (mp2?.maxParticipants !== 2 || mp2.allowUserInMultipleTeams !== false || mp2.hasFixedTeams !== false) {
      throw new Error('update maxParticipants=2 should force flag false and hasFixedTeams false');
    }
    console.log('ok: update maxParticipants=2 forces flag false');

    const ut = await prisma.userTeam.create({
      data: {
        name: `QA userTeam ${Date.now()}`,
        ownerId: u1,
        size: 2,
        members: {
          create: [
            { userId: u1, status: UserTeamMemberStatus.ACCEPTED, isOwner: true },
            { userId: u2, status: UserTeamMemberStatus.ACCEPTED, isOwner: false },
          ],
        },
      },
    });
    userTeamIds.push(ut.id);

    const gUtOn = await mkGame(true);
    await GameTeamService.setGameTeams(gUtOn.id, [
      { teamNumber: 1, playerIds: [u1, u3] },
      { teamNumber: 2, playerIds: [] },
    ]);
    await applyUserTeamToFixedTeamsIfReady(gUtOn.id, ut.id);
    const t2on = await prisma.gameTeam.findFirst({
      where: { gameId: gUtOn.id, teamNumber: 2 },
      include: { players: true },
    });
    if (sortedRosterKey(t2on!.players.map((p) => p.userId)) !== sortedRosterKey([u1, u2])) {
      throw new Error('user-team auto: expected team 2 = user team roster');
    }
    console.log('ok: applyUserTeamToFixedTeamsIfReady with overlap when flag on');

    const gUtOff = await mkGame(false);
    await GameTeamService.setGameTeams(gUtOff.id, [
      { teamNumber: 1, playerIds: [u1, u3] },
      { teamNumber: 2, playerIds: [] },
    ]);
    await applyUserTeamToFixedTeamsIfReady(gUtOff.id, ut.id);
    const t2off = await prisma.gameTeam.findFirst({
      where: { gameId: gUtOff.id, teamNumber: 2 },
      include: { players: true },
    });
    if (t2off!.players.length !== 0) {
      throw new Error('user-team auto: should not fill team 2 when flag off (would duplicate u1)');
    }
    console.log('ok: applyUserTeamToFixedTeamsIfReady skips when flag off');

    const gRm = await mkGame(true);
    await GameTeamService.setGameTeams(gRm.id, [
      { teamNumber: 1, playerIds: [u1, u2] },
      { teamNumber: 2, playerIds: [u1, u3] },
    ]);
    await prisma.$transaction((tx) => removeUserFromGameFixedTeams(tx, gRm.id, u1));
    const u1Left = await prisma.gameTeamPlayer.count({
      where: { userId: u1, gameTeam: { gameId: gRm.id } },
    });
    if (u1Left !== 0) throw new Error('removeUserFromGameFixedTeams should drop u1 from every team');
    console.log('ok: removeUserFromGameFixedTeams clears user from all fixed teams');

    const gDup = await mkGame(true);
    await GameTeamService.setGameTeams(gDup.id, [
      { teamNumber: 1, playerIds: [u1, u2] },
      { teamNumber: 2, playerIds: [u3, u4] },
    ]);
    const gt1 = await prisma.gameTeam.findFirst({ where: { gameId: gDup.id, teamNumber: 1 } });
    let dupDb = false;
    const prismaQuiet = new PrismaClient({ log: [] });
    try {
      await prismaQuiet.gameTeamPlayer.create({ data: { gameTeamId: gt1!.id, userId: u1 } });
    } catch (e: unknown) {
      dupDb = typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
    } finally {
      await prismaQuiet.$disconnect();
    }
    if (!dupDb) throw new Error('expected P2002 duplicate (gameTeamId, userId)');
    console.log('ok: GameTeamPlayer unique (same team, same user)');

    const opp = buildOpponentCounts([
      {
        id: 'r0',
        matches: [
          {
            id: 'm0',
            teamA: [u1, u2],
            teamB: [u1, u3],
            sets: [],
          },
        ],
      },
    ] as never);
    if (!(opp instanceof Map)) throw new Error('buildOpponentCounts map');
    console.log('ok: buildOpponentCounts tolerates shared player across sides');

    const mkU = (id: string) => ({ id, level: 4, gender: 'MALE', firstName: 'T' });
    const stGame = {
      id: 'gen-standings',
      entityType: 'GAME',
      hasFixedTeams: true,
      allowUserInMultipleTeams: true,
      winnerOfGame: 'BY_MATCHES_WON' as const,
      winnerOfMatch: 'BY_SCORES' as const,
      participants: [u1, u2, u3, u4].map((uid) => ({
        userId: uid,
        status: 'PLAYING',
        user: mkU(uid),
      })),
      fixedTeams: [
        {
          id: 'ft-a',
          teamNumber: 1,
          players: [
            { userId: u1, user: mkU(u1) },
            { userId: u2, user: mkU(u2) },
          ],
        },
        {
          id: 'ft-b',
          teamNumber: 2,
          players: [
            { userId: u1, user: mkU(u1) },
            { userId: u3, user: mkU(u3) },
          ],
        },
      ],
    };
    const stRounds = [
      {
        id: 'round-s',
        matches: [
          {
            id: 'm-s',
            teamA: [u1, u2],
            teamB: [u3, u4],
            sets: [{ teamA: 6, teamB: 4 }],
          },
        ],
      },
    ];
    const standings = calculateGameStandings(stGame as never, stRounds as never, 'BY_MATCHES_WON');
    if (standings.length !== 4) throw new Error(`calculateGameStandings expected 4 rows, got ${standings.length}`);
    const placesById = new Map(standings.map((s) => [s.user.id, s.place]));
    for (const [uid, place] of placesById) {
      if (typeof place !== 'number' || place < 1) {
        throw new Error(`calculateGameStandings: player ${uid} has invalid place ${place}`);
      }
    }
    const u1Place = placesById.get(u1);
    const u3Place = placesById.get(u3);
    if (u1Place === undefined || u3Place === undefined) {
      throw new Error('calculateGameStandings: missing place for shared player u1 or u3');
    }
    if (u1Place > u3Place) {
      throw new Error(
        `calculateGameStandings: shared player u1 should hold the best of its team ranks (got ${u1Place} vs u3 ${u3Place})`
      );
    }
    console.log('ok: calculateGameStandings fixed teams + shared player (place is best-of)');

    const initSets = [{ teamA: 0, teamB: 0, isTieBreak: false }];
    const genOv = overlapGenGame(u1, u2, u3, u4);
    if (generateRatingRound({ ...genOv, matchGenerationType: 'RATING' } as never, [], initSets).length < 1) {
      throw new Error('generateRatingRound (fixed overlap) should return matches');
    }
    if (generateEscaleraRound({ ...genOv, matchGenerationType: 'ESCALERA' } as never, [], initSets).length < 1) {
      throw new Error('generateEscaleraRound (fixed overlap) should return matches');
    }
    if (
      (await generateWinnersCourtRound({ ...genOv, matchGenerationType: 'WINNERS_COURT' } as never, [], initSets))
        .length < 1
    ) {
      throw new Error('generateWinnersCourtRound (fixed overlap) should return matches');
    }
    const rg = new RoundGenerator({
      game: { ...genOv, matchGenerationType: 'RATING' } as never,
      rounds: [],
      roundNumber: 1,
      fixedNumberOfSets: 1,
    });
    if ((await rg.generateRound()).length < 1) {
      throw new Error('RoundGenerator RATING (fixed overlap) should return matches');
    }
    console.log('ok: RATING / ESCALERA / WINNERS_COURT / RoundGenerator smoke (overlap GenGame)');

    const gPrismaGen = await mkGame(true);
    await GameTeamService.setGameTeams(gPrismaGen.id, [
      { teamNumber: 1, playerIds: [u1, u2] },
      { teamNumber: 2, playerIds: [u1, u3] },
    ]);
    const forGen = await prisma.game.findUnique({
      where: { id: gPrismaGen.id },
      include: gameIncludeForRoundGeneration,
    });
    if (!forGen) throw new Error('game for prismaGameToGenGame missing');
    const mapped = prismaGameToGenGame(forGen);
    if (!mapped.allowUserInMultipleTeams || (mapped.fixedTeams?.length ?? 0) !== 2) {
      throw new Error('prismaGameToGenGame should expose overlap flag and fixed teams');
    }
    console.log('ok: prismaGameToGenGame');

    const gReady = await mkGame(true);
    await GameTeamService.setGameTeams(gReady.id, [
      { teamNumber: 1, playerIds: [u1, u2] },
      { teamNumber: 2, playerIds: [u1, u3] },
    ]);
    await prisma.gameParticipant.update({
      where: { userId_gameId: { gameId: gReady.id, userId: u2 } },
      data: { status: 'NON_PLAYING' },
    });
    const readiness = await GameReadinessService.calculateGameReadiness(gReady.id);
    if (readiness.teamsReady !== false) {
      throw new Error('teamsReady should be false when a fixed-team player is not PLAYING');
    }
    console.log('ok: GameReadinessService teamsReady false (fixed player NON_PLAYING)');

    const league = await prisma.league.create({
      data: {
        name: `QA allowUserInMultipleTeams league ${Date.now()}`,
        cityId: city.id,
        hasFixedTeams: true,
      },
    });
    const seasonGameRow = await prisma.game.create({
      data: {
        entityType: EntityType.LEAGUE_SEASON,
        gameType: 'CLASSIC',
        cityId: city.id,
        startTime: start,
        endTime: end,
        maxParticipants: 4,
        minParticipants: 2,
        hasFixedTeams: true,
        allowUserInMultipleTeams: true,
        timeIsSet: true,
        participants: {
          create: [
            { userId: u1, role: ParticipantRole.OWNER },
            { userId: u2, role: ParticipantRole.PARTICIPANT },
            { userId: u3, role: ParticipantRole.PARTICIPANT },
            { userId: u4, role: ParticipantRole.PARTICIPANT },
          ],
        },
        fixedTeams: {
          create: [
            {
              teamNumber: 1,
              players: { create: [{ userId: u1 }, { userId: u2 }] },
            },
            {
              teamNumber: 2,
              players: { create: [{ userId: u1 }, { userId: u3 }] },
            },
          ],
        },
      },
    });
    const seasonId = seasonGameRow.id;
    await prisma.leagueSeason.create({
      data: {
        id: seasonId,
        leagueId: league.id,
        orderIndex: 0,
      },
    });
    const leagueRound = await prisma.leagueRound.create({
      data: {
        leagueSeasonId: seasonId,
        orderIndex: 0,
      },
    });
    const leagueGroup = await prisma.leagueGroup.create({
      data: {
        leagueSeasonId: seasonId,
        name: `QA group ${Date.now()}`,
      },
    });

    await LeagueSyncService.syncLeagueParticipants(seasonId);

    await prisma.leagueParticipant.updateMany({
      where: { leagueSeasonId: seasonId, participantType: LeagueParticipantType.TEAM },
      data: { currentGroupId: leagueGroup.id },
    });

    await TeamForRoundGeneration.generateGamesForRound(leagueRound.id);
    const genRoundGames = await prisma.game.findMany({
      where: { leagueRoundId: leagueRound.id, entityType: EntityType.LEAGUE },
      select: { id: true },
    });
    if (genRoundGames.length < 1) {
      throw new Error('TeamForRoundGeneration (overlap + flag on) should create at least one game');
    }
    console.log('ok: TeamForRoundGeneration with overlapping fixed teams + flag on');

    const teamParticipants = await prisma.leagueParticipant.findMany({
      where: { leagueSeasonId: seasonId, participantType: LeagueParticipantType.TEAM },
      include: { leagueTeam: { include: { players: true } } },
    });
    if (teamParticipants.length !== 2) {
      throw new Error(`league sync: expected 2 TEAM participants, got ${teamParticipants.length}`);
    }
    const rosterKeys = teamParticipants
      .map((p) => sortedRosterKey(p.leagueTeam!.players.map((x) => x.userId)))
      .sort();
    const wantRosters = [sortedRosterKey([u1, u2]), sortedRosterKey([u1, u3])].sort();
    if (rosterKeys[0] !== wantRosters[0] || rosterKeys[1] !== wantRosters[1]) {
      throw new Error(`league sync: bad rosters ${JSON.stringify(rosterKeys)}`);
    }
    if (new Set(teamParticipants.map((p) => p.leagueTeamId)).size !== 2) {
      throw new Error('league sync: expected two distinct LeagueTeam rows');
    }
    console.log('ok: syncLeagueParticipants with overlapping season fixed teams -> 2 correct TEAM rows');

    const seasonForApi = await prisma.game.findUnique({ where: { id: seasonId } });
    if (!seasonForApi) throw new Error('season game not found');

    const leagueMatch = await createLeagueGame({
      leagueRoundId: leagueRound.id,
      seasonGame: seasonForApi,
      leagueSeasonId: seasonId,
      team1PlayerIds: [u1, u2],
      team2PlayerIds: [u1, u3],
    });
    const leagueChildFlags = await prisma.game.findUnique({
      where: { id: leagueMatch.id },
      select: { allowUserInMultipleTeams: true, entityType: true, hasFixedTeams: true },
    });
    if (
      !leagueChildFlags?.allowUserInMultipleTeams ||
      !leagueChildFlags.hasFixedTeams ||
      leagueChildFlags.entityType !== EntityType.LEAGUE
    ) {
      throw new Error('createLeagueGame should copy allowUserInMultipleTeams onto child LEAGUE game');
    }
    console.log('ok: createLeagueGame overlapping teams when season flag on -> 200, flag copied');

    await LeagueSyncService.syncLeagueParticipants(seasonId);
    const teamParticipants2 = await prisma.leagueParticipant.findMany({
      where: { leagueSeasonId: seasonId, participantType: LeagueParticipantType.TEAM },
    });
    if (teamParticipants2.length !== 2) {
      throw new Error(`re-sync after round game: expected 2 TEAM participants, got ${teamParticipants2.length}`);
    }
    console.log('ok: sync after overlapping round fixed teams -> still 2 TEAM rows (no reuse corruption)');

    leagueBranches.push({
      leagueId: league.id,
      seasonGameId: seasonId,
      childGameIds: [...genRoundGames.map((g) => g.id), leagueMatch.id],
    });

    const leagueNeg = await prisma.league.create({
      data: {
        name: `QA league overlap neg ${Date.now()}`,
        cityId: city.id,
        hasFixedTeams: false,
      },
    });
    const seasonOff = await prisma.game.create({
      data: {
        entityType: EntityType.LEAGUE_SEASON,
        gameType: 'CLASSIC',
        cityId: city.id,
        startTime: start,
        endTime: end,
        maxParticipants: 4,
        minParticipants: 2,
        hasFixedTeams: false,
        allowUserInMultipleTeams: false,
        timeIsSet: true,
        participants: {
          create: [
            { userId: u1, role: ParticipantRole.OWNER },
            { userId: u2, role: ParticipantRole.PARTICIPANT },
            { userId: u3, role: ParticipantRole.PARTICIPANT },
            { userId: u4, role: ParticipantRole.PARTICIPANT },
          ],
        },
      },
    });
    await prisma.leagueSeason.create({
      data: { id: seasonOff.id, leagueId: leagueNeg.id, orderIndex: 0 },
    });
    const roundNeg = await prisma.leagueRound.create({
      data: { leagueSeasonId: seasonOff.id, orderIndex: 0 },
    });
    const seasonOffRow = await prisma.game.findUnique({ where: { id: seasonOff.id } });
    if (!seasonOffRow) throw new Error('season off missing');
    await expectApiError(
      createLeagueGame({
        leagueRoundId: roundNeg.id,
        seasonGame: seasonOffRow,
        leagueSeasonId: seasonOff.id,
        team1PlayerIds: [u1, u2],
        team2PlayerIds: [u1, u3],
      }),
      400,
      'share participants',
    );
    console.log('ok: createLeagueGame overlap + season flag off -> 400');

    leagueBranches.push({ leagueId: leagueNeg.id, seasonGameId: seasonOff.id, childGameIds: [] });

    const leagueGenReject = await prisma.league.create({
      data: {
        name: `QA round gen reject ${Date.now()}`,
        cityId: city.id,
        hasFixedTeams: true,
      },
    });
    const seasonReject = await prisma.game.create({
      data: {
        entityType: EntityType.LEAGUE_SEASON,
        gameType: 'CLASSIC',
        cityId: city.id,
        startTime: start,
        endTime: end,
        maxParticipants: 4,
        minParticipants: 2,
        hasFixedTeams: true,
        allowUserInMultipleTeams: false,
        timeIsSet: true,
        participants: {
          create: [
            { userId: u1, role: ParticipantRole.OWNER },
            { userId: u2, role: ParticipantRole.PARTICIPANT },
            { userId: u3, role: ParticipantRole.PARTICIPANT },
            { userId: u4, role: ParticipantRole.PARTICIPANT },
          ],
        },
        fixedTeams: {
          create: [
            { teamNumber: 1, players: { create: [{ userId: u1 }, { userId: u2 }] } },
            { teamNumber: 2, players: { create: [{ userId: u3 }, { userId: u4 }] } },
          ],
        },
      },
    });
    await prisma.leagueSeason.create({
      data: { id: seasonReject.id, leagueId: leagueGenReject.id, orderIndex: 0 },
    });
    const groupReject = await prisma.leagueGroup.create({
      data: { leagueSeasonId: seasonReject.id, name: `QA rej ${Date.now()}` },
    });
    const roundReject = await prisma.leagueRound.create({
      data: { leagueSeasonId: seasonReject.id, orderIndex: 0 },
    });
    await LeagueSyncService.syncLeagueParticipants(seasonReject.id);
    const teamPartsReject = await prisma.leagueParticipant.findMany({
      where: { leagueSeasonId: seasonReject.id, participantType: LeagueParticipantType.TEAM },
      include: { leagueTeam: { include: { players: true } } },
    });
    const ltOverlap = teamPartsReject.find(
      (p) => sortedRosterKey(p.leagueTeam!.players.map((x) => x.userId)) === sortedRosterKey([u3, u4]),
    );
    if (!ltOverlap?.leagueTeam) throw new Error('expected [u3,u4] league team');
    await prisma.leagueTeamPlayer.deleteMany({ where: { leagueTeamId: ltOverlap.leagueTeam.id } });
    await prisma.leagueTeamPlayer.createMany({
      data: [
        { leagueTeamId: ltOverlap.leagueTeam.id, userId: u1 },
        { leagueTeamId: ltOverlap.leagueTeam.id, userId: u3 },
      ],
    });
    await prisma.leagueParticipant.updateMany({
      where: { leagueSeasonId: seasonReject.id, participantType: LeagueParticipantType.TEAM },
      data: { currentGroupId: groupReject.id },
    });
    await expectApiError(
      TeamForRoundGeneration.generateGamesForRound(roundReject.id),
      400,
      'cannot share players',
    );
    console.log('ok: TeamForRoundGeneration rejects overlap when season flag off');

    leagueBranches.push({
      leagueId: leagueGenReject.id,
      seasonGameId: seasonReject.id,
      childGameIds: [],
    });

    const leaguePlayoff = await prisma.league.create({
      data: {
        name: `QA playoff overlap ${Date.now()}`,
        cityId: city.id,
        hasFixedTeams: true,
      },
    });
    const seasonPlayoff = await prisma.game.create({
      data: {
        entityType: EntityType.LEAGUE_SEASON,
        gameType: 'CLASSIC',
        cityId: city.id,
        startTime: start,
        endTime: end,
        maxParticipants: 4,
        minParticipants: 2,
        hasFixedTeams: false,
        allowUserInMultipleTeams: true,
        timeIsSet: true,
        participants: {
          create: [
            { userId: u1, role: ParticipantRole.OWNER },
            { userId: u2, role: ParticipantRole.PARTICIPANT },
            { userId: u3, role: ParticipantRole.PARTICIPANT },
            { userId: u4, role: ParticipantRole.PARTICIPANT },
          ],
        },
      },
    });
    await prisma.leagueSeason.create({
      data: { id: seasonPlayoff.id, leagueId: leaguePlayoff.id, orderIndex: 0 },
    });
    const roundPlayoff = await prisma.leagueRound.create({
      data: { leagueSeasonId: seasonPlayoff.id, orderIndex: 0 },
    });
    const seasonPlayoffRow = await prisma.game.findUnique({ where: { id: seasonPlayoff.id } });
    if (!seasonPlayoffRow) throw new Error('season playoff missing');
    const playoffGame = await createLeaguePlayoffGame({
      leagueRoundId: roundPlayoff.id,
      leagueSeasonId: seasonPlayoff.id,
      seasonGame: seasonPlayoffRow,
      gameType: 'AMERICANO',
      participantUserIds: [u1, u2, u3],
      teams: [
        [u1, u2],
        [u1, u3],
      ],
    });
    if (!playoffGame.allowUserInMultipleTeams || !playoffGame.hasFixedTeams) {
      throw new Error('playoff game should copy allowUserInMultipleTeams and fixed teams');
    }
    leagueBranches.push({
      leagueId: leaguePlayoff.id,
      seasonGameId: seasonPlayoff.id,
      childGameIds: [playoffGame.id],
    });
    console.log('ok: createLeaguePlayoffGame overlapping teams + season flag on');

    const leaguePlayoffOff = await prisma.league.create({
      data: {
        name: `QA playoff reject ${Date.now()}`,
        cityId: city.id,
        hasFixedTeams: true,
      },
    });
    const seasonPlayoffOff = await prisma.game.create({
      data: {
        entityType: EntityType.LEAGUE_SEASON,
        gameType: 'CLASSIC',
        cityId: city.id,
        startTime: start,
        endTime: end,
        maxParticipants: 4,
        minParticipants: 2,
        hasFixedTeams: false,
        allowUserInMultipleTeams: false,
        timeIsSet: true,
        participants: {
          create: [
            { userId: u1, role: ParticipantRole.OWNER },
            { userId: u2, role: ParticipantRole.PARTICIPANT },
            { userId: u3, role: ParticipantRole.PARTICIPANT },
            { userId: u4, role: ParticipantRole.PARTICIPANT },
          ],
        },
      },
    });
    await prisma.leagueSeason.create({
      data: { id: seasonPlayoffOff.id, leagueId: leaguePlayoffOff.id, orderIndex: 0 },
    });
    const roundPlayoffOff = await prisma.leagueRound.create({
      data: { leagueSeasonId: seasonPlayoffOff.id, orderIndex: 0 },
    });
    const seasonPlayoffOffRow = await prisma.game.findUnique({ where: { id: seasonPlayoffOff.id } });
    if (!seasonPlayoffOffRow) throw new Error('season playoff off missing');
    await expectApiError(
      createLeaguePlayoffGame({
        leagueRoundId: roundPlayoffOff.id,
        leagueSeasonId: seasonPlayoffOff.id,
        seasonGame: seasonPlayoffOffRow,
        gameType: 'AMERICANO',
        participantUserIds: [u1, u2, u3],
        teams: [
          [u1, u2],
          [u1, u3],
        ],
      }),
      400,
      'share participants',
    );
    leagueBranches.push({
      leagueId: leaguePlayoffOff.id,
      seasonGameId: seasonPlayoffOff.id,
      childGameIds: [],
    });
    console.log('ok: createLeaguePlayoffGame overlap + season flag off -> 400');

    console.log('all §12 backend checks in this script passed');
  } finally {
    for (const utId of userTeamIds) {
      await prisma.userTeam.delete({ where: { id: utId } }).catch(() => undefined);
    }
    for (const b of leagueBranches) {
      await cleanupLeagueBranch(prisma, b.leagueId, b.seasonGameId, b.childGameIds);
    }
    for (const id of [...createdGameIds].reverse()) {
      await prisma.game.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
