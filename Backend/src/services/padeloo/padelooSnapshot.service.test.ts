import { parseCourtsInput } from '../booking/snapshotStorage';
import { ApiError } from '../../utils/ApiError';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function expectApiError(fn: () => unknown, msg: string): void {
  try {
    fn();
    console.error('FAIL:', msg);
    process.exit(1);
  } catch (err) {
    assert(err instanceof ApiError, `${msg} (expected ApiError)`);
  }
}

function run(): void {
  const courts = parseCourtsInput([
    {
      courtId: 'court-1',
      externalCourtId: '5',
      externalCourtName: 'Teren 1',
      busySlots: [{ startTime: '2026-07-14T08:00:00.000Z', endTime: '2026-07-14T09:00:00.000Z' }],
    },
  ]);

  assert(courts.length === 1, 'expected one court');
  assert(courts[0]?.externalCourtId === '5', 'externalCourtId');
  assert(courts[0]?.busySlots.length === 1, 'busySlots');

  expectApiError(() => parseCourtsInput([{ externalCourtId: '' }]), 'reject empty externalCourtId');
  expectApiError(() => parseCourtsInput(null), 'reject null input');

  console.log('padelooSnapshot.service.test.ts: all passed');
}

run();
