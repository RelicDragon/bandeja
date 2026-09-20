import assert from 'node:assert/strict';
import type { Sport } from '@prisma/client';
import {
  runMonthlyRecapPass,
  type MonthlyRecapPassDeps,
  type RecapUserPage,
} from './monthlyRecapPass';
import type { RecapOwnerRow } from './recapInputs.loader';
import { MONTHLY_RECAP_PAYLOAD_VERSION, type MonthlyRecapPayload } from './recap.types';

function owner(id: string): RecapOwnerRow {
  return {
    id,
    firstName: id,
    lastName: null,
    avatar: null,
    isPremium: false,
    language: 'en',
    primarySport: 'PADEL' as Sport,
    playStreakCount: 0,
    playStreakBest: 0,
  };
}

function payload(monthKey: string): MonthlyRecapPayload {
  return {
    version: MONTHLY_RECAP_PAYLOAD_VERSION,
    monthKey,
    monthStart: `${monthKey}-01T00:00:00.000Z`,
    daysInMonth: 30,
    weekdayOffset: 1,
    variant: 'FULL',
    sports: [],
    totals: {
      games: 4,
      wins: 2,
      losses: 2,
      ties: 0,
      winRatePct: 50,
      playedDays: [1],
      clubs: 0,
      partners: 0,
    },
    streak: null,
    owner: { firstName: null, lastName: null, avatar: null, isPremium: false },
    slides: [{ key: 'cover', kind: 'COVER', sport: null, sensitive: false }],
  };
}

type Recorder = {
  deps: MonthlyRecapPassDeps;
  /** Rows the fake store already holds, keyed `userId:monthKey`. */
  stored: Set<string>;
  notified: string[];
  generateCalls: string[];
};

function recorder(options: {
  active?: string[];
  lowActivity?: string[];
  /** Ids the low-activity scan reads but filters out (they played last month). */
  lowActivityFiltered?: string[];
  preStored?: string[];
  failFor?: string;
  batchSize?: number;
}): Recorder {
  const stored = new Set<string>(options.preStored ?? []);
  const notified: string[] = [];
  const generateCalls: string[] = [];

  /**
   * A page source that scans `limit` ids and then drops the ones in `filtered`
   * — exactly what `findLowActivityUserIdsForMonth` does when a scanned user
   * also played last month. `nextCursor` reports the last id **scanned**.
   */
  const page = (all: string[], filtered: ReadonlySet<string> = new Set()) => async (
    _monthKey: string,
    pageOptions: { cursor?: string; limit: number },
  ): Promise<RecapUserPage> => {
    const start = pageOptions.cursor ? all.indexOf(pageOptions.cursor) + 1 : 0;
    const scanned = all.slice(start, start + pageOptions.limit);
    return {
      userIds: scanned.filter((id) => !filtered.has(id)),
      nextCursor:
        scanned.length < pageOptions.limit ? null : scanned[scanned.length - 1] ?? null,
    };
  };

  const deps: MonthlyRecapPassDeps = {
    batchSize: options.batchSize ?? 200,
    findActiveUserIds: page([...(options.active ?? [])].sort()),
    findLowActivityUserIds: page(
      [...(options.lowActivity ?? [])].sort(),
      new Set(options.lowActivityFiltered ?? []),
    ),
    loadOwner: async (userId) => owner(userId),
    generate: async (row, monthKey) => {
      generateCalls.push(row.id);
      if (options.failFor === row.id) throw new Error('boom');
      const key = `${row.id}:${monthKey}`;
      // Exactly what the unique (userId, monthKey) does: the second attempt
      // reports `created: false` and keeps the stored payload.
      const created = !stored.has(key);
      stored.add(key);
      return { created, payload: payload(monthKey) };
    },
    notify: async ({ userId }) => {
      notified.push(userId);
    },
    prune: async () => ({ recapsPruned: 3 }),
  };

  return { deps, stored, notified, generateCalls };
}

