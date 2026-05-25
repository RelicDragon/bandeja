/**
 * Phase B½: recompute game unread counts for games that had PHOTOS chat (post-migration).
 * Run after delete-photos-chat-messages.ts (or with game ids from migrate-game-photos output).
 *
 * Run: npm run migrate:recompute-unread-after-photos
 * With socket (server must be up): npm run migrate:recompute-unread-after-photos -- --emit-socket
 */
import dotenv from 'dotenv';
dotenv.config();

import { readFileSync } from 'fs';
import { join } from 'path';
import prisma from '../../src/config/database';
import {
  emitUnreadUpdatesForResults,
  recomputeUnreadForGameIds,
} from '../../src/services/migration/gamePhotoUnreadRecompute.service';

const EMIT_SOCKET = process.argv.includes('--emit-socket');
const AFFECTED_GAMES_PATH = join(__dirname, '.game-photos-affected-games.json');

function loadAffectedGameIds(): string[] {
  try {
    const raw = readFileSync(AFFECTED_GAMES_PATH, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
    }
  } catch {
    // fall through
  }
  return [];
}

async function main() {
  let gameIds = loadAffectedGameIds();

  if (gameIds.length === 0) {
    const fromPhotos = await prisma.gamePhoto.findMany({
      distinct: ['gameId'],
      select: { gameId: true },
    });
    gameIds = fromPhotos.map((r) => r.gameId);
  }

  if (gameIds.length === 0) {
    console.log('No affected games — nothing to recompute.');
    return;
  }

  console.log(`Recomputing unread for ${gameIds.length} game(s)...`);
  const results = await recomputeUnreadForGameIds(gameIds);

  const withUnread = results.filter((r) => r.unreadCount > 0);
  console.log(
    `Participants checked: ${results.length}, still with unread: ${withUnread.length}`
  );

  if (EMIT_SOCKET) {
    const emitted = await emitUnreadUpdatesForResults(results);
    console.log(`Socket unread updates emitted: ${emitted}`);
  } else {
    console.log(
      'Skipped socket emit (pass --emit-socket with API server running to push live clients).'
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
