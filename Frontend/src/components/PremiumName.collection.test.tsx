// @vitest-environment jsdom
import { act } from 'react';
import type { ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const equipped = vi.hoisted(() => ({
  nameColorAssetKey: null as string | null,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
vi.mock('@/features/collection/useEquippedGoods', () => ({
  useNameColorClass: (_userId: string | undefined, premiumVisible: boolean) =>
    premiumVisible || !equipped.nameColorAssetKey
      ? null
      : `collection-name collection-${equipped.nameColorAssetKey}`,
}));

import { PremiumName } from './PremiumName';

let container: HTMLDivElement;
let root: Root;

function render(node: ReactElement): void {
  act(() => {
    root.render(node);
  });
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  equipped.nameColorAssetKey = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe('PremiumName with an equipped name colour', () => {
  it('paints a bought colour for a non-premium player', () => {
    equipped.nameColorAssetKey = 'name-violet';
    render(
      <PremiumName user={{ id: 'u1', isPremium: false, showPremiumStatus: false }}>Ana</PremiumName>,
    );
    const span = container.querySelector('span');
    expect(span?.className).toContain('collection-name-violet');
    expect(span?.className).not.toContain('premium-name-glow');
  });

  it('lets premium gold win over a bought colour', () => {
    equipped.nameColorAssetKey = 'name-violet';
    render(
      <PremiumName user={{ id: 'u1', isPremium: true, showPremiumStatus: true }}>Ana</PremiumName>,
    );
    const span = container.querySelector('span');
    expect(span?.className).toContain('premium-name-glow');
    expect(span?.className).not.toContain('collection-name-violet');
  });

  it('falls back to a plain name when nothing is equipped', () => {
    render(
      <PremiumName user={{ id: 'u1', isPremium: false, showPremiumStatus: false }}>Ana</PremiumName>,
    );
    const span = container.querySelector('span');
    expect(span?.className.trim()).toBe('');
  });

  it('keeps working for a user with no id (embedded projections)', () => {
    render(<PremiumName user={{ isPremium: false, showPremiumStatus: false }}>Ana</PremiumName>);
    expect(container.textContent).toBe('Ana');
  });
});
