// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaymentMethodDef } from '@shared/payments/paymentMethods';

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
  DrawerHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DrawerDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

vi.mock('@/components/ui/OverlayKeyboardBody', () => ({
  OverlayKeyboardBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { PaymentMethodPickerSheet } from './PaymentMethodPickerSheet';

/**
 * PRD 348 — what the picker actually offers, per country.
 *
 * The catalogue itself is covered in `shared/payments`; this is the one thing
 * only the component can prove: the list a Belgrade organiser sees is the
 * Serbian one, and a method already on the game cannot be added twice.
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

function render(props: {
  countryIso2: string | null;
  selectedIds?: string[];
  onSelect?: (method: PaymentMethodDef) => void;
}) {
  act(() => {
    root.render(
      <PaymentMethodPickerSheet
        open
        onOpenChange={() => {}}
        countryIso2={props.countryIso2}
        selectedIds={props.selectedIds ?? []}
        onSelect={props.onSelect ?? (() => {})}
      />,
    );
  });
}

const optionLabels = () =>
  Array.from(container.querySelectorAll('li button')).map(
    (button) => button.querySelector('span span')?.textContent ?? '',
  );

describe('PaymentMethodPickerSheet', () => {
  it('leads with the custom option and the local rail in Serbia', () => {
    render({ countryIso2: 'RS' });
    const labels = optionLabels();

    expect(labels[0]).toBe('cost.payment.method.custom');
    expect(labels[1]).toBe('IPS Prenesi');
    expect(labels).toContain('cost.payment.method.rsAccount');
    // The whole point of the country scope: no IBAN, no Revolut in Belgrade.
    expect(labels).not.toContain('cost.payment.method.iban');
    expect(labels).not.toContain('Revolut');
  });

  it('offers Bizum in Spain and PromptPay in Thailand', () => {
    render({ countryIso2: 'ES' });
    expect(optionLabels()).toContain('Bizum');

    render({ countryIso2: 'TH' });
    const thai = optionLabels();
    expect(thai).toContain('PromptPay');
    expect(thai).not.toContain('Bizum');
  });

  it('falls back to the universal three when the country is unknown', () => {
    render({ countryIso2: null });
    expect(optionLabels()).toEqual([
      'cost.payment.method.custom',
      'cost.payment.method.bankTransfer',
      'cost.payment.method.cash',
    ]);
  });

  it('cannot add the same method twice', () => {
    const onSelect = vi.fn();
    render({ countryIso2: 'RS', selectedIds: ['IPS_PRENESI'], onSelect });

    const prenesi = Array.from(container.querySelectorAll('li button')).find((button) =>
      button.textContent?.includes('IPS Prenesi'),
    ) as HTMLButtonElement | undefined;

    expect(prenesi?.disabled).toBe(true);
    act(() => prenesi?.click());
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('hands back the picked method', () => {
    const onSelect = vi.fn();
    render({ countryIso2: 'ES', onSelect });

    const bizum = Array.from(container.querySelectorAll('li button')).find((button) =>
      button.textContent?.includes('Bizum'),
    ) as HTMLButtonElement | undefined;

    act(() => bizum?.click());
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'BIZUM' }));
  });
});
