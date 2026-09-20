import assert from 'node:assert/strict';
import {
  postWeltnerBooking,
  fetchWeltnerAvailability,
  WeltnerRejectedError,
} from './weltnerClient';

async function main() {
  const original = globalThis.fetch;
  const body = {
    court: 'teren-1-yucatan',
    date: '2026-09-21',
    start: '22:00',
    duration: '120',
    name: 'Test Player',
    phone: '+381601234567',
  };
  let calls = 0;
  try {
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(url, 'https://booking.weltner.site/api/book');
      assert.equal(init?.method, 'POST');
      assert.deepEqual(JSON.parse(String(init?.body)), body);
      assert.equal(init?.redirect, 'error');
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    };
    assert.equal(await postWeltnerBooking(body), null);
    assert.equal(calls, 1);
    globalThis.fetch = async () => {
      calls++;
      throw new Error('lost response');
    };
    await assert.rejects(postWeltnerBooking(body), /lost response/);
    assert.equal(calls, 2, 'a failed POST must never automatically retry');
    globalThis.fetch = async () => new Response('{}', { status: 409 });
    await assert.rejects(postWeltnerBooking(body), WeltnerRejectedError);
    globalThis.fetch = async () => new Response('{}', { status: 500 });
    await assert.rejects(postWeltnerBooking(body), /bookingUnknown/);
    globalThis.fetch = async () => new Response('<html>proxy</html>', { status: 200 });
    await assert.rejects(postWeltnerBooking(body), /bookingUnknown/);
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ bookingId: 'actual-provider-id' }), {
        status: 201,
      });
    assert.equal(await postWeltnerBooking(body), 'actual-provider-id');
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          court: body.court,
          date: body.date,
          slots: [{ start: '22:00', end: '00:00', duration: 120 }],
        }),
      );
    assert.equal((await fetchWeltnerAvailability(body.court, body.date)).slots[0].end, '00:00');
  } finally {
    globalThis.fetch = original;
  }
  console.log('Weltner client mapping and uncertain-response checks passed');
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
