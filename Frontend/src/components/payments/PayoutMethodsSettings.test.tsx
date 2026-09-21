// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPaymentMethod, type PaymentMethodDef } from '@shared/payments/paymentMethods';
import type { PaymentMethodEntry } from '@shared/payments/paymentMethodSelection';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));
vi.mock('@/config/featureFlags', () => ({ isCostSplitEnabled: () => true }));
vi.mock('./PaymentMethodPickerSheet', () => ({
  PaymentMethodPickerSheet: ({
    open,
    onSelect,
    onOpenChange,
  }: {
    open: boolean;
    onSelect: (method: PaymentMethodDef) => void;
    onOpenChange: (open: boolean) => void;
  }) => open ? (
    <button type="button" onClick={() => {
      const method = getPaymentMethod('CUSTOM');
      if (method) onSelect(method);
      onOpenChange(false);
    }}>Choose custom</button>
  ) : null,
}));

import { PayoutMethodsSettings } from './PayoutMethodsSettings';

let container: HTMLDivElement;
let root: Root;
const onSave = vi.fn<(methods: PaymentMethodEntry[]) => Promise<boolean>>();

beforeEach(() => {
  vi.clearAllMocks();
  onSave.mockResolvedValue(true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(savedMethods: PaymentMethodEntry[] = []) {
  act(() => root.render(
    <PayoutMethodsSettings savedMethods={savedMethods} countryIso2="RS" onSave={onSave} />,
  ));
}

async function click(label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent === label,
  );
  expect(button).toBeDefined();
  await act(async () => button?.click());
}

function input() {
  const field = container.querySelector('input');
  if (!field) throw new Error('Expected payment handle input');
  return field;
}

function typeHandle(value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input(), value);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('PayoutMethodsSettings', () => {
  it('keeps a new blank method through profile refreshes and saves only on request', async () => {
    render();
    await click('cost.payment.addFirst');
    await click('Choose custom');
    expect(input().value).toBe('');
    expect(onSave).not.toHaveBeenCalled();

    render([]);
    expect(input().value).toBe('');
    typeHandle('Pay me at the court');
    render([]);
    expect(input().value).toBe('Pay me at the court');
    expect(onSave).not.toHaveBeenCalled();

    await click('cost.save');
    expect(onSave).toHaveBeenCalledExactlyOnceWith([
      { method: 'CUSTOM', handle: 'Pay me at the court' },
    ]);
  });

  it('does not save incomplete methods or discard a failed save', async () => {
    render();
    await click('cost.payment.addFirst');
    await click('Choose custom');
    await click('cost.save');
    expect(onSave).not.toHaveBeenCalled();
    expect(input().value).toBe('');

    typeHandle('Cash after the game');
    onSave.mockResolvedValueOnce(false);
    await click('cost.save');
    expect(input().value).toBe('Cash after the game');
    render([]);
    expect(input().value).toBe('Cash after the game');
  });

  it('cancels back to saved settings without writing', async () => {
    render([{ method: 'CUSTOM', handle: 'Original instructions' }]);
    typeHandle('New instructions');
    await click('cost.cancel');
    expect(input().value).toBe('Original instructions');
    expect(onSave).not.toHaveBeenCalled();
  });
});
