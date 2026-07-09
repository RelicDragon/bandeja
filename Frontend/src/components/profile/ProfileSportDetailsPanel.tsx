import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Input } from '@/components';
import type { Sport, User } from '@/types';
import { getSportConfig } from '@/sport/sportRegistry';
import { getSportPublicIcon } from '@/sport/sportPublicIcon';
import { SportQuestionnaireProfileStatus } from '@/components/sportQuestionnaire/SportQuestionnaireProfileStatus';
import { SportProfileLevelMeta } from '@/components/profile/SportProfileLevelMeta';
import { SportProfileExternalRating } from '@/components/profile/SportProfileExternalRating';

type ProfileSportDetailsPanelProps = {
  sport: Sport;
  user: User;
  displayLevel: number;
  gamesPlayed: number;
  levelEditable: boolean;
  editing: boolean;
  draftLevel: string;
  disabled?: boolean;
  onDraftLevelChange: (value: string) => void;
  onStartEditLevel: () => void;
  onSaveLevel: () => void;
  onCancelEdit: () => void;
  onClose: () => void;
  onUserUpdated: (user: User) => void;
};

export function ProfileSportDetailsPanel({
  sport,
  user,
  displayLevel,
  gamesPlayed,
  levelEditable,
  editing,
  draftLevel,
  disabled = false,
  onDraftLevelChange,
  onStartEditLevel,
  onSaveLevel,
  onCancelEdit,
  onClose,
  onUserUpdated,
}: ProfileSportDetailsPanelProps) {
  const { t } = useTranslation();
  const config = getSportConfig(sport);
  const label = t(config.labelKey);

  return (
    <div className="rounded-xl border-2 border-primary-300/80 bg-primary-50/80 p-4 shadow-sm dark:border-primary-600/50 dark:bg-primary-950/25">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <img src={getSportPublicIcon(sport)} alt="" className="h-12 w-12 shrink-0 object-contain" draggable={false} />
          <div className="min-w-0">
            <h4 className="text-base font-semibold text-gray-900 dark:text-white">{label}</h4>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-sm font-semibold text-yellow-600 dark:text-yellow-400">
                {displayLevel.toFixed(1)}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t('profile.sports.gamesCount', { count: gamesPlayed })}
              </span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-200/80 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          aria-label={t('profile.sports.hideDetails')}
        >
          <X size={18} aria-hidden />
        </button>
      </div>

      {editing ? (
        <div className="flex max-w-sm flex-col gap-2">
          <Input
            type="number"
            step="0.1"
            min={1}
            max={7}
            value={draftLevel}
            onChange={(e) => onDraftLevelChange(e.target.value)}
            className="h-9 text-center text-sm"
          />
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={onSaveLevel} disabled={disabled}>
              {t('profile.save')}
            </Button>
            <Button size="sm" variant="secondary" className="flex-1" onClick={onCancelEdit}>
              {t('profile.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => {
              if (levelEditable) onStartEditLevel();
            }}
            className={`self-start text-sm font-semibold text-yellow-600 dark:text-yellow-400 ${
              levelEditable ? 'underline-offset-2 hover:underline' : 'cursor-default'
            }`}
            disabled={!levelEditable}
          >
            {t('profile.sports.editLevel')}
          </button>
          <SportProfileLevelMeta user={user} sport={sport} level={displayLevel} className="items-start text-left" />
          <SportProfileExternalRating
            user={user}
            sport={sport}
            disabled={disabled}
            onUserUpdated={onUserUpdated}
          />
          <SportQuestionnaireProfileStatus
            user={user}
            sport={sport}
            gamesPlayed={gamesPlayed}
            onUserUpdated={onUserUpdated}
            className="self-start"
          />
        </div>
      )}
    </div>
  );
}
