import * as fs from 'fs';
import * as path from 'path';
import { Sport } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { mergeClubSports } from '../../src/shared/clubSports';
import { mapPlaytomicSportToSport } from '../../src/sport/playtomicSport';

const JSON_DIRS = [
  path.join(__dirname, '..', '..', 'additions', 'playtomic', 'jsons'),
  path.join(__dirname, '..', '..', 'additions', 'playtomic', 'jsons-archive'),
];

const SAMPLE_LIMIT = 50;

interface PtResource {
  resourceId: string;
  name: string;
  sport: string;
}

interface PtClub {
  tenant_name?: string;
  resources?: PtResource[];
}

export type CourtRow = {
  id: string;
  name: string;
  clubId: string;
  sport: Sport | null;
  externalCourtId: string | null;
  isActive: boolean;
};

export type ClubRow = {
  id: string;
  name: string;
  sports: Sport[];
  isBar: boolean;
};

export type PlaytomicCourtSport = {
  externalCourtId: string;
  sport: Sport;
  resourceName: string;
  sourceFile: string;
  tenantName: string;
};

export type CourtSportProposal = {
  courtId: string;
  courtName: string;
  clubId: string;
  clubName: string;
  currentSport: Sport | null;
  proposedSport: Sport;
  source: 'playtomic' | 'single-sport-club';
  isActive: boolean;
  externalCourtId: string | null;
};

export type CourtSportConflict = {
  courtId: string;
  courtName: string;
  clubId: string;
  clubName: string;
  currentSport: Sport;
  jsonSport: Sport;
  externalCourtId: string;
  resourceName: string;
  sourceFile: string;
  isActive: boolean;
};

export type ClubSportsProposal = {
  clubId: string;
  clubName: string;
  currentSports: Sport[];
  proposedSports: Sport[];
  addedSports: Sport[];
};

export type ManualFixRow = {
  courtId: string;
  courtName: string;
  clubId: string;
  clubName: string;
  clubSports: Sport[];
  isActive: boolean;
  reason: 'multi-sport-club-null-court' | 'empty-club-sports';
};

export type SkippedBarClub = {
  clubId: string;
  clubName: string;
  courtCount: number;
};

export type ReconcileSummary = {
  clubsInScope: number;
  courtsInScope: number;
  courtsWithNullSport: number;
  courtsWithSport: number;
  skippedBarClubs: number;
  skippedBarCourts: number;
  playtomicJsonResources: number;
  playtomicMatchedCourts: number;
  playtomicFillProposals: number;
  playtomicConflicts: number;
  singleSportClubFillProposals: number;
  clubSportsSyncProposals: number;
  manualFixCourts: number;
  courtsStillNullAfterPlan: number;
};

export type ReconcilePlan = {
  summary: ReconcileSummary;
  courtProposals: CourtSportProposal[];
  courtConflicts: CourtSportConflict[];
  clubSportsProposals: ClubSportsProposal[];
  manualFixes: ManualFixRow[];
  skippedBars: SkippedBarClub[];
};

export type ReconcileSnapshot = {
  version: 1;
  createdAt: string;
  courts: Array<{ id: string; sport: Sport | null }>;
  clubs: Array<{ id: string; sports: Sport[] }>;
};

export function listPlaytomicJsonFiles(jsonDirs: string[] = JSON_DIRS): string[] {
  const files: string[] = [];
  for (const dir of jsonDirs) {
    if (!fs.existsSync(dir)) continue;
    const names = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    for (const name of names) {
      files.push(path.join(dir, name));
    }
  }
  return files.sort();
}

