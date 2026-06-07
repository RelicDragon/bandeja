import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatListSearchBar } from './ChatListSearchBar';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? _key,
  }),
}));

const baseProps = {
  chatsFilter: 'users' as const,
  contactsMode: false,
  searchInput: '',
  onSearchChange: () => {},
  onClearSearch: () => {},
  onContactsToggle: () => {},
  onAddBug: () => {},
};

describe('ChatListSearchBar', () => {
  it('uses transparent chrome so the list page background shows through', () => {
    const html = renderToStaticMarkup(<ChatListSearchBar {...baseProps} />);
    expect(html).not.toMatch(/border-b[^>]*bg-white/);
    expect(html).toMatch(/bg-transparent/);
  });

  it('keeps unread badge visible outside the mail button bounds', () => {
    const html = renderToStaticMarkup(
      <ChatListSearchBar {...baseProps} unreadChatsCount={3} onUnreadFilterToggle={() => {}} />
    );
    expect(html).toMatch(/overflow-visible/);
    expect(html).toMatch(/>3</);
  });
});