async function main(): Promise<void> {
  // --- day window ------------------------------------------------------------

  for (const day of ['01', '02', '03']) {
    const rec = recorder({ active: ['u1'] });
    const stats = await runMonthlyRecapPass(rec.deps, {
      now: new Date(`2026-10-${day}T04:00:00.000Z`),
    });
    assert.equal(stats.skippedOutsideWindow, false, `day ${day} runs`);
    assert.equal(stats.monthKey, '2026-09', 'the pass targets the month that just ended');
    assert.equal(stats.created, 1);
  }

  for (const day of ['04', '17', '31']) {
    const rec = recorder({ active: ['u1'] });
    const stats = await runMonthlyRecapPass(rec.deps, {
      now: new Date(`2026-10-${day}T04:00:00.000Z`),
    });
    assert.equal(stats.skippedOutsideWindow, true, `day ${day} is skipped`);
    assert.equal(stats.considered, 0, 'nothing is read outside the window');
    assert.equal(rec.notified.length, 0);
    assert.equal(stats.recapsPruned, 0, 'a skipped pass does not prune either');
  }

  {
    const rec = recorder({ active: ['u1'] });
    const stats = await runMonthlyRecapPass(rec.deps, {
      now: new Date('2026-10-17T04:00:00.000Z'),
      force: true,
    });
    assert.equal(stats.skippedOutsideWindow, false, 'force overrides the window');
    assert.equal(stats.created, 1);
  }

  // --- idempotency across the 1st / 2nd / 3rd -------------------------------

  {
    const rec = recorder({ active: ['a', 'b'], lowActivity: ['c'] });

    const first = await runMonthlyRecapPass(rec.deps, { now: new Date('2026-10-01T04:00:00.000Z') });
    assert.equal(first.created, 3);
    assert.equal(first.notified, 3);
    assert.deepEqual(rec.notified, ['a', 'b', 'c']);

    const second = await runMonthlyRecapPass(rec.deps, { now: new Date('2026-10-02T04:00:00.000Z') });
    assert.equal(second.considered, 3, 'the catch-up run still walks everybody');
    assert.equal(second.created, 0, 'no row is created twice');
    assert.equal(second.notified, 0, 'and nobody is pushed twice');

    const third = await runMonthlyRecapPass(rec.deps, { now: new Date('2026-10-03T04:00:00.000Z') });
    assert.equal(third.created, 0);
    assert.deepEqual(rec.notified, ['a', 'b', 'c'], 'exactly one push per user per month');
  }

  // --- a user who already has a row from an earlier attempt -----------------

  {
    const rec = recorder({ active: ['a', 'b'], preStored: ['a:2026-09'] });
    const stats = await runMonthlyRecapPass(rec.deps, { now: new Date('2026-10-02T04:00:00.000Z') });
    assert.equal(stats.created, 1);
    assert.deepEqual(rec.notified, ['b'], 'only the newly created recap is announced');
  }

  // --- one failure never stops the sweep ------------------------------------

  {
    const rec = recorder({ active: ['a', 'b', 'c'], failFor: 'b' });
    const stats = await runMonthlyRecapPass(rec.deps, { now: new Date('2026-10-01T04:00:00.000Z') });
    assert.equal(stats.failed, 1);
    assert.equal(stats.created, 2);
    assert.deepEqual(rec.notified, ['a', 'c']);
  }

  // --- paging ---------------------------------------------------------------

  {
    const many = Array.from({ length: 7 }, (_, i) => `u${i}`);
    const rec = recorder({ active: many, batchSize: 2 });
    const stats = await runMonthlyRecapPass(rec.deps, { now: new Date('2026-10-01T04:00:00.000Z') });
    assert.equal(stats.considered, 7, 'the cursor walks every page');
    assert.deepEqual(rec.generateCalls, [...many].sort());
  }

  // --- a short *filtered* page is not the end of the scan --------------------

  /*
   * The low-activity source reads `limit` ids and then drops anyone who also
   * played last month, so a full page routinely returns fewer ids than it
   * scanned. Breaking on that gave every lapsed user sorting after the first
   * such page no recap and no push, with no catch-up next month.
   */
  {
    const many = Array.from({ length: 6 }, (_, i) => `v${i}`);
    const rec = recorder({
      lowActivity: many,
      lowActivityFiltered: ['v0', 'v1'],
      batchSize: 2,
    });
    const stats = await runMonthlyRecapPass(rec.deps, { now: new Date('2026-10-01T04:00:00.000Z') });
    assert.equal(
      stats.considered,
      4,
      'the scan continues past a page whose rows were all filtered out',
    );
    assert.deepEqual(rec.generateCalls, ['v2', 'v3', 'v4', 'v5']);
    assert.deepEqual(rec.notified, ['v2', 'v3', 'v4', 'v5']);
  }

  // A page that is *entirely* filtered out must not end the sweep either.
  {
    const many = Array.from({ length: 4 }, (_, i) => `w${i}`);
    const rec = recorder({
      lowActivity: many,
      lowActivityFiltered: ['w0', 'w1'],
      batchSize: 2,
    });
    const stats = await runMonthlyRecapPass(rec.deps, { now: new Date('2026-10-01T04:00:00.000Z') });
    assert.equal(stats.considered, 2);
    assert.deepEqual(rec.notified, ['w2', 'w3']);
  }

  // --- retention -------------------------------------------------------------

  {
    const rec = recorder({ active: [] });
    const stats = await runMonthlyRecapPass(rec.deps, { now: new Date('2026-10-01T04:00:00.000Z') });
    assert.equal(stats.recapsPruned, 3, 'every pass prunes recaps past the 12-month window');
  }

}

main()
  .then(() => console.log('✅ monthlyRecapPass tests passed'))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
