import { useTranslation } from 'react-i18next';
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

const tagClassName =
  'inline-flex items-center rounded-full border border-gray-200/90 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-700 dark:border-gray-600 dark:bg-gray-800/80 dark:text-gray-200';

const tagButtonClassName = `${tagClassName} transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-800 active:scale-[0.98] dark:hover:border-primary-600 dark:hover:bg-primary-950/40 dark:hover:text-primary-200`;

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

type ParticipantSetupTagsProps = {
  game: Game;
  canEdit?: boolean;
  onEditMaxParticipants?: () => void;
};

export const ParticipantSetupTags = ({
  game,
  canEdit = false,
  onEditMaxParticipants,
}: ParticipantSetupTagsProps) => {
  const { t } = useTranslation();
  const tags = buildParticipantSetupTags(game, t, { canEdit, onEditMaxParticipants });

  if (tags.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) =>
        tag.onClick ? (
          <button key={tag.key} type="button" onClick={tag.onClick} className={tagButtonClassName}>
            {tag.label}
          </button>
        ) : (
          <span key={tag.key} className={tagClassName}>
            {tag.label}
          </span>
        ),
      )}
    </div>
  );
};
