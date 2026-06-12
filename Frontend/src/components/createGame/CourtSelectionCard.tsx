import { memo } from 'react';
import { Home } from 'lucide-react';
import { CourtOccupancyRing } from './CourtOccupancyRing';
import { resolveCourtNameParts } from '@/utils/courtDisplayName';
import type { Court } from '@/types';

const RING_SIZE = 28;

interface CourtSelectionCardProps {
  court?: Court;
  label?: string;
  selectId: string;
  selected: boolean;
  fillPercent?: number;
  loading?: boolean;
  selectionIndex?: number;
  disabled?: boolean;
  onSelectCourt: (id: string) => void;
}

export const CourtSelectionCard = memo(function CourtSelectionCard({
  court,
  label,
  selectId,
  selected,
  fillPercent = 0,
  loading = false,
  selectionIndex,
  disabled = false,
  onSelectCourt,
}: CourtSelectionCardProps) {
  const nameParts = court ? resolveCourtNameParts(court.name, court.integrationCourtName) : null;
  const primaryTextClass = selected
    ? 'text-primary-900 dark:text-primary-100'
    : 'text-gray-900 dark:text-gray-100';
  const secondaryTextClass = selected
    ? 'text-primary-700/80 dark:text-primary-300/80'
    : 'text-gray-500 dark:text-gray-400';
  const iconClass = selected
    ? 'text-primary-600 dark:text-primary-400'
    : 'text-gray-400';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelectCourt(selectId)}
      className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-colors min-w-0 ${
        disabled
          ? 'opacity-50 cursor-not-allowed border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60'
          : selected
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/40 ring-1 ring-primary-500/30'
            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 hover:border-primary-400 dark:hover:border-primary-600'
      }`}
    >
      <div className="flex-1 min-w-0">
        {court && nameParts ? (
          <>
            <div className="flex items-center gap-1 min-w-0">
              <span className={`text-xs font-medium leading-tight truncate ${primaryTextClass}`}>
                {nameParts.name}
              </span>
              {court.isIndoor && (
                <Home size={11} className={`shrink-0 ${iconClass}`} />
              )}
            </div>
            {nameParts.integrationName ? (
              <span className={`block text-[10px] leading-tight truncate mt-0.5 ${secondaryTextClass}`}>
                {nameParts.integrationName}
              </span>
            ) : null}
          </>
        ) : (
          <span className={`text-xs font-medium leading-tight line-clamp-2 ${
            selected ? 'text-primary-900 dark:text-primary-100' : 'text-gray-700 dark:text-gray-300'
          }`}
          >
            {label}
          </span>
        )}
      </div>
      {court ? (
        <div className="relative shrink-0">
          {selectionIndex != null && selected ? (
            <span className="absolute -top-1 -right-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-primary-600 text-[10px] font-semibold text-white">
              {selectionIndex}
            </span>
          ) : null}
          <CourtOccupancyRing
            percent={fillPercent}
            loading={loading}
            selected={selected}
            size={RING_SIZE}
          />
        </div>
      ) : (
        <div
          className="rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 shrink-0"
          style={{ width: RING_SIZE, height: RING_SIZE }}
        />
      )}
    </button>
  );
});
