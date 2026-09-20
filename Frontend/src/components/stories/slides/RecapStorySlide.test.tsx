// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { RecapSegmentPayload, RecapSlideKind } from '@/api/recap';
import type { StorySegment } from '@/api/stories';

let reducedMotion = false;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    // Quote-free so assertions survive React's HTML escaping.
    t: (key: string, options?: Record<string, unknown>) =>
      options
        ? `${key}|${Object.entries(options)
            .map(([name, value]) => `${name}=${String(value)}`)
            .join(',')}`
        : key,
    i18n: { language: 'en', dir: () => 'ltr' },
  }),
}));

vi.mock('@/hooks/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => reducedMotion,
}));

// The chemistry chip self-fetches; the slide only has to mount it.
vi.mock('@/components/pairs/ChemistryChip', () => ({
  ChemistryChip: ({ userAId, userBId }: { userAId: string; userBId: string }) => (
    <span data-testid="chemistry-chip" data-pair={`${userAId},${userBId}`} />
  ),
}));

vi.mock('framer-motion', () => {
  const create = (tag: string) =>
    ({ initial, animate, transition, ...rest }: Record<string, unknown>) => {
      const Tag = tag as 'span';
      return (
        <Tag
          {...(rest as object)}
          data-initial={initial === false ? 'false' : 'object'}
          data-duration={String((transition as { duration?: number } | undefined)?.duration ?? '')}
          data-animate={JSON.stringify(animate)}
        />
      );
    };
  return {
    motion: new Proxy({}, { get: (_target, tag) => create(String(tag)) }),
  };
});

import { RecapStorySlide } from './RecapStorySlide';

const TOTALS: NonNullable<RecapSegmentPayload['totals']> = {
  games: 14,
  wins: 9,
  losses: 5,
  ties: 0,
  winRatePct: 64,
  playedDays: [2, 9],
  clubs: 2,
  partners: 4,
};

const BASE: RecapSegmentPayload = {
  monthKey: '2026-09',
  monthStart: '2026-09-01T00:00:00.000Z',
  slideKey: 'cover',
  kind: 'COVER',
  sport: null,
  sports: ['PADEL'],
  variant: 'FULL',
  sensitive: false,
  owner: { firstName: 'Mia', lastName: 'Ortiz', avatar: null, isPremium: false },
  totals: TOTALS,
};

function segment(
  kind: RecapSlideKind,
  extra: Partial<RecapSegmentPayload> = {},
): Extract<StorySegment, { sourceType: 'MONTHLY_RECAP' }> {
  return {
    key: `MONTHLY_RECAP:2026-09#${kind}`,
    sourceType: 'MONTHLY_RECAP',
    viewed: false,
    createdAt: '2026-10-01T04:00:00.000Z',
    recap: { ...BASE, kind, slideKey: kind.toLowerCase(), ...extra },
  };
}

function render(
  kind: RecapSlideKind,
  extra: Partial<RecapSegmentPayload> = {},
  viewerId?: string,
): string {
  return renderToStaticMarkup(
    <RecapStorySlide segment={segment(kind, extra)} viewerId={viewerId} />,
  );
}