export function loadPlaytomicCourtSports(jsonDirs: string[] = JSON_DIRS): {
  byExternalId: Map<string, PlaytomicCourtSport>;
  jsonResourceCount: number;
  duplicateExternalIds: string[];
  unsupportedSports: Set<string>;
} {
  const byExternalId = new Map<string, PlaytomicCourtSport>();
  const duplicateExternalIds: string[] = [];
  const unsupportedSports = new Set<string>();
  let jsonResourceCount = 0;

  for (const filePath of listPlaytomicJsonFiles(jsonDirs)) {
    const sourceFile = path.basename(filePath);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const clubs: PtClub[] = JSON.parse(raw);
    for (const club of clubs) {
      const tenantName = (club.tenant_name || '').trim() || sourceFile;
      for (const res of club.resources || []) {
        const externalCourtId = (res.resourceId || '').trim();
        if (!externalCourtId) continue;
        jsonResourceCount++;
        const sport = mapPlaytomicSportToSport(res.sport || '');
        if (!sport) {
          const key = (res.sport || '').trim().toUpperCase();
          if (key) unsupportedSports.add(key);
          continue;
        }
        const entry: PlaytomicCourtSport = {
          externalCourtId,
          sport,
          resourceName: res.name || externalCourtId,
          sourceFile,
          tenantName,
        };
        const existing = byExternalId.get(externalCourtId);
        if (existing) {
          if (existing.sport !== sport && !duplicateExternalIds.includes(externalCourtId)) {
            duplicateExternalIds.push(externalCourtId);
          }
          continue;
        }
        byExternalId.set(externalCourtId, entry);
      }
    }
  }

  return { byExternalId, jsonResourceCount, duplicateExternalIds, unsupportedSports };
}

