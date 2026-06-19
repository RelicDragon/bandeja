import { Sport } from '@prisma/client';
import {
  buildReconcilePlan,
  buildSnapshotFromPlan,
  formatReconcileReport,
  type ClubRow,
  type CourtRow,
  type PlaytomicCourtSport,
} from './courtClubSportsReconcile';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const clubA: ClubRow = { id: 'club-a', name: 'Padel Only', sports: [Sport.PADEL], isBar: false };
const clubMulti: ClubRow = {
  id: 'club-m',
  name: 'Multi',
  sports: [Sport.PADEL, Sport.TENNIS],
  isBar: false,
};
const barClub: ClubRow = { id: 'bar-1', name: 'Bar', sports: [Sport.PADEL], isBar: true };

function testPlaytomicFill(): void {
  const courts: CourtRow[] = [
    {
      id: 'c1',
      name: 'Court 1',
      clubId: clubA.id,
      sport: null,
      externalCourtId: 'ext-1',
      isActive: true,
    },
  ];
  const playtomic = new Map<string, PlaytomicCourtSport>([
    [
      'ext-1',
      {
        externalCourtId: 'ext-1',
        sport: Sport.TENNIS,
        resourceName: 'Tennis 1',
        sourceFile: 'test.json',
        tenantName: 'Tenant',
      },
    ],
  ]);

  const plan = buildReconcilePlan({
    clubs: [clubA],
    courts,
    playtomicByExternalId: playtomic,
    playtomicJsonResourceCount: 1,
  });

  assert(plan.courtProposals.length === 1, 'one playtomic proposal');
  assert(plan.courtProposals[0].proposedSport === Sport.TENNIS, 'playtomic sport');
  assert(plan.courtProposals[0].source === 'playtomic', 'playtomic source');
  assert(plan.clubSportsProposals.length === 1, 'club gains TENNIS');
  assert(
    plan.clubSportsProposals[0].proposedSports.includes(Sport.TENNIS),
    'club sports merged',
  );
}

function testPlaytomicConflict(): void {
  const courts: CourtRow[] = [
    {
      id: 'c1',
      name: 'Court 1',
      clubId: clubA.id,
      sport: Sport.PADEL,
      externalCourtId: 'ext-1',
      isActive: false,
    },
  ];
  const playtomic = new Map<string, PlaytomicCourtSport>([
    [
      'ext-1',
      {
        externalCourtId: 'ext-1',
        sport: Sport.TENNIS,
        resourceName: 'Tennis 1',
        sourceFile: 'test.json',
        tenantName: 'Tenant',
      },
    ],
  ]);

  const plan = buildReconcilePlan({
    clubs: [clubA],
    courts,
    playtomicByExternalId: playtomic,
    playtomicJsonResourceCount: 1,
  });

  assert(plan.courtProposals.length === 0, 'no overwrite on conflict');
  assert(plan.courtConflicts.length === 1, 'conflict recorded');
  assert(plan.manualFixes.length === 0, 'no manual fix for conflict');
}

function testSingleSportClubDefault(): void {
  const courts: CourtRow[] = [
    {
      id: 'c2',
      name: 'Court 2',
      clubId: clubA.id,
      sport: null,
      externalCourtId: null,
      isActive: true,
    },
  ];

  const plan = buildReconcilePlan({
    clubs: [clubA],
    courts,
    playtomicByExternalId: new Map(),
    playtomicJsonResourceCount: 0,
  });

  assert(plan.courtProposals.length === 1, 'single-sport fill');
  assert(plan.courtProposals[0].source === 'single-sport-club', 'single-sport source');
  assert(plan.courtProposals[0].proposedSport === Sport.PADEL, 'club default sport');
}

function testMultiSportManualFix(): void {
  const courts: CourtRow[] = [
    {
      id: 'c3',
      name: 'Court 3',
      clubId: clubMulti.id,
      sport: null,
      externalCourtId: null,
      isActive: true,
    },
  ];

  const plan = buildReconcilePlan({
    clubs: [clubMulti],
    courts,
    playtomicByExternalId: new Map(),
    playtomicJsonResourceCount: 0,
  });

  assert(plan.courtProposals.length === 0, 'no auto fill for multi-sport');
  assert(plan.manualFixes.length === 1, 'manual fix listed');
  assert(plan.summary.courtsStillNullAfterPlan === 1, 'court stays null');
}

function testSkipBars(): void {
  const courts: CourtRow[] = [
    {
      id: 'bar-court',
      name: 'Bar court',
      clubId: barClub.id,
      sport: null,
      externalCourtId: null,
      isActive: true,
    },
  ];

  const plan = buildReconcilePlan({
    clubs: [barClub],
    courts,
    playtomicByExternalId: new Map(),
    playtomicJsonResourceCount: 0,
  });

  assert(plan.courtProposals.length === 0, 'bar courts skipped');
  assert(plan.skippedBars.length === 1, 'bar club skipped');
  assert(plan.summary.courtsInScope === 0, 'no courts in scope');
}

function testIdempotentSnapshot(): void {
  const courts: CourtRow[] = [
    {
      id: 'c1',
      name: 'Court 1',
      clubId: clubA.id,
      sport: null,
      externalCourtId: null,
      isActive: true,
    },
  ];
  const plan = buildReconcilePlan({
    clubs: [clubA],
    courts,
    playtomicByExternalId: new Map(),
    playtomicJsonResourceCount: 0,
  });
  const snapshot = buildSnapshotFromPlan(plan);
  assert(snapshot.courts.length === 1, 'snapshot courts');
  assert(snapshot.courts[0].sport === null, 'snapshot stores prior null');
  assert(snapshot.version === 1, 'snapshot version');
}

function testReportSections(): void {
  const plan = buildReconcilePlan({
    clubs: [clubMulti],
    courts: [
      {
        id: 'c3',
        name: 'Court 3',
        clubId: clubMulti.id,
        sport: null,
        externalCourtId: null,
        isActive: true,
      },
    ],
    playtomicByExternalId: new Map(),
    playtomicJsonResourceCount: 0,
  });
  const report = formatReconcileReport(plan);
  assert(report.includes('Manual fix (null courts needing operator review)'), 'manual fix section');
  assert(report.includes('Summary'), 'summary section');
}

function main(): void {
  testPlaytomicFill();
  testPlaytomicConflict();
  testSingleSportClubDefault();
  testMultiSportManualFix();
  testSkipBars();
  testIdempotentSnapshot();
  testReportSections();
  console.log('courtClubSportsReconcile tests: OK');
}

main();
