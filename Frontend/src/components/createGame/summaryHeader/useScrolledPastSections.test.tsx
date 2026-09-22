// @vitest-environment jsdom

import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useScrolledPastSections } from './useScrolledPastSections';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('create-game summary scroll tracking', () => {
  let host: HTMLDivElement;
  let root: Root;
  let sectionTop: number;
  let frame: FrameRequestCallback | undefined;
  const viewportRef = createRef<HTMLDivElement>();
  const sectionRefs = { setup: createRef<HTMLDivElement>() };
  const render = vi.fn();

  function Harness() {
    const past = useScrolledPastSections(viewportRef, sectionRefs);
    render(past.setup);
    return <div ref={viewportRef}><div ref={sectionRefs.setup} /></div>;
  }

  function scroll(top: number) {
    sectionTop = top;
    act(() => {
      viewportRef.current?.dispatchEvent(new Event('scroll'));
      const pending = frame;
      frame = undefined;
      pending?.(0);
    });
  }

  beforeEach(() => {
    sectionTop = 100;
    frame = undefined;
    render.mockClear();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return new DOMRect(0, this === sectionRefs.setup.current ? sectionTop : 0, 400, 100);
    });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => root.render(<Harness />));
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not rerender on scroll when the visible summary has not changed', () => {
    scroll(10);
    expect(render).toHaveBeenLastCalledWith(true);
    render.mockClear();
    for (const top of [9, 8, 0, -50]) scroll(top);
    expect(render).not.toHaveBeenCalled();
  });

  it('keeps a chip stable around the reveal boundary and hides it when scrolling back', () => {
    scroll(10);
    expect(render).toHaveBeenLastCalledWith(true);
    render.mockClear();
    for (const top of [11, 13, 10, 20, 51]) scroll(top);
    expect(render).not.toHaveBeenCalled();
    scroll(53);
    expect(render).toHaveBeenLastCalledWith(false);
  });
});
