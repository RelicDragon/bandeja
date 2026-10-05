/**
 * Edit drawer → Location & time → courts, in the court-slot model:
 * which courts (ordered; the first is the game's main court) and how many
 * courts the game uses in total. Courts beyond the picked ones are "Any
 * court" slots. A court holding a linked reservation cannot be dropped here
 * (unlink it from the Courts card first). Reservations themselves are made
 * on the game page, never here.
 */
import { useTranslation } from 'react-i18next';
import { LayoutGrid, Lock, Minus, Plus } from 'lucide-react';
import type { Court } from '@/types';
import { LocationTimeStepHeader } from '@/components/gameLocationTime/LocationTimeStepHeader';

export type EditCourtSlotsPickerProps = {
  courts: readonly Court[];
  selectedIds: readonly string[];
  /** Courts with a linked reservation (cannot be deselected). */
  lockedIds: ReadonlySet<string>;
  onToggle: (courtId: string) => void;
  /** Total courts (picked + any). */
  count: number;
  onCountChange: (count: number) => void;
  maxCount?: number;
};

export function EditCourtSlotsPicker({
  courts,
  selectedIds,
  lockedIds,
  onToggle,
  count,
  onCountChange,
  maxCount = 16,
}: EditCourtSlotsPickerProps) {
  const { t } = useTranslation();
  const min = Math.max(1, selectedIds.length);
  const anyCount = Math.max(0, count - selectedIds.length);
  const stepBtn =
    'flex h-11 w-11 items-center justify-center rounded-full text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-40 dark:text-gray-200 dark:hover:bg-gray-700';

  return (
    <section className="space-y-3" data-testid="edit-court-slots-picker">
      <LocationTimeStepHeader
        icon={LayoutGrid}
        title={t('gameDetails.courts.pickerTitle')}
        done={selectedIds.length > 0}
      />
      <p className="text-xs text-gray-500 dark:text-gray-400">{t('gameDetails.courts.pickerHint')}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('gameDetails.courts.pickerTitle')}>
        {courts.map((court) => {
          const position = selectedIds.indexOf(court.id);
          const selected = position >= 0;
          const locked = selected && lockedIds.has(court.id);
          return (
            <button
              key={court.id}
              type="button"
              aria-pressed={selected}
              aria-disabled={locked || undefined}
              title={locked ? t('gameDetails.courts.linkedCourtLocked') : undefined}
              onClick={() => {
                if (!locked) onToggle(court.id);
              }}
              className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                selected
                  ? 'border-primary-600 bg-primary-600 text-white'
                  : 'border-gray-200 bg-white text-gray-800 hover:border-primary-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'
              }`}
            >
              {selected ? (
                <span className="text-xs font-semibold tabular-nums opacity-80" aria-hidden>
                  {position + 1}
                </span>
              ) : null}
              {court.name}
              {locked ? <Lock size={12} aria-hidden /> : null}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-3" data-testid="edit-court-count">
        <span className="min-w-0 text-sm text-gray-700 dark:text-gray-200">
          {t('gameDetails.courts.count')}
          {anyCount > 0 ? (
            <span className="block text-xs text-gray-500 dark:text-gray-400">
              {t('gameDetails.courts.anyCourts', { count: anyCount })}
            </span>
          ) : null}
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            className={stepBtn}
            aria-label={t('gameDetails.courts.fewer')}
            disabled={count <= min}
            onClick={() => onCountChange(count - 1)}
          >
            <Minus size={16} aria-hidden />
          </button>
          <span className="w-6 text-center text-sm font-semibold tabular-nums text-gray-900 dark:text-white" aria-live="polite">
            {count}
          </span>
          <button
            type="button"
            className={stepBtn}
            aria-label={t('gameDetails.courts.more')}
            disabled={count >= maxCount}
            onClick={() => onCountChange(count + 1)}
          >
            <Plus size={16} aria-hidden />
          </button>
        </span>
      </div>
    </section>
  );
}
