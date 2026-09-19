// @vitest-environment jsdom
// The city-picker chrome pulls in Leaflet transitively, which needs a DOM at import time.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { CHAT_LIST_SEARCH_DEBOUNCE_MS } from '@/utils/chatListConstants';
import { ChatListSearchBar } from './ChatListSearchBar';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? _key,
    i18n: { language: 'en' },
  }),
  // `@/i18n/config` is pulled in transitively and calls `i18n.use(initReactI18next)`.
  initReactI18next: { type: '3rdParty', init: () => {} },
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

  it('renders disabled chrome while list is loading', () => {
    const html = renderToStaticMarkup(<ChatListSearchBar {...baseProps} disabled />);
    expect(html).toMatch(/pointer-events-none/);
    expect(html).toMatch(/opacity-60/);
    expect(html).toMatch(/disabled/);
    expect(html).toMatch(/aria-busy="true"/);
  });
});

describe('ChatListSearchBar debouncing', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  const mount = (props: Parameters<typeof ChatListSearchBar>[0]) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(<ChatListSearchBar {...props} />);
    });
    return container.querySelector('input') as HTMLInputElement;
  };

  const type = (input: HTMLInputElement, value: string) => {
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )!.set!;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
    vi.useRealTimers();
  });

  it('shows keystrokes immediately but lifts the query only after the debounce', () => {
    vi.useFakeTimers();
    const onSearchChange = vi.fn();
    const input = mount({ ...baseProps, onSearchChange });

    type(input, 'no');
    type(input, 'nov');
    expect(input.value).toBe('nov');
    expect(onSearchChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(CHAT_LIST_SEARCH_DEBOUNCE_MS);
    });
    expect(onSearchChange).toHaveBeenCalledTimes(1);
    expect(onSearchChange).toHaveBeenCalledWith('nov');
  });

  it('does not restart the debounce when the caller re-renders with new callbacks', () => {
    vi.useFakeTimers();
    const onSearchChange = vi.fn();
    const input = mount({ ...baseProps, onSearchChange });

    type(input, 'ab');
    act(() => {
      vi.advanceTimersByTime(CHAT_LIST_SEARCH_DEBOUNCE_MS - 50);
      // A parent render mid-debounce hands down fresh callback identities.
      root!.render(<ChatListSearchBar {...baseProps} onSearchChange={onSearchChange} />);
    });
    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(onSearchChange).toHaveBeenCalledTimes(1);
    expect(onSearchChange).toHaveBeenCalledWith('ab');
  });

  it('clears immediately without waiting for the debounce', () => {
    vi.useFakeTimers();
    const onSearchChange = vi.fn();
    const onClearSearch = vi.fn();
    const input = mount({ ...baseProps, searchInput: 'novi', onSearchChange, onClearSearch });
    expect(input.value).toBe('novi');

    const clearButton = container!.querySelector(
      'button[aria-label="Clear search"]'
    ) as HTMLButtonElement;
    act(() => {
      clearButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onClearSearch).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('');
    act(() => {
      vi.advanceTimersByTime(CHAT_LIST_SEARCH_DEBOUNCE_MS);
    });
    expect(onSearchChange).not.toHaveBeenCalled();
  });

  it('adopts an externally committed query (URL sync) without echoing it back', () => {
    vi.useFakeTimers();
    const onSearchChange = vi.fn();
    const input = mount({ ...baseProps, onSearchChange });

    act(() => {
      root!.render(<ChatListSearchBar {...baseProps} searchInput="deep-link" onSearchChange={onSearchChange} />);
    });
    expect(input.value).toBe('deep-link');

    act(() => {
      vi.advanceTimersByTime(CHAT_LIST_SEARCH_DEBOUNCE_MS);
    });
    expect(onSearchChange).not.toHaveBeenCalled();
  });
});
