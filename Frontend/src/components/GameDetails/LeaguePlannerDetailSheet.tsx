import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { X, ExternalLink, CalendarClock } from 'lucide-react';
import type { LeaguePlannerUnscheduledGame } from '@/api/leagues';
import { useDesktop } from '@/hooks/useDesktop';

export interface LeaguePlannerDetailSheetProps {
  isOpen: boolean;
  onClose: () => void;
  dateLabel: string;
  bucketLabel: string;
  freeCount: number;
  busyCount: number;
  unknownCount: number;
  totalInView: number;
  schedulableGameIds: string[];
  unscheduledGames: LeaguePlannerUnscheduledGame[];
  peopleLayer: boolean;
  matchesLayer: boolean;
}

export const LeaguePlannerDetailSheet = ({
  isOpen,
  onClose,
  dateLabel,
  bucketLabel,
  freeCount,
  busyCount,
  unknownCount,
  totalInView,
  schedulableGameIds,
  unscheduledGames,
  peopleLayer,
  matchesLayer,
}: LeaguePlannerDetailSheetProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isDesktop = useDesktop();
  const panelRef = useRef<HTMLDivElement>(null);
  const useDialog = isDesktop;

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const gameById = new Map(unscheduledGames.map((g) => [g.id, g]));
  const schedulable = schedulableGameIds.map((id) => gameById.get(id)).filter(Boolean) as LeaguePlannerUnscheduledGame[];

  const shell = (
    <div
      className={
        useDialog
          ? 'fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-4'
          : 'fixed inset-0 z-[200] flex items-end justify-center'
      }
    >
      <button
        type="button"
        className="absolute inset-0 z-0 border-0 bg-black/45 p-0 dark:bg-black/60"
        aria-label={t('common.close')}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        onMouseDown={(e) => e.stopPropagation()}
        className={[
          'relative z-[1] flex w-full max-h-[min(88vh,640px)] flex-col overflow-hidden rounded-t-2xl border border-gray-200/90 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900',
          useDialog ? 'sm:max-w-md sm:rounded-2xl' : 'max-w-2xl sm:rounded-2xl',
        ].join(' ')}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-primary-600 dark:text-primary-400">
              <CalendarClock className="h-5 w-5 shrink-0" />
              <span className="text-xs font-semibold uppercase tracking-wide">{t('gameDetails.planner.sheetTitle')}</span>
            </div>
            <h2 className="mt-1 truncate text-lg font-semibold text-gray-900 dark:text-white">{dateLabel}</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">{bucketLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            aria-label={t('common.close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-4">
          <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-3 dark:border-gray-800 dark:bg-gray-800/40">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t('gameDetails.planner.layerBreakdown')}
            </p>
            <ul className="mt-2 space-y-1.5 text-sm text-gray-800 dark:text-gray-200">
              <li>
                <span className="font-medium">{t('gameDetails.planner.layerPeople')}:</span>{' '}
                {peopleLayer
                  ? t('gameDetails.planner.peopleCounts', { free: freeCount, busy: busyCount, unknown: unknownCount, total: totalInView })
                  : t('gameDetails.planner.layerOff')}
              </li>
              <li>
                <span className="font-medium">{t('gameDetails.planner.layerMatches')}:</span>{' '}
                {matchesLayer
                  ? schedulable.length > 0
                    ? t('gameDetails.planner.matchesPossible', { count: schedulable.length })
                    : t('gameDetails.planner.matchesNone')
                  : t('gameDetails.planner.layerOff')}
              </li>
            </ul>
          </div>

          {matchesLayer && schedulable.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {t('gameDetails.planner.unscheduledTitle')}
              </p>
              <ul className="mt-2 space-y-2">
                {schedulable.map((g) => (
                  <li
                    key={g.id}
                    className="flex flex-col gap-2 rounded-xl border border-emerald-200/70 bg-emerald-50/50 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/25"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {t('gameDetails.planner.roundGame', { round: g.roundOrderIndex + 1 })}
                      </p>
                      <p className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">
                        {g.sideALabel}{' '}
                        <span className="text-gray-400 dark:text-gray-500">{t('gameDetails.fixtureVsShort')}</span>{' '}
                        {g.sideBLabel}
                      </p>
                      {g.groupName && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{g.groupName}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      data-fixture-primary-action
                      onClick={() => {
                        navigate(`/games/${g.id}`);
                        onClose();
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {t('gameDetails.planner.openGame')}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(shell, document.body);
};
