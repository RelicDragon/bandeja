/**
 * PRD 345 — "this occurrence only" vs "this and future games".
 *
 * `resultsStatus !== 'NONE'` is the mutation lock (docs/product/constraints.md),
 * never `Game.status`. An occurrence whose results have started keeps whatever
 * the organizer agreed on that night, so a template rewrite must skip it — and
 * say so, because the UI shows "2 games keep their current details".
 */

export type GameSeriesEditScope = 'occurrence' | 'future';

export const GAME_SERIES_EDIT_SCOPES: readonly GameSeriesEditScope[] = ['occurrence', 'future'];

export function isGameSeriesEditScope(value: unknown): value is GameSeriesEditScope {
  return value === 'occurrence' || value === 'future';
}

export interface OccurrenceForScope {
  id: string;
  /** Club-local `YYYY-MM-DD`. */
  occurrenceDayKey: string;
  startTime: Date;
  resultsStatus: string;
  status: string;
}

export interface PartitionOccurrencesInput {
  occurrences: readonly OccurrenceForScope[];
  /** Occurrences strictly before this day key are history and are never touched. */
  fromDayKey: string;
  /** Instant used to decide whether an occurrence has already started. */
  now: Date;
}

export interface PartitionedOccurrences {
  /** Unstarted, unlocked — the template rewrite applies here. */
  applicable: OccurrenceForScope[];
  /** Results already started: kept as-is, reported to the UI. */
  locked: OccurrenceForScope[];
  /** Already under way or finished by the clock: kept as-is, reported to the UI. */
  started: OccurrenceForScope[];
}

/**
 * Split the occurrences of a series into the three buckets a "this and future"
 * edit cares about. Pure — feed it rows, get back ids.
 */
export function partitionOccurrencesForFutureEdit({
  occurrences,
  fromDayKey,
  now,
}: PartitionOccurrencesInput): PartitionedOccurrences {
  const applicable: OccurrenceForScope[] = [];
  const locked: OccurrenceForScope[] = [];
  const started: OccurrenceForScope[] = [];

  for (const occurrence of occurrences) {
    if (occurrence.occurrenceDayKey < fromDayKey) continue;
    if (occurrence.resultsStatus !== 'NONE') {
      locked.push(occurrence);
      continue;
    }
    if (occurrence.status === 'ARCHIVED' || occurrence.startTime.getTime() <= now.getTime()) {
      started.push(occurrence);
      continue;
    }
    applicable.push(occurrence);
  }

  return { applicable, locked, started };
}

/**
 * Occurrences that `endSeries` may delete: future, unstarted, results-free.
 * `GameDeleteService` re-checks both conditions and refuses anything else — this
 * is the cheap pre-filter so we do not fire doomed deletes.
 */
export function selectDeletableOccurrences(
  occurrences: readonly OccurrenceForScope[],
  now: Date,
): { deletable: OccurrenceForScope[]; kept: OccurrenceForScope[] } {
  const deletable: OccurrenceForScope[] = [];
  const kept: OccurrenceForScope[] = [];

  for (const occurrence of occurrences) {
    if (occurrence.resultsStatus === 'NONE' && occurrence.startTime.getTime() > now.getTime()) {
      deletable.push(occurrence);
    } else {
      kept.push(occurrence);
    }
  }

  return { deletable, kept };
}

/**
 * Who gets the "same time next week?" prompt.
 *
 * Pure so it can be unit-tested without a database. The three rules, in order:
 * you must have **played** this week (a regular who sat out is not nudged), you
 * must still be on the **regular roster**, and you must not already be PLAYING
 * on the next occurrence — that last one is what makes a re-run of the hook
 * harmless after someone has accepted.
 */
export function selectCarryOverRecipients(input: {
  playedHere: readonly string[];
  regulars: readonly string[];
  alreadyOnNext: readonly string[];
}): string[] {
  const regularSet = new Set(input.regulars);
  const onNextSet = new Set(input.alreadyOnNext);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const userId of input.playedHere) {
    if (seen.has(userId)) continue;
    seen.add(userId);
    if (!regularSet.has(userId)) continue;
    if (onNextSet.has(userId)) continue;
    out.push(userId);
  }
  return out;
}
