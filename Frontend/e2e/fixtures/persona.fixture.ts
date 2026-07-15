import { e2eApi, type E2eUser } from './api-client';
import { e2eApiHeaders } from '../test-user';

const apiURL = () => process.env.E2E_API_URL ?? 'http://localhost:3000/api';

let e2ePhoneSeq = 0;

export function generateE2ePhone(): string {
  e2ePhoneSeq += 1;
  const suffix = `${Date.now()}${e2ePhoneSeq}${Math.floor(Math.random() * 1000)}`
    .replace(/\D/g, '')
    .slice(-7)
    .padStart(7, '0');
  return `+7900${suffix}`;
}

type RegisterPayload = {
  data?: {
    token?: string;
    user?: E2eUser & Record<string, unknown>;
    refreshToken?: string;
    currentSessionId?: string;
  };
};

export async function registerTestUser(options: {
  phone?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  gender?: string;
  genderIsSet?: boolean;
  primarySport?: string;
} = {}): Promise<{ token: string; user: E2eUser & Record<string, unknown>; phone: string; password: string }> {
  const phone = options.phone ?? generateE2ePhone();
  const password = options.password ?? 'E2eTest1!';
  const res = await fetch(`${apiURL()}/auth/register/phone`, {
    method: 'POST',
    headers: e2eApiHeaders(),
    body: JSON.stringify({
      phone,
      password,
      firstName: options.firstName ?? 'E2E',
      lastName: options.lastName ?? 'User',
      gender: options.gender ?? 'MALE',
      genderIsSet: options.genderIsSet ?? true,
      language: 'en',
      ...(options.primarySport ? { primarySport: options.primarySport } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`[e2e] register failed (${res.status}): ${await res.text()}`);
  }
  const payload = (await res.json()) as RegisterPayload;
  const token = payload.data?.token;
  const user = payload.data?.user;
  if (!token || !user?.id) {
    throw new Error('[e2e] register response missing token or user');
  }
  return { token, user, phone, password };
}

export async function updateTestProfile(
  token: string,
  data: Record<string, unknown>,
): Promise<E2eUser & Record<string, unknown>> {
  return e2eApi<E2eUser & Record<string, unknown>>(token, '/users/profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function createNameGateUser(): Promise<{
  token: string;
  user: E2eUser & Record<string, unknown>;
}> {
  const { token, user } = await registerTestUser({ firstName: 'No', lastName: 'Name' });
  const updated = await updateTestProfile(token, { nameIsSet: false });
  return { token, user: { ...user, ...updated, nameIsSet: false } };
}

export async function createGenderPromptUser(): Promise<{
  token: string;
  user: E2eUser & Record<string, unknown>;
}> {
  const { token, user } = await registerTestUser();
  const updated = await updateTestProfile(token, {
    gender: 'PREFER_NOT_TO_SAY',
    genderIsSet: false,
    cityIsSet: true,
  });
  return { token, user: { ...user, ...updated, genderIsSet: false, cityIsSet: true } };
}

/** Fresh user after auto-assign: sport confirmed, has currentCity, cityIsSet false → CityPromptBanner on home. */
export async function createCityPromptUser(): Promise<{
  token: string;
  user: E2eUser & Record<string, unknown>;
}> {
  const { token, user } = await registerTestUser();
  const sports = Array.isArray(user.sportsEnabled) && user.sportsEnabled.length > 0
    ? (user.sportsEnabled as string[])
    : ['PADEL'];
  const primarySport = typeof user.primarySport === 'string' ? user.primarySport : sports[0]!;
  const confirmed = await e2eApi<E2eUser & Record<string, unknown>>(token, '/users/primary-sport/confirm', {
    method: 'POST',
    body: JSON.stringify({ sports, primarySport }),
  });
  const updated = await updateTestProfile(token, { cityIsSet: false });
  return {
    token,
    user: { ...user, ...confirmed, ...updated, cityIsSet: false, primarySportIsSet: true },
  };
}

export async function createWelcomePromptUser(): Promise<{
  token: string;
  user: E2eUser & Record<string, unknown>;
}> {
  const { token, user } = await registerTestUser();
  const updated = await updateTestProfile(token, { cityIsSet: true, welcomeScreenPassed: false });
  return {
    token,
    user: { ...user, ...updated, welcomeScreenPassed: false, cityIsSet: true },
  };
}

export async function createPrimarySportGateUser(): Promise<{
  token: string;
  user: E2eUser & Record<string, unknown>;
}> {
  const { token, user } = await registerTestUser();
  const updated = await updateTestProfile(token, { primarySportIsSet: false, nameIsSet: true });
  return { token, user: { ...user, ...updated, primarySportIsSet: false, nameIsSet: true } };
}

/** Simulates auto-detect failure: no currentCity → full /select-city picker. */
export async function createNoCityUser(): Promise<{
  token: string;
  user: E2eUser & Record<string, unknown>;
}> {
  const { token, user } = await registerTestUser();
  await updateTestProfile(token, { cityIsSet: false });
  const profile = await e2eApi<E2eUser & Record<string, unknown>>(token, '/users/e2e/clear-assigned-city', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return {
    token,
    user: { ...user, ...profile, currentCity: null, cityIsSet: false },
  };
}

export async function listCities(
  token: string,
): Promise<Array<{ id: string; name: string; country?: string; latitude?: number | null; longitude?: number | null }>> {
  return e2eApi<
    Array<{ id: string; name: string; country?: string; latitude?: number | null; longitude?: number | null }>
  >(token, '/cities');
}

export type MapClubSeed = {
  id: string;
  name: string;
  cityId: string;
  cityName: string;
  country: string;
};

export async function listMapClubs(token: string): Promise<MapClubSeed[]> {
  const raw = await e2eApi<MapClubSeed[] | { data?: MapClubSeed[] }>(token, '/clubs/map');
  if (Array.isArray(raw)) return raw;
  return Array.isArray(raw?.data) ? raw.data : [];
}

export async function createNoSportsUser(): Promise<{
  token: string;
  user: E2eUser & Record<string, unknown>;
}> {
  const { token, user } = await registerTestUser();
  const updated = await e2eApi<E2eUser & Record<string, unknown>>(token, '/users/e2e/clear-sports', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return {
    token,
    user: { ...user, ...updated, sportsEnabled: [], nameIsSet: true },
  };
}