function sportsEqual(a: Sport[], b: Sport[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((s, i) => s === b[i]);
}

function mergeCourtSportsForClub(courtSports: Array<Sport | null>): Sport[] {
  let merged: Sport[] = [];
  for (const sport of courtSports) {
    if (sport == null) continue;
    merged = mergeClubSports(merged, sport);
  }
  return merged;
}

export function buildReconcilePlan(input: {
  clubs: ClubRow[];
  courts: CourtRow[];
  playtomicByExternalId: Map<string, PlaytomicCourtSport>;
  playtomicJsonResourceCount: number;
}): ReconcilePlan {
  const { clubs, courts, playtomicByExternalId, playtomicJsonResourceCount } = input;
  const clubById = new Map(clubs.map((c) => [c.id, c]));

  const inScopeClubs = clubs.filter((c) => !c.isBar);
  const inScopeClubIds = new Set(inScopeClubs.map((c) => c.id));
  const skippedBars: SkippedBarClub[] = [];
  for (const club of clubs) {
    if (!club.isBar) continue;
    const courtCount = courts.filter((c) => c.clubId === club.id).length;
    skippedBars.push({ clubId: club.id, clubName: club.name, courtCount });
  }

  const inScopeCourts = courts.filter((c) => inScopeClubIds.has(c.clubId));
  const courtProposals: CourtSportProposal[] = [];
  const courtConflicts: CourtSportConflict[] = [];
  const manualFixes: ManualFixRow[] = [];
  const resolvedSportByCourtId = new Map<string, Sport | null>();

  let playtomicMatchedCourts = 0;

  for (const court of inScopeCourts) {
    const club = clubById.get(court.clubId);
    if (!club) continue;
    resolvedSportByCourtId.set(court.id, court.sport);

    const externalId = court.externalCourtId?.trim() || '';
    const pt = externalId ? playtomicByExternalId.get(externalId) : undefined;
    if (pt) playtomicMatchedCourts++;

    if (court.sport != null) {
      if (pt && pt.sport !== court.sport) {
        courtConflicts.push({
          courtId: court.id,
          courtName: court.name,
          clubId: club.id,
          clubName: club.name,
          currentSport: court.sport,
          jsonSport: pt.sport,
          externalCourtId: externalId,
          resourceName: pt.resourceName,
          sourceFile: pt.sourceFile,
          isActive: court.isActive,
        });
      }
      continue;
    }

    if (pt) {
      courtProposals.push({
        courtId: court.id,
        courtName: court.name,
        clubId: club.id,
        clubName: club.name,
        currentSport: null,
        proposedSport: pt.sport,
        source: 'playtomic',
        isActive: court.isActive,
        externalCourtId: externalId || null,
      });
      resolvedSportByCourtId.set(court.id, pt.sport);
      continue;
    }

    if (club.sports.length === 1) {
      const proposedSport = club.sports[0];
      courtProposals.push({
        courtId: court.id,
        courtName: court.name,
        clubId: club.id,
        clubName: club.name,
        currentSport: null,
        proposedSport,
        source: 'single-sport-club',
        isActive: court.isActive,
        externalCourtId: court.externalCourtId,
      });
      resolvedSportByCourtId.set(court.id, proposedSport);
      continue;
    }

    if (club.sports.length === 0) {
      manualFixes.push({
        courtId: court.id,
        courtName: court.name,
        clubId: club.id,
        clubName: club.name,
        clubSports: [],
        isActive: court.isActive,
        reason: 'empty-club-sports',
      });
      continue;
    }

    if (club.sports.length > 1) {
      manualFixes.push({
        courtId: court.id,
        courtName: court.name,
        clubId: club.id,
        clubName: club.name,
        clubSports: [...club.sports],
        isActive: court.isActive,
        reason: 'multi-sport-club-null-court',
      });
    }
  }

  const courtsByClub = new Map<string, CourtRow[]>();
  for (const court of inScopeCourts) {
    const list = courtsByClub.get(court.clubId) ?? [];
    list.push(court);
    courtsByClub.set(court.clubId, list);
  }

  const clubSportsProposals: ClubSportsProposal[] = [];
  for (const club of inScopeClubs) {
    const clubCourts = courtsByClub.get(club.id) ?? [];
    const effectiveSports = clubCourts.map((c) => resolvedSportByCourtId.get(c.id) ?? c.sport);
    const fromCourts = mergeCourtSportsForClub(effectiveSports);
    let proposedSports = [...club.sports];
    const addedSports: Sport[] = [];
    for (const sport of fromCourts) {
      const next = mergeClubSports(proposedSports, sport);
      if (next.length > proposedSports.length) {
        addedSports.push(sport);
      }
      proposedSports = next;
    }
    if (!sportsEqual(proposedSports, club.sports)) {
      clubSportsProposals.push({
        clubId: club.id,
        clubName: club.name,
        currentSports: [...club.sports],
        proposedSports,
        addedSports,
      });
    }
  }

  const courtsWithNullSport = inScopeCourts.filter((c) => c.sport == null).length;
  const courtsStillNullAfterPlan = inScopeCourts.filter(
    (c) => resolvedSportByCourtId.get(c.id) == null,
  ).length;

  const summary: ReconcileSummary = {
    clubsInScope: inScopeClubs.length,
    courtsInScope: inScopeCourts.length,
    courtsWithNullSport,
    courtsWithSport: inScopeCourts.length - courtsWithNullSport,
    skippedBarClubs: skippedBars.length,
    skippedBarCourts: skippedBars.reduce((n, b) => n + b.courtCount, 0),
    playtomicJsonResources: playtomicJsonResourceCount,
    playtomicMatchedCourts,
    playtomicFillProposals: courtProposals.filter((p) => p.source === 'playtomic').length,
    playtomicConflicts: courtConflicts.length,
    singleSportClubFillProposals: courtProposals.filter((p) => p.source === 'single-sport-club')
      .length,
    clubSportsSyncProposals: clubSportsProposals.length,
    manualFixCourts: manualFixes.length,
    courtsStillNullAfterPlan,
  };

  return {
    summary,
    courtProposals,
    courtConflicts,
    clubSportsProposals,
    manualFixes,
    skippedBars,
  };
}

function sampleRows<T>(rows: T[], limit = SAMPLE_LIMIT): T[] {
  return rows.slice(0, limit);
}

export function formatReconcileReport(plan: ReconcilePlan): string {
  const lines: string[] = [];
  const { summary } = plan;

  lines.push('=== Court & Club Sports Reconcile Audit ===');
  lines.push('');
  lines.push('Summary');
  lines.push(`  Clubs in scope (non-bar):        ${summary.clubsInScope}`);
  lines.push(`  Courts in scope:                 ${summary.courtsInScope}`);
  lines.push(`  Courts with sport set:           ${summary.courtsWithSport}`);
  lines.push(`  Courts with null sport:          ${summary.courtsWithNullSport}`);
  lines.push(`  Skipped bar clubs:               ${summary.skippedBarClubs}`);
  lines.push(`  Skipped bar courts:              ${summary.skippedBarCourts}`);
  lines.push(`  Playtomic JSON resources:        ${summary.playtomicJsonResources}`);
  lines.push(`  Courts matched by external id:   ${summary.playtomicMatchedCourts}`);
  lines.push(`  Proposed fills (Playtomic):      ${summary.playtomicFillProposals}`);
  lines.push(`  Proposed fills (single-sport):   ${summary.singleSportClubFillProposals}`);
  lines.push(`  JSON vs DB conflicts:            ${summary.playtomicConflicts}`);
  lines.push(`  Club sports sync proposals:      ${summary.clubSportsSyncProposals}`);
  lines.push(`  Manual fix courts:               ${summary.manualFixCourts}`);
  lines.push(`  Courts still null after plan:    ${summary.courtsStillNullAfterPlan}`);
  lines.push('');

  lines.push(`Court sport proposals (showing up to ${SAMPLE_LIMIT})`);
  if (plan.courtProposals.length === 0) {
    lines.push('  (none)');
  } else {
    for (const row of sampleRows(plan.courtProposals)) {
      lines.push(
        `  court=${row.courtId} "${row.courtName}" club="${row.clubName}" ` +
          `null → ${row.proposedSport} [${row.source}] active=${row.isActive}`,
      );
    }
    if (plan.courtProposals.length > SAMPLE_LIMIT) {
      lines.push(`  ... and ${plan.courtProposals.length - SAMPLE_LIMIT} more`);
    }
  }
  lines.push('');

  lines.push(`Club sports sync proposals (showing up to ${SAMPLE_LIMIT})`);
  if (plan.clubSportsProposals.length === 0) {
    lines.push('  (none)');
  } else {
    for (const row of sampleRows(plan.clubSportsProposals)) {
      lines.push(
        `  club=${row.clubId} "${row.clubName}" ` +
          `[${row.currentSports.join(', ')}] → [${row.proposedSports.join(', ')}] ` +
          `(add: ${row.addedSports.join(', ') || '—'})`,
      );
    }
    if (plan.clubSportsProposals.length > SAMPLE_LIMIT) {
      lines.push(`  ... and ${plan.clubSportsProposals.length - SAMPLE_LIMIT} more`);
    }
  }
  lines.push('');

  lines.push('--- Manual fix (null courts needing operator review) ---');
  if (plan.manualFixes.length === 0) {
    lines.push('  (none)');
  } else {
    for (const row of sampleRows(plan.manualFixes)) {
      lines.push(
        `  court=${row.courtId} "${row.courtName}" club="${row.clubName}" ` +
          `clubSports=[${row.clubSports.join(', ')}] active=${row.isActive}`,
      );
    }
    if (plan.manualFixes.length > SAMPLE_LIMIT) {
      lines.push(`  ... and ${plan.manualFixes.length - SAMPLE_LIMIT} more`);
    }
  }
  lines.push('');

  lines.push('--- Manual fix (JSON vs DB sport conflicts) ---');
  if (plan.courtConflicts.length === 0) {
    lines.push('  (none)');
  } else {
    for (const row of sampleRows(plan.courtConflicts)) {
      lines.push(
        `  court=${row.courtId} "${row.courtName}" club="${row.clubName}" ` +
          `db=${row.currentSport} json=${row.jsonSport} external=${row.externalCourtId} ` +
          `file=${row.sourceFile}`,
      );
    }
    if (plan.courtConflicts.length > SAMPLE_LIMIT) {
      lines.push(`  ... and ${plan.courtConflicts.length - SAMPLE_LIMIT} more`);
    }
  }

  return lines.join('\n');
}

export function buildSnapshotFromPlan(plan: ReconcilePlan): ReconcileSnapshot {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    courts: plan.courtProposals.map((p) => ({ id: p.courtId, sport: p.currentSport })),
    clubs: plan.clubSportsProposals.map((p) => ({
      id: p.clubId,
      sports: p.currentSports,
    })),
  };
}

