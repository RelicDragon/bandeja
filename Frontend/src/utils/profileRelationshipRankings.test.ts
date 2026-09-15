import { describe, expect, it } from 'vitest';
import type { PerformanceRelationshipEntry, UserPerformanceInsights } from '@/api/users';
import {
  clampRelationshipPlaceIndex,
  dedupeRelationshipCards,
  distinctRelationshipRankingModes,
  firstRankedEntry,
  rankingFingerprint,
  resolveRelationshipsForMode,
} from './profileRelationshipRankings';

function entry(id: string, name = id): PerformanceRelationshipEntry {
  return {
    user: { id, firstName: name, lastName: '' } as PerformanceRelationshipEntry['user'],
    wins: 1,
    losses: 0,
    ties: 0,
    totalMatches: 1,
    winRate: '100.0',
    ratingNetChange: 0.1,
    games: [],
  };
}

function source(
  partial: Partial<UserPerformanceInsights['relationships']>,
): UserPerformanceInsights['relationships'] {
  return {
    bestPartner: [],
    worstPartner: [],
    bestPartnerByRating: [],
    worstPartnerByRating: [],
    bestPartnerByCount: [],
    worstPartnerByCount: [],
    favoriteTarget: [],
    nemesis: [],
    favoriteTargetByRating: [],
    nemesisByRating: [],
    favoriteTargetByCount: [],
    nemesisByCount: [],
    ...partial,
  };
}

describe('resolveRelationshipsForMode', () => {
  it('falls back to formulae when By* ranks are empty', () => {
    const best = [entry('a')];
    const worst = [entry('b')];
    const s = source({ bestPartner: best, worstPartner: worst });

    expect(resolveRelationshipsForMode(s, 'rating').bestPartner[0]?.user.id).toBe('a');
    expect(resolveRelationshipsForMode(s, 'games').worstPartner[0]?.user.id).toBe('b');
  });

  it('treats a non-array payload as empty ranks', () => {
    const s = source({
      bestPartner: [entry('a')],
      bestPartnerByRating: entry('r') as never,
    });
    expect(resolveRelationshipsForMode(s, 'rating').bestPartner[0]?.user.id).toBe('a');
  });

  it('prefers ByRating / ByCount when present', () => {
    const s = source({
      bestPartner: [entry('f')],
      bestPartnerByRating: [entry('r')],
      bestPartnerByCount: [entry('c')],
    });

    expect(resolveRelationshipsForMode(s, 'formulae').bestPartner[0]?.user.id).toBe('f');
    expect(resolveRelationshipsForMode(s, 'rating').bestPartner[0]?.user.id).toBe('r');
    expect(resolveRelationshipsForMode(s, 'games').bestPartner[0]?.user.id).toBe('c');
  });

  it('keeps 2nd and 3rd ranks for the active mode', () => {
    const s = source({
      bestPartner: [entry('f1'), entry('f2'), entry('f3')],
      bestPartnerByCount: [entry('c1'), entry('c2'), entry('c3')],
    });

    expect(resolveRelationshipsForMode(s, 'games').bestPartner.map((item) => item.user.id)).toEqual([
      'c1',
      'c2',
      'c3',
    ]);
    expect(resolveRelationshipsForMode(s, 'formulae').bestPartner.map((item) => item.user.id)).toEqual([
      'f1',
      'f2',
      'f3',
    ]);
  });
});

