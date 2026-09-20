// @vitest-environment jsdom

/**
 * PRD 357 — the indoor/outdoor control is what decides whether a club's games
 * ever get a weather alert, so it must stay a prominent two-option control and
 * must keep writing `isIndoor`.
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

vi.mock('@/components', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/Dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@/sport/sportRegistry', () => ({ getSportConfig: () => ({ labelKey: 'sport.padel' }) }));
vi.mock('@/components/sport/SportPublicIcon', () => ({ SportPublicIcon: () => <span /> }));

type SwitchProps = {
  tabs: { id: string; label: string }[];
  activeId: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
};

const switchRenders: SwitchProps[] = [];
vi.mock('@/components/SegmentedSwitch', () => ({
  SegmentedSwitch: (props: SwitchProps) => {
    switchRenders.push(props);
    return (
      <div role="tablist" aria-label={props.ariaLabel}>
        {props.tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={props.activeId === tab.id}
            onClick={() => props.onChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    );
  },
}));

import { ClubAdminCourtForm } from './ClubAdminCourtForm';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(node: ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(node);
  });
  return container;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  switchRenders.length = 0;
});

describe('ClubAdminCourtForm court cover', () => {
  it('renders Indoor / Outdoor as a segmented control, not a checkbox', () => {
    const host = render(
      <ClubAdminCourtForm
        open
        onClose={() => undefined}
        clubSports={['PADEL'] as never}
        onSubmit={async () => undefined}
      />,
    );
    const tablist = host.querySelector('[role="tablist"]') as HTMLElement;
    expect(tablist).toBeTruthy();
    expect(tablist.getAttribute('aria-label')).toBe('weatherAlerts.courtCover');
    expect(switchRenders[0].tabs.map((tab) => tab.id)).toEqual(['indoor', 'outdoor']);
    expect(switchRenders[0].tabs.map((tab) => tab.label)).toEqual([
      'weatherAlerts.indoor',
      'weatherAlerts.outdoor',
    ]);
    expect(host.textContent).toContain('weatherAlerts.courtCoverHint');
  });

  it('defaults a new court to outdoor and submits the flag it shows', async () => {
    const onSubmit = vi.fn(async () => undefined);
    const host = render(
      <ClubAdminCourtForm
        open
        onClose={() => undefined}
        clubSports={['PADEL'] as never}
        onSubmit={onSubmit}
      />,
    );
    expect(switchRenders.at(-1)!.activeId).toBe('outdoor');

    const nameInput = host.querySelector('input') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )!.set!;
    act(() => {
      setter.call(nameInput, 'Court 9');
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const indoorButton = host.querySelectorAll('[role="tablist"] button')[0] as HTMLButtonElement;
    act(() => indoorButton.click());
    expect(switchRenders.at(-1)!.activeId).toBe('indoor');

    const submit = [...host.querySelectorAll('button')].at(-1) as HTMLButtonElement;
    await act(async () => {
      submit.click();
    });
    expect(onSubmit).toHaveBeenCalled();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ isIndoor: true });
  });

  it('starts from the existing court value when editing', () => {
    render(
      <ClubAdminCourtForm
        open
        onClose={() => undefined}
        clubSports={['PADEL'] as never}
        court={{ id: 'c1', name: 'Court 1', isIndoor: true, isActive: true } as never}
        onSubmit={async () => undefined}
      />,
    );
    expect(switchRenders.at(-1)!.activeId).toBe('indoor');
  });
});
