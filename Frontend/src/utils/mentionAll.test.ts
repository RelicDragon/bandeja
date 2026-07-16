import { describe, expect, it } from 'vitest';
import {
  ALL_MENTION_ID,
  expandMentionIds,
  isAllMentionId,
  matchesAllMentionQuery,
} from './mentionAll';

describe('mentionAll', () => {
  it('detects all mention id', () => {
    expect(isAllMentionId(ALL_MENTION_ID)).toBe(true);
    expect(isAllMentionId('user-1')).toBe(false);
  });

  it('matches all mention query', () => {
    expect(matchesAllMentionQuery('')).toBe(true);
    expect(matchesAllMentionQuery('a')).toBe(true);
    expect(matchesAllMentionQuery('all')).toBe(true);
    expect(matchesAllMentionQuery('bob')).toBe(false);
  });

  it('expands all mention into participant ids excluding self', () => {
    expect(expandMentionIds(['all', 'u2'], ['u1', 'u2', 'u3'], 'u1')).toEqual(['u2', 'u3']);
  });

  it('leaves normal mentions unchanged', () => {
    expect(expandMentionIds(['u2'], ['u1', 'u2', 'u3'], 'u1')).toEqual(['u2']);
  });
});
