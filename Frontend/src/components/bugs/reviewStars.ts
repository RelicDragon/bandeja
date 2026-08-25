import type { BugType } from '@/types';

export const ALL_BUG_TYPES: BugType[] = ['BUG', 'CRITICAL', 'SUGGESTION', 'QUESTION', 'TASK', 'REVIEW'];

export type BugStars = 1 | 2 | 3 | 4 | 5;

export const BUG_STAR_VALUES: BugStars[] = [1, 2, 3, 4, 5];

export function isReviewBugType(type: string): boolean {
  return type === 'REVIEW';
}

export function isValidReviewStars(n: number): n is BugStars {
  return Number.isInteger(n) && n >= 1 && n <= 5;
}

export function defaultStarsWhenSwitchingToReview(): BugStars {
  return 3;
}
