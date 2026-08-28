// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { syncMentionTextareaHeight } from './mentionInputDom';

describe('syncMentionTextareaHeight', () => {
  it('does not shrink below min height', () => {
    const textarea = document.createElement('textarea');
    const control = document.createElement('div');
    control.appendChild(textarea);
    document.body.appendChild(control);

    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 20 });

    syncMentionTextareaHeight(textarea);
    expect(textarea.style.height).toBe('48px');

    control.remove();
  });
});
