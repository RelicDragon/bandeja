// =======================
// PART 2 — Your NodeJS code (TypeScript) — FIXED TYPE COLLISION + cookie handling
//  - Use ExpressResponse for Express, and globalThis.Response for fetch()
// =======================

import type { Response as ExpressResponse } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import prisma from '../config/database';

// Point this to your Worker (no trailing slash), e.g. "https://your-worker.workers.dev"
const WORKER_PROXY_BASE_URL =
  process.env.LUNDA_WORKER_URL ?? 'https://your-worker.workers.dev/api/lunda';

// ---- helpers ----

type FetchResponse = globalThis.Response;

// Robustly split multiple Set-Cookie header values that may be collapsed into one string.
// We split on commas that are followed by a cookie-name pattern "<token>=" (not within Expires).
function splitSetCookieHeader(value: string): string[] {
  if (!value) return [];
  const parts: string[] = [];
  let start = 0;
  let inExpires = false;

  for (let i = 0; i < value.length; i++) {
    const ch = value[i];

    if (!inExpires && value.slice(i, i + 8).toLowerCase() === 'expires=') {
      inExpires = true;
    }
    if (inExpires && ch === ';') {
      inExpires = false;
    }

    if (!inExpires && ch === ',') {
      const look = value.slice(i + 1);
      const m = /^\s*[^=\s;]+=/u.exec(look);
      if (m) {
        parts.push(value.slice(start, i));
        start = i + 1;
      }
    }
  }
  parts.push(value.slice(start));
  return parts.map(s => s.trim()).filter(Boolean);
}

// Turn each Set-Cookie string into just "name=value"
function extractCookiePair(setCookieLine: string): string | null {
  const first = setCookieLine.split(';', 1)[0].trim();
  if (!first || !first.includes('=')) return null;
  return first;
}

// Parse possibly-multiple Set-Cookie headers into a "Cookie" header string.
function buildCookieHeaderFromSetCookie(rawSetCookie: string | null): string | null {
  if (!rawSetCookie) return null;
  const lines = splitSetCookieHeader(rawSetCookie);
  const pairs = lines
    .map(extractCookiePair)
    .filter((p): p is string => !!p);
  if (!pairs.length) return null;
  return pairs.join('; ');
}

// Prefer implementations that expose all Set-Cookie headers. Try several.
async function getCookieHeaderFromFetchResponse(response: FetchResponse): Promise<string | null> {
  const headers = response.headers;
  if (!headers) return null;

  // undici/node18: headers.get('set-cookie') may return a combined string
  let raw = headers.get('set-cookie');

  // node-fetch: headers.raw()?.['set-cookie'] provides array
  const rawFn = (headers as any).raw?.();
  const arr: string[] | undefined = rawFn?.['set-cookie'];
  if (Array.isArray(arr) && arr.length) {
    raw = arr.join(', ');
  }

  return buildCookieHeaderFromSetCookie(raw);
}

// ---- routes ----

interface SyncLundaProfileRequest extends AuthRequest {
  body: {
    phone: string;
    gender?: 'MALE' | 'FEMALE' | 'PREFER_NOT_TO_SAY';
    level?: number;
    preferredCourtSideLeft?: boolean;
    preferredCourtSideRight?: boolean;
    metadata: any;
  };
}

export const syncLundaProfile = asyncHandler(async (req: SyncLundaProfileRequest, res: ExpressResponse) => {
  const { phone, gender, level, preferredCourtSideLeft, preferredCourtSideRight, metadata } = req.body;
  const userId = req.userId!;

  const updateData: any = {};
  if (phone) updateData.phone = phone;
  if (gender) updateData.gender = gender;
  if (level !== undefined) updateData.level = level;
  if (preferredCourtSideLeft !== undefined) updateData.preferredCourtSideLeft = preferredCourtSideLeft;
  if (preferredCourtSideRight !== undefined) updateData.preferredCourtSideRight = preferredCourtSideRight;

  if (metadata?.displayName) {
    const parsed = metadata.displayName.split(' ');
    updateData.firstName = parsed[parsed.length - 1];
    updateData.lastName = parsed.slice(0, -1).join(' ');
  }

  await prisma.user.update({
    where: { id: userId },
    data: updateData,
  });

  await prisma.lundaProfile.upsert({
    where: { userId },
    update: {
      metadata,
      updatedAt: new Date(),
    },
    create: {
      userId,
      metadata,
    },
  });

  res.json({
    success: true,
    message: 'Lunda profile synchronized successfully',
  });
});

interface LundaAuthRequest extends AuthRequest {
  body: {
    phone: string;
    code: string;
    temporalToken: string;
    countryCode: string;
  };
}

