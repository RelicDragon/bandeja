/**
 * Phase C (step 1): hard-delete legacy PHOTOS ChatMessages and dependents.
 * Run AFTER migrate-game-photos.ts and BEFORE `npx prisma migrate dev` that drops PHOTOS enum.
 *
 * Run: npm run migrate:delete-photos-chat
 * Dry-run: npm run migrate:delete-photos-chat -- --dry-run
 */
import dotenv from 'dotenv';
dotenv.config();

const LEGACY_PHOTOS_CHAT_TYPE = 'PHOTOS';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import prisma from '../../src/config/database';

const DRY_RUN = process.argv.includes('--dry-run');
const AFFECTED_GAMES_PATH = join(__dirname, '.game-photos-affected-games.json');

async function deleteLegacyPhotosSideTables(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
) {
  const [cursors, drafts, autoTranslate] = await Promise.all([
    tx.$executeRaw`
      DELETE FROM "ChatReadCursor" WHERE "chatType"::text = ${LEGACY_PHOTOS_CHAT_TYPE}
    `,
    tx.$executeRaw`
      DELETE FROM "ChatDraft" WHERE "chatType"::text = ${LEGACY_PHOTOS_CHAT_TYPE}
    `,
    tx.$executeRaw`
      DELETE FROM "ChatAutoTranslateConfig" WHERE "chatTypeKey" = ${LEGACY_PHOTOS_CHAT_TYPE}
    `,
  ]);
  return { cursors, drafts, autoTranslate };
}

async function main() {
  const photosMessages = await prisma.$queryRaw<Array<{ id: string; contextId: string }>>`
    SELECT m.id, m."contextId"
    FROM "ChatMessage" m
    WHERE m."chatContextType" = 'GAME'::"ChatContextType"
      AND m."chatType"::text = ${LEGACY_PHOTOS_CHAT_TYPE}
  `;

  const messageIds = photosMessages.map((m) => m.id);
  const affectedGameIds = [...new Set(photosMessages.map((m) => m.contextId))].sort();

  if (photosMessages.length === 0) {
    console.log('No PHOTOS chat messages left.');
    if (DRY_RUN) return;
    const side = await prisma.$transaction(deleteLegacyPhotosSideTables);
    console.log('Ancillary cleanup:', side);
    return;
  }

  console.log(`Found ${messageIds.length} PHOTOS messages across ${affectedGameIds.length} games.`);

  if (DRY_RUN) {
    console.log('[dry-run] would delete messages:', messageIds.length);
    return;
  }

  writeFileSync(AFFECTED_GAMES_PATH, JSON.stringify(affectedGameIds));
  console.log(`Updated ${AFFECTED_GAMES_PATH}`);

  await prisma.$transaction(async (tx) => {
    await tx.chatMessage.updateMany({
      where: { replyToId: { in: messageIds } },
      data: { replyToId: null },
    });

    const deleted = await tx.chatMessage.deleteMany({
      where: { id: { in: messageIds } },
    });

    const side = await deleteLegacyPhotosSideTables(tx);

    console.log(`Deleted ${deleted.count} PHOTOS chat messages.`);
    console.log(`Removed ancillary rows:`, side);
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
