/**
 * Re-sync Game + GameExternalBooking times for BOOKTIME-linked games affected by
 * double wire-ingest (timezone / UTC mismatch on ingest).
 *
 * Usage:
 *   npx ts-node scripts/fix-booktime-game-times.ts --dry-run
 *   npx ts-node scripts/fix-booktime-game-times.ts --dry-run --game-id=<id>
 *   npx ts-node scripts/fix-booktime-game-times.ts --heuristic-only --dry-run
 *   npx ts-node scripts/fix-booktime-game-times.ts   # apply (dev/prod — use with care)
 */
import dotenv from 'dotenv';
dotenv.config();

import { ClubIntegrationType, Prisma } from '@prisma/client';
import prisma from '../src/config/database';
import { parseBooktimeIntegrationConfig } from '../src/shared/clubIntegration';
import { BOOKTIME_DEFAULT_TIMEZONE } from '../src/shared/booktime/localTime';
import { deriveGameTimesFromJoinRows, syncGameBookingState } from '../src/services/game/gameExternalBooking.service';
import { deriveGameTimeFromBookings } from '../src/shared/gameBooking/deriveGameTimeFromBookings';
import { decryptToken, encryptToken } from '../src/utils/tokenEncryption';
import { BooktimeScriptClient } from './lib/booktimeApiClient';
import { correctDoubleShiftedStoredUtc, isDoubleShiftPattern } from './lib/booktimeDoubleShift';

const dryRun = process.argv.includes('--dry-run');
const heuristicOnly = process.argv.includes('--heuristic-only');
const gameIdArg = process.argv.find((arg) => arg.startsWith('--game-id='));
const gameIdFilter = gameIdArg?.slice('--game-id='.length).trim() || null;

type BookingRow = {
  id: string;
  externalBookingId: string;
  bookingStart: Date | null;
  bookingEnd: Date | null;
  game: {
    id: string;
    clubId: string | null;
    startTime: Date;
    endTime: Date;
    timeOverride: boolean;
    timeIsSet: boolean;
  };
};

type GameGroup = {
  game: BookingRow['game'];
  bookings: BookingRow[];
  clubId: string;
  timeZone: string;
  companyId: string;
};

type BookingFix = {
  rowId: string;
  externalBookingId: string;
  oldStart: string | null;
  oldEnd: string | null;
  newStart: string;
  newEnd: string;
  source: 'api' | 'heuristic';
};

const stats = {
  gamesScanned: 0,
  gamesUpdated: 0,
  bookingsScanned: 0,
  bookingsFixed: 0,
  bookingsSkipped: 0,
  bookingsNoAuth: 0,
  bookingsApiMiss: 0,
};

function logChange(message: string): void {
  console.log(dryRun ? `[dry-run] ${message}` : message);
}

async function resolveClubTimeZone(clubId: string): Promise<string> {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { city: { select: { timezone: true } } },
  });
  return club?.city?.timezone ?? BOOKTIME_DEFAULT_TIMEZONE;
}

