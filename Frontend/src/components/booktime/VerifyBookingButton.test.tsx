// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VerifyBookingButton } from './VerifyBookingButton';
import type { BookingListClubRow } from '@/hooks/connectedBookingClubs';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mocks = vi.hoisted(() => ({ verify: vi.fn(), remove: vi.fn(), removed: vi.fn(), error: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: mocks.error } }));
vi.mock('@/integrations/booking/createClubBookingProvider', () => ({
  createHydratedClubBookingProvider: async () => ({ verifyBooking: mocks.verify }),
}));
vi.mock('@/services/gameBooking/removeMissingBooking', () => ({ removeMissingBooking: mocks.remove }));
vi.mock('@/components/ui/Dialog', () => {
  const Part = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  return { Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <div role="dialog">{children}</div> : null,
    DialogContent: Part, DialogHeader: Part, DialogTitle: Part, DialogDescription: Part, DialogFooter: Part };
});
vi.mock('@/components/ConfirmationModal', () => ({
  ConfirmationModal: ({ isOpen, onConfirm, onClose, isLoading, loadingText }: {
    isOpen: boolean; onConfirm: () => void; onClose: () => void; isLoading: boolean; loadingText: string;
  }) => isOpen ? <div role="dialog"><button onClick={onConfirm} disabled={isLoading}>{isLoading ? loadingText : 'Remove'}</button><button onClick={onClose}>Cancel</button></div> : null,
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
  act(() => root.render(<VerifyBookingButton bookingId="booking" club={club} onRemoved={mocks.removed} />));
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
async function click(text: string) {
  const button = [...container.querySelectorAll('button')].find((button) => button.textContent === text);
  expect(button).toBeDefined();
  await act(async () => button!.click());
}

describe('Verify action', () => {
  it('uses checking copy during re-verification and deletion copy only while removing', async () => {
    let finishCheck!: (value: boolean) => void;
    let finishRemoval!: () => void;
    mocks.verify.mockResolvedValueOnce(false).mockImplementationOnce(() => new Promise<boolean>((resolve) => { finishCheck = resolve; }));
    mocks.remove.mockImplementationOnce(() => new Promise<void>((resolve) => { finishRemoval = resolve; }));
    await click('club.booktime.verifyBooking');
    await click('Remove');
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('club.booktime.verifyingBooking');
    await act(async () => finishCheck(false));
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('common.deleting');
    await act(async () => finishRemoval());
    expect(mocks.removed).toHaveBeenCalledOnce();
  });

  it('shows a still-booked modal without removing anything', async () => {
    mocks.verify.mockResolvedValue(true);
    await click('club.booktime.verifyBooking');
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('club.booktime.stillBookedBody');
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('requires confirmation and checks again before removing', async () => {
    mocks.verify.mockResolvedValue(false);
    await click('club.booktime.verifyBooking');
    expect(mocks.remove).not.toHaveBeenCalled();
    await click('Remove');
    expect(mocks.verify).toHaveBeenCalledTimes(2);
    expect(mocks.remove).toHaveBeenCalledWith('booking');
    expect(mocks.removed).toHaveBeenCalledOnce();
  });

  it('does not remove a booking after dismissal', async () => {
    mocks.verify.mockResolvedValue(false);
    await click('club.booktime.verifyBooking');
    await click('Cancel');
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('does not remove a booking that reappears before confirmation', async () => {
    mocks.verify.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await click('club.booktime.verifyBooking');
    await click('Remove');
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(container.textContent).toContain('club.booktime.stillBookedBody');
  });

  it('shows an error without a removal prompt when verification fails', async () => {
    mocks.verify.mockRejectedValue(new Error('Session expired'));
    await click('club.booktime.verifyBooking');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(mocks.error).toHaveBeenCalledWith('club.booktime.verifyFailed');
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('keeps the confirmation available for retry after removal fails', async () => {
    mocks.verify.mockResolvedValue(false);
    mocks.remove.mockRejectedValue(new Error('Forbidden'));
    await click('club.booktime.verifyBooking');
    await click('Remove');
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(mocks.removed).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith('club.booktime.removeMissingFailed');
  });
});
