import { Card, Select, Divider, AvatarUpload } from '@/components';
import { Game, Club, GenderTeam, GameType } from '@/types';
import { Settings, Edit3, Save, X, HelpCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShowSettingsNotes } from '@/hooks/useShowSettingsNotes';
import { mediaApi } from '@/api/media';
import { gamesApi } from '@/api';
import toast from 'react-hot-toast';

interface GameSettingsProps {
  game: Game;
  clubs: Club[];
  courts: any[];
  isEditMode: boolean;
  isClosingEditMode: boolean;
  canEdit: boolean;
  editFormData: {
    clubId: string;
    courtId: string;
    name: string;
    isPublic: boolean;
    affectsRating: boolean;
    anyoneCanInvite: boolean;
    resultsByAnyone: boolean;
    allowDirectJoin: boolean;
    hasBookedCourt: boolean;
    afterGameGoToBar: boolean;
    hasFixedTeams: boolean;
    genderTeams: GenderTeam;
    gameType: GameType;
    description: string;
  };
  onEditModeToggle: () => void;
  onSaveChanges: () => void;
  onFormDataChange: (data: Partial<GameSettingsProps['editFormData']>) => void;
  onOpenClubModal: () => void;
  onOpenCourtModal: () => void;
  onGameUpdate?: (game: Game) => void;
}