async function findBooktimeAuthForGame(gameId: string, clubId: string) {
  const participants = await prisma.gameParticipant.findMany({
    where: { gameId },
    select: { userId: true },
  });
  const participantIds = participants.map((p) => p.userId);

  const participantAuth = await prisma.userClubBooktimeAuth.findFirst({
    where: {
      clubId,
      ...(participantIds.length > 0 ? { userId: { in: participantIds } } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      userId: true,
      accessToken: true,
      refreshToken: true,
    },
  });
  if (participantAuth) return participantAuth;

  return prisma.userClubBooktimeAuth.findFirst({
    where: { clubId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      userId: true,
      accessToken: true,
      refreshToken: true,
    },
  });
}

function resolveExpectedTimes(
  storedStart: string | null,
  storedEnd: string | null,
  apiBooking: { bookingStart: string; bookingEnd: string } | undefined,
  timeZone: string,
  allowHeuristic: boolean,
): { bookingStart: string; bookingEnd: string; source: 'api' | 'heuristic' } | null {
  if (!storedStart || !storedEnd) return null;

  if (apiBooking) {
    if (storedStart === apiBooking.bookingStart && storedEnd === apiBooking.bookingEnd) {
      return null;
    }
    const startMatches = isDoubleShiftPattern(storedStart, apiBooking.bookingStart, timeZone);
    const endMatches = isDoubleShiftPattern(storedEnd, apiBooking.bookingEnd, timeZone);
    if (startMatches && endMatches) {
      return { ...apiBooking, source: 'api' };
    }
    console.warn(
      `skip booking: API times differ without double-shift pattern ` +
        `stored=${storedStart}/${storedEnd} api=${apiBooking.bookingStart}/${apiBooking.bookingEnd}`,
    );
    return null;
  }

  if (!allowHeuristic) {
    return null;
  }

  const correctedStart = correctDoubleShiftedStoredUtc(storedStart, timeZone);
  const correctedEnd = correctDoubleShiftedStoredUtc(storedEnd, timeZone);
  if (!correctedStart || !correctedEnd) return null;
  return {
    bookingStart: correctedStart,
    bookingEnd: correctedEnd,
    source: 'heuristic',
  };
}

async function loadCandidateRows(): Promise<BookingRow[]> {
  const where: Prisma.GameExternalBookingWhereInput = {
    externalBookingProvider: ClubIntegrationType.BOOKTIME,
    game: {
      timeOverride: false,
      timeIsSet: true,
      ...(gameIdFilter ? { id: gameIdFilter } : {}),
    },
  };

  return prisma.gameExternalBooking.findMany({
    where,
    select: {
      id: true,
      externalBookingId: true,
      bookingStart: true,
      bookingEnd: true,
      game: {
        select: {
          id: true,
          clubId: true,
          startTime: true,
          endTime: true,
          timeOverride: true,
          timeIsSet: true,
        },
      },
    },
    orderBy: [{ gameId: 'asc' }, { createdAt: 'asc' }],
  });
}

async function buildGameGroups(rows: BookingRow[]): Promise<Map<string, GameGroup>> {
  const groups = new Map<string, GameGroup>();

  for (const row of rows) {
    const clubId = row.game.clubId;
    if (!clubId) {
      console.warn(`skip game=${row.game.id}: no clubId`);
      stats.bookingsSkipped += 1;
      continue;
    }

    let group = groups.get(row.game.id);
    if (!group) {
      const club = await prisma.club.findUnique({
        where: { id: clubId },
        select: { integrationType: true, integrationConfig: true },
      });
      if (club?.integrationType !== ClubIntegrationType.BOOKTIME) {
        console.warn(`skip game=${row.game.id}: club not BOOKTIME`);
        stats.bookingsSkipped += row.bookingStart ? 1 : 0;
        continue;
      }
      const config = parseBooktimeIntegrationConfig(club.integrationConfig);
      if (!config?.companyId) {
        console.warn(`skip game=${row.game.id}: missing companyId`);
        stats.bookingsSkipped += 1;
        continue;
      }
      const timeZone = await resolveClubTimeZone(clubId);
      group = {
        game: row.game,
        bookings: [],
        clubId,
        timeZone,
        companyId: config.companyId,
      };
      groups.set(row.game.id, group);
    }
    group.bookings.push(row);
  }

  return groups;
}

async function applyGameFixes(
  group: GameGroup,
  fixes: BookingFix[],
): Promise<void> {
  if (fixes.length === 0) return;

  const oldGameStart = group.game.startTime.toISOString();
  const oldGameEnd = group.game.endTime.toISOString();

  if (dryRun) {
    for (const fix of fixes) {
      logChange(
        `booking row=${fix.rowId} game=${group.game.id} ext=${fix.externalBookingId} ` +
          `source=${fix.source} start ${fix.oldStart} -> ${fix.newStart} end ${fix.oldEnd} -> ${fix.newEnd}`,
      );
    }
    const derived = deriveGameTimeFromBookingsAfterFixes(group, fixes);
    if (derived) {
      logChange(
        `game=${group.game.id} start ${oldGameStart} -> ${derived.startTime} ` +
          `end ${oldGameEnd} -> ${derived.endTime}`,
      );
    }
    stats.gamesUpdated += 1;
    stats.bookingsFixed += fixes.length;
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const fix of fixes) {
      await tx.gameExternalBooking.update({
        where: { id: fix.rowId },
        data: {
          bookingStart: new Date(fix.newStart),
          bookingEnd: new Date(fix.newEnd),
        },
      });
    }

    const derived = await deriveGameTimesFromJoinRows(group.game.id, tx);
    if (derived) {
      await tx.game.update({
        where: { id: group.game.id },
        data: {
          startTime: derived.startTime,
          endTime: derived.endTime,
          timeIsSet: true,
        },
      });
      console.log(
        `updated game=${group.game.id} start ${oldGameStart} -> ${derived.startTime.toISOString()} ` +
          `end ${oldGameEnd} -> ${derived.endTime.toISOString()}`,
      );
    }

    for (const fix of fixes) {
      console.log(
        `updated booking row=${fix.rowId} game=${group.game.id} ext=${fix.externalBookingId} ` +
          `source=${fix.source} start ${fix.oldStart} -> ${fix.newStart} end ${fix.oldEnd} -> ${fix.newEnd}`,
      );
    }

    await syncGameBookingState(tx, group.game.id);
  });

  stats.gamesUpdated += 1;
  stats.bookingsFixed += fixes.length;
}

