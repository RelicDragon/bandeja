import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import { Lock, Mars, Shuffle, Venus, UsersRound } from 'lucide-react';
import { EntityType, GenderTeam } from '@/types';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';
import { gameFormatFixedTeamsToggleVisible, gameFormatGenderVisible, gameFormatTeamsFieldsVisible } from './gameFormatTeamsVisibility';

type FixedTeamsHintEntity = 'GAME' | 'TOURNAMENT' | 'LEAGUE';

function fixedTeamsHintEntity(entityType: EntityType): FixedTeamsHintEntity {
  switch (entityType) {
    case 'TOURNAMENT':
      return 'TOURNAMENT';
    case 'LEAGUE':
    case 'LEAGUE_SEASON':
      return 'LEAGUE';
    default:
      return 'GAME';
  }
}

const GENDER_TAB_META: { value: GenderTeam; labelKey: string; icon: LucideIcon }[] = [
  { value: 'ANY', labelKey: 'any', icon: UsersRound },
  { value: 'MEN', labelKey: 'men', icon: Mars },
  { value: 'WOMEN', labelKey: 'women', icon: Venus },
  { value: 'MIX_PAIRS', labelKey: 'mixPairs', icon: Shuffle },
];

export interface GameFormatGenderFieldsProps {
  entityType: EntityType;
  genderTeams: GenderTeam;
  onGenderTeamsChange: (v: GenderTeam) => void;
  genderSwitchLayoutId?: string;
  className?: string;
  readOnly?: boolean;
}

export const GameFormatGenderFields = ({
  entityType,
  genderTeams,
  onGenderTeamsChange,
  genderSwitchLayoutId = 'gameFormatTeamsGender',
  className = '',
  readOnly = false,
}: GameFormatGenderFieldsProps) => {
  const { t } = useTranslation();

  const genderTabs = useMemo<SegmentedSwitchTab[]>(
    () =>
      GENDER_TAB_META.map((o) => ({
        id: o.value,
        label: t(`createGame.genderTeams.${o.labelKey}`),
        icon: o.icon,
        ariaLabel: t(`createGame.genderTeams.${o.labelKey}`),
      })),
    [t],
  );

  if (!gameFormatGenderVisible(entityType)) return null;

  return (
    <div className={className.trim()}>
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/70">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="min-w-0 grow text-sm font-medium text-gray-800 dark:text-gray-200">
            {t('createGame.genderTeams.label')}
          </span>
          <div className="flex min-w-0 grow-[1000] basis-0 justify-end">
            <SegmentedSwitch
              className="!mx-0 max-w-full"
              tabs={genderTabs}
              activeId={genderTeams}
              onChange={(id) => onGenderTeamsChange(id as GenderTeam)}
              showOnlyActiveTabText
              layoutId={genderSwitchLayoutId}
              disabled={readOnly}
              ariaLabel={t('createGame.genderTeams.label')}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export interface GameFormatFixedTeamsToggleProps {
  entityType: EntityType;
  participantCount: number;
  hasFixedTeams: boolean;
  onHasFixedTeamsChange: (v: boolean) => void;
  className?: string;
  readOnly?: boolean;
}

export const GameFormatFixedTeamsToggle = ({
  entityType,
  participantCount,
  hasFixedTeams,
  onHasFixedTeamsChange,
  className = '',
  readOnly = false,
}: GameFormatFixedTeamsToggleProps) => {
  const { t } = useTranslation();
  const hintId = useId();

  if (!gameFormatFixedTeamsToggleVisible(entityType, participantCount)) return null;

  const hintEntity = fixedTeamsHintEntity(entityType);
  const hintOff = t(`createGame.fixedTeams.${hintEntity}.descriptionOff`);
  const hintOn = t(`createGame.fixedTeams.${hintEntity}.descriptionOn`);
  const labelOff = t('createGame.fixedTeams.optionOff');
  const labelOn = t('games.fixedTeams');
  const selectedHint = hasFixedTeams ? hintOn : hintOff;

  const options = [
    { value: false, label: labelOff, icon: Shuffle },
    { value: true, label: labelOn, icon: Lock },
  ] as const;

  return (
    <div className={className.trim()}>
      <div
        className={`flex gap-2 rounded-lg bg-gray-100 p-1 dark:bg-gray-800 ${
          readOnly ? 'opacity-60' : ''
        }`}
        role="group"
        aria-label={t('games.fixedTeams')}
        aria-describedby={hintId}
      >
        {options.map((option) => {
          const selected = hasFixedTeams === option.value;
          const Icon = option.icon;
          const iconClass = selected
            ? 'text-white'
            : 'text-gray-500 dark:text-gray-400';
          return (
            <button
              key={String(option.value)}
              type="button"
              disabled={readOnly}
              onClick={() => onHasFixedTeamsChange(option.value)}
              aria-pressed={selected}
              aria-label={option.label}
              className={`flex-1 min-h-10 rounded-md px-2 py-1.5 transition-all disabled:cursor-not-allowed ${
                selected
                  ? 'bg-primary-500 text-white shadow-sm ring-1 ring-primary-600/30'
                  : 'text-gray-700 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700 disabled:hover:bg-transparent dark:disabled:hover:bg-transparent'
              }`}
            >
              <span className="flex items-center justify-center gap-1.5 leading-tight">
                <Icon className={`h-4 w-4 shrink-0 ${iconClass}`} strokeWidth={2.25} aria-hidden />
                <span className="text-sm font-semibold">{option.label}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p
        id={hintId}
        aria-live="polite"
        className="mt-1.5 text-center text-xs leading-relaxed text-gray-500 dark:text-gray-400"
      >
        {selectedHint}
      </p>
    </div>
  );
};

export interface GameFormatTeamsFieldsProps {
  entityType: EntityType;
  participantCount: number;
  genderTeams: GenderTeam;
  hasFixedTeams: boolean;
  onGenderTeamsChange: (v: GenderTeam) => void;
  onHasFixedTeamsChange: (v: boolean) => void;
  allowUserInMultipleTeams?: boolean;
  onAllowUserInMultipleTeamsChange?: (v: boolean) => void;
  genderSwitchLayoutId?: string;
  className?: string;
  readOnly?: boolean;
}

export const GameFormatTeamsFields = ({
  entityType,
  participantCount,
  genderTeams,
  hasFixedTeams,
  onGenderTeamsChange,
  onHasFixedTeamsChange,
  genderSwitchLayoutId = 'gameFormatTeamsGender',
  className = '',
  readOnly = false,
}: GameFormatTeamsFieldsProps) => {
  if (!gameFormatTeamsFieldsVisible(entityType, participantCount)) return null;

  return (
    <div className={`space-y-4 ${className}`.trim()}>
      <GameFormatGenderFields
        entityType={entityType}
        genderTeams={genderTeams}
        onGenderTeamsChange={onGenderTeamsChange}
        genderSwitchLayoutId={genderSwitchLayoutId}
        readOnly={readOnly}
      />
      <GameFormatFixedTeamsToggle
        entityType={entityType}
        participantCount={participantCount}
        hasFixedTeams={hasFixedTeams}
        onHasFixedTeamsChange={onHasFixedTeamsChange}
        readOnly={readOnly}
      />
    </div>
  );
};

export type GameFormatTeamsBinding = Omit<GameFormatTeamsFieldsProps, 'entityType' | 'className'>;
