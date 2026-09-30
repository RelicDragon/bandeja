import assert from 'node:assert/strict';
import { TelegramEditThrottler, type ThrottlerClock } from '../telegramEditThrottler';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Virtual time: `sleep` resolves only when `advance` passes its deadline. */
class FakeClock implements ThrottlerClock {
  time = 0;
  private timers: { at: number; resolve: () => void }[] = [];

  now = (): number => this.time;

  sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      this.timers.push({ at: this.time + Math.max(0, ms), resolve });
    });

  async advance(ms: number): Promise<void> {
    const end = this.time + ms;
    for (;;) {
      await tick();
      this.timers.sort((a, b) => a.at - b.at);
      const due = this.timers[0];
      if (!due || due.at > end) break;
      this.timers.shift();
      this.time = Math.max(this.time, due.at);
      due.resolve();
    }
    this.time = end;
    await tick();
  }
}

type Edit = { at: number; text: string; parseMode: string | undefined };

function fakeApi(clock: FakeClock, failures: unknown[] = []) {
  const edits: Edit[] = [];
  const attempts: Edit[] = [];
  return {
    edits,
    attempts,
    api: {
      async editMessageText(_chatId: number, _messageId: number, text: string, other: { parse_mode?: string }) {
        const entry = { at: clock.now(), text, parseMode: other.parse_mode };
        attempts.push(entry);
        const failure = failures.shift();
        if (failure) throw failure;
        edits.push(entry);
        return true;
      },
    },
  };
}

const telegramError = (error_code: number, description: string, retry_after?: number) => ({
  error_code,
  description,
  ...(retry_after ? { parameters: { retry_after } } : {}),
});

async function testCoalescesBurstsAndSpacesEdits(): Promise<void> {
  const clock = new FakeClock();
  const { api, edits } = fakeApi(clock);
  const throttler = new TelegramEditThrottler(api, 1, 10, { clock, minIntervalMs: 1000 });
  for (let i = 1; i <= 10; i += 1) throttler.update({ html: `v${i}` });
  await clock.advance(0);
  assert.deepEqual(edits.map((e) => e.text), ['v10'], 'burst → one edit with the newest state');

  throttler.update({ html: 'v11' });
  await clock.advance(200);
  throttler.update({ html: 'v12' });
  await clock.advance(500);
  assert.equal(edits.length, 1, 'no second edit inside the interval');
  await clock.advance(400);
  assert.deepEqual(edits.map((e) => e.text), ['v10', 'v12']);
  assert.ok(edits[1].at - edits[0].at >= 1000);

  throttler.update({ html: 'v12' });
  await clock.advance(2000);
  assert.equal(edits.length, 2, 'unchanged state is not re-sent');
}

async function testRetryAfter429(): Promise<void> {
  const clock = new FakeClock();
  const { api, edits, attempts } = fakeApi(clock, [telegramError(429, 'Too Many Requests: retry after 3', 3)]);
  const throttler = new TelegramEditThrottler(api, 1, 10, { clock, minIntervalMs: 1000 });
  throttler.update({ html: 'a' });
  await clock.advance(0);
  assert.equal(attempts.length, 1);
  assert.equal(edits.length, 0);
  throttler.update({ html: 'b' });
  await clock.advance(2500);
  assert.equal(edits.length, 0, 'waits the full retry_after');
  await clock.advance(600);
  assert.deepEqual(edits.map((e) => e.text), ['b'], 'retries with the newest state');
  assert.ok(edits[0].at >= 3000);
}

async function testNotModifiedIsSuccess(): Promise<void> {
  const clock = new FakeClock();
  const { api, attempts } = fakeApi(clock, [telegramError(400, 'Bad Request: message is not modified')]);
  const throttler = new TelegramEditThrottler(api, 1, 10, { clock, minIntervalMs: 1000 });
  const shown = throttler.flush({ html: 'same' });
  await clock.advance(0);
  assert.equal(await shown, true);
  await clock.advance(5000);
  assert.equal(attempts.length, 1, 'no retry after "not modified"');
}

async function testParseErrorFallsBackToPlainText(): Promise<void> {
  const clock = new FakeClock();
  const { api, edits } = fakeApi(clock, [telegramError(400, "Bad Request: can't parse entities: unexpected end tag")]);
  const throttler = new TelegramEditThrottler(api, 1, 10, { clock, minIntervalMs: 1000 });
  const shown = throttler.flush({ html: '<b>x &amp; y</b>' });
  await clock.advance(1000);
  assert.equal(await shown, true);
  assert.deepEqual(edits, [{ at: 1000, text: 'x & y', parseMode: undefined }]);
}

async function testGoneMessageMakesThrottlerDead(): Promise<void> {
  const clock = new FakeClock();
  const { api, attempts } = fakeApi(clock, [telegramError(400, 'Bad Request: message to edit not found')]);
  const throttler = new TelegramEditThrottler(api, 1, 10, { clock, minIntervalMs: 1000 });
  const shown = throttler.flush({ html: 'final' });
  await clock.advance(0);
  assert.equal(await shown, false);
  assert.equal(throttler.isDead, true);
  throttler.update({ html: 'later' });
  await clock.advance(5000);
  assert.equal(attempts.length, 1, 'a dead throttler stops editing');
}

async function testFlushWaitsForInterval(): Promise<void> {
  const clock = new FakeClock();
  const { api, edits } = fakeApi(clock);
  const throttler = new TelegramEditThrottler(api, 1, 10, { clock, minIntervalMs: 1000 });
  throttler.update({ html: 'progress' });
  await clock.advance(100);
  const shown = throttler.flush({ html: 'final' });
  await clock.advance(500);
  assert.equal(edits.length, 1);
  await clock.advance(500);
  assert.equal(await shown, true);
  assert.deepEqual(edits.map((e) => e.text), ['progress', 'final']);
  assert.ok(edits[1].at - edits[0].at >= 1000);
}

void (async () => {
  await testCoalescesBurstsAndSpacesEdits();
  await testRetryAfter429();
  await testNotModifiedIsSuccess();
  await testParseErrorFallsBackToPlainText();
  await testGoneMessageMakesThrottlerDead();
  await testFlushWaitsForInterval();
  console.log('telegramEditThrottler.test.ts: ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
