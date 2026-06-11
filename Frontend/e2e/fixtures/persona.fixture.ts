import { e2eApi, e2eGetProfile, type E2eUser } from './api-client';
import { e2eApiHeaders } from '../test-user';

const apiURL = () => process.env.E2E_API_URL ?? 'http://localhost:3000/api';

export function generateE2ePhone(): string {
  const suffix = `${Date.now()}`.slice(-7);
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

export async function createCityPromptUser(): Promise<{
  token: string;
  user: E2eUser & Record<string, unknown>;
}> {
  const { token, user } = await registerTestUser();
  const updated = await updateTestProfile(token, { cityIsSet: false });
  return { token, user: { ...user, ...updated, cityIsSet: false } };
}

export async function createWelcomePromptUser(): Promise<{
  token: string;
  user: E2eUser & Record<string, unknown>;
}> {
  const { token, user } = await registerTestUser();
  const profile = await e2eGetProfile(token);
  return {
    token,
    user: {
      ...user,
      ...profile,
      welcomeScreenPassed: false,
      cityIsSet: true,
    },
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

export async function createNoCityUser(): Promise<{
  token: string;
  user: E2eUser & Record<string, unknown>;
}> {
  const { token, user } = await registerTestUser();
  return {
    token,
    user: {
      ...user,
      currentCity: null,
      cityIsSet: false,
    },
  };
}

export async function createNoSportsUser(): Promise<{
  token: string;
  user: E2eUser & Record<string, unknown>;
}> {
  const { token, user } = await registerTestUser();
  return {
    token,
    user: {
      ...user,
      sportsEnabled: [],
      nameIsSet: true,
    },
  };
}

export async function listCities(token: string): Promise<Array<{ id: string; name: string }>> {
  const cities = await e2eApi<Array<{ id: string; name: string; country?: string }>>(token, '/cities');
  return cities;
}
