import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { BOOKING_ERROR_KEYS } from '@bandeja/shared/booking/errorKeys';
import { ClubIntegrationType } from '@prisma/client';
import prisma from '../config/database';
import { parseNspadelIntegrationConfig } from '../shared/clubIntegration';
import {
  forwardNspadelUpstream,
  isAllowedNspadelUpstreamPath,
} from '../services/nspadel/nspadelUpstream.service';

function extractUpstreamPath(req: Request): string {
  const wildcard = (req.params as Record<string, unknown>)[0] ?? (req.params as Record<string, unknown>).path ?? '';
  const raw = Array.isArray(wildcard) ? wildcard.join('/') : String(wildcard);
  const normalized = raw.startsWith('/') ? raw : `/${raw}`;
  const queryIndex = req.url.indexOf('?');
  const query = queryIndex >= 0 ? req.url.slice(queryIndex) : '';
  return `${normalized}${query}`;
}

/**
 * Proxies FE traffic to the club's own Supabase project.
 * Resolves the base URL per club from integrationConfig — never hardcoded —
 * because the project URL/RPC names are unverified until observed in the club bundle.
 */
export const proxyNspadelUpstream = asyncHandler(async (req: Request, res: Response) => {
  const pathWithQuery = extractUpstreamPath(req);
  if (!isAllowedNspadelUpstreamPath(pathWithQuery)) {
    throw new ApiError(404, 'Not found');
  }

  const clubId = typeof req.query.clubId === 'string' ? req.query.clubId.trim() : '';
  if (!clubId) {
    throw new ApiError(400, 'clubId is required');
  }
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { integrationType: true, integrationConfig: true },
  });
  if (!club || club.integrationType !== ClubIntegrationType.NSPADELSUPABASE) {
    throw new ApiError(404, 'Club not found');
  }
  const config = parseNspadelIntegrationConfig(club.integrationConfig);
  if (!config) {
    throw new ApiError(400, BOOKING_ERROR_KEYS.nspadelSupabaseUrlRequired);
  }

  const method = req.method.toUpperCase();
  const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  const accessToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : null;
  const apikey =
    typeof req.headers['x-nspadel-apikey'] === 'string'
      ? req.headers['x-nspadel-apikey']
      : null;

  const body =
    method === 'GET' || method === 'HEAD'
      ? undefined
      : req.body !== undefined && req.body !== null && Object.keys(req.body as object).length === 0
        ? undefined
        : req.body;

  const upstream = await forwardNspadelUpstream({
    supabaseUrl: config.supabaseUrl,
    method,
    pathWithQuery,
    body,
    apikey,
    accessToken,
  });

  res.status(upstream.status).json(upstream.body);
});
