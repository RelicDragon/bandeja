import { useTranslation } from 'react-i18next';
import { SegmentedSwitch } from '@/components/SegmentedSwitch';
import type { LeagueRound } from '@/api/leagues';
import { resolveBracketRoundPickerLabel } from '@/utils/bracketRoundDisplay.util';

interface BracketRoundPickerProps {
  rounds: LeagueRound[];
  selectedRoundId: string;
  onSelect: (roundId: string) => void;
  layoutIdPrefix: string;
  /** Title from loaded bracket slots for the selected round (UX-A15). */
  selectedRoundSlotTitle?: string | null;
}

function roundGenericLabel(
  round: LeagueRound,
  t: (key: string, opts?: Record<string, unknown>) => string
): string {
  return `${t('gameDetails.round')} ${round.orderIndex + 1}`;
}

function roundLabel(
  round: LeagueRound,
  selectedRoundId: string,
  selectedRoundSlotTitle: string | null | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string
): string {
  const generic = roundGenericLabel(round, t);
  if (round.id !== selectedRoundId) return generic;
  return resolveBracketRoundPickerLabel(round, selectedRoundSlotTitle, generic);
}

export function BracketRoundPicker({
  rounds,
  selectedRoundId,
  onSelect,
  layoutIdPrefix,
  selectedRoundSlotTitle,
}: BracketRoundPickerProps) {
  const { t } = useTranslation();
  if (rounds.length <= 1) return null;

  if (rounds.length <= 4) {
    return (
      <div className="flex w-full justify-center overflow-x-auto">
        <SegmentedSwitch
          tabs={rounds.map((r) => ({
            id: r.id,
            label: roundLabel(r, selectedRoundId, selectedRoundSlotTitle, t),
          }))}
          activeId={selectedRoundId}
          onChange={onSelect}
          showOnlyActiveTabText={false}
          layoutId={`${layoutIdPrefix}-bracket-round`}
          className="w-fit max-w-full"
        />
      </div>
    );
  }

  return (
    <div className="flex justify-center">
      <label className="sr-only" htmlFor={`${layoutIdPrefix}-bracket-round-select`}>
        {t('gameDetails.bracketRoundPickerLabel')}
      </label>
      <select
        id={`${layoutIdPrefix}-bracket-round-select`}
        value={selectedRoundId}
        onChange={(e) => onSelect(e.target.value)}
        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
      >
        {rounds.map((r) => (
          <option key={r.id} value={r.id}>
            {roundLabel(r, selectedRoundId, selectedRoundSlotTitle, t)}
          </option>
        ))}
      </select>
    </div>
  );
}
