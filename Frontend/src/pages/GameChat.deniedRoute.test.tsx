// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameChat } from './GameChat';

const useThreadChromeMock = vi.fn();
const setBottomTabsVisibleMock = vi.fn();
const handleBackButtonMock = vi.fn();

vi.mock('./GameChat/ThreadViewProvider', () => ({
  ThreadViewProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('./GameChat/useThreadView', () => ({
  useThreadChrome: () => useThreadChromeMock(),
}));

vi.mock('./GameChat/GameChatAccessDenied', () => ({
  GameChatAccessDenied: () => <div data-testid="game-chat-access-denied">Denied</div>,
}));

vi.mock('./GameChat/GameChatHeaderSection', () => ({
  GameChatHeaderSection: () => <div>header</div>,
}));

vi.mock('./GameChat/GameChatFooterGate', () => ({
  GameChatFooterGate: () => <div>footer</div>,
}));

vi.mock('./GameChat/GameChatModals', () => ({
  GameChatModals: () => <div>modals</div>,
}));

vi.mock('./GameChat/GameChatThreadBody', () => ({
  GameChatThreadBody: () => <div>thread</div>,
}));

vi.mock('@/store/shellNavStore', () => ({
  useShellNavStore: (selector: (state: { setBottomTabsVisible: typeof setBottomTabsVisibleMock }) => unknown) =>
    selector({ setBottomTabsVisible: setBottomTabsVisibleMock }),
}));

vi.mock('@/hooks/useBackButtonHandler', () => ({
  useBackButtonHandler: (...args: unknown[]) => handleBackButtonMock(...args),
}));

vi.mock('@/contexts/SportLevelContext', () => ({
  SportLevelProvider: ({ children }: { children: ReactNode }) => children,
}));

describe('GameChat denied route rendering', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    setBottomTabsVisibleMock.mockClear();
    handleBackButtonMock.mockClear();
    useThreadChromeMock.mockReturnValue({
      id: 'game-1',
      contextType: 'GAME',
      isEmbedded: false,
      game: null,
      derived: { canViewPublicChat: true },
      panels: { handleBackButton: vi.fn() },
      chatContainerRef: { current: null },
      navigate: vi.fn(),
      isGameChatAccessDenied: true,
    });
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    container?.remove();
  });

  it('renders the denied state when archived route access is rejected in place', async () => {
    await act(async () => {
      root.render(<GameChat />);
    });

    expect(container.querySelector('[data-testid="game-chat-access-denied"]')?.textContent).toBe(
      'Denied'
    );
  });
});
