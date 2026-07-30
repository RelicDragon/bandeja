import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { ApiError } from '../utils/ApiError';

type RequestSchemas = {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
};

type RequestTarget = keyof RequestSchemas;
type ValidatedRequestParts = Partial<Record<RequestTarget, unknown>>;

const validatedRequestParts = new WeakMap<Request, ValidatedRequestParts>();

export function getValidatedRequestPart<T>(
  req: Request,
  target: RequestTarget
): T {
  const parts = validatedRequestParts.get(req);
  if (!parts || !(target in parts)) {
    throw new Error(`Validated request ${target} is unavailable`);
  }
  return parts[target] as T;
}

function validationMessage(error: {
  issues: Array<{ path: Array<string | number>; message: string }>;
}): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'request';
      return `${path}: ${issue.message}`;
    })
    .join(', ');
}

/**
 * Validates an HTTP request at the routing seam. Parsed values are retained in
 * a request-scoped WeakMap so controllers consume Zod's normalized output even
 * for req.query, which Express exposes through a getter.
 */
export function validateZod(schemas: RequestSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsedParts = validatedRequestParts.get(req) ?? {};
    validatedRequestParts.set(req, parsedParts);
    for (const target of ['params', 'query', 'body'] as const) {
      const schema = schemas[target];
      if (!schema) continue;
      const result = schema.safeParse(req[target]);
      if (!result.success) {
        next(
          new ApiError(400, validationMessage(result.error), true, {
            code: 'validation.invalidInput',
            target,
          }),
        );
        return;
      }
      parsedParts[target] = result.data;
      if (target === 'body') {
        req.body = result.data;
      } else if (target === 'params') {
        Object.assign(req.params, result.data);
      }
    }
    next();
  };
}
