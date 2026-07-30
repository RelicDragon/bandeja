// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BracketPhase4CreateOptions } from './BracketPhase4CreateOptions';

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string; group?: string }) =>
      (options?.defaultValue ?? _key).replace('{{group}}', options?.group ?? ''),
  }),
}));

vi.mock('@/components/ToggleSwitch', () => ({
  ToggleSwitch: ({ id }: { id?: string }) => <button type="button" id={id} role="switch" />,
}));

vi.mock('./BracketCustomByePicker', () => ({
  BracketCustomByePicker: () => null,
}));

describe('BracketPhase4CreateOptions', () => {
  const sharedProps = {
    entrantCount: 4,
    includeThirdPlace: true,
    onIncludeThirdPlaceChange: vi.fn(),
    includeConsolationBracket: false,
    onIncludeConsolationBracketChange: vi.fn(),
    includeDoubleElimination: false,
    onIncludeDoubleEliminationChange: vi.fn(),
    customByeEnabled: false,
    onCustomByeEnabledChange: vi.fn(),
    customByeSeedRanks: [],
    onCustomByeSeedRanksChange: vi.fn(),
  };

  let container: HTMLDivElement;
  let root: Root;

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  async function renderOptions(ui: ReactNode) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(ui);
    });
  }

  it('reveals differing-group hints and copy actions under affected toggles', async () => {
    await renderOptions(
      <BracketPhase4CreateOptions
        {...sharedProps}
        thirdPlaceMismatchHint="Turned off in: Group B, Group C."
        consolationMismatchHint="Turned on in: Group B."
        doubleEliminationMismatchHint="Turned on in: Group C."
        onCopyThirdPlaceToOtherGroups={vi.fn()}
        onCopyConsolationToOtherGroups={vi.fn()}
        onCopyDoubleEliminationToOtherGroups={vi.fn()}
      />
    );

    expect(container.innerHTML).toContain('Turned off in: Group B, Group C.');
    expect(container.innerHTML).toContain('Turned on in: Group B.');
    expect(container.innerHTML).toContain('Turned on in: Group C.');
    expect(container.innerHTML.match(/Copy to other groups/g)).toHaveLength(3);
    expect(container.innerHTML.match(/grid-rows-\[0fr\] opacity-0/g)).toHaveLength(3);

    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    });

    expect(container.innerHTML.match(/grid-rows-\[1fr\] opacity-100/g)).toHaveLength(3);
    expect(container.querySelectorAll('label[for]')).toHaveLength(3);
    expect(container.querySelectorAll('button[role="switch"][id]')).toHaveLength(3);
  });

  it('animates hints away when all group values become equal', async () => {
    await renderOptions(
      <BracketPhase4CreateOptions
        {...sharedProps}
        thirdPlaceMismatchHint="Turned off in: Group B, Group C."
        consolationMismatchHint="Turned on in: Group B."
        doubleEliminationMismatchHint="Turned on in: Group C."
        onCopyThirdPlaceToOtherGroups={vi.fn()}
        onCopyConsolationToOtherGroups={vi.fn()}
        onCopyDoubleEliminationToOtherGroups={vi.fn()}
      />
    );

    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    });

    await act(async () => {
      root.render(<BracketPhase4CreateOptions {...sharedProps} />);
    });

    expect(container.innerHTML.match(/grid-rows-\[0fr\] opacity-0/g)).toHaveLength(3);
    expect(container.innerHTML).toContain('tabindex="-1"');
  });

  it('keeps hints and copy actions hidden when all group values match', async () => {
    await renderOptions(<BracketPhase4CreateOptions {...sharedProps} />);

    expect(container.innerHTML.match(/grid-rows-\[0fr\] opacity-0/g)).toHaveLength(3);
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(3);
    expect(container.querySelectorAll('button[disabled][tabindex="-1"]')).toHaveLength(3);
  });
});
