/**
 * Live watch demo — one public padel game in progress, for the "Live now" rail,
 * the game-details Live block and the `/games/:id/watch` scoreboard.
 *
 * Four players from the viewer's city (never the viewer, so they see it as a
 * spectator) on a court of the city's biggest club, best of 3, with a real
 * live-scoring envelope: set 1 6–4, set 2 3–4, current game at deuce. The score
 * is replayed through the backend scoring engine, so serve rotation and the
 * set / game counters are exactly what live scoring would have written.
 * Idempotent: re-running deletes and recreates it. `--clean` removes it and exits.
 *
 *   cd Backend
 *   npx ts-node --transpile-only scripts/seed-live-watch-demo.ts
 *   npx ts-node --transpile-only scripts/seed-live-watch-demo.ts --clean
 *
 * Optional env: VIEWER_EMAIL (default relic.serbia@gmail.com).
 *
 * Dev only. It writes straight to the tables and skips the game and results
 * services, so there is no chat, no system message and no follower push.
 */
import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';
import {
  advanceLiveSet,
  canAdvanceLiveSet,
  createInitialLiveScoringState,
  scoreLivePoint,
} from '../src/services/results/liveScoringEngine/core';
import { getRules } from '../src/services/results/liveScoringEngine/rulebook';
import type { LiveScoringState, LiveTeamSide } from '../src/services/results/liveScoringEngine/types';
import { MATCH_LIVE_SCORING_V } from '../src/services/results/matchLiveScoring.types';

const NAME = 'Live watch demo';
const VIEWER_EMAIL = process.env.VIEWER_EMAIL ?? 'relic.serbia@gmail.com';

const A: LiveTeamSide = 'teamA';
const B: LiveTeamSide = 'teamB';
/** Game winners: set 1 6–4 to A, set 2 3–4. */
const GAMES: LiveTeamSide[] = [A, B, A, B, A, A, B, A, B, A, B, A, B, A, B, A, B];
/** Points of the game in progress: 40–40, deuce (golden point is off). */
const CURRENT_GAME: LiveTeamSide[] = [A, B, A, B, A, B];

const SCORING = {
  sport: 'PADEL',
  scoringPreset: 'CLASSIC_BEST_OF_3',
  scoringMode: 'CLASSIC',
  fixedNumberOfSets: 3,
  maxTotalPointsPerSet: 0,
  maxPointsPerTeam: 0,
  deucesBeforeGoldenPoint: null,
  pointsPerTie: 0,
} as const;

function replay(): LiveScoringState {
  const rules = getRules(SCORING);
  let state: LiveScoringState = {
    ...createInitialLiveScoringState(rules),
    firstServerTeam: A,
    firstServerDoublesPlayerIndex: 0,
    pointsServeRotation: 'official',
    matchStartCourtEndsSwapped: false,
    matchStartTeamASidesMirrored: false,
    matchStartTeamBSidesMirrored: false,
  };
  const point = (side: LiveTeamSide) => {
    const next = scoreLivePoint(state, side, rules);
    if (!next.changed) throw new Error(`engine refused a point for ${side}`);
    state = next.state;
    if (canAdvanceLiveSet(state, rules)) state = advanceLiveSet(state, rules).state;
  };
  for (const winner of GAMES) for (let i = 0; i < 4; i += 1) point(winner);
  for (const side of CURRENT_GAME) point(side);
  return state;
}

async function clean(): Promise<number> {
  const { count } = await prisma.game.deleteMany({ where: { name: NAME } });
  return count;
}

async function main(): Promise<void> {
  const removed = await clean();
  console.log(`removed ${removed} existing "${NAME}" game(s)`);
  if (process.argv.includes('--clean')) return;

  const viewer = await prisma.user.findUnique({
    where: { email: VIEWER_EMAIL },
    select: { id: true, currentCityId: true },
  });
  if (!viewer?.currentCityId) throw new Error(`${VIEWER_EMAIL} not found or has no city`);
  const cityId = viewer.currentCityId;

  const club = await prisma.club.findFirst({
    where: { cityId, courts: { some: {} } },
    orderBy: { courts: { _count: 'desc' } },
    select: { id: true, name: true, courts: { select: { id: true, name: true }, orderBy: { createdAt: 'asc' }, take: 1 } },
  });
  if (!club) throw new Error('no club with courts in the viewer city');
  const court = club.courts[0];

  const players = await prisma.user.findMany({
    where: {
      currentCityId: cityId,
      id: { not: viewer.id },
      firstName: { not: null },
      lastName: { not: null },
      avatar: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    take: 4,
    select: { id: true, firstName: true, lastName: true },
  });
  if (players.length < 4) throw new Error('need four players in the viewer city');

  const state = replay();
  const now = Date.now();
  const startTime = new Date(now - 35 * 60 * 1000);

  const game = await prisma.game.create({
    data: {
      entityType: 'GAME',
      gameType: 'CLASSIC',
      ...SCORING,
      matchGenerationType: 'HANDMADE',
      name: NAME,
      cityId,
      clubId: club.id,
      courtId: court.id,
      startTime,
      endTime: new Date(now + 55 * 60 * 1000),
      timeIsSet: true,
      maxParticipants: 4,
      playersPerMatch: 4,
      minLevel: 1,
      maxLevel: 7,
      isPublic: true,
      showOnLiveRail: true,
      affectsRating: true,
      status: 'STARTED',
      resultsStatus: 'IN_PROGRESS',
      participants: {
        create: players.map((p, i) => ({
          userId: p.id,
          role: i === 0 ? 'OWNER' : 'PARTICIPANT',
          status: 'PLAYING',
          joinedAt: new Date(now - 24 * 60 * 60 * 1000),
        })),
      },
      rounds: {
        create: {
          roundNumber: 1,
          matches: {
            create: {
              matchNumber: 1,
              courtId: court.id,
              metadata: {
                liveScoring: {
                  v: MATCH_LIVE_SCORING_V,
                  revision: GAMES.length * 4 + CURRENT_GAME.length,
                  updatedAt: new Date(now - 20 * 1000).toISOString(),
                  writerUserId: players[0].id,
                  state,
                },
              },
              teams: {
                create: [
                  { teamNumber: 1, players: { create: [{ userId: players[0].id }, { userId: players[1].id }] } },
                  { teamNumber: 2, players: { create: [{ userId: players[2].id }, { userId: players[3].id }] } },
                ],
              },
              sets: {
                create: state.sets.map((set, i) => ({
                  setNumber: i + 1,
                  teamAScore: set.teamA,
                  teamBScore: set.teamB,
                  isTieBreak: Boolean(set.isTieBreak),
                })),
              },
            },
          },
        },
      },
    },
    select: { id: true },
  });

  const name = (p: (typeof players)[number]) => `${p.firstName} ${p.lastName}`;
  console.log(`${NAME} · ${club.name} · ${court.name}`);
  console.log(`  ${name(players[0])} / ${name(players[1])}  vs  ${name(players[2])} / ${name(players[3])}`);
  console.log(`  sets ${state.sets.map((s) => `${s.teamA}-${s.teamB}`).join(' ')}, game ${JSON.stringify(state.classic?.pointState)}`);
  console.log(`  /games/${game.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
