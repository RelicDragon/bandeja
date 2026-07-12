import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SegmentedSwitch } from '@/components/SegmentedSwitch';
import type { AutomaticMatchRecordMode } from '@/utils/scoring/automaticRelaxedScoring';

type MatchRecordSwitchProps = {
  mode: AutomaticMatchRecordMode;
  onChange: (mode: AutomaticMatchRecordMode) => void;
};

export function AutomaticMatchRecordModeSwitch({ mode, onChange }: MatchRecordSwitchProps) {
  const { t } = useTranslation();

  const tabs = useMemo(
    () => [
      { id: 'GAMES', label: t('gameResults.scoreEntryModeGames') },
      { id: 'AMERICANO_POINTS', label: t('gameResults.scoreEntryModeAmericanoPoints') },
    ],
    [t],
  );

  return (
    <div className="mt-2.5">
      <p className="mb-1.5 text-xs text-gray-500 dark:text-gray-400">
        {t('gameResults.automaticMatchRecordHint')}
      </p>
      <SegmentedSwitch
        tabs={tabs}
        activeId={mode}
        onChange={(id) => onChange(id as AutomaticMatchRecordMode)}
        showOnlyActiveTabText={false}
        layoutId="automatic-match-record-mode"
        className="w-full"
        fullWidth
        ariaLabel={t('gameResults.automaticMatchRecordHint')}
      />
    </div>
  );
}

type DeciderSwitchProps = {
  matchRecordMode: AutomaticMatchRecordMode;
  useSuperTiebreak: boolean;
  onChange: (useSuperTiebreak: boolean) => void;
};

export function AutomaticDeciderSetModeSwitch({
  matchRecordMode,
  useSuperTiebreak,
  onChange,
}: DeciderSwitchProps) {
  const { t } = useTranslation();

  const tabs = useMemo(
    () => [
      {
        id: 'MATCH_MODE',
        label:
          matchRecordMode === 'AMERICANO_POINTS'
            ? t('gameResults.scoreEntryModeAmericanoPoints')
            : t('gameResults.scoreEntryModeGames'),
      },
      { id: 'SUPER_TIEBREAK', label: t('gameResults.scoreEntryModeSuperTiebreak') },
    ],
    [matchRecordMode, t],
  );

  return (
    <div className="mt-2.5">
      <SegmentedSwitch
        tabs={tabs}
        activeId={useSuperTiebreak ? 'SUPER_TIEBREAK' : 'MATCH_MODE'}
        onChange={(id) => onChange(id === 'SUPER_TIEBREAK')}
        showOnlyActiveTabText={false}
        layoutId="automatic-decider-set-mode"
        className="w-full"
        fullWidth
        ariaLabel={t('gameResults.automaticDeciderSetHint')}
      />
    </div>
  );
}
