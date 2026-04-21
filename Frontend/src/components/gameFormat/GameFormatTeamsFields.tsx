import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import { Lock, Mars, Venus, UsersRound, Shuffle } from 'lucide-react';
import { EntityType, GenderTeam } from '@/types';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { gameFormatFixedTeamsToggleVisible, gameFormatGenderVisible, gameFormatTeamsFieldsVisible } from './gameFormatTeamsVisibility';

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
      <div className="flex w-full justify-start">
        <SegmentedSwitch
          className="!mx-0"
          tabs={genderTabs}
          activeId={genderTeams}
          onChange={(id) => onGenderTeamsChange(id as GenderTeam)}
          titleInActiveOnly
          layoutId={genderSwitchLayoutId}
          disabled={readOnly}
        />
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

  if (!gameFormatFixedTeamsToggleVisible(entityType, participantCount)) return null;

  const description = t(hasFixedTeams ? 'createGame.fixedTeams.descriptionOn' : 'createGame.fixedTeams.descriptionOff');

  return (
    <div className={className.trim()}>
      <div
        className={[
          'rounded-xl transition-colors',
          !readOnly && 'hover:bg-primary-50/45 dark:hover:bg-primary-500/10',
          readOnly && 'opacity-90',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1">
          <button
            type="button"
            disabled={readOnly}
            onClick={() => onHasFixedTeamsChange(!hasFixedTeams)}
            className={[
              'col-span-2 flex min-w-0 items-start gap-2 rounded-lg py-0.5 text-left outline-none transition-colors',
              !readOnly &&
                'cursor-pointer active:bg-black/[0.03] dark:active:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900',
              readOnly && 'cursor-default',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label={`${t('games.fixedTeams')}. ${description}`}
          >
            <Lock size={15} className="mt-0.5 shrink-0 text-primary-600 dark:text-primary-400" aria-hidden />
            <span className="min-w-0 flex-1 break-words text-sm font-semibold text-gray-900 dark:text-white">
              {t('games.fixedTeams')}
            </span>
          </button>
          <div className="shrink-0 justify-self-end pt-0.5">
            <ToggleSwitch checked={hasFixedTeams} onChange={onHasFixedTeamsChange} disabled={readOnly} />
          </div>
          <p className="col-span-2 row-start-2 min-w-0 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            {description}
          </p>
        </div>
      </div>
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
