import assert from 'node:assert/strict';
import {
  clearWebhookIdReplayCacheForTest,
  consumeWebhookIdOnce,
  signReplicateWebhookForTest,
  verifyReplicateWebhookRequest,
} from './verifyReplicateWebhook';

const SECRET = 'whsec_' + Buffer.from('test-replicate-webhook-secret-key!!').toString('base64');

async function run() {
  clearWebhookIdReplayCacheForTest();

  const id = 'msg_test_1';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({ id: 'pred_1', status: 'succeeded', output: 'https://example.com/out.png' });
  const signature = signReplicateWebhookForTest(SECRET, id, timestamp, body);

  const ok = await verifyReplicateWebhookRequest({
    secret: SECRET,
    rawBody: body,
    headers: { id, timestamp, signature },
  });
  assert.equal(ok.ok, true, 'valid signature accepted');
  if (ok.ok) assert.equal(ok.webhookId, id);

  assert.equal(await consumeWebhookIdOnce(id), true);
  assert.equal(await consumeWebhookIdOnce(id), false, 'replay of same webhook-id rejected');

  const missing = await verifyReplicateWebhookRequest({
    secret: SECRET,
    rawBody: body,
    headers: { id, timestamp },
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.reason, 'missing_headers');

  const badSig = await verifyReplicateWebhookRequest({
    secret: SECRET,
    rawBody: body,
    headers: { id, timestamp, signature: 'v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' },
  });
  assert.equal(badSig.ok, false);
  if (!badSig.ok) assert.equal(badSig.reason, 'invalid_signature');

  const noSecret = await verifyReplicateWebhookRequest({
    secret: '',
    rawBody: body,
    headers: { id, timestamp, signature },
  });
  assert.equal(noSecret.ok, false);
  if (!noSecret.ok) assert.equal(noSecret.reason, 'missing_secret');

  const stale = await verifyReplicateWebhookRequest({
    secret: SECRET,
    rawBody: body,
    headers: {
      id,
      timestamp: String(Math.floor(Date.now() / 1000) - 10_000),
      signature,
    },
  });
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.reason, 'timestamp_out_of_range');

  console.log('verifyReplicateWebhook.test.ts: ok');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
