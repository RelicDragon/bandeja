// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PlayerAvatarFace } from './PlayerAvatarFace';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const FULL = 'https://cdn.example.com/u_avatar.jpg';
const TINY = 'https://cdn.example.com/u_avatar.tiny.jpg';

describe('PlayerAvatarFace', () => {
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
    container.remove();
    root = null;
  });

  function renderFace(props: {
    avatar?: string | null;
    tinyUrl?: string | null;
    initials?: string;
  } = {}) {
    act(() => {
      root!.render(
        <PlayerAvatarFace
          avatar={props.avatar === undefined ? FULL : props.avatar}
          tinyUrl={props.tinyUrl === undefined ? TINY : props.tinyUrl}
          initials={props.initials ?? 'AB'}
          alt="Player"
          textClassName="text-sm"
        />
      );
    });
  }

  it('renders initials with no img when there is no avatar URL', () => {
    renderFace({ avatar: null, tinyUrl: null });
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('AB');
  });

  it('hides the img until load so a 404 cannot paint the iOS “?” glyph', () => {
    renderFace();
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe(TINY);
    expect(img!.style.visibility).toBe('hidden');

    act(() => {
      img!.dispatchEvent(new Event('load'));
    });
    expect(container.querySelector('img')!.style.visibility).not.toBe('hidden');
  });

  it('remounts a new img for the full URL after tiny fails', () => {
    renderFace();
    const tinyImg = container.querySelector('img')!;
    act(() => {
      tinyImg.dispatchEvent(new Event('error'));
    });
    const fullImg = container.querySelector('img');
    expect(fullImg).not.toBeNull();
    expect(fullImg).not.toBe(tinyImg);
    expect(fullImg!.getAttribute('src')).toBe(FULL);
    expect(fullImg!.style.visibility).toBe('hidden');
  });

  it('unmounts the img and shows initials after the full URL fails', () => {
    renderFace({ tinyUrl: null });
    act(() => {
      container.querySelector('img')!.dispatchEvent(new Event('error'));
    });
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('AB');
  });

  it('falls back tiny → full → initials without leaving a broken img', () => {
    renderFace();
    act(() => {
      container.querySelector('img')!.dispatchEvent(new Event('error'));
    });
    act(() => {
      container.querySelector('img')!.dispatchEvent(new Event('error'));
    });
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('AB');
  });
});