describe('RecapStorySlide', () => {
  it('renders the cover with the owner, the month and the sport chips', () => {
    const html = render('COVER');
    expect(html).toContain('Mia Ortiz');
    expect(html).toContain('September 2026');
    expect(html).toContain('recap.slides.cover.caption');
    expect(html).toContain('sport.padel');
  });

  it('renders the games dot calendar as whole weeks', () => {
    const html = render('GAMES', {
      sport: 'PADEL',
      games: { count: 14, daysInMonth: 30, weekdayOffset: 1, playedDays: [2, 9, 17] },
    });
    // 1 pad + 30 days + 4 trailing pads = 35 dots.
    expect(html.match(/aspect-square/g)).toHaveLength(35);
    expect(html).toContain('recap.slides.games.eyebrow');
  });

  it('draws the win-rate ring and announces the percentage', () => {
    const html = render('WINS', {
      sport: 'PADEL',
      wins: { wins: 9, losses: 5, ties: 0, games: 14, winRatePct: 64 },
    });
    expect(html).toContain('64%');
    expect(html).toContain('stroke-emerald-200');
    expect(html).toContain('recap.slides.wins.alt');
  });

  it('keeps the level copy neutral when the level went down', () => {
    const html = render('LEVEL', {
      sport: 'PADEL',
      level: { before: 4.0, after: 3.8, delta: -0.2, points: [4, 3.9, 3.8] },
    });
    expect(html).toContain('recap.slides.level.neutral');
    expect(html).not.toContain('recap.slides.level.caption');
    expect(html).toContain('4.0 → 3.8');
  });

  it('uses the celebratory level copy when the level went up', () => {
    const html = render('LEVEL', {
      sport: 'PADEL',
      level: { before: 3.9, after: 4.1, delta: 0.2, points: [3.9, 4.1] },
    });
    expect(html).toContain('recap.slides.level.caption');
    expect(html).not.toContain('recap.slides.level.neutral');
  });

  it('mounts the chemistry chip on the partner slide when the viewer is known', () => {
    const html = render(
      'PARTNER',
      {
        sport: 'PADEL',
        partner: {
          userId: 'partner-1',
          firstName: 'Ana',
          lastName: null,
          avatar: null,
          wins: 5,
          games: 7,
        },
      },
      'me-1',
    );
    expect(html).toContain('data-pair="me-1,partner-1"');
    expect(html).toContain('Ana');
  });

  it('omits the chemistry chip when there is no viewer id', () => {
    const html = render('PARTNER', {
      sport: 'PADEL',
      partner: {
        userId: 'partner-1',
        firstName: 'Ana',
        lastName: null,
        avatar: null,
        wins: 5,
        games: 7,
      },
    });
    expect(html).not.toContain('chemistry-chip');
  });

  it('hides the personal best line when it equals the current streak', () => {
    const withBest = render('STREAK', { streak: { weeks: 4, best: 6 } });
    const withoutBest = render('STREAK', { streak: { weeks: 6, best: 6 } });
    expect(withBest).toContain('recap.slides.streak.best');
    expect(withoutBest).not.toContain('recap.slides.streak.best');
  });

  it('renders the club slide from the payload', () => {
    const html = render('CLUB', {
      sport: 'PADEL',
      club: { clubId: 'c1', name: 'Padel Centar', avatar: null, games: 8 },
    });
    expect(html).toContain('Padel Centar');
    expect(html).toContain('count=8');
  });

  it('renders the low-activity slide with its encouragement, not an empty stats reel', () => {
    const html = render('LOW_ACTIVITY', {
      variant: 'LOW_ACTIVITY',
      totals: { ...TOTALS, games: 1, wins: 0, losses: 1, winRatePct: 0 },
    });
    expect(html).toContain('recap.slides.lowActivity.encouragement');
    expect(html).toContain('count=1');
  });

  it('renders nothing for a slide whose payload slice is missing', () => {
    expect(render('WINS', { sport: 'PADEL' })).not.toContain('recap.slides.wins.caption');
    expect(render('PARTNER', { sport: 'PADEL' })).not.toContain('recap.slides.partner.caption');
    expect(render('CLUB', { sport: 'PADEL' })).not.toContain('recap.slides.club.caption');
  });

  it('exposes a text alternative for every slide kind', () => {
    const kinds: RecapSlideKind[] = [
      'COVER',
      'GAMES',
      'WINS',
      'LEVEL',
      'PARTNER',
      'STREAK',
      'CLUB',
      'LOW_ACTIVITY',
      'OUTRO',
    ];
    for (const kind of kinds) {
      expect(render(kind)).toContain(`aria-label="recap.slides.`);
    }
  });

  describe('reduced motion', () => {
    it('skips the chart draw and the dot stagger', () => {
      reducedMotion = true;
      try {
        const games = render('GAMES', {
          sport: 'PADEL',
          games: { count: 3, daysInMonth: 30, weekdayOffset: 0, playedDays: [1] },
        });
        expect(games).not.toContain('data-initial="object"');

        const wins = render('WINS', {
          sport: 'PADEL',
          wins: { wins: 9, losses: 5, ties: 0, games: 14, winRatePct: 64 },
        });
        expect(wins).toContain('data-duration="0"');
        expect(wins).not.toContain('data-initial="object"');

        const level = render('LEVEL', {
          sport: 'PADEL',
          level: { before: 3.9, after: 4.1, delta: 0.2, points: [3.9, 4.1] },
        });
        expect(level).toContain('data-duration="0"');
      } finally {
        reducedMotion = false;
      }
    });

    it('animates when motion is allowed', () => {
      const wins = render('WINS', {
        sport: 'PADEL',
        wins: { wins: 9, losses: 5, ties: 0, games: 14, winRatePct: 64 },
      });
      expect(wins).toContain('data-initial="object"');
      expect(wins).toContain('data-duration="0.5"');
    });
  });
});
