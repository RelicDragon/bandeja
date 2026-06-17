import { Sport } from '@prisma/client';
import { USER_SELECT_WITH_SPORT_PROFILES } from '../../utils/constants';
import { projectGameUsersForSportContext } from '../game/read.service';
import { projectUserForSportContext } from '../user/userSportProfile.service';
import type { SportProjectedUserFields } from '../user/userSportProfile.service';

export const LEAGUE_USER_SELECT = USER_SELECT_WITH_SPORT_PROFILES;

type LeagueUser = Parameters<typeof projectUserForSportContext>[0];

type ProjectedLeagueUser<T extends LeagueUser> = T extends null | undefined
  ? T
  : Omit<T, 'sportProfiles'> & SportProjectedUserFields;

export function projectLeagueUser<T extends LeagueUser>(user: T, seasonSport: Sport): ProjectedLeagueUser<T> {
  return projectUserForSportContext(user, seasonSport);
}

export function projectLeagueParticipant<
  P extends {
    user?: LeagueUser | null;
    leagueTeam?: { players?: { user?: LeagueUser | null }[] } | null;
  },
>(participant: P, seasonSport: Sport): P {
  return {
    ...participant,
    user: participant.user ? projectLeagueUser(participant.user, seasonSport) : participant.user,
    leagueTeam: participant.leagueTeam
      ? {
          ...participant.leagueTeam,
          players: (participant.leagueTeam.players ?? []).map((p) => ({
            ...p,
            user: p.user ? projectLeagueUser(p.user, seasonSport) : p.user,
          })),
        }
      : participant.leagueTeam,
  };
}

export function projectLeagueParticipants<
  P extends Parameters<typeof projectLeagueParticipant>[0],
>(participants: P[], seasonSport: Sport): P[] {
  return participants.map((p) => projectLeagueParticipant(p, seasonSport));
}

export function projectLeagueGame<G extends { sport?: Sport }>(game: G, seasonSport: Sport): G {
  return projectGameUsersForSportContext({ ...game, sport: seasonSport });
}

export function projectLeagueRounds<
  R extends { games?: Array<{ sport?: Sport }> },
>(rounds: R[], seasonSport: Sport): R[] {
  return rounds.map((round) => ({
    ...round,
    games: (round.games ?? []).map((game) => projectLeagueGame(game, seasonSport)),
  }));
}

export function projectBracketPlayoffGroups(groups: any[], seasonSport: Sport): any[] {
  return groups.map((group) => ({
    ...group,
    slots: (group.slots ?? []).map((slot: any) => ({
      ...slot,
      game: slot.game ? projectLeagueGame(slot.game, seasonSport) : slot.game,
      participant: slot.participant
        ? projectLeagueParticipant(slot.participant, seasonSport)
        : slot.participant,
    })),
  }));
}
