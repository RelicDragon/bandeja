// @vitest-environment jsdom

import { useState } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/Dialog';
import { PlayerInviteSearchInput } from './PlayerInviteSearchInput';

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

function FilteringDialog() {
  const [query, setQuery] = useState('');
  const names = ['Alice', 'Bob', 'Carol', 'Dan'].filter((name) =>
    name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Dialog open onClose={() => {}}>
      <DialogContent>
        <DialogTitle className="sr-only">Search</DialogTitle>
        <PlayerInviteSearchInput value={query} onChange={setQuery} placeholder="Search" />
        {names.map((name) => (
          <button type="button" key={name}>
            {name}
          </button>
        ))}
      </DialogContent>
    </Dialog>
  );
}

describe('PlayerInviteSearchInput inside a Radix dialog', () => {
  let root: Root | null = null;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container.remove();
  });

  it('keeps focus after a keystroke that removes sibling list nodes', async () => {
    const steal = new MutationObserver(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body) active.blur();
    });
    steal.observe(document.body, { childList: true, subtree: true });

    try {
      await act(async () => {
        root!.render(<FilteringDialog />);
      });

      const input = document.querySelector('[data-testid="player-invite-search"]');
      expect(input).toBeInstanceOf(HTMLInputElement);
      const search = input as HTMLInputElement;

      await act(async () => {
        search.focus();
      });
      expect(document.activeElement).toBe(search);

      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(search, 'a');
        search.dispatchEvent(new Event('input', { bubbles: true }));
      });

      expect(document.activeElement).toBe(search);
      expect(search.value).toBe('a');
    } finally {
      steal.disconnect();
    }
  });
});
