// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

const rootProps = vi.hoisted(() => ({
  last: {} as Record<string, unknown>,
}));

vi.mock('vaul', () => {
  const Root = ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) => {
    rootProps.last = props;
    return <div data-testid="vaul-root">{children}</div>;
  };
  const passthrough = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  return {
    Drawer: {
      Root,
      NestedRoot: Root,
      Content: passthrough,
      Overlay: () => null,
      Title: passthrough,
      Close: passthrough,
      Portal: passthrough,
      Handle: () => <div data-testid="vaul-handle" />,
      Trigger: passthrough,
      Description: passthrough,
    },
  };
});

import { Drawer } from './Drawer';

describe('Drawer', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    rootProps.last = {};
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('does not change Vaul dismiss behavior unless handleOnly is opted in', () => {
    act(() => {
      root.render(
        <Drawer open>
          <div>sheet</div>
        </Drawer>,
      );
    });
    expect('handleOnly' in rootProps.last).toBe(false);
  });

  it('passes handleOnly to Vaul only when true', () => {
    act(() => {
      root.render(
        <Drawer open handleOnly>
          <div>sheet</div>
        </Drawer>,
      );
    });
    expect(rootProps.last.handleOnly).toBe(true);
  });
});
