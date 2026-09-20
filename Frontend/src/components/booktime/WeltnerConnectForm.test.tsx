// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { WeltnerConnectForm } from './WeltnerConnectForm';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const mocks = vi.hoisted(() => ({ getAuth: vi.fn(), putAuth: vi.fn(), connected: vi.fn() }));
vi.mock('@/api/weltner', () => ({ weltnerApi: mocks }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/store/authStore', () => ({
  useAuthStore: (select: (state: unknown) => unknown) =>
    select({ user: { id: 'player', phone: '+381601111111' } }),
}));
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getAuth.mockResolvedValue({ data: { connected: true, phoneNumber: '+381602222222' } });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
async function render() {
  await act(async () =>
    root.render(
      <WeltnerConnectForm
        club={{ id: 'club', name: 'Club', cityId: 'city', address: '', integrationType: 'WELTNER' }}
        onConnected={mocks.connected}
      />,
    ),
  );
}
async function submit() {
  await act(async () =>
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
}
it('uses the saved club phone instead of silently replacing it with the profile phone', async () => {
  await render();
  expect(container.querySelector('input')!.value).toBe('+381602222222');
  await submit();
  expect(mocks.putAuth).toHaveBeenCalledWith('club', '+381602222222');
  expect(mocks.connected).toHaveBeenCalledOnce();
});
it('keeps the form open and explains a failed save', async () => {
  mocks.putAuth.mockRejectedValue(new Error('invalid phone'));
  await render();
  await submit();
  expect(mocks.connected).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')!.textContent).toBe('weltner.saveFailed');
});
it('waits for the saved phone before accepting edits or submitting', async () => {
  let finish!: (value: unknown) => void;
  mocks.getAuth.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await render();
  expect(container.querySelector('input')!.disabled).toBe(true);
  expect(container.querySelector('button')!.disabled).toBe(true);
  await submit();
  expect(mocks.putAuth).not.toHaveBeenCalled();
  await act(async () => finish({ data: { connected: true, phoneNumber: '+381609999999' } }));
  expect(container.querySelector('input')!.disabled).toBe(false);
  expect(container.querySelector('input')!.value).toBe('+381609999999');
});