function deriveGameTimeFromBookingsAfterFixes(
  group: GameGroup,
  fixes: BookingFix[],
): { startTime: string; endTime: string } | null {
  const fixByRowId = new Map(fixes.map((f) => [f.rowId, f]));
  const snapshots = group.bookings.map((row) => {
    const fix = fixByRowId.get(row.id);
    if (fix) {
      return { bookingStart: fix.newStart, bookingEnd: fix.newEnd };
    }
    return {
      bookingStart: row.bookingStart?.toISOString() ?? null,
      bookingEnd: row.bookingEnd?.toISOString() ?? null,
    };
  });

  const derived = deriveGameTimeFromBookings(snapshots);
  if (!derived.startTime || !derived.endTime) return null;
  return { startTime: derived.startTime, endTime: derived.endTime };
}

async function processGroup(group: GameGroup): Promise<void> {
  stats.gamesScanned += 1;

  const externalIds = new Set(group.bookings.map((b) => b.externalBookingId));
  let apiById = new Map<string, { bookingStart: string; bookingEnd: string }>();

  if (!heuristicOnly) {
    const auth = await findBooktimeAuthForGame(group.game.id, group.clubId);
    if (!auth) {
      stats.bookingsNoAuth += group.bookings.length;
      console.warn(`game=${group.game.id}: no Booktime auth for club=${group.clubId}, using heuristic`);
    } else {
      const client = new BooktimeScriptClient({
        companyId: group.companyId,
        accessToken: decryptToken(auth.accessToken),
        refreshToken: decryptToken(auth.refreshToken),
        onTokensUpdated: async (tokens) => {
          if (dryRun) return;
          await prisma.userClubBooktimeAuth.update({
            where: { id: auth.id },
            data: {
              accessToken: encryptToken(tokens.accessToken),
              refreshToken: encryptToken(tokens.refreshToken),
            },
          });
        },
      });

      try {
        const loaded = await client.loadBookingsById(externalIds, group.timeZone);
        apiById = new Map(
          [...loaded.entries()].map(([id, booking]) => [
            id,
            { bookingStart: booking.bookingStart, bookingEnd: booking.bookingEnd },
          ]),
        );
        for (const id of externalIds) {
          if (!apiById.has(id)) stats.bookingsApiMiss += 1;
        }
      } catch (err) {
        console.warn(`game=${group.game.id}: Booktime API failed, falling back to heuristic`, err);
        apiById = new Map();
      }
    }
  }

  const fixes: BookingFix[] = [];

  for (const row of group.bookings) {
    stats.bookingsScanned += 1;
    const storedStart = row.bookingStart?.toISOString() ?? null;
    const storedEnd = row.bookingEnd?.toISOString() ?? null;
    const apiBooking = heuristicOnly ? undefined : apiById.get(row.externalBookingId);
    const expected = resolveExpectedTimes(
      storedStart,
      storedEnd,
      apiBooking,
      group.timeZone,
      heuristicOnly,
    );

    if (!expected) {
      stats.bookingsSkipped += 1;
      continue;
    }

    fixes.push({
      rowId: row.id,
      externalBookingId: row.externalBookingId,
      oldStart: storedStart,
      oldEnd: storedEnd,
      newStart: expected.bookingStart,
      newEnd: expected.bookingEnd,
      source: expected.source,
    });
  }

  await applyGameFixes(group, fixes);
}

async function main(): Promise<void> {
  console.log(
    `fix-booktime-game-times: dryRun=${dryRun} heuristicOnly=${heuristicOnly}` +
      (gameIdFilter ? ` gameId=${gameIdFilter}` : ''),
  );

  const rows = await loadCandidateRows();
  if (rows.length === 0) {
    console.log('No BOOKTIME-linked games found (timeOverride=false, timeIsSet=true).');
    return;
  }

  const groups = await buildGameGroups(rows);
  for (const group of groups.values()) {
    await processGroup(group);
  }

  console.log(
    `fix-booktime-game-times done: gamesScanned=${stats.gamesScanned} gamesUpdated=${stats.gamesUpdated} ` +
      `bookingsScanned=${stats.bookingsScanned} bookingsFixed=${stats.bookingsFixed} ` +
      `bookingsSkipped=${stats.bookingsSkipped} bookingsNoAuth=${stats.bookingsNoAuth} ` +
      `bookingsApiMiss=${stats.bookingsApiMiss} dryRun=${dryRun}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
