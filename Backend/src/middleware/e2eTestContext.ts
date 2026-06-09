import { Request, Response, NextFunction } from 'express';
import { isE2eTestHeader, runWithE2eTestContext } from '../utils/e2eRequestContext';

export function e2eTestContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (isE2eTestHeader(req)) {
    runWithE2eTestContext(() => next());
    return;
  }
  next();
}
