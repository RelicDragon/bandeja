import { describe, expect, it } from 'vitest';
import type { BracketPlayoffResponse } from '@/api/leagues';
import {
  getActiveBracketGroup,
  isCrossGroupBracket,
  resolveBracketGroupFromQuery,
  shouldPromptBracketGroupSelection,
} from './bracketView.util';

function payload(scope: 'PER_GROUP' | 'CROSS_GROUP', groupIds: (string | null)[]): BracketPlayoffResponse {
  return {
    round: { id: 'r1', leagueSeasonId: 's1', orderIndex: 0, sentStartMessage: false, createdAt: '', updatedAt: '', games: [], bracketScope: scope, playoffFormat: 'BRACKET' },
    groups: groupIds.map((leagueGroupId) => ({
      leagueGroupId,
      entrantCount: 4,
      bracketSize: 4,
      byeCount: 0,
      playInGameCount: 0,
      slots: [],
    })),
  };
}

describe('bracketView.util', () => {
  it('detects CROSS_GROUP scope', () => {
    expect(isCrossGroupBracket(payload('CROSS_GROUP', [null]))).toBe(true);
    expect(isCrossGroupBracket(payload('PER_GROUP', ['g1']))).toBe(false);
  });

  it('getActiveBracketGroup ignores group filter for cross', () => {
    const p = payload('CROSS_GROUP', [null]);
    expect(getActiveBracketGroup(p, { selectedGroupId: 'g2', allGroupId: 'ALL' })?.leagueGroupId).toBeNull();
  });

  it('getActiveBracketGroup respects group filter for per-group', () => {
    const p = payload('PER_GROUP', ['g1', 'g2']);
    expect(getActiveBracketGroup(p, { selectedGroupId: 'g2', allGroupId: 'ALL' })?.leagueGroupId).toBe('g2');
  });

  it('UX-A1: All groups on PER_GROUP multi-group prompts selection instead of first tree', () => {
    const p = payload('PER_GROUP', ['g1', 'g2']);
    expect(shouldPromptBracketGroupSelection(p, { selectedGroupId: 'ALL', allGroupId: 'ALL' })).toBe(true);
    expect(getActiveBracketGroup(p, { selectedGroupId: 'ALL', allGroupId: 'ALL' })).toBeNull();
  });

  it('single-group PER_GROUP still resolves without prompt', () => {
    const p = payload('PER_GROUP', ['g1']);
    expect(shouldPromptBracketGroupSelection(p, { selectedGroupId: 'ALL', allGroupId: 'ALL' })).toBe(false);
    expect(getActiveBracketGroup(p, { selectedGroupId: 'ALL', allGroupId: 'ALL' })?.leagueGroupId).toBe('g1');
  });

  it('resolveBracketGroupFromQuery ignores invalid group for cross', () => {
    const p = payload('CROSS_GROUP', [null]);
    expect(resolveBracketGroupFromQuery(p, 'g99')?.leagueGroupId).toBeNull();
  });

  it('resolveBracketGroupFromQuery uses query for per-group', () => {
    const p = payload('PER_GROUP', ['g1', 'g2']);
    expect(resolveBracketGroupFromQuery(p, 'g2')?.leagueGroupId).toBe('g2');
    expect(resolveBracketGroupFromQuery(p, 'g99')?.leagueGroupId).toBe('g1');
  });
});
