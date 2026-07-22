import assert from 'node:assert/strict';
import express from 'express';
import { handleReplicateWebhook } from '../../controllers/replicateWebhook.controller';
import { GameResultsArtifactService } from '../gameResultsArtifact/gameResultsArtifact.service';
import {
  clearWebhookIdReplayCacheForTest,
  signReplicateWebhookForTest,
} from './verifyReplicateWebhook';
import { errorHandler } from '../../middleware/errorHandler';
import { config } from '../../config/env';

async function withSecret(secret: string, run: () => Promise<void>): Promise<void> {
  const prev = config.resultsArtifacts.replicateWebhookSecret;
  config.resultsArtifacts.replicateWebhookSecret = secret;
  try {
    await run();
  } finally {
    config.resultsArtifacts.replicateWebhookSecret = prev;
  }
}

async function runWebhookHttp(): Promise<void> {
  clearWebhookIdReplayCacheForTest();
  const secret = 'whsec_' + Buffer.from('controller-webhook-secret-bytes!!').toString('base64');
  let handled = 0;
  let failNext = false;
  const original = GameResultsArtifactService.handleReplicateWebhook;
  GameResultsArtifactService.handleReplicateWebhook = (async () => {
    if (failNext) {
      failNext = false;
      throw new Error('simulated apply failure');
    }
    handled += 1;
  }) as typeof GameResultsArtifactService.handleReplicateWebhook;

  const app = express();
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: string }).rawBody = buf.toString('utf8');
      },
    })
  );
  app.post('/webhooks/replicate', handleReplicateWebhook);
  app.use(errorHandler);

  const server = app.listen(0);
  const { port } = server.address() as { port: number };
  const url = `http://127.0.0.1:${port}/webhooks/replicate`;
  const bodyObj = { id: 'pred_abc', status: 'succeeded', output: 'https://example.com/x.png' };
  const body = JSON.stringify(bodyObj);

  try {
    await withSecret('', async () => {
      const noSecret = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      assert.equal(noSecret.status, 401);
      const noSecretJson = (await noSecret.json()) as { reason?: string; data?: { reason?: string } };
      assert.equal(noSecretJson.reason, undefined);
      assert.equal(noSecretJson.data?.reason, undefined);
      assert.equal(handled, 0);
    });

    await withSecret(secret, async () => {
      const unsigned = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      assert.equal(unsigned.status, 401);
      const unsignedJson = (await unsigned.json()) as { reason?: string };
      assert.equal(unsignedJson.reason, undefined);
      assert.equal(handled, 0);

      const idFail = 'msg_fail_then_ok';
      const tsFail = String(Math.floor(Date.now() / 1000));
      const sigFail = signReplicateWebhookForTest(secret, idFail, tsFail, body);
      const headersFail = {
        'Content-Type': 'application/json',
        'webhook-id': idFail,
        'webhook-timestamp': tsFail,
        'webhook-signature': sigFail,
      };
      failNext = true;
      const failed = await fetch(url, { method: 'POST', headers: headersFail, body });
      assert.equal(failed.status, 500);
      assert.equal(handled, 0);
      const retried = await fetch(url, { method: 'POST', headers: headersFail, body });
      assert.equal(retried.status, 200);
      assert.equal(handled, 1, 'processing failure must release claim so retry applies');

      const id = 'msg_1';
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = signReplicateWebhookForTest(secret, id, timestamp, body);
      const headers = {
        'Content-Type': 'application/json',
        'webhook-id': id,
        'webhook-timestamp': timestamp,
        'webhook-signature': signature,
      };
      const signed = await fetch(url, { method: 'POST', headers, body });
      assert.equal(signed.status, 200);
      assert.equal(handled, 2);

      const replay = await fetch(url, { method: 'POST', headers, body });
      assert.equal(replay.status, 200);
      const replayJson = (await replay.json()) as { duplicate?: boolean };
      assert.equal(replayJson.duplicate, true);
      assert.equal(handled, 2, 'replay must not re-apply artifact handler');
    });
  } finally {
    GameResultsArtifactService.handleReplicateWebhook = original;
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

async function run() {
  await runWebhookHttp();
  console.log('replicateWebhook.controller.test.ts: ok');
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
