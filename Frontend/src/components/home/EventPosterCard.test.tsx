// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Game } from '@/types';
import type { GameLocalizedTextProjection } from '@/utils/gameText/gameLocalizedText.types';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
    i18n: { language: 'ru' },
  }),
}));

vi.mock('@/store/authStore', async () => {
  const { create } = await import('zustand');
  return {
    useAuthStore: create(() => ({
      user: {
        id: 'u1',
        language: 'ru',
        currentCity: { id: 'c1', timezone: 'UTC' },
      },
    })),
  };
});

import { EventPosterCard } from './EventPosterCard';

const roots: Root[] = [];
const containers: HTMLDivElement[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  for (const container of containers.splice(0)) {
    container.remove();
  }
});

function render(node: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  containers.push(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(<MemoryRouter>{node}</MemoryRouter>);
  });
  return container;
}

function projection(
  overrides: Partial<GameLocalizedTextProjection['name']> & {
    locale?: GameLocalizedTextProjection['locale'];
  } = {},
): GameLocalizedTextProjection {
  const { locale, ...nameOverrides } = overrides;
  return {
    locale: locale ?? 'ru',
    name: {
      text: 'Открытый турнир',
      sourceRevision: 1,
      state: 'ready',
      provenance: 'automatic',
      ...nameOverrides,
    },
    description: {
      text: null,
      sourceRevision: 0,
      state: 'not_needed',
      provenance: 'empty_source',
    },
  };
}

function baseEvent(overrides: Partial<Game> = {}): Game {
  return {
    id: 'ev1',
    entityType: 'EVENT',
    eventKind: 'TOURNAMENT',
    sport: 'PADEL',
    gameType: 'CLASSIC',
    name: 'Open tournament',
    city: { id: 'c1', name: 'City', country: 'X' } as Game['city'],
    startTime: '2026-05-21T17:00:00.000Z',
    endTime: '2026-05-21T19:00:00.000Z',
    maxParticipants: 32,
    minParticipants: 2,
    isPublic: true,
    affectsRating: false,
    allowDirectJoin: true,
    status: 'ANNOUNCED',
    resultsStatus: 'NONE',
    participants: [],
    ...overrides,
  } as Game;
}

describe('EventPosterCard localized title', () => {
  it('shows localized name when localizedText is ready', () => {
    const el = render(
      <EventPosterCard game={baseEvent({ localizedText: projection() })} />,
    );
    expect(el.textContent).toContain('Открытый турнир');
    expect(el.textContent).not.toContain('Open tournament');
  });

  it('falls back to original when translation is pending', () => {
    const el = render(
      <EventPosterCard
        game={baseEvent({
          localizedText: projection({
            text: 'Open tournament',
            state: 'pending',
            provenance: 'original',
            sourceRevision: 0,
          }),
        })}
      />,
    );
    expect(el.textContent).toContain('Open tournament');
  });
});
