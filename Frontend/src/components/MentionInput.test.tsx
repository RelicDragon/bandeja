// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MentionInput } from '@/components/MentionInput';
import type { Game } from '@/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}
(globalThis as { ResizeObserver?: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock;

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (state: { user: { id: string } }) => unknown) =>
    selector({ user: { id: 'current-user' } }),
}));

vi.mock('@/api/chat', () => ({
  chatApi: {
    getGameParticipants: vi.fn().mockResolvedValue([]),
    getGroupChannelParticipants: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/components/MentionSuggestionAvatar', () => ({
  MentionSuggestionAvatar: ({ user }: { user?: { firstName?: string } }) => (
    <span data-testid="mention-avatar">{user?.firstName}</span>
  ),
}));

function gp(userId: string, gameId = 'game-1') {
  return {
    id: `gp-${userId}`,
    userId,
    gameId,
    status: 'PLAYING' as const,
    role: 'PARTICIPANT' as const,
    user: {
      id: userId,
      firstName: userId,
      lastName: 'Test',
    },
  };
}

function makeGame(participantCount: number): Game {
  const participants = Array.from({ length: participantCount }, (_, index) => ({
    id: `gp-${index}`,
    userId: `user-${index}`,
    gameId: 'game-1',
    status: 'PLAYING' as const,
    role: 'PARTICIPANT' as const,
    user: {
      id: `user-${index}`,
      firstName: `User${index}`,
      lastName: 'Test',
    },
  }));
  return {
    id: 'game-1',
    chatType: 'PUBLIC',
    participants,
  } as Game;
}

function MentionHarness({ game }: { game: Game }) {
  const [value, setValue] = useState('');
  const [mentionIds, setMentionIds] = useState<string[]>([]);

  return (
    <div style={{ width: 360 }}>
      <MentionInput
        value={value}
        onChange={(nextValue, nextMentionIds) => {
          setValue(nextValue);
          setMentionIds(nextMentionIds);
        }}
        game={game}
        contextType="GAME"
        chatType="PUBLIC"
        placeholder="Type a message"
      />
      <div data-testid="composer-value">{value}</div>
      <div data-testid="mention-count">{mentionIds.length}</div>
    </div>
  );
}

describe('MentionInput', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = '';
  });

  it('shows capped suggestions after typing @ without freezing input', async () => {
    const game = makeGame(40);
    await act(async () => {
      root.render(<MentionHarness game={game} />);
    });

    const textarea = container.querySelector('textarea');
    expect(textarea).toBeTruthy();

    await act(async () => {
      textarea!.focus();
    });

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(textarea!, '@');
      textarea!.selectionStart = 1;
      textarea!.selectionEnd = 1;
      textarea!.dispatchEvent(new Event('input', { bubbles: true }));
      textarea!.dispatchEvent(new Event('select', { bubbles: true }));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const suggestions = document.body.querySelectorAll('.mention-suggestions-list li');
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.length).toBeLessThanOrEqual(20);

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(textarea!, '@us');
      textarea!.selectionStart = 3;
      textarea!.selectionEnd = 3;
      textarea!.dispatchEvent(new Event('input', { bubbles: true }));
      textarea!.dispatchEvent(new Event('select', { bubbles: true }));
    });

    expect(container.querySelector('[data-testid="composer-value"]')?.textContent).toBe('@us');
  });

  it('falls back to embedded participants when API returns empty list', async () => {
    const game = makeGame(25);
    await act(async () => {
      root.render(<MentionHarness game={game} />);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const textarea = container.querySelector('textarea');
    expect(textarea).toBeTruthy();

    await act(async () => {
      textarea!.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(textarea!, '@');
      textarea!.selectionStart = 1;
      textarea!.selectionEnd = 1;
      textarea!.dispatchEvent(new Event('input', { bubbles: true }));
      textarea!.dispatchEvent(new Event('select', { bubbles: true }));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const suggestions = document.body.querySelectorAll('.mention-suggestions-list li');
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.length).toBeLessThanOrEqual(20);
  });

  it('falls back to parent roster for league child games', async () => {
    const game = {
      id: 'round-1',
      parentId: 'season-1',
      participants: [],
      parent: { id: 'season-1', participants: [gp('season-player', 'season-1')] },
    } as Game;
    await act(async () => {
      root.render(<MentionHarness game={game} />);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const textarea = container.querySelector('textarea');
    await act(async () => {
      textarea!.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(textarea!, '@');
      textarea!.selectionStart = 1;
      textarea!.selectionEnd = 1;
      textarea!.dispatchEvent(new Event('input', { bubbles: true }));
      textarea!.dispatchEvent(new Event('select', { bubbles: true }));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const suggestions = document.body.querySelectorAll('.mention-suggestions-list li');
    expect(suggestions.length).toBeGreaterThan(0);
  });
});
