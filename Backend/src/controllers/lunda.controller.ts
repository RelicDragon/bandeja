// =======================
// PART 2 — Your NodeJS code (TypeScript), updated to call the Worker
// Replace LUNDA_BASE_URL with your Worker base URL and keep all DB logic.
// Only network calls are routed via the Worker proxy, preserving cookies.
// =======================

import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import prisma from '../config/database';

// Point this to your Worker (no trailing slash), e.g. "https://your-worker.workers.dev"
const WORKER_PROXY_BASE_URL = process.env.LUNDA_WORKER_URL ?? 'https://reroute-worker.relic-ilya.workers.dev/api/lunda';

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

export const syncLundaProfile = asyncHandler(async (req: SyncLundaProfileRequest, res: Response) => {
  const { phone, gender, level, preferredCourtSideLeft, preferredCourtSideRight, metadata } = req.body;
  const userId = req.userId!;

  // Update user profile with Lunda data
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

  // Update user profile
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

export const lundaAuth = asyncHandler(async (req: LundaAuthRequest, res: Response) => {
  const { phone, code, temporalToken, countryCode } = req.body;
  const userId = req.userId!;

  const response = await fetch(`${WORKER_PROXY_BASE_URL}/player/auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // No Cookie for auth; upstream will set it and the worker will pass Set-Cookie back
    },
    body: JSON.stringify({
      parameters: {
        countryCode: countryCode,
        phone: phone,
        code: code,
        temporalToken: temporalToken,
        method: 'TELEGRAM',
      },
    }),
  });

  if (!response.ok) {
    throw new ApiError(response.status, `Lunda API error: ${response.status}`);
  }

  const data = (await response.json()) as { result: { status: string } };

  if (data.result.status !== 'SUCCESSFUL') {
    throw new ApiError(400, 'Авторизация не удалась');
  }

  const setCookieHeader = response.headers.get('set-cookie');
  if (!setCookieHeader) {
    throw new ApiError(500, 'Cookie не получен от Lunda API');
  }

  await prisma.lundaProfile.upsert({
    where: { userId },
    update: {
      cookie: setCookieHeader,
      updatedAt: new Date(),
    } as any,
    create: {
      userId,
      cookie: setCookieHeader,
      metadata: {},
    } as any,
  });

  res.json({
    success: true,
    cookie: setCookieHeader,
  });
});

export const lundaGetProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
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
      'Content-Type': 'application/json',
      // Forward the stored Lunda cookie to the worker; worker forwards to upstream
      Cookie: lundaProfile.cookie,
    },
  });

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

export const lundaGetStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
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

export const lundaGetCaptcha = asyncHandler(async (req: LundaGetCaptchaRequest, res: Response) => {
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
  });

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
    ticket: string;
  };
}

export const lundaSendCode = asyncHandler(async (req: LundaSendCodeRequest, res: Response) => {
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
  });

  if (!response.ok) {
    throw new ApiError(response.status, `Lunda API error: ${response.status}`);
  }

  const data = (await response.json()) as { result: any };

  res.json({
    success: true,
    result: data.result,
  });
});