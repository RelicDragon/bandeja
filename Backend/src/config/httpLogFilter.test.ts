import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { markHttpLogStart, shouldSkipHttpLog, SLOW_REQUEST_LOG_MS } from './httpLogFilter';

function request(originalUrl: string): Request {
  return { originalUrl, url: originalUrl } as Request;
}

function response(statusCode: number): Response {
  return { statusCode } as Response;
}

function timed(originalUrl: string): Request {
  const req = request(originalUrl);
  markHttpLogStart(req, response(200), () => {});
  return req;
}

function busyWaitMs(ms: number): void {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    /* keep the clock moving so the filter sees a slow request */
  }
}

function run(): void {
  // Fast successful polls are dropped.
  assert.equal(shouldSkipHttpLog(timed('/api/chat/sync/events?afterSeq=0'), response(200)), true);
  assert.equal(shouldSkipHttpLog(timed('/health'), response(200)), true);
  assert.equal(shouldSkipHttpLog(timed('/api/chat/unread-objects'), response(304)), true);

  // Failures on the same paths are always kept.
  assert.equal(shouldSkipHttpLog(timed('/api/chat/sync/events?afterSeq=0'), response(429)), false);
  assert.equal(shouldSkipHttpLog(timed('/api/chat/sync/events'), response(500)), false);

  // Non-poll routes are always kept.
  assert.equal(shouldSkipHttpLog(timed('/api/games/available'), response(200)), false);
  assert.equal(shouldSkipHttpLog(timed('/api/chat/messages'), response(200)), false);

  // A prefix must not swallow a sibling route.
  assert.equal(shouldSkipHttpLog(timed('/api/healthcheck-admin'), response(200)), false);

  // Slow polls stay in the log.
  const slow = timed('/api/weather/day?city=1');
  busyWaitMs(SLOW_REQUEST_LOG_MS + 20);
  assert.equal(shouldSkipHttpLog(slow, response(200)), false);

  // An unmarked request is treated as fast rather than throwing.
  assert.equal(shouldSkipHttpLog(request('/api/users/presence'), response(200)), true);

  console.log('httpLogFilter.test.ts: ok');
}

run();
