import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { BracketCustomByePicker } from './BracketCustomByePicker';
import { getPhase4CreateOptionsVisibility } from '@/features/leagueBracket';

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
  thirdPlaceMismatchHint?: string;
  consolationMismatchHint?: string;
  doubleEliminationMismatchHint?: string;
  onCopyThirdPlaceToOtherGroups?: () => void;
  onCopyConsolationToOtherGroups?: () => void;
  onCopyDoubleEliminationToOtherGroups?: () => void;
}

function Phase4Toggle({
  checked,
  onChange,
  label,
  hint,
  mismatchHint,
  copyLabel,
  onCopyToOtherGroups,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
  mismatchHint?: string;
  copyLabel: string;
  onCopyToOtherGroups?: () => void;
}) {
  const switchId = useId();
  const [scopeRevealed, setScopeRevealed] = useState(false);
  const hasMismatch = Boolean(mismatchHint && onCopyToOtherGroups);

  useEffect(() => {
    if (!hasMismatch) {
      setScopeRevealed(false);
      return;
    }
    const frame = requestAnimationFrame(() => {
      setScopeRevealed(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [hasMismatch]);

  const showScope = hasMismatch && scopeRevealed;

  return (
    <div className="px-3 py-1 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
      <div className="flex items-center justify-between mb-1">
        <label
          htmlFor={switchId}
          className="text-sm font-medium text-gray-800 dark:text-gray-200 min-w-0 pe-2 cursor-pointer"
        >
          {label}
        </label>
        <div className="flex-shrink-0">
          <ToggleSwitch id={switchId} checked={checked} onChange={onChange} />
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>
      <div
        className={`grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out motion-reduce:transition-none ${
          showScope
            ? 'mt-1.5 grid-rows-[1fr] opacity-100'
            : 'mt-0 grid-rows-[0fr] opacity-0'
        }`}
        aria-hidden={!showScope}
      >
        <div className="min-h-0 overflow-hidden">
          <p className="text-[11px] leading-snug text-red-600 dark:text-red-400">
            {mismatchHint}
          </p>
          <button
            type="button"
            onClick={onCopyToOtherGroups}
            disabled={!showScope}
            tabIndex={showScope ? 0 : -1}
            className="mt-0.5 text-xs font-medium text-primary-600 underline-offset-2 hover:underline disabled:pointer-events-none dark:text-primary-400"
          >
            {copyLabel}
          </button>
        </div>
      </div>
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
  thirdPlaceMismatchHint,
  consolationMismatchHint,
  doubleEliminationMismatchHint,
  onCopyThirdPlaceToOtherGroups,
  onCopyConsolationToOtherGroups,
  onCopyDoubleEliminationToOtherGroups,
}: BracketPhase4CreateOptionsProps) {
  const { t } = useTranslation();
  const { showThird, showConsolation, showDoubleElim, byeCount } = getPhase4CreateOptionsVisibility(
    entrantCount,
    customByeSeedRanks
  );
  if (!showThird && !showConsolation && !showDoubleElim && byeCount <= 0) return null;
  const copyLabel = t('gameDetails.bracketSettingCopyToOtherGroups', {
    defaultValue: 'Copy to other groups',
  });

  return (
    <div className="space-y-3">
      {showDoubleElim && onIncludeDoubleEliminationChange && (
        <Phase4Toggle
          checked={includeDoubleElimination}
          onChange={(on) => {
            onIncludeDoubleEliminationChange(on);
            if (on) {
              if (onIncludeConsolationBracketChange) onIncludeConsolationBracketChange(false);
              onIncludeThirdPlaceChange(false);
            }
          }}
          label={t('gameDetails.bracketDoubleElimination')}
          hint={t('gameDetails.bracketDoubleEliminationHint', {
            defaultValue: 'Losers drop to a second bracket; grand final if winners-bracket champion loses once.',
          })}
          mismatchHint={doubleEliminationMismatchHint}
          copyLabel={copyLabel}
          onCopyToOtherGroups={onCopyDoubleEliminationToOtherGroups}
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
          mismatchHint={consolationMismatchHint}
          copyLabel={copyLabel}
          onCopyToOtherGroups={onCopyConsolationToOtherGroups}
        />
      )}
      {showThird && (
        <Phase4Toggle
          checked={includeThirdPlace}
          onChange={(on) => {
            onIncludeThirdPlaceChange(on);
            if (on && onIncludeDoubleEliminationChange) {
              onIncludeDoubleEliminationChange(false);
            }
          }}
          label={t('gameDetails.bracketThirdPlaceMatch')}
          hint={t('gameDetails.bracketThirdPlaceMatchHint', {
            defaultValue: 'Semifinal losers play one extra match for bronze.',
          })}
          mismatchHint={thirdPlaceMismatchHint}
          copyLabel={copyLabel}
          onCopyToOtherGroups={onCopyThirdPlaceToOtherGroups}
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
