import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import {
  forwardKlikterenUpstream,
  isAllowedKlikterenUpstreamPath,
} from '../services/klikteren/klikterenUpstream.service';

function extractUpstreamPath(req: Request): string {
  const wildcard = req.params[0] ?? req.params.path ?? '';
  const raw = Array.isArray(wildcard) ? wildcard.join('/') : String(wildcard);
  const normalized = raw.startsWith('/') ? raw : `/${raw}`;
  const queryIndex = req.url.indexOf('?');
  const query = queryIndex >= 0 ? req.url.slice(queryIndex) : '';
  return `${normalized}${query}`;
}

export const proxyKlikterenUpstream = asyncHandler(async (req: Request, res: Response) => {
  const pathWithQuery = extractUpstreamPath(req);
  if (!isAllowedKlikterenUpstreamPath(pathWithQuery)) {
    throw new ApiError(404, 'Not found');
  }

  const method = req.method.toUpperCase();
  const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  const accessToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : null;
  const cookie =
    typeof req.headers['x-klikteren-cookie'] === 'string'
      ? req.headers['x-klikteren-cookie']
      : null;

  const body =
    method === 'GET' || method === 'HEAD'
      ? undefined
      : req.body !== undefined && req.body !== null && Object.keys(req.body as object).length === 0
        ? undefined
        : req.body;

  const upstream = await forwardKlikterenUpstream({
    method,
    pathWithQuery,
    body,
    accessToken,
    cookie,
  });

  for (const value of upstream.setCookie) {
    res.append('X-Klikteren-Set-Cookie', value);
  }

  res.status(upstream.status).json(upstream.body);
});
