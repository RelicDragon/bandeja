/**
 * "When and where" editor → courts, in the court-slot model: which courts
 * (ordered; the first is the game's main court). Never how many — the roster
 * decides that (players ÷ players per court); courts the organizer hasn't
 * picked are "Any court" slots. Picking a court when the game already has all
 * it needs swaps out the last one that can move. A court holding a linked
 * booking can't be dropped here: it moves with the time (or is removed from
 * the court sheet). Bookings themselves are made on the game page.
 */
import { useTranslation } from 'react-i18next';
import { LayoutGrid, Lock } from 'lucide-react';
import type { Court } from '@/types';
import { LocationTimeStepHeader } from '@/components/gameLocationTime/LocationTimeStepHeader';

export type EditCourtSlotsPickerProps = {
  courts: readonly Court[];
  selectedIds: readonly string[];
  /** Courts with a linked booking (cannot be deselected). */
  lockedIds: ReadonlySet<string>;
  onToggle: (courtId: string) => void;
  /** Courts the roster needs. */
  need: number;
  /** Every court is locked (linked bookings are moving with the time). */
  locked?: boolean;
};

export function EditCourtSlotsPicker({ courts, selectedIds, lockedIds, onToggle, need, locked = false }: EditCourtSlotsPickerProps) {
  const { t } = useTranslation();
  const anyCount = Math.max(0, need - selectedIds.length);
  const tooMany = selectedIds.length > need;

  return (
    <section className="space-y-3" data-testid="edit-court-slots-picker">
      <LocationTimeStepHeader
        icon={LayoutGrid}
        title={need > 1 ? t('gameDetails.courts.pickerTitleMany') : t('gameDetails.courts.pickerTitleOne')}
        done={selectedIds.length > 0 && !tooMany}
      />
      <p className={`text-xs ${tooMany ? 'text-amber-700 dark:text-amber-300' : 'text-gray-500 dark:text-gray-400'}`} data-testid="edit-court-need">
        {locked
          ? t('gameDetails.courts.pickerLocked')
          : tooMany
            ? t('gameDetails.courts.pickerTooMany', { count: need })
            : need > 1
              ? t('gameDetails.courts.pickerNeedMany', { count: need })
              : t('gameDetails.courts.pickerNeedOne')}
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('gameDetails.courts.pickerTitleMany')}>
        {courts.map((court) => {
          const position = selectedIds.indexOf(court.id);
          const selected = position >= 0;
          const pinned = locked || (selected && lockedIds.has(court.id));
          return (
            <button
              key={court.id}
              type="button"
              aria-pressed={selected}
              aria-disabled={pinned || undefined}
              title={pinned && selected ? t('gameDetails.courts.linkedCourtLocked') : undefined}
              onClick={() => {
                if (!pinned) onToggle(court.id);
              }}
              className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                selected
                  ? 'border-primary-600 bg-primary-600 text-white'
                  : 'border-gray-200 bg-white text-gray-800 hover:border-primary-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'
              } ${pinned && !selected ? 'opacity-50' : ''}`}
            >
              {selected && need > 1 ? (
                <span className="text-xs font-semibold tabular-nums opacity-80" aria-hidden>
                  {position + 1}
                </span>
              ) : null}
              {court.name}
              {pinned && selected ? <Lock size={12} aria-hidden /> : null}
            </button>
          );
        })}
      </div>
      {anyCount > 0 && !locked ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">{t('gameDetails.courts.anyCourts', { count: anyCount })}</p>
      ) : null}
    </section>
  );
}
