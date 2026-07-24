import { describe, expect, it } from 'vitest';
import type { PerformanceRelationshipEntry, UserPerformanceInsights } from '@/api/users';
import {
  dedupeRelationshipCards,
  distinctRelationshipRankingModes,
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
    bestPartner: null,
    worstPartner: null,
    favoriteTarget: null,
    nemesis: null,
    ...partial,
  };
}

describe('resolveRelationshipsForMode', () => {
  it('falls back to formulae when By* fields are missing', () => {
    const best = entry('a');
    const worst = entry('b');
    const s = source({ bestPartner: best, worstPartner: worst });

    expect(resolveRelationshipsForMode(s, 'rating').bestPartner?.user.id).toBe('a');
    expect(resolveRelationshipsForMode(s, 'games').worstPartner?.user.id).toBe('b');
  });

  it('prefers ByRating / ByCount when present', () => {
    const s = source({
      bestPartner: entry('f'),
      bestPartnerByRating: entry('r'),
      bestPartnerByCount: entry('c'),
    });

    expect(resolveRelationshipsForMode(s, 'formulae').bestPartner?.user.id).toBe('f');
    expect(resolveRelationshipsForMode(s, 'rating').bestPartner?.user.id).toBe('r');
    expect(resolveRelationshipsForMode(s, 'games').bestPartner?.user.id).toBe('c');
  });
});

describe('distinctRelationshipRankingModes', () => {
  it('Polina sparse: only formulae when all modes resolve identically', () => {
    const vera = entry('vera');
    const ellina = entry('ellina');
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
      bestPartner: entry('f-best'),
      worstPartner: entry('f-worst'),
      bestPartnerByRating: entry('r-best'),
      worstPartnerByRating: entry('f-worst'),
      bestPartnerByCount: entry('c-best'),
      worstPartnerByCount: entry('f-worst'),
    });

    expect(distinctRelationshipRankingModes(s)).toEqual(['formulae', 'rating', 'games']);
  });

  it('keeps only one of Rating/Games when those two match each other', () => {
    const s = source({
      bestPartner: entry('f'),
      worstPartner: entry('fw'),
      bestPartnerByRating: entry('alt'),
      worstPartnerByRating: entry('fw'),
      bestPartnerByCount: entry('alt'),
      worstPartnerByCount: entry('fw'),
    });

    expect(distinctRelationshipRankingModes(s)).toEqual(['formulae', 'rating']);
  });

  it('keeps Games when only count ranking diverges', () => {
    const s = source({
      bestPartner: entry('f'),
      worstPartner: entry('fw'),
      bestPartnerByRating: entry('f'),
      worstPartnerByRating: entry('fw'),
      bestPartnerByCount: entry('c'),
      worstPartnerByCount: entry('fw'),
    });

    expect(distinctRelationshipRankingModes(s)).toEqual(['formulae', 'games']);
  });

  it('treats missing By* as identical to formulae (no empty switch)', () => {
    const s = source({
      bestPartner: entry('a'),
      worstPartner: entry('b'),
      favoriteTarget: entry('c'),
      nemesis: entry('d'),
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
    const a = resolveRelationshipsForMode(source({ bestPartner: entry('x') }), 'formulae');
    const b = resolveRelationshipsForMode(source({ bestPartner: entry('x') }), 'formulae');
    expect(rankingFingerprint(a)).toBe(rankingFingerprint(b));
  });
});
