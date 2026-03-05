import { useTranslation } from 'react-i18next';
import { Game, GameType } from '@/types';
import { Select, AvatarUpload } from '@/components';

export interface GeneralTabState {
  name: string;
  description: string;
  gameType: GameType;
  pendingAvatar: { avatar: File; original: File } | null;
  removeAvatar: boolean;
}

interface GeneralTabProps {
  game: Game;
  state: GeneralTabState;
  onChange: (patch: Partial<GeneralTabState>) => void;
  avatarPreviewUrl?: string | null;
}

export const GeneralTab = ({ game, state, onChange, avatarPreviewUrl }: GeneralTabProps) => {
  const { t } = useTranslation();
  const isLeagueSeason = game?.entityType === 'LEAGUE_SEASON';
  const nameLabel = t(isLeagueSeason ? 'createGame.gameNameLeague' : 'createGame.gameName');
  const namePlaceholder = t(isLeagueSeason ? 'createGame.gameNamePlaceholderLeague' : 'createGame.gameNamePlaceholder');
  const commentsLabel = t(isLeagueSeason ? 'createGame.commentsLeague' : 'createGame.comments');
  const commentsPlaceholder = t(isLeagueSeason ? 'createGame.commentsPlaceholderLeague' : 'createGame.commentsPlaceholder');
  const gameTypeLabel = t(isLeagueSeason ? 'createGame.gameTypeLeague' : 'createGame.gameType');

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

      {game.entityType !== 'TRAINING' && (
        <div className="px-3 py-1 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200 min-w-0 pr-2">{gameTypeLabel}</span>
            <div className="flex-shrink-0 w-40">
              <Select
                options={
                  game?.entityType === 'GAME'
                    ? [
                        { value: 'CLASSIC', label: t('games.gameTypes.CLASSIC') },
                        { value: 'AMERICANO', label: t('games.gameTypes.AMERICANO') },
                        { value: 'MEXICANO', label: t('games.gameTypes.MEXICANO') },
                        { value: 'CUSTOM', label: t('games.gameTypes.CUSTOM') },
                      ]
                    : [
                        { value: 'CLASSIC', label: t('games.gameTypes.CLASSIC') },
                        { value: 'AMERICANO', label: t('games.gameTypes.AMERICANO') },
                        { value: 'MEXICANO', label: t('games.gameTypes.MEXICANO') },
                        { value: 'ROUND_ROBIN', label: t('games.gameTypes.ROUND_ROBIN') },
                        { value: 'WINNER_COURT', label: t('games.gameTypes.WINNER_COURT') },
                        { value: 'CUSTOM', label: t('games.gameTypes.CUSTOM') },
                      ]
                }
                value={state.gameType}
                onChange={(value) => onChange({ gameType: value as GameType })}
                disabled={false}
              />
            </div>
          </div>
        </div>
      )}

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
