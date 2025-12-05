import { useTranslation } from 'react-i18next';
import { ToggleSwitch } from '../ToggleSwitch';
import { Select } from '../Select';
import { Divider } from '../Divider';
import { EntityType, GenderTeam, GameType } from '@/types';
import { HelpCircle } from 'lucide-react';
import { useShowSettingsNotes } from '@/hooks/useShowSettingsNotes';

interface GameSettingsSectionProps {
  isPublic: boolean;
  isRatingGame: boolean;
  anyoneCanInvite: boolean;
  resultsByAnyone: boolean;
  allowDirectJoin: boolean;
  afterGameGoToBar: boolean;
  hasFixedTeams: boolean;
  genderTeams: GenderTeam;
  gameType: GameType;
  maxParticipants: number;
  entityType: EntityType;
  onPublicChange: (checked: boolean) => void;
  onRatingGameChange: (checked: boolean) => void;
  onAnyoneCanInviteChange: (checked: boolean) => void;
  onResultsByAnyoneChange: (checked: boolean) => void;
  onAllowDirectJoinChange: (checked: boolean) => void;
  onAfterGameGoToBarChange: (checked: boolean) => void;
  onHasFixedTeamsChange: (checked: boolean) => void;
  onGenderTeamsChange: (value: GenderTeam) => void;
  onGameTypeChange: (value: GameType) => void;
}

export const GameSettingsSection = ({
  isPublic,
  isRatingGame,
  anyoneCanInvite,
  resultsByAnyone,
  allowDirectJoin,
  afterGameGoToBar,
  hasFixedTeams,
  genderTeams,
  gameType,
  maxParticipants,
  entityType,
  onPublicChange,
  onRatingGameChange,
  onAnyoneCanInviteChange,
  onResultsByAnyoneChange,
  onAllowDirectJoinChange,
  onAfterGameGoToBarChange,
  onHasFixedTeamsChange,
  onGenderTeamsChange,
  onGameTypeChange,
}: GameSettingsSectionProps) => {
  const { t } = useTranslation();
  const { showNotes, toggleShowNotes } = useShowSettingsNotes();

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          {entityType === 'TOURNAMENT' ? t('createGame.settingsTournament') :
           entityType === 'LEAGUE' ? t('createGame.settingsLeague') :
           t('createGame.settings')}
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
      <div className="space-y-2">
        <div className="px-3 py-1 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200 min-w-0 pr-2">
              {t('createGame.gameType')}
            </span>
            <div className="flex-shrink-0 w-40">
              <Select
                options={
                  entityType === 'GAME'
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
                value={gameType}
                onChange={(value) => onGameTypeChange(value as GameType)}
              />
            </div>
          </div>
          {showNotes && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('createGame.gameTypeNote')}
            </p>
          )}
        </div>
        {(entityType === 'GAME' || entityType === 'TOURNAMENT' || entityType === 'LEAGUE') && (
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
                    ...(maxParticipants >= 4 && maxParticipants % 2 === 0
                      ? [{ value: 'MIX_PAIRS', label: t('createGame.genderTeams.mixPairs') }]
                      : []),
                  ]}
                  value={genderTeams}
                  onChange={(value) => onGenderTeamsChange(value as GenderTeam)}
                />
              </div>
            </div>
            {showNotes && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {(() => {
                  if (genderTeams === 'ANY') return t('createGame.genderTeams.note.any');
                  if (genderTeams === 'MEN') return t('createGame.genderTeams.note.men');
                  if (genderTeams === 'WOMEN') return t('createGame.genderTeams.note.women');
                  if (genderTeams === 'MIX_PAIRS') return t('createGame.genderTeams.note.mixPairs');
                  return '';
                })()}
              </p>
            )}
          </div>
        )}
        {maxParticipants !== 2 && (
          <div className="px-3 py-1 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200 min-w-0 pr-2">
                {t('games.fixedTeams')}
              </span>
              <div className="flex-shrink-0">
                <ToggleSwitch 
                  checked={hasFixedTeams} 
                  onChange={onHasFixedTeamsChange}
                  disabled={!(maxParticipants >= 4 && maxParticipants % 2 === 0)}
                />
              </div>
            </div>
            {showNotes && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {hasFixedTeams 
                  ? t('createGame.hasFixedTeams.note.true')
                  : t('createGame.hasFixedTeams.note.false')}
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
              <ToggleSwitch checked={isRatingGame} onChange={onRatingGameChange} />
            </div>
          </div>
          {showNotes && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {isRatingGame 
                ? t('createGame.ratingGame.note.true')
                : t('createGame.ratingGame.note.false')}
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
              <ToggleSwitch checked={isPublic} onChange={onPublicChange} />
            </div>
          </div>
          {showNotes && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {isPublic 
                ? t('createGame.publicGame.note.true')
                : t('createGame.publicGame.note.false')}
            </p>
          )}
        </div>
        <div className="px-3 py-1 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200 min-w-0 pr-2">
              {t('createGame.anyoneCanInvite.title')}
            </span>
            <div className="flex-shrink-0">
              <ToggleSwitch checked={anyoneCanInvite} onChange={onAnyoneCanInviteChange} />
            </div>
          </div>
          {showNotes && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {anyoneCanInvite 
                ? t('createGame.anyoneCanInvite.note.true')
                : t('createGame.anyoneCanInvite.note.false')}
            </p>
          )}
        </div>
        {entityType !== 'TOURNAMENT' && (
          <div className="px-3 py-1 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200 min-w-0 pr-2">
                {t('createGame.resultsByAnyone.title')}
              </span>
              <div className="flex-shrink-0">
                <ToggleSwitch checked={resultsByAnyone} onChange={onResultsByAnyoneChange} />
              </div>
            </div>
            {showNotes && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {resultsByAnyone 
                  ? t('createGame.resultsByAnyone.note.true')
                  : t('createGame.resultsByAnyone.note.false')}
              </p>
            )}
          </div>
        )}
        <div className="px-3 py-1 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200 min-w-0 pr-2">
              {t('createGame.allowDirectJoin.title')}
            </span>
            <div className="flex-shrink-0">
              <ToggleSwitch checked={allowDirectJoin} onChange={onAllowDirectJoinChange} />
            </div>
          </div>
          {showNotes && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {allowDirectJoin 
                ? t('createGame.allowDirectJoin.note.true')
                : t('createGame.allowDirectJoin.note.false')}
            </p>
          )}
        </div>
        {entityType !== 'BAR' && (
          <div className="px-3 py-1 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200 min-w-0 pr-2">
                {t('createGame.afterGameGoToBar.title')}
              </span>
              <div className="flex-shrink-0">
                <ToggleSwitch checked={afterGameGoToBar} onChange={onAfterGameGoToBarChange} />
              </div>
            </div>
            {showNotes && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {afterGameGoToBar 
                  ? t('createGame.afterGameGoToBar.note.true')
                  : t('createGame.afterGameGoToBar.note.false')}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

