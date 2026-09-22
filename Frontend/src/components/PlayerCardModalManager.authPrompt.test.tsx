// @vitest-environment jsdom

import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Link, MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BasicUser } from '@/types';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const { dialogRender, viewer, registerModal, unregisterModal } = vi.hoisted(() => ({
  dialogRender: vi.fn(),
  viewer: { user: null as BasicUser | null },
  registerModal: vi.fn(),
  unregisterModal: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (state: typeof viewer) => unknown) => selector(viewer),
}));
vi.mock('@/store/favoritesStore', () => ({
  useFavoritesStore: (selector: (state: { isFavorite: () => boolean }) => unknown) =>
    selector({ isFavorite: () => false }),
}));
vi.mock('@/store/presenceStore', () => ({
  usePresenceStore: (selector: (state: { isOnline: () => boolean }) => unknown) =>
    selector({ isOnline: () => false }),
}));
vi.mock('@/store/shellNavStore', () => ({
  useShellNavStore: (selector: (state: { pendingPlayerCardReopen: null }) => unknown) =>
    selector({ pendingPlayerCardReopen: null }),
}));
vi.mock('@/features/collection/useEquippedGoods', () => ({ useFrameClass: () => null }));
vi.mock('@/hooks/usePresenceSubscription', () => ({ usePresenceSubscription: () => {} }));
vi.mock('@/services/backButtonService', () => ({
  backButtonService: { registerModal, unregisterModal },
}));
vi.mock('@/components/ui/Dialog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/Dialog')>();
  return {
    ...actual,
    Dialog: (props: ComponentProps<typeof actual.Dialog>) => {
      dialogRender(props.open);
      return <actual.Dialog {...props} />;
    },
  };
});
vi.mock('@/components/PlayerCardBottomSheet', () => ({
  PlayerCardBottomSheet: ({ playerId }: { playerId: string | null }) =>
    playerId ? <div data-testid="player-card">{playerId}</div> : null,
}));
vi.mock('@/components/GameDetails/PublicGamePrompt', () => ({
  PublicGamePrompt: () => <Link to="/login">Login</Link>,
}));

import { PlayerAvatar } from './PlayerAvatar';
import { PlayerCardModalManager } from './PlayerCardModalManager';

const players: BasicUser[] = Array.from({ length: 40 }, (_, index) => ({
  id: `player-${index}`, firstName: `Player ${index}`, level: 3, socialLevel: 1,
  gender: 'MALE', approvedLevel: false, isTrainer: false,
}));

function Location() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

function Screen({ count = 40 }: { count?: number }) {
  return (
    <MemoryRouter initialEntries={['/games/test']}>
      <PlayerCardModalManager>
        <Location />
        {players.slice(0, count).map((player) => (
          <PlayerAvatar key={player.id} player={player} superTiny />
        ))}
      </PlayerCardModalManager>
    </MemoryRouter>
  );
}

describe('shared avatar sign-in prompt', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    viewer.user = null;
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function openFromAvatar() {
    const avatar = container.querySelector<HTMLButtonElement>('button')!;
    await act(async () => { avatar.focus(); avatar.click(); });
    return avatar;
  }

  it('mounts no closed dialogs for a list of avatars and mounts only one on demand', async () => {
    await act(async () => { root.render(<Screen />); });
    expect(dialogRender).not.toHaveBeenCalled();
    expect(registerModal).not.toHaveBeenCalled();

    await openFromAvatar();
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(dialogRender.mock.calls.every(([open]) => open === true)).toBe(true);
    expect(registerModal).toHaveBeenCalledTimes(1);
    expect(registerModal).toHaveBeenCalledWith('player-avatar-auth-modal', expect.any(Function));

    // Virtualized avatars may unmount while the shared prompt is open.
    await act(async () => { root.render(<Screen count={0} />); });
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    const close = document.querySelector<HTMLButtonElement>('[data-slot="dialog-close"]')!;
    await act(async () => { close.click(); });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(unregisterModal).toHaveBeenCalledWith('player-avatar-auth-modal');
  });

  it('closes with Escape, restores focus, and reopens from another avatar', async () => {
    await act(async () => { root.render(<Screen />); });
    const avatar = await openFromAvatar();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(avatar);

    await act(async () => { container.querySelectorAll<HTMLButtonElement>('button')[1].click(); });
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  });

  it('closes when Login navigates away', async () => {
    await act(async () => { root.render(<Screen />); });
    await openFromAvatar();
    await act(async () => { document.querySelector<HTMLAnchorElement>('[role="dialog"] a')!.click(); });
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe('/login');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('uses the shared player card for signed-in users', async () => {
    viewer.user = players[1];
    await act(async () => { root.render(<Screen />); });
    await openFromAvatar();
    expect(container.querySelector('[data-testid="player-card"]')?.textContent).toBe('player-0');
    expect(dialogRender).not.toHaveBeenCalled();
  });

  it('closes through the native Back handler', async () => {
    await act(async () => { root.render(<Screen />); });
    await openFromAvatar();
    await act(async () => { registerModal.mock.calls[0][1](); });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('dismisses an open prompt after the viewer signs in', async () => {
    await act(async () => { root.render(<Screen />); });
    await openFromAvatar();
    viewer.user = players[1];
    await act(async () => { root.render(<Screen />); });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
