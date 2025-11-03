import { useTranslation } from 'react-i18next';
import { ToggleSwitch } from '../ToggleSwitch';
import { Select } from '../Select';
import { EntityType, GenderTeam } from '@/types';

interface GameSettingsSectionProps {
  isPublic: boolean;
  isRatingGame: boolean;
  anyoneCanInvite: boolean;
  resultsByAnyone: boolean;
  afterGameGoToBar: boolean;
  hasFixedTeams: boolean;
  genderTeams: GenderTeam;
  maxParticipants: number;
  entityType: EntityType;
  onPublicChange: (checked: boolean) => void;
  onRatingGameChange: (checked: boolean) => void;
  onAnyoneCanInviteChange: (checked: boolean) => void;
  onResultsByAnyoneChange: (checked: boolean) => void;
  onAfterGameGoToBarChange: (checked: boolean) => void;
  onHasFixedTeamsChange: (checked: boolean) => void;
  onGenderTeamsChange: (value: GenderTeam) => void;
}

export const GameSettingsSection = ({
  isPublic,
  isRatingGame,
  anyoneCanInvite,
  resultsByAnyone,
  afterGameGoToBar,
  hasFixedTeams,
  genderTeams,
  maxParticipants,
  entityType,
  onPublicChange,
  onRatingGameChange,
  onAnyoneCanInviteChange,
  onResultsByAnyoneChange,
  onAfterGameGoToBarChange,
  onHasFixedTeamsChange,
  onGenderTeamsChange,
}: GameSettingsSectionProps) => {
  const { t } = useTranslation();

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
        {t('createGame.settings')}
      </h2>
      <div className="space-y-2">
        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200 min-w-0 pr-2">
            {t('createGame.publicGame')}
          </span>
          <div className="flex-shrink-0">
            <ToggleSwitch checked={isPublic} onChange={onPublicChange} />
          </div>
        </div>
        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200 min-w-0 pr-2">
            {t('createGame.ratingGame')}
          </span>
          <div className="flex-shrink-0">
            <ToggleSwitch checked={isRatingGame} onChange={onRatingGameChange} />
          </div>
        </div>
        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200 min-w-0 pr-2">
            {t('createGame.anyoneCanInvite')}
          </span>
          <div className="flex-shrink-0">
            <ToggleSwitch checked={anyoneCanInvite} onChange={onAnyoneCanInviteChange} />
          </div>
        </div>
        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200 min-w-0 pr-2">
            {t('createGame.resultsByAnyone')}
          </span>
          <div className="flex-shrink-0">
            <ToggleSwitch checked={resultsByAnyone} onChange={onResultsByAnyoneChange} />
          </div>
        </div>
        {entityType !== 'BAR' && (
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200 min-w-0 pr-2">
              {t('createGame.afterGameGoToBar')}
            </span>
            <div className="flex-shrink-0">
              <ToggleSwitch checked={afterGameGoToBar} onChange={onAfterGameGoToBarChange} />
            </div>
          </div>
        )}
        {maxParticipants !== 2 && (
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
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
        )}
        {(entityType === 'GAME' || entityType === 'TOURNAMENT' || entityType === 'LEAGUE') && (
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
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
        )}
      </div>
    </div>
  );
};

