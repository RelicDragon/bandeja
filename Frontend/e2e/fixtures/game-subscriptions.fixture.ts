import { e2eApi, e2eGetProfile } from './api-client';

export async function createGameSubscriptionViaApi(token: string): Promise<{ id: string }> {
  const profile = await e2eGetProfile(token);
  const cityId = profile.currentCity?.id;
  if (!cityId) {
    throw new Error('[e2e] user has no currentCity for game subscription');
  }
  const sub = await e2eApi<{ id: string }>(token, '/game-subscriptions', {
    method: 'POST',
    body: JSON.stringify({ cityId, clubIds: [], entityTypes: [], dayOfWeek: [], myGenderOnly: false }),
  });
  if (!sub?.id) {
    throw new Error('[e2e] create game subscription missing id');
  }
  return { id: sub.id };
}

export async function deleteGameSubscriptionViaApi(token: string, id: string): Promise<void> {
  try {
    await e2eApi(token, `/game-subscriptions/${id}`, { method: 'DELETE' });
  } catch {
    /* already gone */
  }
}