export function loadSnapshot(filePath: string): ReconcileSnapshot {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw) as ReconcileSnapshot;
  if (parsed.version !== 1) {
    throw new Error(`Unsupported snapshot version: ${String((parsed as { version?: unknown }).version)}`);
  }
  return parsed;
}

export function defaultSnapshotDir(): string {
  return path.join(__dirname, '..', 'snapshots', 'court-club-sports');
}

export function writeSnapshot(snapshot: ReconcileSnapshot, dir = defaultSnapshotDir()): string {
  fs.mkdirSync(dir, { recursive: true });
  const stamp = snapshot.createdAt.replace(/[:.]/g, '-');
  const filePath = path.join(dir, `court-club-sports-${stamp}.json`);
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
  return filePath;
}

export async function loadDbRows(prisma: PrismaClient): Promise<{ clubs: ClubRow[]; courts: CourtRow[] }> {
  const clubs = await prisma.club.findMany({
    select: { id: true, name: true, sports: true, isBar: true },
  });
  const courts = await prisma.court.findMany({
    select: {
      id: true,
      name: true,
      clubId: true,
      sport: true,
      externalCourtId: true,
      isActive: true,
    },
  });
  return { clubs, courts };
}

export async function computeReconcilePlanFromDb(prisma: PrismaClient): Promise<ReconcilePlan> {
  const { clubs, courts } = await loadDbRows(prisma);
  const { byExternalId, jsonResourceCount } = loadPlaytomicCourtSports();
  return buildReconcilePlan({
    clubs,
    courts,
    playtomicByExternalId: byExternalId,
    playtomicJsonResourceCount: jsonResourceCount,
  });
}