const ToggleSwitch = ({ checked, onChange, disabled }: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) onChange(!checked);
    }}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
      disabled ? 'opacity-50 cursor-not-allowed' : ''
    } ${
      checked ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
    }`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
);

export const GameSettings = ({
  game,
  clubs,
  courts,
  isEditMode,
  isClosingEditMode,
  canEdit,
  editFormData,
  onEditModeToggle,
  onSaveChanges,
  onFormDataChange,
  onOpenClubModal,
  onOpenCourtModal,
  onGameUpdate,
}: GameSettingsProps) => {
  const { t } = useTranslation();
  const { showNotes, toggleShowNotes } = useShowSettingsNotes();

  if (!canEdit) {
    return null;
  }

  const canShowEdit = game.resultsStatus === 'NONE' && game.status !== 'ARCHIVED';

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Settings size={18} className="text-gray-500 dark:text-gray-400" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {t('createGame.settings')}
          </h2>
          <button
            onClick={toggleShowNotes}
            className={`p-2 rounded-lg transition-all duration-300 ease-in-out shadow-sm hover:shadow-md ${
              showNotes
                ? 'bg-primary-600 hover:bg-primary-700 dark:bg-primary-600 dark:hover:bg-primary-700 border border-primary-600 dark:border-primary-600 shadow-primary-100 dark:shadow-primary-900/20'
                : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600'
            }`}
            title={showNotes ? t('common.hideNotes') : t('common.showNotes')}
          >
            <HelpCircle size={18} className={showNotes ? 'text-white' : 'text-gray-600 dark:text-gray-300'} />
          </button>
        </div>
        {canEdit && canShowEdit && (
          <div className="flex items-center gap-2">
            <button
              onClick={onEditModeToggle}
              className={`p-2 rounded-lg transition-all duration-300 ease-in-out shadow-sm hover:shadow-md ${
                isEditMode
                  ? 'bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 border border-red-600 dark:border-red-600 shadow-red-100 dark:shadow-red-900/20 translate-x-0'
                  : 'bg-primary-600 hover:bg-primary-700 dark:bg-primary-600 dark:hover:bg-primary-700 border border-primary-600 dark:border-primary-600 shadow-primary-100 dark:shadow-primary-900/20 translate-x-10'
              }`}
              title={isEditMode ? t('common.cancel') : t('common.edit')}
            >
              <div className="relative w-[18px] h-[18px]">
                <X
                  size={18}
                  className={`absolute inset-0 transition-all duration-300 ease-in-out ${
                    isEditMode
                      ? 'opacity-100 rotate-0 scale-100 text-white'
                      : 'opacity-0 rotate-90 scale-75'
                  }`}
                />
                <Edit3
                  size={18}
                  className={`absolute inset-0 transition-all duration-300 ease-in-out ${
                    isEditMode
                      ? 'opacity-0 -rotate-90 scale-75'
                      : 'opacity-100 rotate-0 scale-100 text-white'
                  }`}
                />
              </div>
            </button>
            
            <button
              onClick={onSaveChanges}
              className={`p-2 rounded-lg transition-all duration-300 ease-in-out shadow-sm hover:shadow-md shadow-green-200 dark:shadow-green-900/30 ${
                isEditMode 
                  ? 'bg-green-600 hover:bg-green-700 opacity-100 scale-100 translate-x-0' 
                  : 'bg-green-600 hover:bg-green-700 opacity-0 scale-75 pointer-events-none -translate-x-10'
              }`}
              title={t('common.save')}
              disabled={!isEditMode}
            >
              <Save size={18} className="text-white" />
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {/* Avatar Upload - Only show in edit mode */}
        {(isEditMode || isClosingEditMode) && (
          <div className={`${isClosingEditMode ? 'animate-bounce-out' : 'animate-bounce-in'}`}>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
              {t('gameDetails.gameAvatar')}
            </label>
            <div className="flex justify-center">
              <AvatarUpload
                currentAvatar={game.avatar || undefined}
                isGameAvatar={true}
                onUpload={async (avatarFile: File, originalFile: File) => {
                  if (!game.id) return;
                  try {
                    await mediaApi.uploadGameAvatar(game.id, avatarFile, originalFile);
                    const response = await gamesApi.getById(game.id);
                    if (onGameUpdate) {
                      onGameUpdate(response.data);
                    }
                    toast.success(t('gameDetails.avatarUpdated'));
                  } catch (error: any) {
                    const errorMessage = error.response?.data?.message || 'errors.generic';
                    toast.error(t(errorMessage, { defaultValue: errorMessage }));
                    throw error;
                  }
                }}
                onRemove={async () => {
                  if (!game.id) return;
                  try {
                    await gamesApi.update(game.id, { avatar: null, originalAvatar: null });
                    const response = await gamesApi.getById(game.id);
                    if (onGameUpdate) {
                      onGameUpdate(response.data);
                    }
                    toast.success(t('gameDetails.avatarRemoved'));
                  } catch (error: any) {
                    const errorMessage = error.response?.data?.message || 'errors.generic';
                    toast.error(t(errorMessage, { defaultValue: errorMessage }));
                    throw error;
                  }
                }}
                disabled={!isEditMode}
              />
            </div>
            <Divider />
          </div>
        )}

        {/* Location Settings - Only show in edit mode */}
        {(isEditMode || isClosingEditMode) && (
          <div className={`space-y-3 ${isClosingEditMode ? 'animate-bounce-out' : 'animate-bounce-in'}`}>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                {t('createGame.location')}
              </label>
              <div className="space-y-2">
                <button
                  onClick={onOpenClubModal}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm text-left hover:border-primary-500 transition-colors"
                >
                  {editFormData.clubId
                    ? clubs.find(c => c.id === editFormData.clubId)?.name
                    : t('createGame.selectClub')
                  }
                </button>
                {editFormData.clubId && !(game?.entityType === 'BAR' && courts.length === 1) && (
                  <button
                    onClick={onOpenCourtModal}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm text-left hover:border-primary-500 transition-colors"
                  >
                    {editFormData.courtId === 'notBooked' || !editFormData.courtId
                      ? t('createGame.notBookedYet')
                      : courts.find(c => c.id === editFormData.courtId)?.name
                    }
                  </button>
                )}
              </div>
            </div>
            
            {/* Booked Court/Hall Switch - Only when court is selected */}
            {(editFormData.courtId !== 'notBooked' && editFormData.courtId) && (
              <>
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200 min-w-0 pr-2">
                    {game?.entityType === 'BAR' ? t('createGame.hasBookedHall') : t('createGame.hasBookedCourt')}
                  </span>
                  <div className="flex-shrink-0">
                    <ToggleSwitch 
                      checked={editFormData.hasBookedCourt} 
                      onChange={(checked) => onFormDataChange({hasBookedCourt: checked})}
                    />
                  </div>
                </div>
                <Divider />
              </>
            )}
          </div>
        )}

        {/* Boolean Settings */}
        <div className="space-y-2">
          <div className="px-3 py-1 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200 min-w-0 pr-2">
                {t('createGame.gameType')}
              </span>
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
                  value={isEditMode ? editFormData.gameType : (game?.gameType || 'CLASSIC')}
                  onChange={(value) => onFormDataChange({gameType: value as GameType})}
                  disabled={!isEditMode}
                />
              </div>
            </div>
            {showNotes && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('createGame.gameTypeNote')}
              </p>
            )}
          </div>
          {(game?.entityType === 'GAME' || game?.entityType === 'TOURNAMENT' || game?.entityType === 'LEAGUE') && (
            <div className="px-3 py-1 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200 min-w-0 pr-2">
                  {t('createGame.genderTeams.label')}
                </span>
                <div className="flex-shrink-0 w-32">
                  <Select
                    options={[
                      { value: 'ANY', label: t('createGame.genderTeams.any') },
                      { value: 'MEN', label: t('createGame.genderTeams.men') },
                      { value: 'WOMEN', label: t('createGame.genderTeams.women') },
                      ...(game?.maxParticipants >= 4 && game?.maxParticipants % 2 === 0
                        ? [{ value: 'MIX_PAIRS', label: t('createGame.genderTeams.mixPairs') }]
                        : []),
                    ]}
                    value={isEditMode ? editFormData.genderTeams : (game?.genderTeams || 'ANY')}
                    onChange={(value) => onFormDataChange({genderTeams: value as GenderTeam})}
                    disabled={!isEditMode}
                  />
                </div>
              </div>
              {showNotes && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {(() => {
                    const selectedGender = isEditMode ? editFormData.genderTeams : (game?.genderTeams || 'ANY');
                    if (selectedGender === 'ANY') return t('createGame.genderTeams.note.any');
                    if (selectedGender === 'MEN') return t('createGame.genderTeams.note.men');
                    if (selectedGender === 'WOMEN') return t('createGame.genderTeams.note.women');
                    if (selectedGender === 'MIX_PAIRS') return t('createGame.genderTeams.note.mixPairs');
                    return '';
                  })()}
                </p>
              )}
            </div>
          )}
          {game?.maxParticipants !== 2 && (
            <div className="px-3 py-1 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200 min-w-0 pr-2">
                  {t('games.fixedTeams')}
                </span>
                <div className="flex-shrink-0">
                  <ToggleSwitch
                    checked={isEditMode ? editFormData.hasFixedTeams : game?.hasFixedTeams || false}
                    onChange={(checked) => onFormDataChange({hasFixedTeams: checked})}
                    disabled={!isEditMode || !(game?.maxParticipants >= 4 && game?.maxParticipants % 2 === 0)}
                  />
                </div>
              </div>
              {showNotes && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {(() => {
                    const hasFixedTeams = isEditMode ? editFormData.hasFixedTeams : (game?.hasFixedTeams || false);
                    return hasFixedTeams 
                      ? t('createGame.hasFixedTeams.note.true')
                      : t('createGame.hasFixedTeams.note.false');
                  })()}
                </p>
              )}
            </div>
          )}
          <div className="px-3 py-1 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200 min-w-0 pr-2">
                {t('createGame.ratingGame.title')}
              </span>
              <div className="flex-shrink-0">
                <ToggleSwitch 
                  checked={isEditMode ? editFormData.affectsRating : game?.affectsRating || false} 
                  onChange={(checked) => onFormDataChange({affectsRating: checked})}
                  disabled={!isEditMode}
                />
              </div>
            </div>
            {showNotes && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {(() => {
                  const affectsRating = isEditMode ? editFormData.affectsRating : (game?.affectsRating || false);
                  return affectsRating 
                    ? t('createGame.ratingGame.note.true')
                    : t('createGame.ratingGame.note.false');
                })()}
              </p>
            )}
          </div>
          
          <Divider />
          
          <div className="px-3 py-1 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200 min-w-0 pr-2">
                {t('createGame.publicGame.title')}
              </span>
              <div className="flex-shrink-0">
                <ToggleSwitch 
                  checked={isEditMode ? editFormData.isPublic : game?.isPublic || false} 
                  onChange={(checked) => onFormDataChange({isPublic: checked})}
                  disabled={!isEditMode}
                />
              </div>
            </div>
            {showNotes && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {(() => {
                  const isPublic = isEditMode ? editFormData.isPublic : (game?.isPublic || false);
                  return isPublic 
                    ? t('createGame.publicGame.note.true')
                    : t('createGame.publicGame.note.false');
                })()}
              </p>
            )}
          </div>
          <div className="px-3 py-1 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200 min-w-0 pr-2">
                {t('createGame.anyoneCanInvite.title')}
              </span>
              <div className="flex-shrink-0">
                <ToggleSwitch 
                  checked={isEditMode ? editFormData.anyoneCanInvite : game?.anyoneCanInvite || false} 
                  onChange={(checked) => onFormDataChange({anyoneCanInvite: checked})}
                  disabled={!isEditMode}
                />
              </div>
            </div>
            {showNotes && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {(() => {
                  const anyoneCanInvite = isEditMode ? editFormData.anyoneCanInvite : (game?.anyoneCanInvite || false);
                  return anyoneCanInvite 
                    ? t('createGame.anyoneCanInvite.note.true')
                    : t('createGame.anyoneCanInvite.note.false');
                })()}
              </p>
            )}
          </div>
          <div className="px-3 py-1 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200 min-w-0 pr-2">
                {t('createGame.resultsByAnyone.title')}
              </span>
              <div className="flex-shrink-0">
                <ToggleSwitch 
                  checked={isEditMode ? editFormData.resultsByAnyone : game?.resultsByAnyone || false} 
                  onChange={(checked) => onFormDataChange({resultsByAnyone: checked})}
                  disabled={!isEditMode}
                />
              </div>
            </div>
            {showNotes && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {(() => {
                  const resultsByAnyone = isEditMode ? editFormData.resultsByAnyone : (game?.resultsByAnyone || false);
                  return resultsByAnyone 
                    ? t('createGame.resultsByAnyone.note.true')
                    : t('createGame.resultsByAnyone.note.false');
                })()}
              </p>
            )}
          </div>
          <div className="px-3 py-1 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200 min-w-0 pr-2">
                {t('createGame.allowDirectJoin.title')}
              </span>
              <div className="flex-shrink-0">
                <ToggleSwitch 
                  checked={isEditMode ? editFormData.allowDirectJoin : (game?.allowDirectJoin ?? false)} 
                  onChange={(checked) => onFormDataChange({allowDirectJoin: checked})}
                  disabled={!isEditMode}
                />
              </div>
            </div>
            {showNotes && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {(() => {
                  const allowDirectJoin = isEditMode ? editFormData.allowDirectJoin : (game?.allowDirectJoin ?? false);
                  return allowDirectJoin 
                    ? t('createGame.allowDirectJoin.note.true')
                    : t('createGame.allowDirectJoin.note.false');
                })()}
              </p>
            )}
          </div>
          {game?.entityType !== 'BAR' && (
            <div className="px-3 py-1 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200 min-w-0 pr-2">
                  {t('createGame.afterGameGoToBar.title')}
                </span>
                <div className="flex-shrink-0">
                  <ToggleSwitch
                    checked={isEditMode ? editFormData.afterGameGoToBar : game?.afterGameGoToBar || false}
                    onChange={(checked) => onFormDataChange({afterGameGoToBar: checked})}
                    disabled={!isEditMode}
                  />
                </div>
              </div>
              {showNotes && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {(() => {
                    const afterGameGoToBar = isEditMode ? editFormData.afterGameGoToBar : (game?.afterGameGoToBar || false);
                    return afterGameGoToBar 
                      ? t('createGame.afterGameGoToBar.note.true')
                      : t('createGame.afterGameGoToBar.note.false');
                  })()}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Name - only show if in edit mode */}
        {(isEditMode || isClosingEditMode) && (
          <div className={`${(isEditMode || isClosingEditMode) && (!game?.name || game.name.trim() === '') ? (isClosingEditMode ? 'animate-bounce-out' : 'animate-bounce-in') : ''}`}>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
              {t('createGame.gameName')}
            </label>
            {(isEditMode || isClosingEditMode) ? (
              <input
                type="text"
                value={editFormData.name}
                onChange={(e) => onFormDataChange({name: e.target.value})}
                placeholder={t('createGame.gameNamePlaceholder')}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
            ) : (
              <div className="px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm min-h-[48px]">
                {game?.name}
              </div>
            )}
          </div>
        )}

        {/* Description - only show if in edit mode */}
        {(isEditMode || isClosingEditMode) && (
          <div className={`${(isEditMode || isClosingEditMode) && (!game?.description || game.description.trim() === '') ? (isClosingEditMode ? 'animate-bounce-out' : 'animate-bounce-in') : ''}`}>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
              {t('createGame.comments')}
            </label>
            {(isEditMode || isClosingEditMode) ? (
              <textarea
                value={editFormData.description}
                onChange={(e) => onFormDataChange({description: e.target.value})}
                placeholder={t('createGame.commentsPlaceholder')}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none"
                rows={3}
              />
            ) : (
              <div className="px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm min-h-[76px]">
                {game?.description}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};
