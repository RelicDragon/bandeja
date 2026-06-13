import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { e2eApiHeaders, getE2eCredentials, type E2eUserRole } from '../test-user';

const apiURL = () => process.env.E2E_API_URL ?? 'http://localhost:3000/api';

const frontendRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const idsFile = path.join(frontendRoot, '.auth', 'ids.json');

export type E2eUser = {
  id: string;
  currentCity?: { id: string } | null;
  firstName?: string | null;
  lastName?: string | null;
};

type LoginPayload = {
  data?: {
    token?: string;
    refreshToken?: string;
    currentSessionId?: string;
    user?: E2eUser;
  };
};

export type E2eLoginSession = {
  token: string;
  user: E2eUser;
  refreshToken?: string;
  currentSessionId?: string;
};

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  message?: string;
};

export type E2eDualSession = {
  tokenA: string;
  userA: E2eUser;
  tokenB: string;
  userB: E2eUser;
};

export type E2eUserIds = {
  userAId: string;
  userBId: string;
};

export async function e2eLogin(role: E2eUserRole = 'A'): Promise<E2eLoginSession> {
  return e2eLoginAs(role);
}

export async function e2eLoginAs(role: E2eUserRole): Promise<E2eLoginSession> {
  const { phone, password } = getE2eCredentials(role);
  const loginRes = await fetch(`${apiURL()}/auth/login/phone`, {
    method: 'POST',
    headers: e2eApiHeaders(),
    body: JSON.stringify({ phone, password, language: 'en' }),
  });
  if (!loginRes.ok) {
    throw new Error(`[e2e] API login failed for ${role} (${loginRes.status}): ${await loginRes.text()}`);
  }
  const payload = (await loginRes.json()) as LoginPayload;
  const token = payload.data?.token;
  const user = payload.data?.user;
  if (!token || !user?.id) {
    throw new Error(`[e2e] API login response for ${role} missing token or user`);
  }
  return {
    token,
    user,
    refreshToken: payload.data?.refreshToken,
    currentSessionId: payload.data?.currentSessionId,
  };
}

export async function e2eLoginBoth(): Promise<E2eDualSession> {
  const [a, b] = await Promise.all([e2eLoginAs('A'), e2eLoginAs('B')]);
  return { tokenA: a.token, userA: a.user, tokenB: b.token, userB: b.user };
}

export async function getE2eUserIds(): Promise<E2eUserIds> {
  try {
    if (fs.existsSync(idsFile)) {
      const parsed = JSON.parse(fs.readFileSync(idsFile, 'utf8')) as E2eUserIds;
      if (parsed.userAId && parsed.userBId) return parsed;
    }
  } catch {
    /* refresh below */
  }
  const { userA, userB } = await e2eLoginBoth();
  return { userAId: userA.id, userBId: userB.id };
}

export async function e2eApi<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...e2eApiHeaders(),
    Authorization: `Bearer ${token}`,
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${apiURL()}${path}`, { ...init, headers });
  const text = await res.text();
  let json: ApiEnvelope<T> | undefined;
  try {
    json = text ? (JSON.parse(text) as ApiEnvelope<T>) : undefined;
  } catch {
    /* non-json */
  }
  if (!res.ok) {
    throw new Error(`[e2e] ${init.method ?? 'GET'} ${path} ${res.status}: ${text}`);
  }
  return (json?.data ?? json) as T;
}

export async function e2eGetProfile(token: string): Promise<E2eUser> {
  return e2eApi<E2eUser>(token, '/users/profile');
}

type UserChat = { id: string };

export async function ensureUserDm(token: string, otherUserId: string): Promise<string> {
  const chat = await e2eApi<UserChat>(token, `/chat/user-chats/with/${otherUserId}`);
  if (!chat?.id) {
    throw new Error('[e2e] ensureUserDm: missing chat id');
  }
  return chat.id;
}

export async function sendUserDmViaApi(
  token: string,
  otherUserId: string,
  content: string,
): Promise<void> {
  const chatId = await ensureUserDm(token, otherUserId);
  await e2eApi(token, '/chat/messages', {
    method: 'POST',
    body: JSON.stringify({
      contextId: chatId,
      chatContextType: 'USER',
      chatType: 'PUBLIC',
      content,
    }),
  });
}

type Invite = { id: string };

export async function inviteUserToGameViaApi(
  token: string,
  gameId: string,
  receiverId: string,
): Promise<Invite> {
  return e2eApi<Invite>(token, '/invites', {
    method: 'POST',
    body: JSON.stringify({ gameId, receiverId }),
  });
}

export async function declineInviteViaApi(
  token: string,
  inviteId: string,
  message?: string,
): Promise<void> {
  await e2eApi(token, `/invites/${inviteId}/decline`, {
    method: 'POST',
    body: JSON.stringify(message ? { message } : {}),
  });
}

export async function getMyInvitesViaApi(token: string): Promise<Array<{ id: string; gameId?: string }>> {
  return e2eApi(token, '/invites/my-invites');
}

export function displayName(user: E2eUser): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.id;
}