describe('distinctRelationshipRankingModes', () => {
  it('Polina sparse: only formulae when all modes resolve identically', () => {
    const vera = [entry('vera')];
    const ellina = [entry('ellina')];
    const s = source({
      bestPartner: vera,
      worstPartner: vera,
      bestPartnerByRating: vera,
      worstPartnerByRating: vera,
      bestPartnerByCount: vera,
      worstPartnerByCount: vera,
      favoriteTarget: ellina,
      nemesis: ellina,
      favoriteTargetByRating: ellina,
      nemesisByRating: ellina,
      favoriteTargetByCount: ellina,
      nemesisByCount: ellina,
    });

    expect(distinctRelationshipRankingModes(s)).toEqual(['formulae']);
  });

  it('keeps Rating and Games when each changes the people set', () => {
    const s = source({
      bestPartner: [entry('f-best')],
      worstPartner: [entry('f-worst')],
      bestPartnerByRating: [entry('r-best')],
      worstPartnerByRating: [entry('f-worst')],
      bestPartnerByCount: [entry('c-best')],
      worstPartnerByCount: [entry('f-worst')],
    });

    expect(distinctRelationshipRankingModes(s)).toEqual(['formulae', 'rating', 'games']);
  });

  it('keeps only one of Rating/Games when those two match each other', () => {
    const s = source({
      bestPartner: [entry('f')],
      worstPartner: [entry('fw')],
      bestPartnerByRating: [entry('alt')],
      worstPartnerByRating: [entry('fw')],
      bestPartnerByCount: [entry('alt')],
      worstPartnerByCount: [entry('fw')],
    });

    expect(distinctRelationshipRankingModes(s)).toEqual(['formulae', 'rating']);
  });

  it('keeps Games when only count ranking diverges', () => {
    const s = source({
      bestPartner: [entry('f')],
      worstPartner: [entry('fw')],
      bestPartnerByRating: [entry('f')],
      worstPartnerByRating: [entry('fw')],
      bestPartnerByCount: [entry('c')],
      worstPartnerByCount: [entry('fw')],
    });

    expect(distinctRelationshipRankingModes(s)).toEqual(['formulae', 'games']);
  });

  it('treats missing By* as identical to formulae (no empty switch)', () => {
    const s = source({
      bestPartner: [entry('a')],
      worstPartner: [entry('b')],
      favoriteTarget: [entry('c')],
      nemesis: [entry('d')],
    });

    expect(distinctRelationshipRankingModes(s)).toEqual(['formulae']);
  });

  it('ignores 2nd/3rd ranks when deciding whether the overview switch appears', () => {
    const s = source({
      bestPartner: [entry('same'), entry('f2')],
      bestPartnerByCount: [entry('same'), entry('c2')],
    });

    expect(distinctRelationshipRankingModes(s)).toEqual(['formulae']);
  });
});

describe('dedupeRelationshipCards', () => {
  it('drops duplicate best/worst and favorite/nemesis', () => {
    const vera = entry('vera');
    const ellina = entry('ellina');
    const cards = dedupeRelationshipCards([
      { key: 'bestPartner' as const, entry: vera },
      { key: 'worstPartner' as const, entry: vera },
      { key: 'favoriteTarget' as const, entry: ellina },
      { key: 'nemesis' as const, entry: ellina },
    ]);

    expect(cards.map((c) => c.key)).toEqual(['bestPartner', 'favoriteTarget']);
  });

  it('keeps both partners when ids differ', () => {
    const cards = dedupeRelationshipCards([
      { key: 'bestPartner' as const, entry: entry('a') },
      { key: 'worstPartner' as const, entry: entry('b') },
    ]);

    expect(cards.map((c) => c.key)).toEqual(['bestPartner', 'worstPartner']);
  });

  it('drops cards with missing user id', () => {
    const cards = dedupeRelationshipCards([
      { key: 'bestPartner' as const, entry: null },
      { key: 'worstPartner' as const, entry: entry('b') },
    ]);

    expect(cards.map((c) => c.key)).toEqual(['worstPartner']);
  });
});

describe('rankingFingerprint', () => {
  it('is stable for same ids regardless of object identity', () => {
    const a = resolveRelationshipsForMode(source({ bestPartner: [entry('x')] }), 'formulae');
    const b = resolveRelationshipsForMode(source({ bestPartner: [entry('x')] }), 'formulae');
    expect(rankingFingerprint(a)).toBe(rankingFingerprint(b));
  });
});

describe('clampRelationshipPlaceIndex', () => {
  it('stays on 1st when only one person exists', () => {
    expect(clampRelationshipPlaceIndex([entry('a')], 2)).toBe(0);
  });

  it('allows 2nd but not 3rd when two people exist', () => {
    expect(clampRelationshipPlaceIndex([entry('a'), entry('b')], 1)).toBe(1);
    expect(clampRelationshipPlaceIndex([entry('a'), entry('b')], 2)).toBe(1);
  });

  it('allows 3rd when three people exist', () => {
    expect(clampRelationshipPlaceIndex([entry('a'), entry('b'), entry('c')], 2)).toBe(2);
  });
});

describe('firstRankedEntry', () => {
  it('returns the 1st place person', () => {
    expect(firstRankedEntry([entry('a'), entry('b')])?.user.id).toBe('a');
    expect(firstRankedEntry([])).toBeNull();
  });
});
