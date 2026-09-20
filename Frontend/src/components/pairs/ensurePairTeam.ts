import { userTeamsApi } from '@/api/userTeams';
import { createOrReuseUserTeam } from '@/utils/createOrReuseUserTeam';
import { useUserTeamsStore } from '@/store/userTeamsStore';

/**
 * PRD 352 — "Create a team" from the pair sheet.
 *
 * This is the **existing** team flow with both members prefilled, not a second
 * one: `createOrReuseUserTeam` gives the viewer their solo team (reusing an
 * empty one rather than piling up duplicates), and the partner is invited into
 * it. Returns the team id to navigate to.
 */
export async function ensurePairTeam(
  viewerId: string | undefined,
  partnerId: string,
  existingTeamId?: string | null,
): Promise<string> {
  if (existingTeamId) return existingTeamId;

  const { id } = await createOrReuseUserTeam(viewerId);
  await userTeamsApi.invite(id, partnerId);
  await useUserTeamsStore.getState().refreshAll();
  return id;
}
