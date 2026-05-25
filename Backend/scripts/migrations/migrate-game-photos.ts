/**
 * Phase B: backfill GamePhoto rows from GAME + PHOTOS ChatMessages.
 * Idempotent — safe on empty GamePhoto table or re-run after partial failure.
 *
 * Run: npm run migrate:game-photos
 * Dry-run: npm run migrate:game-photos -- --dry-run
 */
import dotenv from 'dotenv';
dotenv.config();

import { writeFileSync } from 'fs';
import { join } from 'path';
import { Prisma } from '@prisma/client';
import prisma from '../../src/config/database';

/** Legacy chat channel removed in Phase C — kept as literal for backfill scripts. */
const LEGACY_PHOTOS_CHAT_TYPE = 'PHOTOS';

const DRY_RUN = process.argv.includes('--dry-run');
const AFFECTED_GAMES_PATH = join(__dirname, '.game-photos-affected-games.json');

export function photoIdForMessageUrl(messageId: string, index: number): string {
  return index === 0 ? messageId : `${messageId}__${index}`;
}

type VerificationReport = {
  countMismatches: Array<{ gameId: string; stored: number; actual: number }>;
  orphanMainPhotoId: Array<{ gameId: string; mainPhotoId: string }>;
  mainPointsToDeletedPhoto: Array<{ gameId: string; mainPhotoId: string }>;
  gamesWithPhotosMessages: number;
  photosInserted: number;
  photosSkipped: number;
  gamesUpdated: number;
};

