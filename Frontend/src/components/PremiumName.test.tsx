import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PremiumName } from './PremiumName';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: () => 'Premium' }) }));

// PRD 355 — the name reads its equipped colour through this hook, whose store
// pulls in `api/axios` (and through it the real i18n config) at module load.
// The `react-i18next` mock above has `useTranslation` alone, so that chain must
// not load. The bought-colour behaviour is covered by PremiumName.collection.test.tsx.
vi.mock('@/features/collection/useEquippedGoods', () => ({ useNameColorClass: () => null }));

it('removes the public signature and premium tooltip when a member opts out', () => {
  const name = (user: { isPremium?: boolean; showPremiumStatus?: boolean }) =>
    renderToStaticMarkup(<PremiumName user={user} className="truncate" title="Player">Ana Petrović</PremiumName>);
  expect(name({ isPremium: true, showPremiumStatus: false })).toBe(name({ isPremium: false }));
  expect(name({ isPremium: true, showPremiumStatus: true })).toContain('premium-name premium-name--gold');
  expect(name({ isPremium: true })).toContain('title="Premium"');
});

describe('premium name styles', () => {
  const classOf = (node: ReturnType<typeof PremiumName>) => /class="([^"]*)"/.exec(renderToStaticMarkup(node))?.[1] ?? '';

  it('paints the chosen style and keeps caller classes', () => {
    const cls = classOf(
      <PremiumName user={{ isPremium: true, premiumNameStyle: 'aurora' }} className="truncate">Ana</PremiumName>,
    );
    expect(cls.split(' ')).toEqual(['premium-name', 'premium-name--aurora', 'truncate']);
  });

  it('falls back to gold for a missing or unknown style', () => {
    expect(classOf(<PremiumName user={{ isPremium: true }}>Ana</PremiumName>)).toContain('premium-name--gold');
    const unknown = { isPremium: true, premiumNameStyle: 'plasma' } as unknown as { isPremium: boolean };
    expect(classOf(<PremiumName user={unknown}>Ana</PremiumName>)).toContain('premium-name--gold');
  });

  it('only animates when asked, and pins the tone on request', () => {
    const user = { isPremium: true, premiumNameStyle: 'neon' as const };
    expect(classOf(<PremiumName user={user}>Ana</PremiumName>)).not.toContain('premium-name--animated');
    const hero = classOf(<PremiumName user={user} animated tone="dark">Ana</PremiumName>);
    expect(hero).toContain('premium-name--neon');
    expect(hero).toContain('premium-name--animated');
    expect(hero).toContain('premium-name--on-dark');
  });

  it('never styles a member who hides premium status', () => {
    const cls = classOf(
      <PremiumName user={{ isPremium: true, showPremiumStatus: false, premiumNameStyle: 'holo' }} animated>Ana</PremiumName>,
    );
    expect(cls).not.toContain('premium-name');
  });
});
