/**
 * QA: TeamForRoundGeneration (fixed-teams league rounds). Run:
 *   DB_URL=... npx ts-node scripts/qa-leagueRoundGeneration.ts
 */
import {
  EntityType,
  LeagueParticipantType,
  ParticipantRole,
  RoundType,
  type PrismaClient,
} from '@prisma/client';
import { TeamForRoundGeneration } from '../src/services/league/generation/TeamForRoundGeneration';
import { matchupKeyFromSigs, teamPlayerSig } from '../src/services/league/generation/fixedTeamsRoundMatching';

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

async function cleanupLeagueBranch(
  prisma: PrismaClient,
  leagueId: string,
  seasonGameId: string,
) {
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

function matchupKeyFromGameTeams(
  aUserIds: string[],
  bUserIds: string[],
): string {
  return matchupKeyFromSigs(teamPlayerSig(aUserIds), teamPlayerSig(bUserIds));
}

async function matchupKeysForRound(prisma: PrismaClient, leagueRoundId: string): Promise<string[]> {
  const games = await prisma.game.findMany({
    where: { leagueRoundId, entityType: EntityType.LEAGUE },
    include: {
      fixedTeams: {
        orderBy: { teamNumber: 'asc' },
        include: { players: { select: { userId: true } } },
      },
    },
  });
  const keys: string[] = [];
  for (const g of games) {
    if (g.fixedTeams.length < 2) continue;
    const p0 = g.fixedTeams[0].players.map((p) => p.userId).filter(Boolean);
    const p1 = g.fixedTeams[1].players.map((p) => p.userId).filter(Boolean);
    if (p0.length !== 2 || p1.length !== 2) continue;
    keys.push(matchupKeyFromGameTeams(p0, p1));
  }
  return keys;
}

async function assignAllTeamParticipantsToGroup(
  prisma: PrismaClient,
  seasonId: string,
  groupId: string,
) {
  await prisma.leagueParticipant.updateMany({
    where: { leagueSeasonId: seasonId, participantType: LeagueParticipantType.TEAM },
    data: { currentGroupId: groupId },
  });
}

type Branch = { leagueId: string; seasonId: string };

async function createFixedTeamLeague(
  prisma: PrismaClient,
  cityId: string,
  teamRosters: string[][],
  allowUserInMultipleTeams: boolean,
  start: Date,
  end: Date,
): Promise<Branch> {
  const userIds = [...new Set(teamRosters.flat())];
  if (userIds.length !== teamRosters.flat().length) {
    throw new Error('createFixedTeamLeague: each user must appear once (disjoint rosters)');
  }

  const league = await prisma.league.create({
    data: {
      name: `QA league round gen ${Date.now()}`,
      cityId,
      hasFixedTeams: true,
    },
  });

  const seasonGameRow = await prisma.game.create({
    data: {
      entityType: EntityType.LEAGUE_SEASON,
      gameType: 'CLASSIC',
      cityId,
      startTime: start,
      endTime: end,
      maxParticipants: 4,
      minParticipants: 2,
      hasFixedTeams: true,
      allowUserInMultipleTeams,
      timeIsSet: true,
      participants: {
        create: userIds.map((userId, i) => ({
          userId,
          role: i === 0 ? ParticipantRole.OWNER : ParticipantRole.PARTICIPANT,
        })),
      },
      fixedTeams: {
        create: teamRosters.map((pair, idx) => ({
          teamNumber: idx + 1,
          players: { create: pair.map((userId) => ({ userId })) },
        })),
      },
    },
  });

  await prisma.leagueSeason.create({
    data: {
      id: seasonGameRow.id,
      leagueId: league.id,
      orderIndex: 0,
    },
  });

  return { leagueId: league.id, seasonId: seasonGameRow.id };
}

/** `teamCount` disjoint pairs from `userRow` in order. */
function buildDisjointTeams(userRow: { id: string }[], teamCount: number): string[][] {
  const need = teamCount * 2;
  if (userRow.length < need) {
    throw new Error(`buildDisjointTeams: need ${need} users for ${teamCount} teams, have ${userRow.length}`);
  }
  const teams: string[][] = [];
  for (let i = 0; i < teamCount; i++) {
    teams.push([userRow[i * 2]!.id, userRow[i * 2 + 1]!.id]);
  }
  return teams;
}

async function assertFullSingleRoundRobin(
  prisma: PrismaClient,
  label: string,
  teamCount: number,
  seasonId: string,
) {
  const n = teamCount;
  const roundsNeeded = n % 2 === 0 ? n - 1 : n;
  const gamesPerRound = Math.floor(n / 2);
  const expectedUniquePairings = (n * (n - 1)) / 2;

  const allKeys = new Set<string>();
  for (let o = 0; o < roundsNeeded; o++) {
    const round = await prisma.leagueRound.create({
      data: { leagueSeasonId: seasonId, orderIndex: o, roundType: RoundType.REGULAR },
    });
    await TeamForRoundGeneration.generateGamesForRound(round.id);
    const keys = await matchupKeysForRound(prisma, round.id);
    if (keys.length !== gamesPerRound) {
      throw new Error(`${label} round ${o}: expected ${gamesPerRound} games, got ${keys.length}`);
    }
    for (const k of keys) {
      if (allKeys.has(k)) {
        throw new Error(`${label}: duplicate matchup ${k} across rounds (round index ${o})`);
      }
      allKeys.add(k);
    }
  }
  if (allKeys.size !== expectedUniquePairings) {
    throw new Error(`${label}: expected ${expectedUniquePairings} unique pairings, got ${allKeys.size}`);
  }
  console.log(`ok: ${label} — ${n} teams, ${roundsNeeded} rounds, ${allKeys.size} distinct matchups`);
}

async function main() {
  ensureDbUrl();
  const { default: prisma } = await import('../src/config/database');
  const { LeagueSyncService } = await import('../src/services/league/sync.service');

  const city = await prisma.city.findFirst({ select: { id: true } });
  if (!city) throw new Error('no City row');

  const users = await prisma.user.findMany({ take: 50, select: { id: true }, orderBy: { id: 'asc' } });
  if (users.length < 48) throw new Error('need at least 48 User rows (for 24-team league QA)');

  const uid = (i: number) => users[i]!.id;
  const start = new Date(Date.now() + 86_400_000);
  const end = new Date(start.getTime() + 7_200_000);
  const branches: Branch[] = [];

  try {
    // --- 1) Pure round-robin: 4 teams, 3 rounds → 6 distinct pairings ---
    {
      const teams = [
        [uid(0), uid(1)],
        [uid(2), uid(3)],
        [uid(4), uid(5)],
        [uid(6), uid(7)],
      ];
      const { leagueId, seasonId } = await createFixedTeamLeague(
        prisma,
        city.id,
        teams,
        false,
        start,
        end,
      );
      branches.push({ leagueId, seasonId });

      const group = await prisma.leagueGroup.create({
        data: { leagueSeasonId: seasonId, name: `QA rr4 ${Date.now()}` },
      });
      await LeagueSyncService.syncLeagueParticipants(seasonId);
      await assignAllTeamParticipantsToGroup(prisma, seasonId, group.id);

      const allKeys = new Set<string>();
      for (let o = 0; o < 3; o++) {
        const round = await prisma.leagueRound.create({
          data: { leagueSeasonId: seasonId, orderIndex: o, roundType: RoundType.REGULAR },
        });
        await TeamForRoundGeneration.generateGamesForRound(round.id);
        const keys = await matchupKeysForRound(prisma, round.id);
        if (keys.length !== 2) {
          throw new Error(`pure RR round ${o}: expected 2 games, got ${keys.length}`);
        }
        for (const k of keys) {
          if (allKeys.has(k)) throw new Error(`pure RR: duplicate matchup ${k} across rounds`);
          allKeys.add(k);
        }
      }
      if (allKeys.size !== 6) {
        throw new Error(`pure RR: expected 6 unique matchups, got ${allKeys.size}`);
      }
      console.log('ok: pure round-robin 4 teams × 3 rounds → 6 distinct pairings');
    }

    // --- 2) PLAYOFF round does not count toward REGULAR slot ---
    {
      const teams = [
        [uid(0), uid(1)],
        [uid(2), uid(3)],
        [uid(4), uid(5)],
        [uid(6), uid(7)],
      ];
      const { leagueId, seasonId } = await createFixedTeamLeague(
        prisma,
        city.id,
        teams,
        false,
        start,
        end,
      );
      branches.push({ leagueId, seasonId });

      const group = await prisma.leagueGroup.create({
        data: { leagueSeasonId: seasonId, name: `QA playoff ${Date.now()}` },
      });
      await LeagueSyncService.syncLeagueParticipants(seasonId);
      await assignAllTeamParticipantsToGroup(prisma, seasonId, group.id);

      const r0 = await prisma.leagueRound.create({
        data: { leagueSeasonId: seasonId, orderIndex: 0, roundType: RoundType.REGULAR },
      });
      await TeamForRoundGeneration.generateGamesForRound(r0.id);
      const k0 = (await matchupKeysForRound(prisma, r0.id)).sort().join(';');

      await prisma.leagueRound.create({
        data: { leagueSeasonId: seasonId, orderIndex: 1, roundType: RoundType.PLAYOFF },
      });

      const r2 = await prisma.leagueRound.create({
        data: { leagueSeasonId: seasonId, orderIndex: 2, roundType: RoundType.REGULAR },
      });
      await TeamForRoundGeneration.generateGamesForRound(r2.id);
      const keysAfterGap = await matchupKeysForRound(prisma, r2.id);

      const rAlt = await prisma.leagueRound.create({
        data: { leagueSeasonId: seasonId, orderIndex: 3, roundType: RoundType.REGULAR },
      });
      await TeamForRoundGeneration.generateGamesForRound(rAlt.id);
      const keysAlt = await matchupKeysForRound(prisma, rAlt.id);

      const r1solo = await prisma.leagueRound.create({
        data: { leagueSeasonId: seasonId, orderIndex: 4, roundType: RoundType.REGULAR },
      });
      await TeamForRoundGeneration.generateGamesForRound(r1solo.id);
      const keysSolo = await matchupKeysForRound(prisma, r1solo.id);

      if (keysAfterGap.sort().join(';') === k0) {
        throw new Error('expected REGULAR after PLAYOFF to use slot 1, not repeat slot 0');
      }
      if (keysAlt.sort().join(';') === keysAfterGap.sort().join(';')) {
        throw new Error('expected different pairings for consecutive REGULAR rounds');
      }
      if (keysSolo.length !== 2) throw new Error('expected 2 games on third REGULAR round');
      console.log('ok: PLAYOFF round ignored for REGULAR RR slot indexing');
    }

    // --- 3) New team mid-season: adaptive matching, new pairings vs incumbents ---
    {
      const teams = [
        [uid(0), uid(1)],
        [uid(2), uid(3)],
        [uid(4), uid(5)],
        [uid(6), uid(7)],
      ];
      const { leagueId, seasonId } = await createFixedTeamLeague(
        prisma,
        city.id,
        teams,
        false,
        start,
        end,
      );
      branches.push({ leagueId, seasonId });

      const group = await prisma.leagueGroup.create({
        data: { leagueSeasonId: seasonId, name: `QA add5 ${Date.now()}` },
      });
      await LeagueSyncService.syncLeagueParticipants(seasonId);
      await assignAllTeamParticipantsToGroup(prisma, seasonId, group.id);

      const round0 = await prisma.leagueRound.create({
        data: { leagueSeasonId: seasonId, orderIndex: 0, roundType: RoundType.REGULAR },
      });
      await TeamForRoundGeneration.generateGamesForRound(round0.id);
      const keysR0 = new Set(await matchupKeysForRound(prisma, round0.id));

      await prisma.gameTeam.create({
        data: {
          gameId: seasonId,
          teamNumber: 5,
          players: { create: [{ userId: uid(8) }, { userId: uid(9) }] },
        },
      });
      await prisma.gameParticipant.create({
        data: { gameId: seasonId, userId: uid(8), role: ParticipantRole.PARTICIPANT, status: 'PLAYING' },
      });
      await prisma.gameParticipant.create({
        data: { gameId: seasonId, userId: uid(9), role: ParticipantRole.PARTICIPANT, status: 'PLAYING' },
      });
      await LeagueSyncService.syncLeagueParticipants(seasonId);
      await assignAllTeamParticipantsToGroup(prisma, seasonId, group.id);

      const newSig = teamPlayerSig([uid(8), uid(9)]);
      const round1 = await prisma.leagueRound.create({
        data: { leagueSeasonId: seasonId, orderIndex: 1, roundType: RoundType.REGULAR },
      });
      await TeamForRoundGeneration.generateGamesForRound(round1.id);
      const gamesR1 = await prisma.game.findMany({
        where: { leagueRoundId: round1.id, entityType: EntityType.LEAGUE },
        include: {
          fixedTeams: {
            orderBy: { teamNumber: 'asc' },
            include: { players: { select: { userId: true } } },
          },
        },
      });
      if (gamesR1.length !== 2) {
        throw new Error(`5 teams: expected 2 games (one bye), got ${gamesR1.length}`);
      }
      let newTeamSides = 0;
      for (const g of gamesR1) {
        for (const ft of g.fixedTeams) {
          const sig = teamPlayerSig(ft.players.map((p) => p.userId));
          if (sig === newSig) newTeamSides++;
        }
      }
      if (newTeamSides !== 1) {
        throw new Error('expected new team in exactly one match this round');
      }
      const keysR1 = await matchupKeysForRound(prisma, round1.id);
      for (const k of keysR1) {
        if (keysR0.has(k)) {
          throw new Error(`add team: round 1 repeated matchup from round 0: ${k}`);
        }
      }
      console.log('ok: fifth team joins — 2 matches, new team plays, no repeat of R0 pairings');
    }

    // --- 4) Drop team: continue with 3 teams ---
    {
      const teams = [
        [uid(0), uid(1)],
        [uid(2), uid(3)],
        [uid(4), uid(5)],
        [uid(6), uid(7)],
      ];
      const { leagueId, seasonId } = await createFixedTeamLeague(
        prisma,
        city.id,
        teams,
        false,
        start,
        end,
      );
      branches.push({ leagueId, seasonId });

      const group = await prisma.leagueGroup.create({
        data: { leagueSeasonId: seasonId, name: `QA drop ${Date.now()}` },
      });
      await LeagueSyncService.syncLeagueParticipants(seasonId);
      await assignAllTeamParticipantsToGroup(prisma, seasonId, group.id);

      const r0 = await prisma.leagueRound.create({
        data: { leagueSeasonId: seasonId, orderIndex: 0, roundType: RoundType.REGULAR },
      });
      await TeamForRoundGeneration.generateGamesForRound(r0.id);
      const played = new Set(await matchupKeysForRound(prisma, r0.id));

      const dropUserPair = [uid(6), uid(7)].sort();
      const teamParts = await prisma.leagueParticipant.findMany({
        where: { leagueSeasonId: seasonId, participantType: LeagueParticipantType.TEAM },
        include: { leagueTeam: { include: { players: { select: { userId: true } } } } },
      });
      const dropLp = teamParts.find((p) => {
        const ids = (p.leagueTeam?.players ?? []).map((x) => x.userId).sort();
        return ids.length === 2 && ids[0] === dropUserPair[0] && ids[1] === dropUserPair[1];
      });
      if (!dropLp?.leagueTeamId) throw new Error('drop-team: league participant not found');

      const gt4 = await prisma.gameTeam.findFirst({
        where: { gameId: seasonId, teamNumber: 4 },
      });
      if (gt4) {
        await prisma.gameTeamPlayer.deleteMany({ where: { gameTeamId: gt4.id } });
        await prisma.gameTeam.delete({ where: { id: gt4.id } });
      }
      await prisma.leagueParticipant.delete({ where: { id: dropLp.id } });
      await prisma.leagueTeam.delete({ where: { id: dropLp.leagueTeamId } });
      // Do not syncLeagueParticipants here: sync re-ingests teams from past round games and would resurrect the dropped team.

      const r1 = await prisma.leagueRound.create({
        data: { leagueSeasonId: seasonId, orderIndex: 1, roundType: RoundType.REGULAR },
      });
      await TeamForRoundGeneration.generateGamesForRound(r1.id);
      const keys1 = await matchupKeysForRound(prisma, r1.id);
      if (keys1.length !== 1) throw new Error(`3 teams: expected 1 game, got ${keys1.length}`);
      if (played.has(keys1[0]!)) {
        throw new Error('drop team: should not repeat R0 matchup when other unplayed pairs exist among 3 teams');
      }
      console.log('ok: team removed — 3-team round generates 1 fresh matchup');
    }

    // --- 5) Full single RR: 12 teams (11 rounds × 6 games = 66 pairings) ---
    {
      const teams = buildDisjointTeams(users, 12);
      const { leagueId, seasonId } = await createFixedTeamLeague(prisma, city.id, teams, false, start, end);
      branches.push({ leagueId, seasonId });
      const group = await prisma.leagueGroup.create({
        data: { leagueSeasonId: seasonId, name: `QA rr12 ${Date.now()}` },
      });
      await LeagueSyncService.syncLeagueParticipants(seasonId);
      await assignAllTeamParticipantsToGroup(prisma, seasonId, group.id);
      await assertFullSingleRoundRobin(prisma, '12-team group', 12, seasonId);
    }

    // --- 6) Full single RR: 24 teams (23 rounds × 12 games = 276 pairings) ---
    {
      const teams = buildDisjointTeams(users, 24);
      const { leagueId, seasonId } = await createFixedTeamLeague(prisma, city.id, teams, false, start, end);
      branches.push({ leagueId, seasonId });
      const group = await prisma.leagueGroup.create({
        data: { leagueSeasonId: seasonId, name: `QA rr24 ${Date.now()}` },
      });
      await LeagueSyncService.syncLeagueParticipants(seasonId);
      await assignAllTeamParticipantsToGroup(prisma, seasonId, group.id);
      await assertFullSingleRoundRobin(prisma, '24-team group', 24, seasonId);
    }

    console.log('qa-leagueRoundGeneration: all checks passed');
  } finally {
    for (const b of branches.reverse()) {
      await cleanupLeagueBranch(prisma, b.leagueId, b.seasonId);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
