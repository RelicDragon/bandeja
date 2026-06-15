import { ApiError } from '../../utils/ApiError';
import {
  ingestBookingSnapshotTimes,
  normalizeBooktimeIngestIso,
  parseBusySlotsForIngest,
} from './ingest';

const TZ = 'Europe/Belgrade';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function assertThrows400(fn: () => void, msgSubstring: string): void {
  try {
    fn();
    console.error('FAIL: expected ApiError 400 containing', msgSubstring);
    process.exit(1);
  } catch (err: unknown) {
    assert(err instanceof ApiError, 'expected ApiError');
    assert((err as ApiError).statusCode === 400, 'expected status 400');
    assert((err as ApiError).message.includes(msgSubstring), `message should include "${msgSubstring}"`);
  }
}

function testNormalizeFakeZ(): void {
  assert(
    normalizeBooktimeIngestIso('2026-06-14T09:00:00.000Z', 'start', TZ)
      === '2026-06-14T07:00:00.000Z',
    'fake-Z converts to real UTC',
  );
}

function testNormalizeNaive(): void {
  assert(
    normalizeBooktimeIngestIso('2026-06-14T09:00', 'start', TZ) === '2026-06-14T07:00:00.000Z',
    'naive local converts to UTC',
  );
}

function testNormalizeAlreadyUtc(): void {
  const stored = '2026-06-14T07:00:00.000Z';
  assert(
    normalizeBooktimeIngestIso(stored, 'start', TZ) === stored,
    'already-UTC passes through',
  );
}

function testNormalizeUnparseable(): void {
  assertThrows400(
    () => normalizeBooktimeIngestIso('not-a-date', 'bookingStart', TZ),
    'bookingStart is unparseable',
  );
}

function testParseBusySlotsForIngest(): void {
  const slots = parseBusySlotsForIngest(
    [
      { startTime: '2026-06-14T09:00:00.000Z', endTime: '2026-06-14T10:00:00.000Z' },
      { startTime: '2026-06-14T11:00', endTime: '2026-06-14T12:00' },
      { startTime: '2026-06-14T13:00:00.000Z', endTime: '2026-06-14T14:00:00.000Z' },
    ],
    TZ,
  );
  assert(slots.length === 3, 'three slots parsed');
  assert(slots[0].startTime === '2026-06-14T07:00:00.000Z', 'slot0 start fake-Z');
  assert(slots[0].endTime === '2026-06-14T08:00:00.000Z', 'slot0 end fake-Z');
  assert(slots[1].startTime === '2026-06-14T09:00:00.000Z', 'slot1 start naive');
  assert(slots[2].startTime === '2026-06-14T11:00:00.000Z', 'slot2 start already UTC');
}

function testParseBusySlotsInvalidInterval(): void {
  assertThrows400(
    () =>
      parseBusySlotsForIngest(
        [{ startTime: '2026-06-14T10:00:00.000Z', endTime: '2026-06-14T09:00:00.000Z' }],
        TZ,
      ),
    'endTime must be after startTime',
  );
}

function testParseBusySlotsUnparseable(): void {
  assertThrows400(
    () =>
      parseBusySlotsForIngest(
        [{ startTime: 'bad', endTime: '2026-06-14T10:00:00.000Z' }],
        TZ,
      ),
    'startTime is unparseable',
  );
}

function testIngestBookingSnapshotTimes(): void {
  const { bookingStart, bookingEnd } = ingestBookingSnapshotTimes(
    '2026-06-14T09:00:00.000Z',
    '2026-06-14T10:00:00.000Z',
    TZ,
  );
  assert(bookingStart?.toISOString() === '2026-06-14T07:00:00.000Z', 'booking start fake-Z');
  assert(bookingEnd?.toISOString() === '2026-06-14T08:00:00.000Z', 'booking end fake-Z');
}

function testIngestBookingSnapshotNaive(): void {
  const { bookingStart, bookingEnd } = ingestBookingSnapshotTimes(
    '2026-06-14T18:00',
    '2026-06-14T19:00',
    TZ,
  );
  assert(bookingStart?.toISOString() === '2026-06-14T16:00:00.000Z', 'naive booking start');
  assert(bookingEnd?.toISOString() === '2026-06-14T17:00:00.000Z', 'naive booking end');
}

function testIngestBookingSnapshotAlreadyUtc(): void {
  const start = '2026-06-14T07:00:00.000Z';
  const end = '2026-06-14T08:00:00.000Z';
  const result = ingestBookingSnapshotTimes(start, end, TZ);
  assert(result.bookingStart?.toISOString() === start, 'stored UTC start');
  assert(result.bookingEnd?.toISOString() === end, 'stored UTC end');
}

function testIngestBookingSnapshotInvalidInterval(): void {
  assertThrows400(
    () => ingestBookingSnapshotTimes('2026-06-14T10:00:00.000Z', '2026-06-14T09:00:00.000Z', TZ),
    'bookingEnd must be after bookingStart',
  );
}

testNormalizeFakeZ();
testNormalizeNaive();
testNormalizeAlreadyUtc();
testNormalizeUnparseable();
testParseBusySlotsForIngest();
testParseBusySlotsInvalidInterval();
testParseBusySlotsUnparseable();
testIngestBookingSnapshotTimes();
testIngestBookingSnapshotNaive();
testIngestBookingSnapshotAlreadyUtc();
testIngestBookingSnapshotInvalidInterval();

console.log('booktime ingest tests: OK');