type LegacyPhotosMessage = {
  id: string;
  contextId: string;
  senderId: string | null;
  mediaUrls: string[];
  thumbnailUrls: string[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

async function loadPhotosMessages(): Promise<LegacyPhotosMessage[]> {
  return prisma.$queryRaw<LegacyPhotosMessage[]>`
    SELECT
      m.id,
      m."contextId",
      m."senderId",
      m."mediaUrls",
      m."thumbnailUrls",
      m."createdAt",
      m."updatedAt",
      m."deletedAt"
    FROM "ChatMessage" m
    WHERE m."chatContextType" = 'GAME'::"ChatContextType"
      AND m."chatType"::text = ${LEGACY_PHOTOS_CHAT_TYPE}
    ORDER BY m."contextId" ASC, m."createdAt" ASC
  `;
}

async function backfillFromMessages(
  messages: Awaited<ReturnType<typeof loadPhotosMessages>>
): Promise<{ inserted: number; skipped: number; affectedGameIds: Set<string> }> {
  const affectedGameIds = new Set<string>();
  let inserted = 0;
  let skipped = 0;

  for (const msg of messages) {
    if (!msg.mediaUrls?.length) continue;
    affectedGameIds.add(msg.contextId);

    for (let i = 0; i < msg.mediaUrls.length; i++) {
      const originalUrl = msg.mediaUrls[i];
      if (!originalUrl?.trim()) continue;

      const id = photoIdForMessageUrl(msg.id, i);
      const thumbnailUrl =
        msg.thumbnailUrls?.[i]?.trim() || originalUrl;

      const existing = await prisma.gamePhoto.findUnique({
        where: { id },
        select: { id: true },
      });
      if (existing) {
        skipped++;
        continue;
      }

      const data: Prisma.GamePhotoCreateInput = {
        id,
        originalUrl,
        thumbnailUrl,
        order: i,
        createdAt: msg.createdAt,
        updatedAt: msg.updatedAt,
        deletedAt: msg.deletedAt,
        game: { connect: { id: msg.contextId } },
        ...(msg.senderId
          ? { uploader: { connect: { id: msg.senderId } } }
          : {}),
      };

      if (DRY_RUN) {
        console.log(`[dry-run] would create GamePhoto ${id} game=${msg.contextId}`);
        inserted++;
        continue;
      }

      await prisma.gamePhoto.create({ data });
      inserted++;
    }
  }

  return { inserted, skipped, affectedGameIds };
}

async function repairGamePhotoFields(gameIds: Iterable<string>): Promise<number> {
  let updated = 0;

  for (const gameId of gameIds) {
    const activePhotos = await prisma.gamePhoto.findMany({
      where: { gameId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    const actualCount = activePhotos.length;
    const activeIds = new Set(activePhotos.map((p) => p.id));

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { mainPhotoId: true, photosCount: true },
    });
    if (!game) continue;

    let mainPhotoId = game.mainPhotoId;
    if (mainPhotoId && !activeIds.has(mainPhotoId)) {
      mainPhotoId = activePhotos[0]?.id ?? null;
    }
    if (!mainPhotoId && activePhotos.length > 0) {
      mainPhotoId = activePhotos[0].id;
    }
    if (mainPhotoId && activeIds.has(mainPhotoId) === false) {
      mainPhotoId = null;
    }

    const needsUpdate =
      game.photosCount !== actualCount || game.mainPhotoId !== mainPhotoId;

    if (!needsUpdate) continue;

    if (DRY_RUN) {
      console.log(
        `[dry-run] would update game ${gameId}: photosCount ${game.photosCount} -> ${actualCount}, mainPhotoId ${game.mainPhotoId} -> ${mainPhotoId}`
      );
      updated++;
      continue;
    }

    await prisma.game.update({
      where: { id: gameId },
      data: { photosCount: actualCount, mainPhotoId },
    });
    updated++;
  }

  return updated;
}

async function verify(): Promise<VerificationReport> {
  const report: VerificationReport = {
    countMismatches: [],
    orphanMainPhotoId: [],
    mainPointsToDeletedPhoto: [],
    gamesWithPhotosMessages: 0,
    photosInserted: 0,
    photosSkipped: 0,
    gamesUpdated: 0,
  };

  const remaining = await prisma.$queryRaw<[{ n: bigint }]>`
    SELECT COUNT(*)::bigint AS n
    FROM "ChatMessage" m
    WHERE m."chatContextType" = 'GAME'::"ChatContextType"
      AND m."chatType"::text = ${LEGACY_PHOTOS_CHAT_TYPE}
  `;
  report.gamesWithPhotosMessages = Number(remaining[0]?.n ?? 0);

  const games = await prisma.game.findMany({
    where: {
      OR: [{ photosCount: { gt: 0 } }, { mainPhotoId: { not: null } }],
    },
    select: { id: true, photosCount: true, mainPhotoId: true },
  });

  for (const g of games) {
    const actual = await prisma.gamePhoto.count({
      where: { gameId: g.id, deletedAt: null },
    });
    if (g.photosCount !== actual) {
      report.countMismatches.push({
        gameId: g.id,
        stored: g.photosCount,
        actual,
      });
    }
    if (!g.mainPhotoId) continue;

    const photo = await prisma.gamePhoto.findUnique({
      where: { id: g.mainPhotoId },
      select: { gameId: true, deletedAt: true },
    });
    if (!photo || photo.gameId !== g.id) {
      report.orphanMainPhotoId.push({ gameId: g.id, mainPhotoId: g.mainPhotoId });
    } else if (photo.deletedAt) {
      report.mainPointsToDeletedPhoto.push({
        gameId: g.id,
        mainPhotoId: g.mainPhotoId,
      });
    }
  }

  return report;
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== Phase B: migrate game photos ===');

  const messages = await loadPhotosMessages();
  const existingPhotoCount = await prisma.gamePhoto.count();

  if (messages.length === 0 && existingPhotoCount === 0) {
    console.log('No PHOTOS chat messages and GamePhoto table empty — nothing to backfill.');
    const report = await verify();
    console.log('Verification:', JSON.stringify(report, null, 2));
    if (!DRY_RUN) {
      writeFileSync(AFFECTED_GAMES_PATH, JSON.stringify([]));
    }
    return;
  }

  const { inserted, skipped, affectedGameIds } = await backfillFromMessages(messages);

  const allGameIds = new Set(affectedGameIds);
  const photoGameRows = await prisma.gamePhoto.findMany({
    distinct: ['gameId'],
    select: { gameId: true },
  });
  for (const { gameId } of photoGameRows) allGameIds.add(gameId);

  const gamesUpdated = await repairGamePhotoFields(allGameIds);

  if (!DRY_RUN) {
    writeFileSync(
      AFFECTED_GAMES_PATH,
      JSON.stringify([...affectedGameIds].sort())
    );
    console.log(`Wrote affected game ids (${affectedGameIds.size}) to ${AFFECTED_GAMES_PATH}`);
  }

  const report = await verify();
  report.photosInserted = inserted;
  report.photosSkipped = skipped;
  report.gamesUpdated = gamesUpdated;

  console.log('\n--- Summary ---');
  console.log(`PHOTOS messages processed: ${messages.length}`);
  console.log(`GamePhoto rows inserted: ${inserted}, skipped (existing): ${skipped}`);
  console.log(`Games repaired (count/main): ${gamesUpdated}`);
  console.log('\n--- Verification ---');
  console.log(JSON.stringify(report, null, 2));

  if (
    report.countMismatches.length > 0 ||
    report.orphanMainPhotoId.length > 0 ||
    report.mainPointsToDeletedPhoto.length > 0
  ) {
    console.error('\nVerification found issues — review before Phase C.');
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
