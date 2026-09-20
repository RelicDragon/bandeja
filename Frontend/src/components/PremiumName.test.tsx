import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
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
  expect(name({ isPremium: true, showPremiumStatus: true })).toContain('premium-name-glow');
  expect(name({ isPremium: true })).toContain('title="Premium"');
});
