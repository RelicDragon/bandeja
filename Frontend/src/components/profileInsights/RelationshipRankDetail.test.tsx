// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { PerformanceRelationshipEntry } from '@/api/users';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/utils/dateFormat', () => ({
  formatDate: () => 'Jan 1',
}));

import { RelationshipPlaceSwitch } from './RelationshipPlaceSwitch';
import { RelationshipRankDetail } from './RelationshipRankDetail';

function entry(id: string, wins: number): PerformanceRelationshipEntry {
  return {
    user: { id, firstName: id, lastName: '' } as PerformanceRelationshipEntry['user'],
    wins,
    losses: 0,
    ties: 0,
    totalMatches: wins,
    winRate: '100.0',
    ratingNetChange: 0.1,
    games: [],
  };
}

describe('RelationshipPlaceSwitch', () => {
  it('hides when only one person is ranked', () => {
    const html = renderToStaticMarkup(
      <RelationshipPlaceSwitch rankCount={1} placeIndex={0} onChange={() => undefined} />,
    );
    expect(html).toBe('');
  });

  it('shows 1st and 2nd when two people are ranked', () => {
    const html = renderToStaticMarkup(
      <RelationshipPlaceSwitch rankCount={2} placeIndex={0} onChange={() => undefined} />,
    );
    expect(html).toContain('data-testid="relationship-place-switch"');
    expect(html).toContain('playerCard.relationshipPlace1');
    expect(html).toContain('playerCard.relationshipPlace2');
    expect(html).not.toContain('playerCard.relationshipPlace3');
  });

  it('shows 3rd when three people are ranked', () => {
    const html = renderToStaticMarkup(
      <RelationshipPlaceSwitch rankCount={3} placeIndex={0} onChange={() => undefined} />,
    );
    expect(html).toContain('playerCard.relationshipPlace3');
  });
});

describe('RelationshipRankDetail', () => {
  it('shows the ranking method under the title', () => {
    const html = renderToStaticMarkup(
      <RelationshipRankDetail
        icon={() => null}
        label="Best partner"
        tone="text-green-600"
        ranks={[entry('a', 12), entry('b', 11), entry('c', 10)]}
        placeIndex={0}
        rankingMode="games"
        onPlaceIndexChange={() => undefined}
        onBack={() => undefined}
      />,
    );
    expect(html).toContain('Best partner');
    expect(html).toContain('data-testid="relationship-ranking-method"');
    expect(html).toContain('playerCard.relationshipRankingGames');
    expect(html).toContain('>a</div>');
  });

  it('shows the 2nd-place person for games ranking', () => {
    const html = renderToStaticMarkup(
      <RelationshipRankDetail
        icon={() => null}
        label="Best partner"
        tone="text-green-600"
        ranks={[entry('a', 12), entry('b', 11), entry('c', 10)]}
        placeIndex={1}
        rankingMode="games"
        onPlaceIndexChange={() => undefined}
        onBack={() => undefined}
      />,
    );
    expect(html).toContain('>b</div>');
    expect(html).toContain('11');
  });
});
