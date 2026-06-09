import { e2eApi } from './api-client';

type UserTeam = { id: string; name: string };

export async function createUserTeamViaApi(
  token: string,
  name?: string,
): Promise<{ id: string; name: string }> {
  const team = await e2eApi<UserTeam>(token, '/user-teams', {
    method: 'POST',
    body: JSON.stringify({ name: name ?? `[E2E] team ${Date.now()}` }),
  });
  if (!team?.id) {
    throw new Error('[e2e] create user team response missing id');
  }
  return { id: team.id, name: team.name };
}

export async function deleteUserTeamViaApi(token: string, teamId: string): Promise<void> {
  try {
    await e2eApi(token, `/user-teams/${teamId}`, { method: 'DELETE' });
  } catch {
    /* already gone */
  }
}

type ClubAdminClub = { id: string; name: string };
type ClubAdminList = { items: ClubAdminClub[]; total: number };

export async function listClubAdminClubsViaApi(token: string): Promise<ClubAdminClub[]> {
  const res = await e2eApi<ClubAdminList>(token, '/club-admin/clubs?limit=20');
  return res?.items ?? [];
}
