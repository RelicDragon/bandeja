import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { ApiError } from '../utils/ApiError';

type RequestSchemas = {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
};

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
 * Validates an HTTP request at the routing seam and replaces mutable inputs
 * with Zod's parsed values. Query objects are validated but not reassigned
 * because Express exposes req.query through a getter.
 */
export function validateZod(schemas: RequestSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
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
      if (target === 'body') {
        req.body = result.data;
      } else if (target === 'params') {
        Object.assign(req.params, result.data);
      }
    }
    next();
  };
}
