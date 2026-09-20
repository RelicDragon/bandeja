// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useWeltnerTimeOptions } from './useWeltnerTimeOptions';
import type { WeltnerAvailability } from '@/api/weltner';
import type { Club } from '@/types';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const mocks = vi.hoisted(() => ({ availability: vi.fn() }));
vi.mock('@/api/weltner', () => ({
  weltnerApi: { availability: mocks.availability },
}));
const club: Club = {
  id: 'club',
  name: 'Club',
  cityId: 'city',
  address: '',
  integrationType: 'WELTNER',
};
const day = new Date('2026-09-21T12:00:00Z');
const fixture: WeltnerAvailability = {
  date: '2026-09-21',
  courts: [
    {
      courtId: 'one',
      externalCourtId: 'teren-1-yucatan',
      slots: [
        { start: '08:00', end: '09:00', duration: 60 },
        { start: '08:00', end: '09:30', duration: 90 },
        { start: '22:00', end: '00:00', duration: 120 },
      ],
    },
    {
      courtId: 'two',
      externalCourtId: 'teren-2-azteca',
      slots: [
        { start: '08:00', end: '09:00', duration: 60 },
        { start: '22:00', end: '00:00', duration: 120 },
      ],
    },
  ],
};
let root: Root;
let container: HTMLDivElement;
let result: ReturnType<typeof useWeltnerTimeOptions>;
function Probe({
  duration = 1,
  date = day,
  selected = ['one', 'two'],
}: {
  duration?: number;
  date?: Date;
  selected?: string[];
}) {
  result = useWeltnerTimeOptions({
    club,
    selectedDate: date,
    durationHours: duration,
    selectedCourtId: null,
    selectedCourtIds: selected,
    enabled: true,
  });
  return null;
}
beforeEach(() => {
  vi.resetAllMocks();
  container = document.createElement('div');
  root = createRoot(container);
  mocks.availability.mockResolvedValue(fixture);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
it('intersects exact start-duration tuples instead of stitching shorter free slots', async () => {
  await act(async () => root.render(<Probe />));
  expect(result.generateTimeOptions()).toEqual(['08:00']);
  await act(async () => root.render(<Probe duration={1.5} />));
  expect(result.generateTimeOptions()).toEqual([]);
  await act(async () => root.render(<Probe duration={2} />));
  expect(result.generateTimeOptions()).toEqual(['22:00']);
  expect(result.canAccommodateDuration('22:00', 3)).toBe(false);
});
it('does not show old-day availability while a changed date is loading', async () => {
  await act(async () => root.render(<Probe />));
  mocks.availability.mockReturnValue(new Promise(() => {}));
  await act(async () => root.render(<Probe date={new Date('2026-09-22T12:00:00Z')} />));
  expect(result.generateTimeOptions()).toEqual([]);
  expect(result.loading).toBe(true);
});
it('fails closed when a selected court is absent from the response', async () => {
  await act(async () => root.render(<Probe selected={['one', 'missing']} />));
  expect(result.generateTimeOptions()).toEqual([]);
});
