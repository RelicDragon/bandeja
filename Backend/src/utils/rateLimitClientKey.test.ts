import assert from 'node:assert/strict';
import type { Request } from 'express';
import { rateLimitKeyFromRequest } from './rateLimitClientKey';

function fakeReq(partial: Partial<Request> & { ip?: string; headers?: Record<string, string> }): Request {
  return {
    ip: partial.ip,
    headers: partial.headers ?? {},
  } as Request;
}

function run() {
  const trusted = rateLimitKeyFromRequest(
    fakeReq({
      ip: '203.0.113.10',
      headers: {
        'cf-connecting-ip': '198.51.100.1',
        'x-forwarded-for': '198.51.100.2, 10.0.0.1',
        'x-real-ip': '198.51.100.3',
      },
    })
  );
  assert.equal(trusted, '203.0.113.10', 'must use req.ip, ignore spoofed forwarded headers');

  const spoofOnly = rateLimitKeyFromRequest(
    fakeReq({
      ip: '203.0.113.10',
      headers: { 'x-forwarded-for': '1.2.3.4' },
    })
  );
  assert.equal(spoofOnly, '203.0.113.10');

  const unknown = rateLimitKeyFromRequest(fakeReq({ ip: undefined, headers: { 'x-forwarded-for': '9.9.9.9' } }));
  assert.equal(unknown, 'unknown');

  console.log('rateLimitClientKey.test.ts: ok');
}

run();
