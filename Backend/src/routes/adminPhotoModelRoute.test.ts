import assert from 'node:assert/strict';
import express from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { ApiError } from '../utils/ApiError';

async function patchWithValidateStack(
  stack: express.RequestHandler[],
  body: Record<string, unknown>
): Promise<{ status: number; json: Record<string, unknown> }> {
  const app = express();
  app.use(express.json());
  app.patch('/photo-model', ...stack, (req, res) => {
    res.json({ success: true, modelId: req.body.modelId });
  });
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err instanceof ApiError ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(status).json({ success: false, message });
  });

  const server = app.listen(0);
  const { port } = server.address() as { port: number };

  try {
    const response = await fetch(`http://127.0.0.1:${port}/photo-model`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await response.json()) as Record<string, unknown>;
    return { status: response.status, json };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

async function run() {
  const correct = await patchWithValidateStack(
    [validate([body('modelId').isString().trim().notEmpty()])],
    { modelId: 'black-forest-labs/flux-2-pro' }
  );
  assert.equal(correct.status, 200);
  assert.equal(correct.json.modelId, 'black-forest-labs/flux-2-pro');

  const invalid = await patchWithValidateStack(
    [validate([body('modelId').isString().trim().notEmpty()])],
    { modelId: '' }
  );
  assert.equal(invalid.status, 400);

  console.log('adminPhotoModelRoute.test.ts: ok');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
