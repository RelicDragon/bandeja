// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { blurForeignOverlayFocus } from './blurForeignOverlayFocus';

describe('blurForeignOverlayFocus', () => {
  const nodes: HTMLElement[] = [];

  afterEach(() => {
    for (const node of nodes) node.remove();
    nodes.length = 0;
  });

  function mount(tag: 'button' | 'div', className?: string) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    document.body.append(node);
    nodes.push(node);
    return node;
  }

  it('blurs focus that sits outside the overlay about to hide the previous layer', () => {
    const previous = mount('div', 'cap-keyboard-aware-sheet');
    const avatar = document.createElement('button');
    avatar.className = 'court-lobby-arena__avatar';
    previous.append(avatar);
    const current = mount('div', 'cap-keyboard-aware-sheet');
    avatar.focus();
    expect(document.activeElement).toBe(avatar);

    blurForeignOverlayFocus(current);

    expect(document.activeElement).not.toBe(avatar);
  });

  it('keeps focus already inside the new overlay', () => {
    const current = mount('div', 'cap-keyboard-aware-sheet');
    const close = document.createElement('button');
    current.append(close);
    close.focus();

    blurForeignOverlayFocus(current);

    expect(document.activeElement).toBe(close);
  });

  it('does nothing when nothing is focused', () => {
    const current = mount('div', 'cap-keyboard-aware-sheet');
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    blurForeignOverlayFocus(current);

    expect(document.activeElement === document.body || document.activeElement === null).toBe(
      true,
    );
  });
});
