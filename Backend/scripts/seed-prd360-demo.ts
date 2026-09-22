/**
 * PRD 360 demo data — "Novices welcome": organizer toggle, card tag, Find filter.
 *
 * Creates six public games in the viewer's Home city, each pinned to one state
 * the feature must render. Idempotent: re-running deletes and recreates the
 * set. `--clean` removes it and exits.
 *
 *   cd Backend
 *   npx ts-node --transpile-only scripts/seed-prd360-demo.ts
 *   npx ts-node --transpile-only scripts/seed-prd360-demo.ts --clean
 *
 * Optional env: VIEWER_EMAIL (default relic.ilya@gmail.com).
 *
 * Dev only. It writes straight to the tables and deliberately skips the
 * create-game service, so there is no chat, no system message and no
 * notification — the point is the tag, the toggle and the filter.
 */
import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';
import type { EntityType, ParticipantRole, ResultsStatus, GameStatus } from '@prisma/client';

const NAME_PREFIX = 'PRD360';
const VIEWER_EMAIL = process.env.VIEWER_EMAIL ?? 'relic.ilya@gmail.com';

async function clean(): Promise<number> {
  const { count } = await prisma.game.deleteMany({
    where: { name: { startsWith: NAME_PREFIX } },
  });
  return count;
}

async function main(): Promise<void> {
  const cleanOnly = process.argv.includes('--clean');

  const removed = await clean();
  console.log(`removed ${removed} existing ${NAME_PREFIX} game(s)`);
  if (cleanOnly) return;

  const viewer = await prisma.user.findFirst({
    where: { email: VIEWER_EMAIL },
    select: { id: true, firstName: true, currentCityId: true },
  });
  if (!viewer?.currentCityId) throw new Error(`No user ${VIEWER_EMAIL} with a Home city`);
  const cityId = viewer.currentCityId;

  // Fillers are anyone else in the same city, so the roster avatars look real.
  const pool = await prisma.user.findMany({
    where: { currentCityId: cityId, id: { not: viewer.id } },
    select: { id: true },
    orderBy: { id: 'asc' },
    take: 40,
  });
  if (pool.length < 4) throw new Error(`Not enough users in city ${cityId} (${pool.length})`);
  let cursor = 0;
  const nextUser = () => pool[cursor++ % pool.length].id;

  const startOfTomorrow = new Date();
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  startOfTomorrow.setHours(9, 0, 0, 0);

  type Scenario = {
    label: string;
    expect: string;
    suitableForNovices: boolean;
    entityType?: EntityType;
    minLevel?: number;
    maxLevel?: number;
    /** Seat the viewer as OWNER so the settings block is reachable. */
    viewerOwns?: boolean;
    /** Past + FINAL, to show the toggle frozen with the other settings. */
    locked?: boolean;
  };

  const scenarios: Scenario[] = [
    {
      label: 'tagged',
      expect: 'Teal "Novices welcome" pill on the Find / Home / My card and in the details header',
      suitableForNovices: true,
    },
    {
      label: 'untagged control',
      expect: 'Same level range, no pill — the tag is a choice, never derived from the band',
      suitableForNovices: false,
    },
    {
      label: 'tagged but 4.0-6.0',
      expect: 'Pill shows AND the level gate still bites: a 2.0 player is still blocked from joining',
      suitableForNovices: true,
      minLevel: 4,
      maxLevel: 6,
    },
    {
      label: 'TRAINING tagged',
      expect: 'Pill on a non-GAME entity type that has the capability',
      suitableForNovices: true,
      entityType: 'TRAINING',
    },
    {
      label: 'yours, toggle it',
      expect: 'You are the owner: open it and flip "Novices welcome" in the settings block',
      suitableForNovices: false,
      viewerOwns: true,
    },
    {
      label: 'yours, locked',
      expect: 'Past game with FINAL results: pill still shows, switch is disabled with its neighbours',
      suitableForNovices: true,
      viewerOwns: true,
      locked: true,
    },
  ];

  console.log(`\nviewer: ${viewer.firstName} <${VIEWER_EMAIL}> city=${cityId}\n`);

  for (const [index, scenario] of scenarios.entries()) {
    const startTime = scenario.locked
      ? new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
      : new Date(startOfTomorrow.getTime() + index * 2 * 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + 90 * 60 * 1000);

    const seats: Array<{ userId: string; role: ParticipantRole }> = scenario.viewerOwns
      ? [
          { userId: viewer.id, role: 'OWNER' },
          { userId: nextUser(), role: 'PARTICIPANT' },
        ]
      : [
          { userId: nextUser(), role: 'OWNER' },
          { userId: nextUser(), role: 'PARTICIPANT' },
        ];

    const game = await prisma.game.create({
      data: {
        entityType: scenario.entityType ?? 'GAME',
        gameType: 'CLASSIC',
        sport: 'PADEL',
        name: `${NAME_PREFIX} · ${scenario.label}`,
        cityId,
        startTime,
        endTime,
        timeIsSet: true,
        maxParticipants: 4,
        playersPerMatch: 4,
        minLevel: scenario.minLevel ?? 1,
        maxLevel: scenario.maxLevel ?? 7,
        isPublic: true,
        allowDirectJoin: true,
        suitableForNovices: scenario.suitableForNovices,
        status: (scenario.locked ? 'FINISHED' : 'ANNOUNCED') as GameStatus,
        resultsStatus: (scenario.locked ? 'FINAL' : 'NONE') as ResultsStatus,
        venueText: 'PRD 360 demo',
        participants: {
          create: seats.map((seat) => ({
            userId: seat.userId,
            role: seat.role,
            status: 'PLAYING',
            joinedAt: new Date(Date.now() - 240 * 60 * 1000),
          })),
        },
      },
      select: { id: true, name: true },
    });

    console.log(`${game.name}`);
    console.log(`  /games/${game.id}`);
    console.log(`  → ${scenario.expect}\n`);
  }

  console.log(
    'Find → advanced filters → "Novices welcome only" should leave exactly the tagged upcoming ones.',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
