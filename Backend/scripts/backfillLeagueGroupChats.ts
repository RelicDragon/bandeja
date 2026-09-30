/**
 * Create the auto-managed group chats for Fix Liga "Jesen-Zima 2026" (the only season backfilled).
 * Newer seasons get their chats from the live reconcile hooks.
 *
 *   npx ts-node --transpile-only scripts/backfillLeagueGroupChats.ts
 *   npx ts-node --transpile-only scripts/backfillLeagueGroupChats.ts --apply
 */
import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';
import {
  LeagueGroupChatService,
  buildLeagueGroupChatMembers,
  leagueGroupChatName,
} from '../src/services/league/leagueGroupChat.service';

const JESEN_ZIMA_2026_SEASON_ID = 'cmu2s0kkq0000zg15e33rraqx';

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const season = await prisma.leagueSeason.findUnique({
    where: { id: JESEN_ZIMA_2026_SEASON_ID },
    select: {
      game: {
        select: {
          name: true,
          participants: {
            where: { role: { in: ['OWNER', 'ADMIN'] }, status: { in: ['PLAYING', 'NON_PLAYING', 'IN_QUEUE'] } },
            select: { userId: true, role: true },
          },
        },
      },
      groups: {
        select: {
          id: true,
          name: true,
          groupChannel: { select: { id: true, participantsCount: true } },
          participants: {
            where: { withdrawnAt: null },
            select: { userId: true, leagueTeam: { select: { players: { select: { userId: true } } } } },
          },
        },
      },
    },
  });
  if (!season) throw new Error(`Season ${JESEN_ZIMA_2026_SEASON_ID} not found`);

  console.log(`${season.game?.name ?? JESEN_ZIMA_2026_SEASON_ID} — ${apply ? 'APPLY' : 'dry-run'}`);
  for (const group of season.groups) {
    const members = buildLeagueGroupChatMembers({
      groupId: group.id,
      participants: group.participants,
      seasonAdmins: season.game?.participants ?? [],
    });
    const admins = [...members.values()].filter((r) => r !== 'PARTICIPANT').length;
    const state = group.groupChannel
      ? `exists (${group.groupChannel.id}, ${group.groupChannel.participantsCount} members)`
      : 'new';
    console.log(
      `  ${leagueGroupChatName(season.game?.name, group.name)}: ${members.size} members (${admins} admins) — ${state}`,
    );
  }

  if (!apply) {
    console.log('Pass --apply to write.');
    return;
  }
  await LeagueGroupChatService.reconcileSeason(JESEN_ZIMA_2026_SEASON_ID, { announce: false });
  const chats = await prisma.groupChannel.findMany({
    where: { leagueGroup: { leagueSeasonId: JESEN_ZIMA_2026_SEASON_ID } },
    select: { id: true, name: true, participantsCount: true },
  });
  for (const c of chats) console.log(`  ✓ ${c.name} (${c.id}): ${c.participantsCount} members`);
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
