// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Club } from '@/types';
import type { ConnectedBookingClubRow } from './connectedBookingClubs';
import { useClubBookingAuth } from './useClubBookingAuth';
import { useWeltnerUpcomingBookings } from './useWeltnerUpcomingBookings';
import { useAllPastClubBookings } from './useAllPastClubBookings';
import { WeltnerConnectForm } from '@/components/booktime/WeltnerConnectForm';
import { WeltnerBookings } from '@/components/booktime/WeltnerBookings';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mocks = vi.hoisted(() => ({ userId: 'a' as string | null, getAuth: vi.fn(), putAuth: vi.fn(), bookings: vi.fn(), past: vi.fn(), connected: vi.fn() }));
vi.mock('@/store/authStore', () => ({ useAuthStore: (select: (state: { user: { id: string; phone: string } | null }) => unknown) => select({ user: mocks.userId ? { id: mocks.userId, phone: '+381601111111' } : null }) }));
vi.mock('@/api/weltner', () => ({ weltnerApi: mocks }));
vi.mock('@/api/booktime', () => ({ booktimeApi: {} }));
vi.mock('@/api/padeloo', () => ({ padelooApi: {} }));
vi.mock('@/api/klikteren', () => ({ klikterenApi: {} }));
vi.mock('@/hooks/useBooktimeAllPast', () => ({ useBooktimeAllPast: () => ({ bookings: [], loading: false }) }));
vi.mock('@/integrations/weltner/receipts', () => ({ loadWeltnerBookingsForClubs: mocks.past }));
vi.mock('@/integrations/padeloo/padelooAllPastLoader', () => ({ loadPadelooPastForClubs: vi.fn() }));
vi.mock('@/integrations/klikteren/klikterenAllPastLoader', () => ({ loadKlikterenPastForClubs: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }));
vi.mock('react-router-dom', () => ({ Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a> }));
const club: Club = { id: 'club', name: 'Club', cityId: 'city', address: '', integrationType: 'WELTNER' };
const row: ConnectedBookingClubRow = { clubId: 'club', clubName: 'Club', avatar: null, integrationType: 'WELTNER', connected: true, needsReauth: false, scoutOptIn: false, cityTimezone: 'Europe/Belgrade', courts: [] };
const clubs = [row];
const receipt = { externalBookingId: 'weltner:private-a', state: 'CONFIRMED', courtId: 'court', bookingStart: '2099-01-01T12:00:00Z', bookingEnd: '2099-01-01T13:00:00Z' };
const auth = { data: { connected: true, phoneNumber: '+381609999999' } };
const past = { uuid: 'weltner:past-a', bookingStart: '2020-01-01T12:00:00Z', bookingEnd: '2020-01-01T13:00:00Z', clubId: 'club', clubName: 'Club', integrationType: 'WELTNER' };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function Harness() {
  const connected = useClubBookingAuth(club, true);
  const upcoming = useWeltnerUpcomingBookings(club, true);
  const history = useAllPastClubBookings(clubs, true);
  return <div>{connected.status?.phoneNumber}{upcoming.bookings.map(r => r.uuid).join(',')}{history.bookings.map(r => r.uuid).join(',')}</div>;
}
let root: Root;
let container: HTMLDivElement;
beforeEach(() => { vi.resetAllMocks(); mocks.userId = 'a'; mocks.getAuth.mockResolvedValue(auth); mocks.bookings.mockResolvedValue([receipt]); mocks.past.mockResolvedValue([past]); container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
it('masks saved phone, upcoming receipts and history immediately on same-club account switch/logout', async () => {
  await act(async () => root.render(<Harness />));
  expect(container.textContent).toContain('+381609999999');
  expect(container.textContent).toContain('weltner:private-a');
  expect(container.textContent).toContain('weltner:past-a');
  const nextAuth = deferred<unknown>(); const nextBookings = deferred<unknown[]>(); const nextPast = deferred<unknown[]>();
  mocks.getAuth.mockReturnValue(nextAuth.promise); mocks.bookings.mockReturnValue(nextBookings.promise); mocks.past.mockReturnValue(nextPast.promise);
  mocks.userId = 'b';
  await act(async () => root.render(<Harness />));
  expect(container.textContent).toBe('');
  mocks.userId = null;
  await act(async () => root.render(<Harness />));
  await act(async () => { nextAuth.resolve(auth); nextBookings.resolve([receipt]); nextPast.resolve([past]); });
  expect(container.textContent).toBe('');
  expect(mocks.getAuth).toHaveBeenCalledTimes(2); expect(mocks.bookings).toHaveBeenCalledTimes(2); expect(mocks.past).toHaveBeenCalledTimes(2);
});
it('ignores the previous account response when the new account finished first', async () => {
  const oldAuth = deferred<unknown>(); const oldBookings = deferred<unknown[]>(); const oldPast = deferred<unknown[]>();
  mocks.getAuth.mockReturnValueOnce(oldAuth.promise).mockResolvedValue({ data: { connected: false } });
  mocks.bookings.mockReturnValueOnce(oldBookings.promise).mockResolvedValue([]); mocks.past.mockReturnValueOnce(oldPast.promise).mockResolvedValue([]);
  await act(async () => root.render(<Harness />)); mocks.userId = 'b'; await act(async () => root.render(<Harness />));
  await act(async () => { oldAuth.resolve(auth); oldBookings.resolve([receipt]); oldPast.resolve([past]); });
  expect(container.textContent).toBe('');
});
it('clears the form phone for another account sharing the same profile phone and ignores a stale save', async () => {
  const save = deferred<unknown>(); mocks.putAuth.mockReturnValue(save.promise);
  await act(async () => root.render(<WeltnerConnectForm club={club} onConnected={mocks.connected} />));
  expect(container.querySelector('input')!.value).toBe('+381609999999');
  await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  const next = deferred<unknown>(); mocks.getAuth.mockReturnValue(next.promise); mocks.userId = 'b';
  await act(async () => root.render(<WeltnerConnectForm club={club} onConnected={mocks.connected} />));
  expect(container.querySelector('input')!.value).toBe('+381601111111');
  expect(container.querySelector('button')!.disabled).toBe(true);
  await act(async () => save.resolve({})); expect(mocks.connected).not.toHaveBeenCalled();
  mocks.userId = null; await act(async () => root.render(<WeltnerConnectForm club={club} onConnected={mocks.connected} />));
  await act(async () => next.resolve(auth));
  expect(container.querySelector('input')!.value).toBe(''); expect(container.querySelector('button')!.disabled).toBe(true);
  expect(mocks.getAuth).toHaveBeenCalledTimes(2);
});
it('hides receipt-panel data on account switch and ignores a late response after logout', async () => {
  const disconnected = { ...row, connected: false };
  await act(async () => root.render(<WeltnerBookings club={disconnected} refreshKey={0} />));
  expect(container.querySelector('a')!.getAttribute('href')).toContain('private-a');
  const next = deferred<unknown[]>(); mocks.bookings.mockReturnValue(next.promise); mocks.userId = 'b';
  await act(async () => root.render(<WeltnerBookings club={disconnected} refreshKey={0} />));
  expect(container.querySelector('a')).toBeNull();
  mocks.userId = null; await act(async () => root.render(<WeltnerBookings club={disconnected} refreshKey={0} />));
  await act(async () => next.resolve([receipt]));
  expect(container.textContent).toBe(''); expect(mocks.bookings).toHaveBeenCalledTimes(2);
});
