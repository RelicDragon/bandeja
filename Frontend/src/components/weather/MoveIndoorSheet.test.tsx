// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IndoorAlternatives } from '@/api/gameWeather';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const queryState = {
  data: undefined as IndoorAlternatives | undefined,
  isLoading: false,
  isError: false,
};

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => queryState,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) =>
      values ? `${key}|${Object.values(values).join('|')}` : key,
    i18n: { language: 'en-GB' },
  }),
}));

vi.mock('@/hooks/useBackButtonModal', () => ({ useBackButtonModal: () => undefined }));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('react-hot-toast', () => ({
  default: { success: (m: string) => toastSuccess(m), error: (m: string) => toastError(m) },
}));

const saveLocationTime = vi.fn(async () => ({}));
vi.mock('@/components/gameLocationTime/useSaveGameLocationTime', () => ({
  saveLocationTime: (...args: unknown[]) => saveLocationTime(...(args as [])),
}));

vi.mock('@/components/ui/Drawer', () => ({
  Drawer: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  DrawerContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DrawerHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DrawerDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));

vi.mock('@/queries/queryKeys', () => ({
  queryKeys: { weatherAlerts: { indoorAlternatives: (id: string) => ['wa', id] } },
}));

const noteMovedIndoor = vi.fn(async () => ({ success: true, data: { posted: true } }));
vi.mock('@/api/gameWeather', () => ({
  gameWeatherApi: {
    getIndoorAlternatives: vi.fn(),
    noteMovedIndoor: (...args: unknown[]) => noteMovedIndoor(...(args as [])),
  },
}));

import { MoveIndoorSheet } from './MoveIndoorSheet';

const game = {
  id: 'game-1',
  startTime: '2026-09-21T17:00:00.000Z',
  endTime: '2026-09-21T18:30:00.000Z',
} as never;

function alternatives(overrides: Partial<IndoorAlternatives> = {}): IndoorAlternatives {
  return {
    clubId: 'club-1',
    startTime: '2026-09-21T17:00:00.000Z',
    endTime: '2026-09-21T18:30:00.000Z',
    outdoorCourtCount: 1,
    totalCourtCount: 1,
    currentCourts: [{ id: 'c9', name: 'Court 9', isIndoor: false }],
    courts: [],
    hasLinkedBooking: false,
    linkedBookingCourtNames: [],
    isLoadingExternalSlots: false,
    ...overrides,
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(node: ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(node);
  });
  return container;
}

beforeEach(() => {
  queryState.data = undefined;
  queryState.isLoading = false;
  queryState.isError = false;
  saveLocationTime.mockClear();
  noteMovedIndoor.mockClear();
  toastSuccess.mockClear();
  toastError.mockClear();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

const noop = () => undefined;

describe('MoveIndoorSheet', () => {
  it('shows the loading state while availability is being checked', () => {
    queryState.isLoading = true;
    const host = render(
      <MoveIndoorSheet
        game={game}
        open
        onOpenChange={noop}
        onMoved={noop}
        onChangeTime={noop}
      />,
    );
    expect(host.textContent).toContain('weatherAlerts.loadingCourts');
  });

  it('announces availability on every row', () => {
    queryState.data = alternatives({
      courts: [
        { id: 'c1', name: 'Court 1', isFree: true, busyKind: null },
        { id: 'c2', name: 'Court 2', isFree: false, busyKind: 'game' },
      ],
    });
    const host = render(
      <MoveIndoorSheet
        game={game}
        open
        onOpenChange={noop}
        onMoved={noop}
        onChangeTime={noop}
      />,
    );
    const buttons = [...host.querySelectorAll('button')];
    expect(buttons[0].getAttribute('aria-label')).toBe(
      'weatherAlerts.courtFreeAnnouncement|Court 1',
    );
    expect(buttons[1].getAttribute('aria-label')).toBe(
      'weatherAlerts.courtBusyAnnouncement|Court 2',
    );
    expect(buttons[1].hasAttribute('disabled')).toBe(true);
  });

  it('applies a free court through the existing edit path', async () => {
    queryState.data = alternatives({
      courts: [{ id: 'c1', name: 'Court 1', isFree: true, busyKind: null }],
    });
    const onMoved = vi.fn();
    const host = render(
      <MoveIndoorSheet
        game={game}
        open
        onOpenChange={noop}
        onMoved={onMoved}
        onChangeTime={noop}
      />,
    );
    const button = host.querySelector('button') as HTMLButtonElement;
    await act(async () => {
      button.click();
    });
    expect(saveLocationTime).toHaveBeenCalledWith('game-1', {
      courtId: 'c1',
      courtIds: ['c1'],
      addBookingIds: [],
      removeBookingIds: [],
    });
    expect(noteMovedIndoor).toHaveBeenCalledWith('game-1', 'c1');
    expect(toastSuccess).toHaveBeenCalledWith('weatherAlerts.moved|Court 1');
    expect(onMoved).toHaveBeenCalled();
  });

  it('falls back to "change time" when nothing is free', () => {
    queryState.data = alternatives({
      courts: [{ id: 'c1', name: 'Court 1', isFree: false, busyKind: 'external' }],
    });
    const onChangeTime = vi.fn();
    const host = render(
      <MoveIndoorSheet
        game={game}
        open
        onOpenChange={noop}
        onMoved={noop}
        onChangeTime={onChangeTime}
        timeZone="UTC"
      />,
    );
    expect(host.textContent).toContain('weatherAlerts.noneFree|17:00');
    const fallback = [...host.querySelectorAll('button')].at(-1) as HTMLButtonElement;
    act(() => fallback.click());
    expect(onChangeTime).toHaveBeenCalled();
  });

  it('warns that a linked booking is not moved', () => {
    queryState.data = alternatives({
      hasLinkedBooking: true,
      linkedBookingCourtNames: ['Court 5'],
      courts: [{ id: 'c1', name: 'Court 1', isFree: true, busyKind: null }],
    });
    const host = render(
      <MoveIndoorSheet
        game={game}
        open
        onOpenChange={noop}
        onMoved={noop}
        onChangeTime={noop}
      />,
    );
    expect(host.textContent).toContain('weatherAlerts.bookingWarning|Court 5');
  });

  it('says so when the club has no indoor courts at all', () => {
    queryState.data = alternatives({ courts: [] });
    const host = render(
      <MoveIndoorSheet
        game={game}
        open
        onOpenChange={noop}
        onMoved={noop}
        onChangeTime={noop}
      />,
    );
    expect(host.textContent).toContain('weatherAlerts.noIndoorCourts');
  });

  it('counts the outdoor courts on a multi-court game', () => {
    queryState.data = alternatives({
      outdoorCourtCount: 1,
      totalCourtCount: 2,
      currentCourts: [
        { id: 'c5', name: 'Court 5', isIndoor: false },
        { id: 'c6', name: 'Court 6', isIndoor: true },
      ],
      courts: [{ id: 'c1', name: 'Court 1', isFree: true, busyKind: null }],
    });
    const host = render(
      <MoveIndoorSheet
        game={game}
        open
        onOpenChange={noop}
        onMoved={noop}
        onChangeTime={noop}
      />,
    );
    expect(host.textContent).toContain('weatherAlerts.courtsOutdoor|1|2');
  });

  it('keeps the other courts of a multi-court game when one moves indoor', async () => {
    // Regression: `courtIds` overwrites the whole set, so sending only the
    // picked court silently dropped Court 6 from a two-court game.
    queryState.data = alternatives({
      outdoorCourtCount: 1,
      totalCourtCount: 2,
      currentCourts: [
        { id: 'c5', name: 'Court 5', isIndoor: false },
        { id: 'c6', name: 'Court 6', isIndoor: true },
      ],
      courts: [{ id: 'c1', name: 'Court 1', isFree: true, busyKind: null }],
    });
    const host = render(
      <MoveIndoorSheet
        game={game}
        open
        onOpenChange={noop}
        onMoved={noop}
        onChangeTime={noop}
      />,
    );
    const button = host.querySelector('button') as HTMLButtonElement;
    await act(async () => {
      button.click();
    });
    expect(saveLocationTime).toHaveBeenCalledWith('game-1', {
      courtId: 'c1',
      courtIds: ['c1', 'c6'],
      addBookingIds: [],
      removeBookingIds: [],
    });
  });
});
