// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MentionSuggestionsContainer } from '@/components/MentionSuggestionsContainer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('MentionSuggestionsContainer', () => {
  it('preserves list ref from react-mentions via cloneElement', () => {
    const ref = vi.fn();
    const ul = (
      <ul ref={ref} className="base" role="listbox">
        <li>One</li>
      </ul>
    );

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<MentionSuggestionsContainer>{ul}</MentionSuggestionsContainer>);
    });

    expect(ref).toHaveBeenCalled();
    expect(container.querySelector('.mention-suggestions-list')).toBeTruthy();

    act(() => root.unmount());
    container.remove();
  });
});
