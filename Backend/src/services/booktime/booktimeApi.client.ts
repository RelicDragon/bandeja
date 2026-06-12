import { parseBooktimeIntegrationConfig } from '../../shared/clubIntegration';
import { encryptToken } from '../../utils/tokenEncryption';
import prisma from '../../config/database';

const BOOKTIME_API_URL = 'https://api.booktime.rs';

type BooktimeRequestOptions = {
  method?: string;
  body?: Record<string, unknown>;
  auth?: boolean;
};

type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

async function booktimeRequestOnce<T>(
  companyId: string,
  tokens: TokenPair,
  path: string,
  options: BooktimeRequestOptions = {}
): Promise<T> {
  const method = options.method ?? 'GET';
  const auth = options.auth ?? false;
  const url =
    auth && tokens.accessToken
      ? `${BOOKTIME_API_URL}${path}`
      : `${BOOKTIME_API_URL}/public${path}`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth && tokens.accessToken) {
    headers.Authorization = `Bearer ${tokens.accessToken}`;
  }

  const payload = options.body ? { ...options.body, companyId } : undefined;

  const res = await fetch(url, {
    method,
    headers,
    body: payload ? JSON.stringify(payload) : undefined,
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const errBody = data as { message?: string; error?: string; errorCode?: string } | null;
    const message =
      (typeof errBody?.message === 'string' && errBody.message) ||
      (typeof errBody?.error === 'string' && errBody.error) ||
      (typeof errBody?.errorCode === 'string' && errBody.errorCode) ||
      res.statusText;
    throw Object.assign(new Error(message), { status: res.status, data });
  }

  return data as T;
}

async function refreshBooktimeTokens(
  companyId: string,
  refreshToken: string
): Promise<TokenPair | null> {
  try {
    const data = await booktimeRequestOnce<{ accessToken?: string; refreshToken?: string }>(
      companyId,
      { accessToken: '', refreshToken },
      '/users/refresh-token',
      { method: 'PUT', body: { refreshToken } }
    );
    if (!data.accessToken) return null;
    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken ?? refreshToken,
    };
  } catch {
    return null;
  }
}

async function persistRefreshedTokens(authId: string, tokens: TokenPair): Promise<void> {
  await prisma.userClubBooktimeAuth.update({
    where: { id: authId },
    data: {
      accessToken: encryptToken(tokens.accessToken),
      refreshToken: encryptToken(tokens.refreshToken),
    },
  });
}

async function booktimeAuthenticatedRequest<T>(
  authId: string,
  companyId: string,
  tokens: TokenPair,
  path: string,
  options: BooktimeRequestOptions = {}
): Promise<T> {
  try {
    return await booktimeRequestOnce<T>(companyId, tokens, path, options);
  } catch (err) {
    const status = err && typeof err === 'object' && 'status' in err ? Number((err as { status: number }).status) : 0;
    if (status !== 401) throw err;
    const refreshed = await refreshBooktimeTokens(companyId, tokens.refreshToken);
    if (!refreshed) throw err;
    await persistRefreshedTokens(authId, refreshed);
    return booktimeRequestOnce<T>(companyId, refreshed, path, options);
  }
}

export async function cancelBooktimeBookingForUser(
  authId: string,
  companyId: string,
  tokens: TokenPair,
  bookingId: string
): Promise<void> {
  await booktimeAuthenticatedRequest<void>(
    authId,
    companyId,
    tokens,
    `/booking/cancel?bookingId=${encodeURIComponent(bookingId)}`,
    { method: 'PATCH', auth: true }
  );
}

export async function resolveBooktimeCompanyId(clubId: string): Promise<string | null> {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { integrationConfig: true },
  });
  const config = parseBooktimeIntegrationConfig(club?.integrationConfig);
  return config?.companyId ?? null;
}
