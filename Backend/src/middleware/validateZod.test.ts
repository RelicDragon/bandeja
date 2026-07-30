import assert from 'node:assert/strict';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { getValidatedRequestPart, validateZod } from './validateZod';

const request = {
  body: {},
  params: {},
  query: { cityId: '  city-1  ' },
} as unknown as Request;
let nextError: unknown;

validateZod({
  query: z.object({ cityId: z.string().trim() }).strict(),
})(
  request,
  {} as Response,
  ((error?: unknown) => {
    nextError = error;
  }) as NextFunction,
);

assert.equal(nextError, undefined);
assert.deepEqual(
  getValidatedRequestPart<{ cityId: string }>(request, 'query'),
  { cityId: 'city-1' },
);
assert.equal(request.query.cityId, '  city-1  ');

const cacheBustedRequest = {
  body: {},
  params: {},
  query: { cityId: 'city-1', _t: '1785444814529' },
} as unknown as Request;
let cacheBustedError: unknown;

validateZod({
  query: z.object({ cityId: z.string() }).strict(),
})(
  cacheBustedRequest,
  {} as Response,
  ((error?: unknown) => {
    cacheBustedError = error;
  }) as NextFunction,
);

assert.equal(cacheBustedError, undefined);
assert.deepEqual(
  getValidatedRequestPart<{ cityId: string }>(cacheBustedRequest, 'query'),
  { cityId: 'city-1' },
);

console.log('validateZod.test.ts: ok');
