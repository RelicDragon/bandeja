import type { PairPeriod } from '@/api/pairs';

/** PRD 352 — period chips, newest window last so "all" reads as the default. */
export const PAIR_PERIODS: readonly PairPeriod[] = ['all', '30', '10'];
