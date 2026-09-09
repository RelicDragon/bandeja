// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClubAvailabilitySheet } from './ClubAvailabilitySheet';
import type { Club } from '@/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mocks = vi.hoisted(() => ({ navigate: vi.fn(), reload: vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('react-i18next', async (original) => ({ ...await original<typeof import('react-i18next')>(), useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/hooks/useClubAvailability', () => ({ useClubAvailability: () => ({
  durationMinutes: 90, setDurationMinutes: vi.fn(), durations: [60, 90], loading: false, error: null,
  courtRows: [
    { court: { id: 'padel-court', name: 'Padel', sport: 'PADEL' }, freeSlots: ['23:30'] },
    { court: { id: 'tennis-court', name: 'Tennis', sport: 'TENNIS' }, freeSlots: ['12:00'] },
  ], dateKey: '2030-01-06', minDateKey: '2030-01-01', maxDateKey: '2030-01-20', reload: mocks.reload,
}) }));
const club = { id: 'club', name: 'Club', city: { timezone: 'Europe/Belgrade' } } as Club;
let root: Root;
let container: HTMLDivElement;
beforeEach(() => { vi.clearAllMocks(); container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
function render(onSelectSlot?: Parameters<typeof ClubAvailabilitySheet>[0]['onSelectSlot'], connected = true) {
  const connect = vi.fn();
  act(() => root.render(<ClubAvailabilitySheet club={club} selectedDate={new Date(2030, 0, 6, 12)} onDateChange={vi.fn()} lastFetchedAt={null} connected={connected} onConnectRequest={connect} onRefreshSnapshot={async () => true} enabled preferredSport="PADEL" onSelectSlot={onSelectSlot} />));
  return connect;
}
function tapSlot() { act(() => [...container.querySelectorAll('button')].find((button) => button.textContent === '23:30')!.click()); }

describe('availability inside a game form', () => {
  it('returns club, court and exact range across midnight instead of navigating', () => {
    const select = vi.fn(); render(select); tapSlot();
    expect(select).toHaveBeenCalledWith({ club, courtId: 'padel-court', startTime: '2030-01-06T22:30:00.000Z', endTime: '2030-01-07T00:00:00.000Z' });
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('Tennis');
  });
  it('can preset a slot before connecting; the owning form handles booking authentication', () => {
    const select = vi.fn(); const connect = render(select, false); tapSlot();
    expect(select).toHaveBeenCalledOnce(); expect(connect).not.toHaveBeenCalled();
  });
  it('keeps standalone navigation', () => { render(); tapSlot(); expect(mocks.navigate).toHaveBeenCalledOnce(); });
  it('keeps standalone connection gating', () => { const connect = render(undefined, false); tapSlot(); expect(connect).toHaveBeenCalledOnce(); expect(mocks.navigate).not.toHaveBeenCalled(); });
});
