// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useStableIdentity } from './useStableIdentity';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let seen: unknown[] = [];

function Probe({ value }: { value: unknown }) {
  seen.push(useStableIdentity(value));
  return null;
}

function render(value: unknown) {
  act(() => {
    root.render(<Probe value={value} />);
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  seen = [];
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('useStableIdentity', () => {
  it('keeps the first reference while a refetched list stays deeply equal', () => {
    const first = [{ id: 'club-1', name: 'KSC' }];
    const refetched = [{ id: 'club-1', name: 'KSC' }];

    render(first);
    render(refetched);

    expect(seen[0]).toBe(first);
    expect(seen[1]).toBe(first);
    expect(refetched).not.toBe(first);
  });

  it('adopts the new reference once the data actually changes', () => {
    const first = [{ id: 'club-1', name: 'KSC' }];
    const changed = [{ id: 'club-1', name: 'KSC', integrationType: 'BOOKTIME' }];

    render(first);
    render(changed);
    render(changed);

    expect(seen[1]).toBe(changed);
    expect(seen[2]).toBe(changed);
  });

  it('returns the same reference when the identical input is passed again', () => {
    const value = { id: 'club-1' };

    render(value);
    render(value);

    expect(seen[0]).toBe(value);
    expect(seen[1]).toBe(value);
  });

  it('handles undefined, which is how an unselected club arrives', () => {
    render(undefined);
    render(undefined);

    expect(seen[0]).toBeUndefined();
    expect(seen[1]).toBeUndefined();
  });
});
