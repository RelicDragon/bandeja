// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('@/hooks/useBackButtonModal', () => ({ useBackButtonModal: () => {} }));

vi.mock('@/components/ui/Drawer', () => ({
  Drawer: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="sheet">{children}</div> : null,
  DrawerContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerHandle: () => <div />,
  DrawerCloseButton: ({ 'aria-label': label }: { 'aria-label'?: string }) => (
    <button type="button" aria-label={label} />
  ),
}));

import { AttendanceLegendSheet } from './AttendanceLegendSheet';

/**
 * PRD 346 — "What the dots mean" as a legend, not a sentence.
 *
 * The legend used to be a one-line toast: four colours explained in prose that
 * then vanished. These tests pin the two things that made it a legend — every
 * dot state is listed with its own dot, and the product principle travels with
 * it.
 */

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(open: boolean, onClose = vi.fn()) {
  act(() => {
    root.render(<AttendanceLegendSheet open={open} onClose={onClose} />);
  });
}

describe('AttendanceLegendSheet', () => {
  it('lists every dot state with its own dot', () => {
    render(true);
    const items = container.querySelectorAll('[data-testid="attendance-legend-list"] li');

    expect(items).toHaveLength(4);
    expect(
      Array.from(container.querySelectorAll('[data-attendance-state]')).map((dot) =>
        dot.getAttribute('data-attendance-state'),
      ),
    ).toEqual(['CONFIRMED', 'UNSURE', 'UNANSWERED', 'NO_SHOW']);
  });

  it('labels each state from the shared dot copy, so it matches the roster', () => {
    render(true);
    const text = container.textContent ?? '';

    for (const key of ['confirmed', 'unsure', 'unanswered', 'noShow']) {
      expect(text).toContain(`attendance.dots.${key}`);
    }
  });

  it('repeats the product principle where the dots are explained', () => {
    render(true);
    expect(container.textContent).toContain('attendance.caption');
  });

  it('is a real titled surface, not a transient toast', () => {
    render(true);
    expect(container.textContent).toContain('attendance.legend.title');
    expect(container.querySelector('[aria-label="common.close"]')).not.toBeNull();
  });

  it('renders nothing while closed', () => {
    render(false);
    expect(container.querySelector('[data-testid="sheet"]')).toBeNull();
  });
});
