import type { CSSProperties } from 'react';
import type { BasicUser, FixedTeamUserTeam, GameTeam, UserTeam } from '@/types';
import { userTeamColorTones } from '@/utils/userTeamColor';

/**
 * Fixed team ↔ the pair's own `UserTeam`.
 *
 * The server resolves it (`Backend/src/services/game/fixedTeamUserTeam.ts`:
 * accepted members == the fixed team's players) and ships it as
 * `GameTeam.userTeam`. These helpers only read that field.
 */

function rosterKey(userIds: ReadonlyArray<string | null | undefined>): string {
  return [...new Set(userIds.filter((id): id is string => !!id))].sort().join(':');
}

/** The user team of the fixed team whose players are exactly `playerIds` (match scoreboards). */
export function userTeamForRoster(
  fixedTeams: ReadonlyArray<GameTeam> | null | undefined,
  playerIds: ReadonlyArray<string | null | undefined>,
): FixedTeamUserTeam | null {
  const key = rosterKey(playerIds);
  if (!key.includes(':')) return null;
  for (const team of fixedTeams ?? []) {
    if (team.userTeam && rosterKey(team.players.map((p) => p.userId)) === key) return team.userTeam;
  }
  return null;
}

/** The user team's live name wins; then the stored fixture name. `null` = no real name ("Team N" fallback). */
export function fixedTeamDisplayName(team: Pick<GameTeam, 'name' | 'userTeam'> | null | undefined): string | null {
  return team?.userTeam?.name?.trim() || team?.name?.trim() || null;
}

/**
 * Payloads that predate the field (socket game updates, other endpoints) carry
 * no `userTeam` key at all. Keep what we knew for an unchanged roster instead
 * of flashing back to "Team N"; an explicit `null` from the server still wins.
 */
export function carryFixedTeamUserTeams(
  prevTeams: ReadonlyArray<GameTeam> | null | undefined,
  nextTeams: GameTeam[] | null | undefined,
): GameTeam[] | null | undefined {
  if (!nextTeams || !prevTeams?.length) return nextTeams;
  const known = new Map<string, FixedTeamUserTeam>();
  for (const team of prevTeams) {
    if (team.userTeam) known.set(rosterKey(team.players.map((p) => p.userId)), team.userTeam);
  }
  if (known.size === 0) return nextTeams;
  let changed = false;
  const out = nextTeams.map((team) => {
    if ('userTeam' in team) return team;
    const carried = known.get(rosterKey(team.players.map((p) => p.userId)));
    if (!carried) return team;
    changed = true;
    return { ...team, userTeam: carried };
  });
  return changed ? out : nextTeams;
}

/**
 * A `UserTeam` shaped enough for `TeamAvatar`: owner = the player whose id is
 * `ownerId` (first half of the split face), partner = the other player.
 */
export function avatarTeamFromFixedTeam(userTeam: FixedTeamUserTeam, players: BasicUser[]): UserTeam | null {
  if (players.length === 0) return null;
  const owner = players.find((p) => p.id === userTeam.ownerId) ?? players[0];
  const partner = players.find((p) => p.id !== owner.id) ?? null;
  const stamp = '';
  return {
    id: userTeam.id,
    name: userTeam.name,
    avatar: userTeam.avatar,
    originalAvatar: null,
    cutAngle: userTeam.cutAngle,
    color: userTeam.color ?? null,
    ownerId: owner.id,
    size: players.length,
    createdAt: stamp,
    updatedAt: stamp,
    owner,
    members: partner
      ? [
          {
            id: `${userTeam.id}:${partner.id}`,
            teamId: userTeam.id,
            userId: partner.id,
            status: 'ACCEPTED',
            isOwner: false,
            joinedAt: null,
            createdAt: stamp,
            updatedAt: stamp,
            user: partner,
          },
        ]
      : [],
  };
}

/**
 * Team colour for a fixed team that is a user team. Exposes two CSS variables
 * for the accent (`--ut-accent` light mode, `--ut-accent-dark` dark mode) and a
 * subtle wash for the card. `null` colour follows the member primary, like the
 * team page.
 */
export function fixedTeamUserTeamTint(color: string | null | undefined): {
  vars: CSSProperties;
  wash: CSSProperties;
} {
  const tones = userTeamColorTones(color);
  const light = tones?.light ?? 'var(--member-primary-500, #0ea5e9)';
  const dark = tones?.dark ?? 'var(--member-primary-700, #0369a1)';
  return {
    vars: { '--ut-accent': dark, '--ut-accent-dark': light, '--ut-tone': light } as CSSProperties,
    wash: {
      backgroundImage: [
        `radial-gradient(90% 140% at 0% 0%, color-mix(in srgb, ${light} 16%, transparent), transparent 70%)`,
        `linear-gradient(90deg, color-mix(in srgb, ${dark} 7%, transparent), transparent 85%)`,
      ].join(', '),
    },
  };
}

/** Accent text classes; pair with `fixedTeamUserTeamTint(...).vars` on an ancestor or the element. */
export const UT_ACCENT_TEXT = 'text-[color:var(--ut-accent)] dark:text-[color:var(--ut-accent-dark)]';
