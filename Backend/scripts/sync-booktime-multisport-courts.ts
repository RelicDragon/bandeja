import dotenv from 'dotenv';
dotenv.config();

import { Sport } from '@prisma/client';
import prisma from '../src/config/database';
import {
  BooktimeImportCourtsService,
  type BooktimeCompanyImportPayload,
} from '../src/services/admin/booktimeImportCourts.service';

const BOOKTIME_API_URL = 'https://api.booktime.rs';

const CLUBS = [
  {
    label: 'Elite Padel',
    clubId: 'cmhavxhj9000u65s4e4k6c7g6',
    companyId: '8defd7d4-7eb7-4e71-862b-3e98a02bce9d',
  },
  {
    label: 'KSC (ex.CRS)',
    clubId: 'cmhavpbt8000265s4wsulhivd',
    companyId: '002f8a6a-6433-490f-9bae-726b98399672',
  },
] as const;

async function fetchCompany(companyId: string): Promise<BooktimeCompanyImportPayload> {
  const res = await fetch(`${BOOKTIME_API_URL}/public/company/${companyId}`);
  if (!res.ok) {
    throw new Error(`Booktime company fetch failed (${res.status})`);
  }
  return (await res.json()) as BooktimeCompanyImportPayload;
}

function parseArgs(argv: string[]): { apply: boolean } {
  return { apply: argv.includes('--apply') };
}

async function main(): Promise<void> {
  const { apply } = parseArgs(process.argv.slice(2));

  for (const club of CLUBS) {
    const payload = await fetchCompany(club.companyId);
    const resourceCount = payload.bookingResources?.length ?? 0;
    console.log(`\n${club.label}: ${payload.name ?? club.label} — ${resourceCount} resources`);

    if (!apply) {
      console.log('  dry-run (pass --apply to write)');
      continue;
    }

    const result = await BooktimeImportCourtsService.applyImport(club.clubId, payload);
    console.log(
      `  applied: created=${result.created} updated=${result.updated} skipped=${result.skipped} courts=${result.courts.length}`,
    );

    const tennisCourts = result.courts.filter((court) => court.sport === Sport.TENNIS);
    const multiCourts = result.courts.filter((court) => court.sport == null);
    console.log(`  tennis courts=${tennisCourts.length} multi-sport courts=${multiCourts.length}`);
  }

  if (!apply) {
    console.log('\nNo changes written. Re-run with --apply.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
