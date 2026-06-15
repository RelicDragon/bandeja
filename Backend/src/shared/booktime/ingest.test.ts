import { ApiError } from '../../utils/ApiError';
import {
  ingestBookingSnapshotTimes,
  normalizeBooktimeIngestIso,
  normalizeBooktimeWireIngestIso,
  parseBusySlotsForIngest,
} from './ingest';
import { booktimeLocalIsoToDate, storedUtcIsoToInstant } from './localTime';

const TZ = 'Europe/Belgrade';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function belgradeHm(iso: string): string {
  const d = storedUtcIsoToInstant(iso);
  if (!d) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

/** Mirrors Frontend deriveBusyFromAvailableSlots → minutesToBusyInterval output. */
function frontendBusyGap(
  dateKey: string,
  startMinutes: number,
  endMinutes: number,
): { startTime: string; endTime: string } | null {
  const sh = Math.floor(startMinutes / 60);
  const sm = startMinutes % 60;
  const eh = Math.floor(endMinutes / 60);
  const em = endMinutes % 60;
  const start = booktimeLocalIsoToDate(`${dateKey}T${pad2(sh)}:${pad2(sm)}:00`, TZ);
  const end = booktimeLocalIsoToDate(`${dateKey}T${pad2(eh)}:${pad2(em)}:00`, TZ);
  if (!start || !end || end <= start) return null;
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}

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
    normalizeBooktimeWireIngestIso('2026-06-14T09:00:00.000Z', 'start', TZ)
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
      { startTime: '2026-06-14T07:00:00.000Z', endTime: '2026-06-14T08:00:00.000Z' },
      { startTime: '2026-06-14T11:00', endTime: '2026-06-14T12:00' },
      { startTime: '2026-06-14T13:00:00.000Z', endTime: '2026-06-14T14:00:00.000Z' },
    ],
    TZ,
  );
  assert(slots.length === 3, 'three slots parsed');
  assert(slots[0].startTime === '2026-06-14T07:00:00.000Z', 'slot0 start stored UTC pass-through');
  assert(slots[0].endTime === '2026-06-14T08:00:00.000Z', 'slot0 end stored UTC pass-through');
  assert(slots[1].startTime === '2026-06-14T09:00:00.000Z', 'slot1 start naive');
  assert(slots[2].startTime === '2026-06-14T13:00:00.000Z', 'slot2 start already UTC');
}

function testParseBusySlotsStoredUtcMorningEdge(): void {
  const slots = parseBusySlotsForIngest(
    [{ startTime: '2026-06-15T08:00:00.000Z', endTime: '2026-06-15T09:00:00.000Z' }],
    TZ,
  );
  assert(slots[0].startTime === '2026-06-15T08:00:00.000Z', '08Z start pass-through');
  assert(slots[0].endTime === '2026-06-15T09:00:00.000Z', '09Z end pass-through');
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
    '2026-06-14T07:00:00.000Z',
    '2026-06-14T08:00:00.000Z',
    TZ,
  );
  assert(bookingStart?.toISOString() === '2026-06-14T07:00:00.000Z', 'booking start stored UTC');
  assert(bookingEnd?.toISOString() === '2026-06-14T08:00:00.000Z', 'booking end stored UTC');
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

function testIngestBookingSnapshotAfternoonStoredUtc(): void {
  const start = '2026-06-15T16:00:00.000Z';
  const end = '2026-06-15T18:00:00.000Z';
  const result = ingestBookingSnapshotTimes(start, end, TZ);
  assert(result.bookingStart?.toISOString() === start, 'afternoon stored UTC start');
  assert(result.bookingEnd?.toISOString() === end, 'afternoon stored UTC end');
}

function testIngestBookingSnapshotInvalidInterval(): void {
  assertThrows400(
    () => ingestBookingSnapshotTimes('2026-06-14T10:00:00.000Z', '2026-06-14T09:00:00.000Z', TZ),
    'bookingEnd must be after bookingStart',
  );
}

