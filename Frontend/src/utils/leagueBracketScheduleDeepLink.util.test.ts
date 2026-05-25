import { describe, expect, it } from 'vitest';
import {
  buildLeagueBracketSchedulePath,
  buildLeagueBracketScheduleSearch,
  parseLeagueBracketScheduleSearch,
} from './leagueBracketScheduleDeepLink.util';

describe('leagueBracketScheduleDeepLink.util (UX-A2 / UX-C7)', () => {
  it('includes tab, subtab, roundId, round alias, and group for PER_GROUP', () => {
    const search = buildLeagueBracketScheduleSearch({
      roundId: 'round-1',
      groupId: 'g1',
      bracketScope: 'PER_GROUP',
    });
    expect(search).toContain('tab=schedule');
    expect(search).toContain('subtab=bracket');
    expect(search).toContain('roundId=round-1');
    expect(search).toContain('round=round-1');
    expect(search).toContain('group=g1');
  });

  it('omits group for CROSS_GROUP', () => {
    const search = buildLeagueBracketScheduleSearch({
      roundId: 'round-2',
      groupId: 'g1',
      bracketScope: 'CROSS_GROUP',
    });
    expect(search).not.toContain('group=');
  });

  it('builds season schedule path', () => {
    expect(buildLeagueBracketSchedulePath('season-1', { roundId: 'r1', groupId: 'g1' })).toBe(
      '/games/season-1?tab=schedule&subtab=bracket&roundId=r1&round=r1&group=g1'
    );
  });

  it('parseLeagueBracketScheduleSearch reads roundId or round alias', () => {
    expect(parseLeagueBracketScheduleSearch('?roundId=r1&group=g2')).toEqual({
      roundId: 'r1',
      groupId: 'g2',
    });
    expect(parseLeagueBracketScheduleSearch('?round=r9')).toEqual({
      roundId: 'r9',
      groupId: null,
    });
  });
});