export const lundaAuth = asyncHandler(async (req: LundaAuthRequest, res: ExpressResponse) => {
  const { phone, code, temporalToken, countryCode } = req.body;
  const userId = req.userId!;

  const response = await fetch(`${WORKER_PROXY_BASE_URL}/player/auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parameters: {
        countryCode,
        phone,
        code,
        temporalToken,
        method: 'TELEGRAM',
      },
    }),
    redirect: 'manual',
  } as RequestInit);

  if (!response.ok) {
    throw new ApiError(response.status, `Lunda API error: ${response.status}`);
  }

  const data = (await response.json()) as { result: { status: string } };
  if (data.result.status !== 'SUCCESSFUL') {
    throw new ApiError(400, 'Авторизация не удалась');
  }

  const cookieHeader = await getCookieHeaderFromFetchResponse(response as FetchResponse);
  if (!cookieHeader) {
    throw new ApiError(500, 'Cookie не получен от Lunda API');
  }

  await prisma.lundaProfile.upsert({
    where: { userId },
    update: {
      cookie: cookieHeader, // compact "Cookie" header string
      updatedAt: new Date(),
    } as any,
    create: {
      userId,
      cookie: cookieHeader,
      metadata: {},
    } as any,
  });

  res.json({
    success: true,
    cookie: cookieHeader,
  });
});

export const lundaGetProfile = asyncHandler(async (req: AuthRequest, res: ExpressResponse) => {
  const userId = req.userId!;

  const lundaProfile = (await prisma.lundaProfile.findUnique({
    where: { userId },
  })) as { id: string; userId: string; cookie: string | null; metadata: any; createdAt: Date; updatedAt: Date } | null;

  if (!lundaProfile || !lundaProfile.cookie) {
    throw new ApiError(404, 'Lunda cookie не найден. Сначала выполните авторизацию.');
  }

  const response = await fetch(`${WORKER_PROXY_BASE_URL}/player/current`, {
    method: 'GET',
    headers: {
      Cookie: lundaProfile.cookie, // e.g., "SESSION=abc; XSRF=def"
    } as any,
    redirect: 'manual',
  } as RequestInit);

  if (!response.ok) {
    throw new ApiError(response.status, `Lunda API error: ${response.status}`);
  }

  const data = (await response.json()) as { result: any };
  const playerData = data.result;

  const updateData: any = {};

  if (playerData.phone && playerData.countryCode) {
    updateData.phone = `+${playerData.countryCode}${playerData.phone}`;
  }

  if (playerData.gender) {
    updateData.gender =
      playerData.gender === 'MAN'
        ? 'MALE'
        : playerData.gender === 'WOMAN'
        ? 'FEMALE'
        : 'PREFER_NOT_TO_SAY';
  }

  if (playerData.displayRating) {
    updateData.level = parseFloat(playerData.displayRating);
  }

  if (playerData.leftSide !== undefined) {
    updateData.preferredCourtSideLeft = playerData.leftSide;
  }

  if (playerData.rightSide !== undefined) {
    updateData.preferredCourtSideRight = playerData.rightSide;
  }

  if (playerData.displayName) {
    const parsed = playerData.displayName.split(' ');
    updateData.firstName = parsed[parsed.length - 1];
    updateData.lastName = parsed.slice(0, -1).join(' ');
  }

  await prisma.user.update({
    where: { id: userId },
    data: updateData,
  });

  await prisma.lundaProfile.update({
    where: { userId },
    data: {
      metadata: playerData,
      updatedAt: new Date(),
    },
  });

  res.json({
    success: true,
    data: playerData,
  });
});

export const lundaGetStatus = asyncHandler(async (req: AuthRequest, res: ExpressResponse) => {
  const userId = req.userId!;

  const lundaProfile = (await prisma.lundaProfile.findUnique({
    where: { userId },
  })) as { id: string; userId: string; cookie: string | null; metadata: any; createdAt: Date; updatedAt: Date } | null;

  res.json({
    success: true,
    hasCookie: !!lundaProfile?.cookie,
    hasProfile: !!lundaProfile?.metadata && Object.keys(lundaProfile.metadata).length > 0,
    lastSync: lundaProfile?.updatedAt || null,
  });
});

interface LundaGetCaptchaRequest extends AuthRequest {
  body: {
    countryCode: string;
    phone: string;
  };
}

export const lundaGetCaptcha = asyncHandler(async (req: LundaGetCaptchaRequest, res: ExpressResponse) => {
  const { countryCode, phone } = req.body;

  const response = await fetch(`${WORKER_PROXY_BASE_URL}/player/captcha`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parameters: {
        countryCode,
        phone,
      },
    }),
  } as RequestInit);

  if (!response.ok) {
    throw new ApiError(response.status, `Lunda API error: ${response.status}`);
  }

  const data = (await response.json()) as { result: any };

  res.json({
    success: true,
    result: data.result,
  });
});

interface LundaSendCodeRequest extends AuthRequest {
  body: {
    countryCode: string;
    phone: string;
    answer: string;
    method: 'TELEGRAM' | 'SMS';
  //  ticket: string; // keep if needed
    ticket: string;
  };
}

export const lundaSendCode = asyncHandler(async (req: LundaSendCodeRequest, res: ExpressResponse) => {
  const { countryCode, phone, answer, method, ticket } = req.body;

  const response = await fetch(`${WORKER_PROXY_BASE_URL}/player/send-code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parameters: {
        countryCode,
        phone,
        answer,
        method,
        ticket,
      },
    }),
  } as RequestInit);

  if (!response.ok) {
    throw new ApiError(response.status, `Lunda API error: ${response.status}`);
  }

  const data = (await response.json()) as { result: any };

  res.json({
    success: true,
    result: data.result,
  });
});