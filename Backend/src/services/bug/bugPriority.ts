import { BugType } from '@prisma/client';

export const BUG_TYPE_VALUES: BugType[] = [
  BugType.BUG,
  BugType.CRITICAL,
  BugType.SUGGESTION,
  BugType.QUESTION,
  BugType.TASK,
  BugType.REVIEW,
];

export function isReviewBugType(type: string): boolean {
  return type === BugType.REVIEW;
}

export function isValidReviewStars(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 5;
}

export function parseOptionalInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = typeof value === 'number' ? value : parseInt(String(value), 10);
  if (!Number.isInteger(n)) return undefined;
  return n;
}

export function clampTrackerPriority(n: number): number {
  return Math.min(2, Math.max(-2, n));
}

export type BugPriorityResolveOk = { ok: true; priority: number };
export type BugPriorityResolveErr = { ok: false; code: 'errors.bugs.ratingRequired' | 'errors.bugs.ratingInvalid' };
export type BugPriorityResolve = BugPriorityResolveOk | BugPriorityResolveErr;

export function resolveCreatePriority(bugType: BugType, raw: unknown): BugPriorityResolve {
  if (isReviewBugType(bugType)) {
    const n = parseOptionalInt(raw);
    if (n === undefined) return { ok: false, code: 'errors.bugs.ratingRequired' };
    if (!isValidReviewStars(n)) return { ok: false, code: 'errors.bugs.ratingInvalid' };
    return { ok: true, priority: n };
  }
  const n = parseOptionalInt(raw);
  return { ok: true, priority: n === undefined ? 0 : clampTrackerPriority(n) };
}

export function resolveUpdatePriority(params: {
  existingType: BugType;
  nextType: BugType;
  raw: unknown;
}): BugPriorityResolve | { ok: true; priority: undefined } {
  const { existingType, nextType, raw } = params;
  const parsed = parseOptionalInt(raw);
  const switchingToReview = !isReviewBugType(existingType) && isReviewBugType(nextType);
  const switchingFromReview = isReviewBugType(existingType) && !isReviewBugType(nextType);

  if (isReviewBugType(nextType)) {
    if (parsed !== undefined) {
      if (!isValidReviewStars(parsed)) return { ok: false, code: 'errors.bugs.ratingInvalid' };
      return { ok: true, priority: parsed };
    }
    if (switchingToReview) {
      return { ok: true, priority: 3 };
    }
    return { ok: true, priority: undefined };
  }

  if (parsed !== undefined) {
    return { ok: true, priority: clampTrackerPriority(parsed) };
  }
  if (switchingFromReview) {
    return { ok: true, priority: 0 };
  }
  return { ok: true, priority: undefined };
}
