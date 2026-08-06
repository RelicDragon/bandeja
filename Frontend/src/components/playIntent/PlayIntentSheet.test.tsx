// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayIntent } from '@/api/playIntents';

const mocks = vi.hoisted(() => ({
  cancel: vi.fn().mockResolvedValue({ cancelled: 1 }),
  onChanged: vi.fn(),
  onOpenChange: vi.fn(),
}));

const intent: PlayIntent = {
  id: 'intent-1',
  cityId: 'city-1',
  sport: 'PADEL',
  entityType: 'GAME',
  dateKeys: ['2026-07-29'],
  timeOfDay: 'ANYTIME',
  startTime: null,
  endTime: null,
  clubIds: [],
  minLevel: null,
  maxLevel: null,
  genderTeams: 'ANY',
  status: 'OPEN',
  expiresAt: '2026-07-29T23:59:59.000Z',
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  // i18n/config.ts calls i18n.use(initReactI18next).init(...) at import time
  // (pulled in transitively via useBackButtonModal). Provide a no-op stub.
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn() },
}));

vi.mock('framer-motion', async () => {
  const React = await import('react');
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: {
      div: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
        (props, ref) => <div ref={ref} {...props} />,
      ),
    },
  };
});

vi.mock('@/components/ui/Drawer', () => ({
  Drawer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drawer-root">{children}</div>
  ),
  DrawerContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerCloseButton: () => <button type="button">close</button>,
}));

vi.mock('@/hooks/usePlayIntent', () => ({
  usePlayIntentMutations: () => ({
    cancel: { mutateAsync: mocks.cancel, isPending: false },
  }),
}));

vi.mock('@/hooks/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => false,
}));

vi.mock('./PlayIntentComposeSheet', () => ({
  PlayIntentComposePanel: ({
    onSubmitted,
  }: {
    onSubmitted: (nextIntent: PlayIntent) => void;
  }) => (
    <button type="button" data-testid="compose" onClick={() => onSubmitted(intent)}>
      search
    </button>
  ),
}));

vi.mock('./CourtLobbySheet', () => ({
  CourtLobbyPanel: () => <div data-testid="lobby">radar</div>,
}));

describe('PlayIntentSheet', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('switches form to radar and back inside one drawer', async () => {
    const { PlayIntentSheet } = await import('./PlayIntentSheet');
    await act(async () => {
      root.render(
        <PlayIntentSheet
          open
          onOpenChange={mocks.onOpenChange}
          initialMode="compose"
          cityId="city-1"
          sport="PADEL"
          members={[]}
          overflow={0}
          partySize={4}
          availableCount={0}
          clusterProgress={1}
          onChanged={mocks.onChanged}
        />,
      );
    });

    expect(container.querySelectorAll('[data-testid="drawer-root"]')).toHaveLength(1);
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="compose"]')?.click();
    });
    expect(container.querySelector('[data-testid="lobby"]')).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="play-intent-change"]')?.click();
    });
    expect(container.querySelector('[data-testid="compose"]')).not.toBeNull();
  });

  it('confirms cancellation from radar and closes the drawer', async () => {
    const { PlayIntentSheet } = await import('./PlayIntentSheet');
    await act(async () => {
      root.render(
        <PlayIntentSheet
          open
          onOpenChange={mocks.onOpenChange}
          initialMode="lobby"
          cityId="city-1"
          sport="PADEL"
          members={[]}
          overflow={0}
          partySize={4}
          availableCount={0}
          clusterProgress={1}
          intent={intent}
        />,
      );
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="play-intent-drawer-cancel"]')?.click();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="play-intent-drawer-cancel-confirm"]')?.click();
      await Promise.resolve();
    });

    expect(mocks.cancel).toHaveBeenCalledWith('intent-1');
    expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows the spectator "play too" CTA in lobby and swaps to compose on tap', async () => {
    const { PlayIntentSheet } = await import('./PlayIntentSheet');
    await act(async () => {
      root.render(
        // No `intent` → spectator: no change/cancel bar, only the play-too CTA.
        <PlayIntentSheet
          open
          onOpenChange={mocks.onOpenChange}
          initialMode="lobby"
          cityId="city-1"
          sport="PADEL"
          members={[]}
          overflow={0}
          partySize={4}
          availableCount={0}
          clusterProgress={1}
        />,
      );
    });

    // Spectator sees the play-too CTA, not the change/cancel action bar.
    expect(
      container.querySelector('[data-testid="play-intent-play-too"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="play-intent-change"]'),
    ).toBeNull();

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="play-intent-play-too"]')
        ?.click();
    });

    // Tapping it animates (swaps) into the full create-play-intent panel.
    expect(container.querySelector('[data-testid="compose"]')).not.toBeNull();
  });
});
