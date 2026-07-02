import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';
import { dateKeyInTimezone } from '../src/services/weatherForecast.service';
import { WeatherDayArchiveService } from '../src/services/weatherDayArchive.service';

function parseArgs(): {
  fromDate: string;
  toDate: string;
  cityId?: string;
  dryRun: boolean;
} {
  const args = process.argv.slice(2);
  let fromDate = '2026-06-01';
  let toDate = '2026-07-31';
  let cityId: string | undefined;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from-date' && args[i + 1]) {
      fromDate = args[i + 1];
      i++;
    } else if (args[i] === '--to-date' && args[i + 1]) {
      toDate = args[i + 1];
      i++;
    } else if (args[i] === '--city-id' && args[i + 1]) {
      cityId = args[i + 1];
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }

  return { fromDate, toDate, cityId, dryRun };
}

function shiftDayKey(dayKey: string, deltaDays: number): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + deltaDays, 12));
  return shifted.toISOString().slice(0, 10);
}

function listDays(fromDate: string, toDate: string): string[] {
  const days: string[] = [];
  let current = fromDate;
  while (current <= toDate) {
    days.push(current);
    current = shiftDayKey(current, 1);
  }
  return days;
}

async function backfill() {
  const { fromDate, toDate, cityId, dryRun } = parseArgs();
  const days = listDays(fromDate, toDate);
  console.log(
    `Backfill weather day archives ${fromDate} .. ${toDate}${cityId ? ` city=${cityId}` : ''}${dryRun ? ' (dry-run)' : ''} (${days.length} days)`,
  );

  const cityDays = new Map<string, Set<string>>();

  if (cityId) {
    cityDays.set(cityId, new Set(days));
  } else {
    const from = new Date(`${fromDate}T00:00:00.000Z`);
    const to = new Date(`${shiftDayKey(toDate, 1)}T00:00:00.000Z`);
    const games = await prisma.game.findMany({
      where: {
        timeIsSet: true,
        endTime: { gte: from, lt: to, lte: new Date() },
      },
      select: {
        cityId: true,
        startTime: true,
        city: { select: { timezone: true } },
      },
    });

    for (const game of games) {
      const day = dateKeyInTimezone(new Date(game.startTime), game.city.timezone);
      const bucket = cityDays.get(game.cityId) ?? new Set<string>();
      bucket.add(day);
      cityDays.set(game.cityId, bucket);
    }
  }

  let fetched = 0;
  let failed = 0;
  for (const [targetCityId, targetDays] of cityDays) {
    for (const day of targetDays) {
      if (dryRun) {
        fetched++;
        continue;
      }
      try {
        await WeatherDayArchiveService.getDay(targetCityId, day);
        fetched++;
      } catch (error) {
        failed++;
        console.warn(`Failed ${targetCityId} ${day}:`, error instanceof Error ? error.message : String(error));
      }
      if (fetched % 20 === 0 && fetched > 0) {
        console.log(`Progress: ${fetched} city-days fetched`);
      }
    }
  }

  console.log(`Backfill complete: ${fetched} city-days${failed ? `, ${failed} failed` : ''}${dryRun ? ' (dry-run)' : ''}`);
}

backfill()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