function testIngestBookingSnapshotNonBelgradeNaive(): void {
  const nyc = 'America/New_York';
  const { bookingStart, bookingEnd } = ingestBookingSnapshotTimes(
    '2026-06-14T18:00',
    '2026-06-14T19:00',
    nyc,
  );
  assert(
    bookingStart?.toISOString() === '2026-06-14T22:00:00.000Z',
    'naive 18:00 NYC → 22:00Z',
  );
  assert(
    bookingEnd?.toISOString() === '2026-06-14T23:00:00.000Z',
    'naive 19:00 NYC → 23:00Z',
  );

  const belgrade = ingestBookingSnapshotTimes('2026-06-14T18:00', '2026-06-14T19:00', TZ);
  assert(
    belgrade.bookingStart?.toISOString() === '2026-06-14T16:00:00.000Z',
    'same naive wall clock differs by timezone',
  );
}

function testAfternoonWireReingestFootgun(): void {
  const stored = '2026-06-15T16:00:00.000Z';
  const once = normalizeBooktimeWireIngestIso(stored, 'start', TZ);
  assert(once === '2026-06-15T14:00:00.000Z', 'afternoon stored UTC shifts on wire re-ingest');
  const twice = normalizeBooktimeWireIngestIso(once, 'start', TZ);
  assert(twice === '2026-06-15T12:00:00.000Z', 'double wire re-ingest shifts again');
  assert(
    normalizeBooktimeIngestIso(stored, 'start', TZ) === stored,
    'normalizeBooktimeIngestIso pass-through for stored UTC',
  );
}

function testSnapshotPutRoundTripPreservesWallClock(): void {
  const dateKey = '2026-06-15';
  const gaps: Array<{ startMin: number; endMin: number; startLabel: string; endLabel: string }> = [
    { startMin: 10 * 60, endMin: 12 * 60, startLabel: '10:00', endLabel: '12:00' },
    { startMin: 19 * 60, endMin: 20 * 60, startLabel: '19:00', endLabel: '20:00' },
    { startMin: 8 * 60, endMin: 9 * 60, startLabel: '08:00', endLabel: '09:00' },
  ];

  for (const gap of gaps) {
    const wire = frontendBusyGap(dateKey, gap.startMin, gap.endMin);
    assert(wire != null, `frontend gap ${gap.startLabel}-${gap.endLabel}`);
    if (!wire) continue;
    const [stored] = parseBusySlotsForIngest([wire], TZ);
    assert(stored.startTime === wire.startTime, `${gap.startLabel} stored start unchanged`);
    assert(stored.endTime === wire.endTime, `${gap.endLabel} stored end unchanged`);
    assert(belgradeHm(stored.startTime) === gap.startLabel, `${gap.startLabel} Belgrade start`);
    assert(belgradeHm(stored.endTime) === gap.endLabel, `${gap.endLabel} Belgrade end`);
  }
}

function testSnapshotPutAfternoonGapRoundTrip(): void {
  const wire = frontendBusyGap('2026-06-15', 18 * 60, 20 * 60);
  assert(wire != null, '18:00-20:00 gap');
  if (!wire) return;
  const [stored] = parseBusySlotsForIngest([wire], TZ);
  assert(stored.startTime === '2026-06-15T16:00:00.000Z', '18:00 Belgrade → 16:00Z');
  assert(stored.endTime === '2026-06-15T18:00:00.000Z', '20:00 Belgrade → 18:00Z');
  assert(belgradeHm(stored.startTime) === '18:00', 'afternoon gap start display');
  assert(belgradeHm(stored.endTime) === '20:00', 'afternoon gap end display');
}

function testAfternoonFakeZWireIngestOnce(): void {
  assert(
    normalizeBooktimeWireIngestIso('2026-06-15T18:00:00.000Z', 'start', TZ)
      === '2026-06-15T16:00:00.000Z',
    'afternoon fake-Z converts once at wire boundary',
  );
}

testNormalizeFakeZ();
testNormalizeNaive();
testNormalizeAlreadyUtc();
testNormalizeUnparseable();
testParseBusySlotsForIngest();
testParseBusySlotsStoredUtcMorningEdge();
testSnapshotPutRoundTripPreservesWallClock();
testSnapshotPutAfternoonGapRoundTrip();
testParseBusySlotsInvalidInterval();
testParseBusySlotsUnparseable();
testIngestBookingSnapshotTimes();
testIngestBookingSnapshotNaive();
testIngestBookingSnapshotAlreadyUtc();
testIngestBookingSnapshotAfternoonStoredUtc();
testIngestBookingSnapshotInvalidInterval();
testIngestBookingSnapshotNonBelgradeNaive();
testAfternoonWireReingestFootgun();
testAfternoonFakeZWireIngestOnce();

console.log('booktime ingest tests: OK');
