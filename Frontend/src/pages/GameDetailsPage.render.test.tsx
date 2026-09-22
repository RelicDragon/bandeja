// @vitest-environment jsdom
import { act, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useGameDetailsChromeStore } from '@/components/GameDetails/gameDetailsChromeStore';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.hoisted(() => ({ getById: vi.fn() }));
vi.mock('@/api', () => ({ gamesApi: api }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/hooks/useDesktop', () => ({ useDesktop: () => true }));
vi.mock('@/hooks/useIsLandscape', () => ({ useIsLandscape: () => false }));
vi.mock('@/utils/gameResults', () => ({ canShowTournamentTableView: () => true }));
vi.mock('@/components', () => ({ Card: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/SplitViewPanels', () => ({
  SplitViewLeftPanel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SplitViewRightPanel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/motion/AnimatedPresencePanel', () => ({
  AnimatedPresencePanel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/GameDetails/ScrollEdgeHints', () => ({ ScrollEdgeHints: () => null }));
vi.mock('./GameChat', () => ({ GameChat: () => <div>Chat</div> }));

function DetailsProbe() {
  const [draft, setDraft] = useState('');
  return <>
    <input aria-label="Details draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
    <button onClick={() => setDraft('Unsaved edit')}>Edit</button>
  </>;
}
vi.mock('./GameDetailsShell', () => ({ GameDetailsShell: () => <DetailsProbe /> }));
vi.mock('./EventDetails', () => ({ EventDetailsContent: () => <DetailsProbe /> }));

import { GameDetailsPage } from './GameDetailsPage';

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
  useGameDetailsChromeStore.setState(useGameDetailsChromeStore.getInitialState());
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  Element.prototype.scrollTo = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function openDetails(entityType: string) {
  api.getById.mockResolvedValue({ data: { id: 'game-1', entityType } });
  await act(async () => root.render(
    <MemoryRouter initialEntries={['/games/game-1']}>
      <Routes><Route path="/games/:id" element={<GameDetailsPage />} /></Routes>
    </MemoryRouter>,
  ));
  return container.querySelector('input');
}

it('preserves the details subtree when switching between table and split layouts', async () => {
  const details = await openDetails('TOURNAMENT');
  expect(details).not.toBeNull();
  act(() => container.querySelector('button')?.click());
  const scroller = details!.closest('.overflow-y-auto')!;
  scroller.scrollTop = 160;
  act(() => useGameDetailsChromeStore.getState().setGameDetailsTableViewOverride(true));
  expect(container.querySelector('input')).toBe(details);
  expect(details?.value).toBe('Unsaved edit');
  expect(details?.closest('.overflow-y-auto')).toBe(scroller);
  expect(scroller.scrollTop).toBe(160);
  act(() => useGameDetailsChromeStore.getState().setGameDetailsTableViewOverride(false));
  expect(container.querySelector('input')).toBe(details);
  expect(details?.value).toBe('Unsaved edit');
  expect(api.getById).toHaveBeenCalledTimes(1);
});

it('preserves event details when chat access becomes available', async () => {
  const details = await openDetails('EVENT');
  expect(details).not.toBeNull();
  act(() => container.querySelector('button')?.click());
  act(() => useGameDetailsChromeStore.getState().setGameDetailsCanAccessChat(true));
  expect(container.querySelector('input')).toBe(details);
  expect(details?.value).toBe('Unsaved edit');
  expect(container.textContent).toContain('Chat');
  act(() => useGameDetailsChromeStore.getState().setGameDetailsCanAccessChat(false));
  expect(container.querySelector('input')).toBe(details);
  expect(container.textContent).not.toContain('Chat');
});
