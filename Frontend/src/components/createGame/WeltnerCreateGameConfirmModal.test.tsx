// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AxiosError } from 'axios';
import { WeltnerCreateGameConfirmModal } from './WeltnerCreateGameConfirmModal';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const mocks = vi.hoisted(() => ({
  book: vi.fn(),
  save: vi.fn(),
  success: vi.fn(),
}));
vi.mock('@/api/weltner', () => ({ weltnerApi: { book: mocks.book } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/components/ui/Dialog', () => {
  const Part = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  return {
    Dialog: Part,
    DialogContent: Part,
    DialogHeader: Part,
    DialogTitle: Part,
  };
});
const receipt = {
  externalBookingId: 'weltner:receipt',
  courtId: 'court',
  bookingStart: '2026-09-21T20:00:00Z',
  bookingEnd: '2026-09-21T22:00:00Z',
  state: 'CONFIRMED',
};
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.resetAllMocks();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  mocks.book.mockResolvedValue(receipt);
  act(() =>
    root.render(
      <WeltnerCreateGameConfirmModal
        open
        onOpenChange={() => {}}
        club={{
          id: 'club',
          name: 'Club',
          address: '',
          cityId: 'city',
          integrationType: 'WELTNER',
        }}
        bookings={[
          {
            court: {
              id: 'court',
              clubId: 'club',
              name: 'Yucatan',
              isIndoor: false,
              externalCourtId: 'teren-1-yucatan',
            },
            date: new Date('2026-09-21T12:00:00Z'),
            startTime: '22:00',
            durationMinutes: 120,
          },
        ]}
        summaryChips={[]}
        bookFlowContext={{
          refreshSnapshot: async () => true,
          lastFetchedAt: null,
        }}
        snapshotBlocked={false}
        onExecuteCreateGame={mocks.save}
        onSlotTaken={() => {}}
        onSuccess={mocks.success}
      />,
    ),
  );
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
it('attaches authoritative receipt times, including midnight, instead of reconstructing them', async () => {
  await act(async () => container.querySelector('button')!.click());
  expect(mocks.book).toHaveBeenCalledWith('club', {
    courtId: 'court',
    date: '2026-09-21',
    startTime: '22:00',
    durationMinutes: 120,
  });
  expect(mocks.save).toHaveBeenCalledWith({
    externalBookingIds: ['weltner:receipt'],
    bookingSnapshots: [
      {
        externalBookingId: 'weltner:receipt',
        courtId: 'court',
        bookingStart: receipt.bookingStart,
        bookingEnd: receipt.bookingEnd,
      },
    ],
    hasBookedCourt: true,
  });
  expect(mocks.success).toHaveBeenCalledOnce();
});
it('offers game-save recovery after a confirmed court reservation', async () => {
  mocks.save
    .mockRejectedValueOnce(new Error('game save unavailable'))
    .mockResolvedValueOnce(undefined);
  await act(async () => container.querySelector('button')!.click());
  expect(container.textContent).toContain('weltner.gameSaveFailed');
  expect(container.querySelector('button')!.textContent).toBe('weltner.saveGame');
  await act(async () => container.querySelector('button')!.click());
  expect(mocks.success).toHaveBeenCalledOnce();
  expect(mocks.save).toHaveBeenCalledTimes(2);
});
it('blocks a retry when the response was lost', async () => {
  mocks.book.mockRejectedValue(new AxiosError('Network Error'));
  await act(async () => container.querySelector('button')!.click());
  expect(container.textContent).toContain('weltner.bookingUnknown');
  expect(container.querySelector('button')!.disabled).toBe(true);
  expect(mocks.save).not.toHaveBeenCalled();
});
