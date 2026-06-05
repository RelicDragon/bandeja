import { useTranslation } from 'react-i18next';
import type { Game } from '@/types';
import { buildParticipantSetupTags } from './buildParticipantSetupTags';

const tagClassName =
  'inline-flex items-center rounded-full border border-gray-200/90 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-700 dark:border-gray-600 dark:bg-gray-800/80 dark:text-gray-200';

const tagButtonClassName = `${tagClassName} transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-800 active:scale-[0.98] dark:hover:border-primary-600 dark:hover:bg-primary-950/40 dark:hover:text-primary-200`;

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
