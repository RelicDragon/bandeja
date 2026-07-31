import { useTranslation } from 'react-i18next';
import type { BracketPlan } from '@/utils/bracketStructure';
import {
  buildConsolationPreviewColumns,
  buildDoubleEliminationPreviewColumns,
  type BracketAdvancedPreviewColumn,
  type BracketPreviewFeeder,
} from '@/utils/bracketAdvancedPreview.util';

interface BracketAdvancedPhasePreviewProps {
  plan: BracketPlan;
  includeConsolationBracket?: boolean;
  includeDoubleElimination?: boolean;
}

function PreviewMatch({
  feederA,
  feederB,
}: {
  feederA: BracketPreviewFeeder;
  feederB: BracketPreviewFeeder;
}) {
  const { t } = useTranslation();
  const label = (feeder: BracketPreviewFeeder) =>
    t(
      feeder.outcome === 'winner'
        ? 'gameDetails.bracketPreviewWinnerOf'
        : 'gameDetails.bracketPreviewLoserOf',
      {
        defaultValue: feeder.outcome === 'winner' ? 'Winner {{match}}' : 'Loser {{match}}',
        match: feeder.match,
      }
    );

  return (
    <div className="min-w-[8.5rem] overflow-hidden rounded-lg border border-gray-200 bg-white text-xs dark:border-gray-700 dark:bg-gray-800">
      <div className="truncate px-2 py-1.5 text-gray-700 dark:text-gray-200">{label(feederA)}</div>
      <div className="border-t border-gray-200 px-2 py-1.5 text-gray-700 dark:border-gray-700 dark:text-gray-200">
        <span className="block truncate">{label(feederB)}</span>
      </div>
    </div>
  );
}

function PreviewColumns({
  columns,
  label,
}: {
  columns: BracketAdvancedPreviewColumn[];
  label: (roundNumber: number, isFinal: boolean) => string;
}) {
  return (
    <div className="flex gap-4 overflow-x-auto px-2 pb-2">
      {columns.map((column, index) => (
        <section key={column.id} className="flex min-w-[8.5rem] shrink-0 flex-col gap-2">
          <h5 className="text-center text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
            {label(column.roundNumber, index === columns.length - 1)}
          </h5>
          {column.matches.map((match) => (
            <PreviewMatch
              key={match.id}
              feederA={match.feederA}
              feederB={match.feederB}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

export function BracketAdvancedPhasePreview({
  plan,
  includeConsolationBracket,
  includeDoubleElimination,
}: BracketAdvancedPhasePreviewProps) {
  const { t } = useTranslation();

  if (includeDoubleElimination) {
    const columns = buildDoubleEliminationPreviewColumns(plan.mainRounds);
    if (columns.length === 0) return null;
    const lowerFinalColumn = columns[columns.length - 1];
    const lowerFinal = lowerFinalColumn?.matches[0];
    return (
      <div className="space-y-3 border-t border-gray-200 pt-3 dark:border-gray-700">
        <h4 className="text-center text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
          {t('gameDetails.bracketTabLosers', { defaultValue: 'Losers bracket' })}
        </h4>
        <PreviewColumns
          columns={columns}
          label={(roundNumber, isFinal) =>
            isFinal
              ? t('gameDetails.bracketLosersFinal', { defaultValue: 'Losers final' })
              : t('gameDetails.bracketLosersRound', {
                  defaultValue: 'Losers round {{round}}',
                  round: roundNumber,
                })
          }
        />
        {lowerFinal ? (
          <div className="space-y-2 px-2">
            <h4 className="text-center text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
              {t('gameDetails.bracketTabGrandFinal', { defaultValue: 'Grand final' })}
            </h4>
            <div className="mx-auto flex w-fit gap-4 overflow-x-auto pb-1">
              <div className="space-y-1">
                <p className="text-center text-[10px] font-medium uppercase text-gray-500">
                  {t('gameDetails.bracketGrandFinalFirst', { defaultValue: 'Grand final' })}
                </p>
                <PreviewMatch
                  feederA={{ outcome: 'winner', match: 'F' }}
                  feederB={{
                    outcome: 'winner',
                    match: `LB${lowerFinalColumn?.roundNumber ?? columns.length}-1`,
                  }}
                />
              </div>
              <div className="space-y-1">
                <p className="text-center text-[10px] font-medium uppercase text-gray-500">
                  {t('gameDetails.bracketGrandFinalReset', {
                    defaultValue: 'Reset final if required',
                  })}
                </p>
                <PreviewMatch
                  feederA={{ outcome: 'loser', match: 'GF1' }}
                  feederB={{ outcome: 'winner', match: 'GF1' }}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (includeConsolationBracket) {
    const columns = buildConsolationPreviewColumns(plan.mainRounds);
    if (columns.length === 0) return null;
    return (
      <div className="space-y-3 border-t border-gray-200 pt-3 dark:border-gray-700">
        <h4 className="text-center text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
          {t('gameDetails.bracketTabConsolation', { defaultValue: 'Consolation bracket' })}
        </h4>
        <PreviewColumns
          columns={columns}
          label={(roundNumber, isFinal) =>
            isFinal
              ? t('gameDetails.bracketConsolationFinal', { defaultValue: 'Consolation final' })
              : t('gameDetails.bracketConsolationRound', {
                  defaultValue: 'Consolation round {{round}}',
                  round: roundNumber,
                })
          }
        />
      </div>
    );
  }

  return null;
}
