import assert from 'node:assert/strict';
import { validationResult } from 'express-validator';
import { chatMessageLinkPreviewValidators } from './chatMessage.validators';

async function validate(body: Record<string, unknown>) {
  const request = { body };
  await Promise.all(chatMessageLinkPreviewValidators.map((validator) => validator.run(request)));
  return validationResult(request).array();
}

async function run() {
  assert.deepEqual(await validate({ linkPreviewUrl: null, linkPreviewToken: null }), []);
  assert.deepEqual(await validate({}), []);
  assert.deepEqual(
    await validate({
      linkPreviewUrl: 'https://example.com/article',
      linkPreviewToken: 'signed-token',
    }),
    []
  );

  const errors = await validate({ linkPreviewUrl: 42 });
  assert.equal(errors.length, 1);
  const error = errors[0];
  assert(error?.type === 'field');
  assert.equal(error.path, 'linkPreviewUrl');

  console.log('chat message link preview validators: ok');
}

void run();
