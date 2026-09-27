// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ChatMessage, MessageDetails } from '@/api/chat';
import { UnifiedMessageMenu } from './UnifiedMessageMenu';

const mocks = vi.hoisted(() => ({ getMessage: vi.fn(), fetchUsers: vi.fn(), t: (key: string) => key }));
vi.mock('@/api/chat', () => ({ chatApi: { getMessageDetails: mocks.getMessage } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: mocks.t }), initReactI18next: { type: '3rdParty', init: () => {} } }));
vi.mock('@/store/authStore', () => ({ useAuthStore: (select: (s: { user: null }) => unknown) => select({ user: null }) }));
vi.mock('@/store/playersStore', () => ({ usePlayersStore: (select: (s: { users: object }) => unknown) => select({ users: {} }) }));
vi.mock('@/services/users/fetchBasicUsersBatched', () => ({ fetchBasicUsersBatched: mocks.fetchUsers }));
vi.mock('@/components/PlayerAvatar', () => ({ PlayerAvatar: () => null }));
vi.mock('@/components/reactions/EmojiQuickStrip', () => ({ EmojiQuickStrip: () => null }));
vi.mock('@/hooks/useIsStickerFavorite', () => ({ useIsStickerFavorite: () => ({ isFavorite: false }) }));
vi.mock('@/hooks/usePrefersReducedMotion', () => ({ usePrefersReducedMotion: () => true }));
vi.mock('@/utils/saveAsSticker', () => ({ isEligibleSaveAsStickerMessage: () => false }));
vi.mock('@/utils/capacitor', () => ({ isCapacitor: () => false }));
vi.mock('@/utils/messageMenuUtils', async (original) => ({
  ...await original<object>(), formatFullDateTime: () => 'Today',
}));

const message: ChatMessage = {
  id: 'message-1', chatContextType: 'GROUP', contextId: 'group-1',
  senderId: 'sender', sender: { id: 'sender', firstName: 'Sender' },
  content: 'Hello', mediaUrls: [], thumbnailUrls: [], mentionIds: [],
  state: 'READ', chatType: 'PUBLIC', createdAt: '2026-09-27T08:00:00Z',
  updatedAt: '2026-09-27T08:00:00Z', reactions: [], readReceipts: [],
};
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.getMessage.mockReset();
  mocks.fetchUsers.mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
const renderMenu = (initialMessage = message) => act(() => root.render(
  <UnifiedMessageMenu message={initialMessage} isOwnMessage onCopy={() => {}} onClose={() => {}}
    messageElementRef={{ current: null }} />
));
async function click(label: string) {
  const button = [...document.querySelectorAll('button')].find(b => b.textContent === label);
  expect(button).toBeDefined();
  await act(async () => button!.click());
}
it('loads readers and named reactions on opening Details and refreshes on reopening', async () => {
  mocks.getMessage.mockResolvedValue({ message: { ...message,
    readReceipts: [{ id: 'read-1', messageId: message.id, userId: 'reader',
      readAt: message.createdAt, user: { id: 'reader', firstName: 'Alice' } }],
    reactions: [{ id: 'reaction-1', messageId: message.id, userId: 'reactor',
      emoji: '👍', createdAt: message.createdAt, user: { id: 'reactor', firstName: 'Bob' } }],
  }, readers: [{ id: 'reader', firstName: 'Alice' }] });
  renderMenu({ ...message, reactions: [{ id: 'cached-reaction', messageId: message.id, userId: 'reactor', emoji: '👍', createdAt: message.createdAt, user: { id: 'reactor' } }] });
  expect(mocks.getMessage).not.toHaveBeenCalled();
  await click('chat.contextMenu.details');
  expect(mocks.getMessage).toHaveBeenCalledWith(message.id);
  expect(document.body.textContent).toContain('Alice');
  expect(document.body.textContent).toContain('Bob');
  expect(document.body.textContent).not.toContain('Unknown User');
  await click('chat.contextMenu.back');
  mocks.getMessage.mockResolvedValue({ message, readers: [{ id: 'new-reader', firstName: 'Charlie' }] });
  await click('chat.contextMenu.details');
  expect(mocks.getMessage).toHaveBeenCalledTimes(2);
  expect(document.body.textContent).toContain('Charlie');
  expect(document.body.textContent).not.toContain('Bob');
});

it('shows loading, then a retryable error instead of claiming nobody read the message', async () => {
  let rejectRequest!: (error: Error) => void;
  mocks.getMessage.mockImplementationOnce(() => new Promise((_, reject) => { rejectRequest = reject; }));
  renderMenu();
  await click('chat.contextMenu.details');
  expect(document.querySelector('[role="status"]')?.textContent).toBe('common.loading');
  expect(document.body.textContent).not.toContain('chat.contextMenu.notReadYet');
  await act(async () => rejectRequest(new Error('offline')));
  expect(document.querySelector('[role="alert"]')).not.toBeNull();
  expect(document.body.textContent).not.toContain('chat.contextMenu.notReadYet');
  mocks.getMessage.mockResolvedValue({ message, readers: [] });
  await click('common.retry');
  expect(mocks.getMessage).toHaveBeenCalledTimes(2);
  expect(document.querySelector('[role="alert"]')).toBeNull();
  expect(document.body.textContent).toContain('chat.contextMenu.notReadYet');
});

it('ignores a response from an earlier opening after Details is reopened', async () => {
  let resolveOld!: (data: MessageDetails) => void;
  mocks.getMessage.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  renderMenu();
  await click('chat.contextMenu.details');
  await click('chat.contextMenu.back');
  mocks.getMessage.mockResolvedValue({ message, readers: [{ id: 'new-reader', firstName: 'New reader' }] });
  await click('chat.contextMenu.details');
  await act(async () => resolveOld({ message, readers: [{ id: 'old-reader', firstName: 'Old reader' }] }));
  expect(document.body.textContent).toContain('New reader');
  expect(document.body.textContent).not.toContain('Old reader');
});
