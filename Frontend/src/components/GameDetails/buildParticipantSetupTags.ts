import type { Game, GenderTeam } from '@/types';
import { getSportConfig } from '@/sport/sportRegistry';
import { parseGameSport } from '@/utils/gameSport';
import { playersPerMatchOf } from '@/utils/matchFormat';
import {
  gameFormatFixedTeamsToggleVisible,
  gameFormatGenderVisible,
} from '@/components/gameFormat/gameFormatTeamsVisibility';

type ParticipantSetupTag = {
  key: string;
  label: string;
  onClick?: () => void;
};

function genderLabelKey(gender: GenderTeam): string | null {
  switch (gender) {
    case 'MEN':
      return 'createGame.genderTeams.men';
    case 'WOMEN':
      return 'createGame.genderTeams.women';
    case 'MIX_PAIRS':
      return 'createGame.genderTeams.mixPairs';
    default:
      return null;
  }
}

export function buildParticipantSetupTags(
  game: Game,
  t: (key: string) => string,
  options?: { canEdit?: boolean; onEditMaxParticipants?: () => void },
): ParticipantSetupTag[] {
  const tags: ParticipantSetupTag[] = [];
  const sportConfig = getSportConfig(parseGameSport(game.sport));
  const playersPerMatch = playersPerMatchOf(game);

  if (
    game.hasFixedTeams &&
    game.maxParticipants > 2 &&
    gameFormatFixedTeamsToggleVisible(game.entityType, game.maxParticipants)
  ) {
    tags.push({
      key: 'fixed',
      label: t('games.fixedTeams'),
      onClick:
        options?.canEdit && options.onEditMaxParticipants
          ? options.onEditMaxParticipants
          : undefined,
    });
  }

  if (gameFormatGenderVisible(game.entityType)) {
    const gender = (game.genderTeams || 'ANY') as GenderTeam;
    if (gender !== 'ANY') {
      const labelKey = genderLabelKey(gender);
      if (labelKey) tags.push({ key: 'gender', label: t(labelKey) });
    }
  }

  if (
    game.entityType !== 'BAR' &&
    game.entityType !== 'TRAINING' &&
    sportConfig.allowedPlayerCountsPerMatch.length > 1 &&
    playersPerMatch !== sportConfig.defaultPlayersPerMatch
  ) {
    tags.push({
      key: 'format',
      label: playersPerMatch === 2 ? t('sport.match1v1') : t('sport.match2v2'),
    });
  }

  return tags;
}
