import { userTeamsApi } from '@/api';
import { useUserTeamsStore } from '@/store/userTeamsStore';
import { findLatestSoloOwnedTeam } from '@/utils/soloOwnedUserTeam';

export async function createOrReuseUserTeam(userId: string | undefined): Promise<{ id: string; reused: boolean }> {
  const refreshed = await useUserTeamsStore.getState().refreshAll();
  if (!refreshed) {
    throw new Error('network');
  }
  const existing = findLatestSoloOwnedTeam(useUserTeamsStore.getState().teams, userId);
  if (existing) {
    return { id: existing.id, reused: true };
  }
  const team = await userTeamsApi.create({});
  useUserTeamsStore.getState().setTeam(team);
  await useUserTeamsStore.getState().refreshAll();
  return { id: team.id, reused: false };
}
