import { useTranslation } from 'react-i18next';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { BracketCustomByePicker } from './BracketCustomByePicker';
import { byeCountForEntrants, supportsThirdPlaceMatch } from '@/utils/customByeSeedRanks.util';
import { supportsConsolationBracket } from '@/utils/consolationBracket.util';
import { supportsDoubleElimination } from '@/utils/doubleElimBracket.util';

interface BracketPhase4CreateOptionsProps {
  entrantCount: number;
  includeThirdPlace: boolean;
  onIncludeThirdPlaceChange: (value: boolean) => void;
  includeConsolationBracket?: boolean;
  onIncludeConsolationBracketChange?: (value: boolean) => void;
  includeDoubleElimination?: boolean;
  onIncludeDoubleEliminationChange?: (value: boolean) => void;
  customByeEnabled: boolean;
  onCustomByeEnabledChange: (value: boolean) => void;
  customByeSeedRanks: number[];
  onCustomByeSeedRanksChange: (ranks: number[]) => void;
  seedLabels?: Record<number, string>;
}

function Phase4Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <div className="px-3 py-1 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200 min-w-0 pr-2">
          {label}
        </span>
        <div className="flex-shrink-0">
          <ToggleSwitch checked={checked} onChange={onChange} />
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>
    </div>
  );
}

export function BracketPhase4CreateOptions({
  entrantCount,
  includeThirdPlace,
  onIncludeThirdPlaceChange,
  includeConsolationBracket = false,
  onIncludeConsolationBracketChange,
  includeDoubleElimination = false,
  onIncludeDoubleEliminationChange,
  customByeEnabled,
  onCustomByeEnabledChange,
  customByeSeedRanks,
  onCustomByeSeedRanksChange,
  seedLabels,
}: BracketPhase4CreateOptionsProps) {
  const { t } = useTranslation();
  const byeCount = byeCountForEntrants(entrantCount);
  const showThird = supportsThirdPlaceMatch(entrantCount);
  const showConsolation = supportsConsolationBracket(entrantCount, customByeSeedRanks);
  const showDoubleElim = supportsDoubleElimination(entrantCount, customByeSeedRanks);
  if (!showThird && !showConsolation && !showDoubleElim && byeCount <= 0) return null;

  return (
    <div className="space-y-3">
      {showDoubleElim && onIncludeDoubleEliminationChange && (
        <Phase4Toggle
          checked={includeDoubleElimination}
          onChange={(on) => {
            onIncludeDoubleEliminationChange(on);
            if (on && onIncludeConsolationBracketChange) onIncludeConsolationBracketChange(false);
          }}
          label={t('gameDetails.bracketDoubleElimination')}
          hint={t('gameDetails.bracketDoubleEliminationHint', {
            defaultValue: 'Losers drop to a second bracket; grand final if winners-bracket champion loses once.',
          })}
        />
      )}
      {showConsolation && onIncludeConsolationBracketChange && (
        <Phase4Toggle
          checked={includeConsolationBracket}
          onChange={(on) => {
            onIncludeConsolationBracketChange(on);
            if (on && onIncludeDoubleEliminationChange) onIncludeDoubleEliminationChange(false);
          }}
          label={t('gameDetails.bracketConsolationBracket')}
          hint={t('gameDetails.bracketConsolationBracketHint', {
            defaultValue: 'First-round knockout losers play a separate mini-bracket.',
          })}
        />
      )}
      {showThird && (
        <Phase4Toggle
          checked={includeThirdPlace}
          onChange={onIncludeThirdPlaceChange}
          label={t('gameDetails.bracketThirdPlaceMatch')}
          hint={t('gameDetails.bracketThirdPlaceMatchHint', {
            defaultValue: 'Semifinal losers play one extra match for bronze.',
          })}
        />
      )}
      <BracketCustomByePicker
        entrantCount={entrantCount}
        byeCount={byeCount}
        enabled={customByeEnabled}
        onEnabledChange={onCustomByeEnabledChange}
        selectedRanks={customByeSeedRanks}
        onSelectedRanksChange={onCustomByeSeedRanksChange}
        seedLabels={seedLabels}
      />
    </div>
  );
}
