import type { NextFunction, Request, Response } from 'express';
import { config } from '../config/env';
import { getCorsAllowedOrigins, isCorsOriginAllowed } from '../config/corsOrigins';
import { ApiError } from '../utils/ApiError';

const allowedOrigins = getCorsAllowedOrigins({
  nodeEnv: config.nodeEnv,
  frontendUrl: config.frontendUrl,
  extraOrigins: config.corsAllowedOrigins,
});

/** Cookie-authenticated refresh/logout requests must originate from a trusted web client. */
export function requireTrustedRefreshOrigin(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const bodyToken = typeof req.body?.refreshToken === 'string' && !!req.body.refreshToken.trim();
  if (bodyToken) {
    next();
    return;
  }
  const origin = req.get('Origin');
  if (isCorsOriginAllowed(origin, allowedOrigins)) {
    next();
    return;
  }
  const fetchSite = (req.get('Sec-Fetch-Site') || '').toLowerCase();
  if (!origin && (fetchSite === 'same-origin' || fetchSite === 'same-site')) {
    next();
    return;
  }
  next(
    new ApiError(403, 'auth.refreshOriginRejected', true, {
      code: 'auth.refreshOriginRejected',
    })
  );
}
