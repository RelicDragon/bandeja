import { Bet } from '@prisma/client';
import { BetCondition, BetEvaluationResult } from './betConditionEvaluator.service';

const MISSING_TARGET_VOID_REASONS = new Set([
  'User did not participate',
  'Fixed pair not in outcomes',
  'Entity not in outcomes',
]);

export function shouldVoidBetDueToMissingTarget(result: BetEvaluationResult): boolean {
  return !!result.reason && MISSING_TARGET_VOID_REASONS.has(result.reason);
}

function getBetCondition(bet: Pick<Bet, 'condition'>): BetCondition | null {
  const condition = bet.condition;
  if (!condition || typeof condition !== 'object' || Array.isArray(condition)) return null;
  const c = condition as unknown as BetCondition;
  return c.type === 'CUSTOM' || c.type === 'PREDEFINED' ? c : null;
}

export function shouldRouteCustomBetToNeedsReview(
  bet: Pick<Bet, 'type' | 'creatorId' | 'acceptedBy' | 'condition'> & {
    participants?: { userId: string }[];
  }
): boolean {
  const condition = getBetCondition(bet);
  if (condition?.type !== 'CUSTOM') return false;

  if (bet.type === 'POOL') {
    const joiners = (bet.participants ?? []).filter(p => p.userId !== bet.creatorId);
    return joiners.length > 0;
  }

  return !!bet.acceptedBy;
}
