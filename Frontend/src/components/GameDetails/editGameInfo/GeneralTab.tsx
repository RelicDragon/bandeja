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
  const commentsLabel = t(isLeagueSeason ? 'createGame.commentsLeague' : 'createGame.comments');
  const commentsPlaceholder = t(isLeagueSeason ? 'createGame.commentsPlaceholderLeague' : 'createGame.commentsPlaceholder');

  const currentAvatar = state.removeAvatar ? undefined : (avatarPreviewUrl ?? game.avatar ?? undefined);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex justify-center">
          <AvatarUpload
            currentAvatar={currentAvatar ?? undefined}
            isGameAvatar={true}
            onUpload={async (avatarFile, originalFile) => {
              onChange({ pendingAvatar: { avatar: avatarFile, original: originalFile }, removeAvatar: false });
            }}
            onRemove={async () => onChange({ pendingAvatar: null, removeAvatar: true })}
            disabled={false}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">{nameLabel}</label>
        <input
          type="text"
          value={state.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder={namePlaceholder}
          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">{commentsLabel}</label>
        <textarea
          value={state.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder={commentsPlaceholder}
          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none"
          rows={3}
        />
      </div>
    </div>
  );
};
