import {
  rollbackBooktimeBookingsOnCreateFailure,
} from '../booktime/booktimeBookingRollback.service';
import {
  setExternalBookingProviderForTests,
} from './getExternalBookingProvider';
import type { ExternalBookingProvider } from './ExternalBookingProvider';
import { BooktimeExternalBookingProvider } from './providers/BooktimeExternalBookingProvider';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

async function testRollbackServiceRoutesThroughPort(): Promise<void> {
  const calls: Array<{ userId: string; clubId: string; ids: string[] }> = [];
  const mockProvider: ExternalBookingProvider = {
    rollbackBookings: async (userId, clubId, externalBookingIds) => {
      calls.push({ userId, clubId, ids: externalBookingIds });
      return [
        { externalBookingId: 'b-1', attempted: true, cancelled: true },
        { externalBookingId: 'b-2', attempted: true, cancelled: false, error: 'busy' },
      ];
    },
    importCourts: async () => ({}),
  };

  setExternalBookingProviderForTests(mockProvider);
  try {
    const results = await rollbackBooktimeBookingsOnCreateFailure('user-1', 'club-1', [
      'b-1',
      'b-2',
      'b-1',
    ]);
    assert(calls.length === 1, 'rollback service should call provider once');
    assert(calls[0].userId === 'user-1', 'userId forwarded');
    assert(calls[0].clubId === 'club-1', 'clubId forwarded');
    assert(calls[0].ids.length === 3 && calls[0].ids[2] === 'b-1', 'ids forwarded to port');
    assert(results.length === 2, 'provider results returned');
    assert(results[0].cancelled === true, 'first booking cancelled');
    assert(results[1].cancelled === false, 'second booking not cancelled');
  } finally {
    setExternalBookingProviderForTests(null);
  }
}

async function testBooktimeProviderRollbackWithInjectedDeps(): Promise<void> {
  const cancelCalls: string[] = [];
  const provider = new BooktimeExternalBookingProvider({
    resolveCompanyId: async () => 'company-1',
    findAuth: async () => ({
      id: 'auth-1',
      accessToken: 'enc-a',
      refreshToken: 'enc-r',
    }),
    cancelBooking: async (_authId, _companyId, _tokens, bookingId) => {
      cancelCalls.push(bookingId);
      if (bookingId === 'fail-id') throw new Error('provider busy');
    },
    decrypt: (token) => `plain-${token}`,
  });

  const results = await provider.rollbackBookings('user-1', 'club-1', [
    ' ok-id ',
    '',
    'fail-id',
    'ok-id',
  ]);

  assert(cancelCalls.length === 2, 'cancel called for unique non-empty ids');
  assert(cancelCalls[0] === 'ok-id' && cancelCalls[1] === 'fail-id', 'trimmed ids passed to cancel');
  assert(results.length === 2, 'two rollback results');
  assert(results[0].cancelled === true, 'ok-id cancelled');
  assert(results[1].cancelled === false && results[1].error === 'provider busy', 'fail-id reports error');
}

async function run(): Promise<void> {
  await testRollbackServiceRoutesThroughPort();
  await testBooktimeProviderRollbackWithInjectedDeps();
  console.log('booktimeExternalBookingProvider.test.ts: all passed');
}

void run();
