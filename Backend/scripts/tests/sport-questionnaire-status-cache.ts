import express from 'express';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { disableConditionalHttpCache } from '../../src/utils/httpCache';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
}

type HitResult = {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

function hit(port: number, headers: Record<string, string> = {}): Promise<HitResult> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/status',
        method: 'GET',
        headers,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            headers: res.headers,
            body,
          });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

async function main(): Promise<void> {
  const app = express();
  app.get('/status', (req, res) => {
    disableConditionalHttpCache(req, res);
    res.json({
      success: true,
      data: {
        completed: false,
        skipped: false,
        suggested: true,
        level: 1,
        gamesPlayed: 0,
      },
    });
  });

  const server = app.listen(0);
  try {
    const port = (server.address() as AddressInfo).port;
    const first = await hit(port);
    assert(first.statusCode === 200, 'first status response is 200');
    assert(String(first.headers['cache-control']).includes('no-store'), 'sets no-store');
    assert(String(first.headers['cache-control']).includes('no-cache'), 'sets no-cache');
    assert(first.headers.pragma === 'no-cache', 'sets pragma no-cache');
    assert(first.headers.expires === '0', 'sets expires 0');

    const etag = String(first.headers.etag);
    assert(etag.length > 0 && etag !== 'undefined', 'express generated an etag for the body');

    const second = await hit(port, {
      'If-None-Match': etag,
      'If-Modified-Since': new Date().toUTCString(),
    });
    assert(second.statusCode === 200, 'conditional status response still returns 200');
    assert(second.body.includes('"suggested":true'), 'conditional response keeps JSON body');

    console.log('sport-questionnaire-status-cache: all passed');
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
