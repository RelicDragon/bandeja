import { useTranslation } from 'react-i18next';
import { Game } from '@/types';
import { AvatarUpload } from '@/components';

export interface GeneralTabState {
  name: string;
  description: string;
  pendingAvatar: { avatar: File; original: File } | null;
  removeAvatar: boolean;
}

interface GeneralTabProps {
  game: Game;
  state: GeneralTabState;
  onChange: (patch: Partial<GeneralTabState>) => void;
  avatarPreviewUrl?: string | null;
}

export const GeneralTab = ({
  game,
  state,
  onChange,
  avatarPreviewUrl,
}: GeneralTabProps) => {
  const { t } = useTranslation();
  const isLeagueSeason = game?.entityType === 'LEAGUE_SEASON';
  const nameLabel = t(isLeagueSeason ? 'createGame.gameNameLeague' : 'createGame.gameName');
  const namePlaceholder = t(isLeagueSeason ? 'createGame.gameNamePlaceholderLeague' : 'createGame.gameNamePlaceholder');
  const descriptionLabel = t('createGame.description');
  const descriptionPlaceholder = t(
    isLeagueSeason ? 'createGame.descriptionPlaceholderLeague' : 'createGame.descriptionPlaceholder',
  );

  const currentAvatar = state.removeAvatar ? undefined : (avatarPreviewUrl ?? game.avatar ?? undefined);

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <div className="flex shrink-0 items-center gap-4">
        <AvatarUpload
          currentAvatar={currentAvatar ?? undefined}
          isGameAvatar={true}
          onUpload={async (avatarFile, originalFile) => {
            onChange({ pendingAvatar: { avatar: avatarFile, original: originalFile }, removeAvatar: false });
          }}
          onRemove={async () => onChange({ pendingAvatar: null, removeAvatar: true })}
          disabled={false}
          sizeClassName="h-24 w-24 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">{nameLabel}</label>
          <input
            type="text"
            value={state.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder={namePlaceholder}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <label className="mb-1.5 block shrink-0 text-xs font-medium text-gray-600 dark:text-gray-400">{descriptionLabel}</label>
        <textarea
          value={state.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder={descriptionPlaceholder}
          className="min-h-0 w-full flex-1 resize-none rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        />
      </div>
    </div>
  );
};
