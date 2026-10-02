/**
 * Repair the level slide of stored MonthlyRecap payloads.
 *
 * Before c53d111a8 the recap builder folded sportless LevelChangeEvents
 * (social-level SOCIAL_PARTICIPANT / SOCIAL_BAR) into every sport's level
 * journey. This recomputes only the level-derived fields —
 * `sports[].level` and the LEVEL slide's `sensitive` flag — and leaves the
 * rest of the stored payload (totals, streak, partners, viewedAt…) untouched,
 * so nothing else drifts and no push is re-sent.
 *
 *   npx ts-node --transpile-only scripts/backfillMonthlyRecapLevel.ts [--month 2026-09]
 *   npx ts-node --transpile-only scripts/backfillMonthlyRecapLevel.ts [--month 2026-09] --apply
 */
import dotenv from 'dotenv';
dotenv.config();

import { Prisma } from '@prisma/client';
import prisma from '../src/config/database';
import { loadRecapBuildInput, loadRecapOwner } from '../src/services/recap/recapInputs.loader';
import { buildMonthlyRecapPayload } from '../src/services/recap/recapPayload.builder';
import type { MonthlyRecapPayload, RecapLevel } from '../src/services/recap/recap.types';

// Field-wise: jsonb does not keep key order, so JSON.stringify never matches.
function sameLevel(a: RecapLevel | null, b: RecapLevel | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.before === b.before &&
    a.after === b.after &&
    a.delta === b.delta &&
    a.points.length === b.points.length &&
    a.points.every((point, i) => point === b.points[i])
  );
}

async function run(apply: boolean, monthKey: string | null): Promise<void> {
  const rows = await prisma.monthlyRecap.findMany({
    where: monthKey ? { monthKey } : {},
    select: { id: true, userId: true, monthKey: true, payload: true },
    orderBy: [{ monthKey: 'asc' }, { userId: 'asc' }],
  });
  console.log(`Recaps: ${rows.length}${monthKey ? ` (month ${monthKey})` : ''}`);

  let changed = 0;
  let skipped = 0;
  for (const row of rows) {
    const stored = row.payload as unknown as MonthlyRecapPayload;
    if (!stored || !Array.isArray(stored.sports) || !Array.isArray(stored.slides)) {
      skipped += 1;
      console.warn(`skip ${row.id}: unreadable payload`);
      continue;
    }
    const owner = await loadRecapOwner(row.userId);
    if (!owner) {
      skipped += 1;
      continue;
    }
    const fresh = buildMonthlyRecapPayload(await loadRecapBuildInput(owner, row.monthKey));
    const freshBySport = new Map(fresh.sports.map((group) => [group.sport, group.level]));

    const diffs: string[] = [];
    const sports = stored.sports.map((group) => {
      if (!freshBySport.has(group.sport)) return group;
      const level = freshBySport.get(group.sport) ?? null;
      if (sameLevel(group.level, level)) return group;
      diffs.push(
        `${group.sport} ${group.level?.before}→${group.level?.after} ⇒ ${level?.before}→${level?.after}`,
      );
      return { ...group, level };
    });
    if (diffs.length === 0) continue;

    const levelBySport = new Map(sports.map((group) => [group.sport, group.level]));
    const slides = stored.slides.map((slide) => {
      if (slide.kind !== 'LEVEL' || !slide.sport) return slide;
      const level = levelBySport.get(slide.sport);
      return level ? { ...slide, sensitive: level.delta < 0 } : slide;
    });

    changed += 1;
    console.log(`${row.monthKey} ${row.userId}: ${diffs.join('; ')}`);
    if (!apply) continue;
    await prisma.monthlyRecap.update({
      where: { id: row.id },
      data: { payload: { ...stored, sports, slides } as unknown as Prisma.InputJsonValue },
    });
  }

  console.log(
    apply
      ? `Updated ${changed} recap(s), skipped ${skipped}.`
      : `Dry run: ${changed} recap(s) would change, skipped ${skipped} (pass --apply to write)`,
  );
}

const monthIdx = process.argv.indexOf('--month');
const month = monthIdx >= 0 ? process.argv[monthIdx + 1] ?? null : null;
run(process.argv.includes('--apply'), month)
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
