// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StagingEnvironmentBanner } from './StagingEnvironmentBanner';

describe('StagingEnvironmentBanner', () => {
  const originalDeploymentEnvironment = import.meta.env.VITE_DEPLOYMENT_ENV;
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    import.meta.env.VITE_DEPLOYMENT_ENV = originalDeploymentEnvironment;
  });

  it('is unmistakable in the staging deployment', () => {
    import.meta.env.VITE_DEPLOYMENT_ENV = 'staging';

    act(() => root.render(<StagingEnvironmentBanner />));

    expect(container.textContent).toContain('Beta');
    expect(container.textContent).toContain('Staging environment');
    expect(container.textContent).toContain('Not production');
  });

  it('does not render in production', () => {
    import.meta.env.VITE_DEPLOYMENT_ENV = 'production';

    act(() => root.render(<StagingEnvironmentBanner />));

    expect(container.innerHTML).toBe('');
  });
});