export async function applyReconcilePlan(
  prisma: PrismaClient,
  plan: ReconcilePlan,
  courts: CourtRow[],
): Promise<{ snapshotPath: string; courtsUpdated: number; clubsUpdated: number }> {
  const snapshot = buildSnapshotFromPlan(plan);
  const snapshotPath = writeSnapshot(snapshot);

  let courtsUpdated = 0;
  for (const proposal of plan.courtProposals) {
    const court = courts.find((c) => c.id === proposal.courtId);
    if (!court || court.sport != null) continue;
    await prisma.court.update({
      where: { id: proposal.courtId },
      data: { sport: proposal.proposedSport },
    });
    courtsUpdated++;
  }

  let clubsUpdated = 0;
  for (const proposal of plan.clubSportsProposals) {
    await prisma.club.update({
      where: { id: proposal.clubId },
      data: { sports: proposal.proposedSports },
    });
    clubsUpdated++;
  }

  return { snapshotPath, courtsUpdated, clubsUpdated };
}

export async function rollbackFromSnapshot(
  prisma: PrismaClient,
  snapshot: ReconcileSnapshot,
): Promise<{ courtsRestored: number; clubsRestored: number }> {
  let courtsRestored = 0;
  for (const row of snapshot.courts) {
    await prisma.court.update({
      where: { id: row.id },
      data: { sport: row.sport },
    });
    courtsRestored++;
  }

  let clubsRestored = 0;
  for (const row of snapshot.clubs) {
    await prisma.club.update({
      where: { id: row.id },
      data: { sports: row.sports },
    });
    clubsRestored++;
  }

  return { courtsRestored, clubsRestored };
}
