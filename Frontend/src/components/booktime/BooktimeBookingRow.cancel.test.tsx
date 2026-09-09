// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BooktimeBookingRow } from './BooktimeBookingRow';
import type { BookingListClubRow } from '@/hooks/connectedBookingClubs';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mocks = vi.hoisted(() => ({ cancel: vi.fn(), canceled: vi.fn(), error: vi.fn() }));
vi.mock('react-i18next', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-i18next')>(),
  useTranslation: () => ({
  t: (key: string, options?: { hours?: number }) => options?.hours == null ? key : `${key}:${options.hours}`,
}) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: mocks.error } }));
vi.mock('@/store/authStore', () => ({ useAuthStore: () => null }));
vi.mock('@/hooks/useBooktimeLinkedGame', () => ({
  useBooktimeLinkedGame: () => ({ linkedGame: null, linkedGames: [], reload: vi.fn() }),
}));
vi.mock('./useBooktimeClubCurrency', () => ({ useBooktimeClubCurrency: () => null }));
vi.mock('./VerifyBookingButton', () => ({ VerifyBookingButton: () => null }));
vi.mock('./BooktimeLinkGameModal', () => ({ BooktimeLinkGameButton: () => null }));
vi.mock('@/integrations/booking/createClubBookingProvider', () => ({
  createHydratedClubBookingProvider: async () => ({ cancelBooking: mocks.cancel }),
}));
vi.mock('@/components/ConfirmationModal', () => ({
  ConfirmationModal: ({ isOpen, title, message, confirmText, onConfirm, onClose, isLoading, loadingText }: {
    isOpen: boolean; title: string; message: string; confirmText: string;
    onConfirm: () => void; onClose: () => void; isLoading: boolean; loadingText: string;
  }) => isOpen ? <div role="dialog"><h2>{title}</h2><p>{message}</p>
    <button onClick={onConfirm} disabled={isLoading}>{isLoading ? loadingText : confirmText}</button>
    <button onClick={onClose} disabled={isLoading}>Dismiss</button>
  </div> : null,
}));

const club: BookingListClubRow = {
  clubId: 'club', clubName: 'Club', companyId: 'company', avatar: null,
  connected: true, phoneNumber: null, scoutOptIn: false, cityTimezone: 'Europe/Belgrade', courts: [],
};
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.resetAllMocks();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
function render(hoursBeforeStart: number) {
  act(() => root.render(<BooktimeBookingRow
    booking={{ uuid: 'booking', bookingStart: new Date(Date.now() + hoursBeforeStart * 3600000).toISOString(),
      bookingEnd: new Date(Date.now() + (hoursBeforeStart + 1) * 3600000).toISOString() }}
    club={club} allowedHoursToCancel={8} linkedGames={[]} priceQuote={null}
    expandableActions actionsExpanded onCanceled={mocks.canceled}
  />));
}
async function click(text: string) {
  const button = [...container.querySelectorAll('button')].find((button) => button.textContent === text);
  expect(button).toBeDefined();
  await act(async () => button!.click());
}

describe('booking card cancellation deadline', () => {
  it('uses cancellation copy while waiting for the club', async () => {
    let finishCancel!: () => void;
    mocks.cancel.mockImplementationOnce(() => new Promise<void>((resolve) => { finishCancel = resolve; }));
    render(24);
    await click('club.booktime.cancelBooking');
    await click('club.booktime.cancelConfirmCta');
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('club.booktime.cancelingBooking');
    await act(async () => finishCancel());
    expect(mocks.canceled).toHaveBeenCalledOnce();
  });

  it('keeps cancellation available after the deadline and requires both confirmations', async () => {
    render(1);
    await click('club.booktime.cancelBooking');
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('club.booktime.cancelOutsidePolicyBody:8');
    expect(mocks.cancel).not.toHaveBeenCalled();
    await click('common.continue');
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('club.booktime.cancelConfirmTitle');
    expect(mocks.cancel).not.toHaveBeenCalled();
    await click('club.booktime.cancelConfirmCta');
    expect(mocks.cancel).toHaveBeenCalledWith('booking', expect.any(Function));
    expect(mocks.canceled).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it.each(['warning', 'confirmation'])('does not cancel when the %s is dismissed', async (step) => {
    render(1);
    await click('club.booktime.cancelBooking');
    if (step === 'confirmation') await click('common.continue');
    await click('Dismiss');
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await click('club.booktime.cancelBooking');
    expect(container.textContent).toContain('club.booktime.cancelOutsidePolicyTitle');
  });

  it('uses the usual single confirmation when still within the deadline', async () => {
    render(24);
    await click('club.booktime.cancelBooking');
    expect(container.textContent).not.toContain('club.booktime.cancelOutsidePolicyTitle');
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('club.booktime.cancelConfirmTitle');
    await click('club.booktime.cancelConfirmCta');
    expect(mocks.cancel).toHaveBeenCalledOnce();
  });

  it('keeps the card and reports an error if the provider rejects late cancellation', async () => {
    render(1);
    mocks.cancel.mockRejectedValue(new Error('Too late'));
    await click('club.booktime.cancelBooking');
    await click('common.continue');
    await click('club.booktime.cancelConfirmCta');
    expect(mocks.canceled).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith('club.booktime.cancelFailed');
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
