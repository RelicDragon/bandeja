import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { CalendarDays, CalendarRange, Loader2 } from 'lucide-react';
import {
  Drawer,
  DrawerCloseButton,
  DrawerContent,
  DrawerHandle,
} from '@/components/ui/Drawer';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import { isDocumentRtl, isRovingNavKey, nextRovingIndex } from '@/utils/rovingFocus';
import { seriesApi, type SeriesEditScope } from '@/api/series';
import { useSeriesDetail } from './useSeries';

/**
 * PRD 345 — "Apply to · This game · This and future games".
 *
 * Shown after a successful `EditGameInfoModal` save on an occurrence the viewer
 * organizes. "This game" is already done by the time this opens — the edit was
 * saved normally — so choosing it just closes. "This and future games" pushes
 * the same field patch onto the series template and re-applies it to every
 * unstarted occurrence with `resultsStatus === 'NONE'`; the response lists the
 * ones it had to leave alone, which becomes the one-line note.
 */

export interface SeriesScopeSheetProps {
  open: boolean;
  seriesId: string;
  /** The same field patch that was just saved on this occurrence. */
  templatePatch: Record<string, unknown>;
  onDone: () => void;
}

const MODAL_ID = 'series-scope-sheet';

export const SeriesScopeSheet = ({
  open,
  seriesId,
  templatePatch,
  onDone,
}: SeriesScopeSheetProps) => {
  const { t } = useTranslation();
  const [applying, setApplying] = useState(false);
  const [scope, setScope] = useState<SeriesEditScope>('occurrence');
  const groupRef = useRef<HTMLDivElement>(null);
  useBackButtonModal(open, onDone, MODAL_ID);

  /*
   * PRD 345 — "a one-line note listing occurrences that will be skipped because
   * results already started". It has to be readable *before* the tap, so the
   * count comes from the series detail (already cached by the series page and
   * the organizer strip) rather than from the apply response. The server is
   * still the authority: `scope: 'future'` re-checks every occurrence and
   * returns what it actually left alone.
   */
  const { data: detail } = useSeriesDetail(open ? seriesId : null);
  const lockedCount = useMemo(
    () => (detail?.upcoming ?? []).filter((game) => game.resultsStatus !== 'NONE').length,
    [detail?.upcoming],
  );

  const handleApply = useCallback(async () => {
    if (scope === 'occurrence') {
      onDone();
      return;
    }
    setApplying(true);
    try {
      const response = await seriesApi.update(seriesId, {
        template: templatePatch,
        scope: 'future',
      });
      const { updatedGameIds } = response.data.data;
      toast.success(t('series.scopeAppliedNote', { count: updatedGameIds.length }));
      onDone();
    } catch {
      toast.error(t('series.saveError'));
    } finally {
      setApplying(false);
    }
  }, [onDone, scope, seriesId, t, templatePatch]);

  const options: { id: SeriesEditScope; label: string; icon: typeof CalendarDays }[] = [
    { id: 'occurrence', label: t('series.scopeThisGame'), icon: CalendarDays },
    { id: 'future', label: t('series.scopeThisAndFuture'), icon: CalendarRange },
  ];

  // PRD 345 — "scope switches support arrow keys". A `role="radiogroup"` is one
  // tab stop: Arrow / Home / End move focus *and* selection, exactly like
  // `components/pairs/PairSortChips.tsx`.
  const handleScopeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isRovingNavKey(event.key)) return;
    const radios = groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    if (!radios || radios.length === 0) return;
    const list = Array.from(radios);
    const focused = list.indexOf(document.activeElement as HTMLButtonElement);
    const target = nextRovingIndex({
      key: event.key,
      currentIndex: focused >= 0 ? focused : options.findIndex((option) => option.id === scope),
      enabled: list.map(() => true),
      rtl: isDocumentRtl(),
      // Deliberately both axes: WAI-ARIA defines Up/Down *and* Left/Right on a
      // `radiogroup`, unlike a `tablist`, which owns only its own axis.
      orientation: 'both',
    });
    if (target == null) return;
    const option = options[target];
    if (!option) return;
    event.preventDefault();
    setScope(option.id);
    list[target]?.focus();
  };

  return (
    <Drawer
      open={open}
      handleOnly
      onOpenChange={(next) => {
        if (!next) onDone();
      }}
    >
      <DrawerContent
        className="flex flex-col overflow-hidden bg-white dark:bg-gray-900"
        aria-labelledby={`${MODAL_ID}-title`}
      >
        <DrawerHandle className="relative mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-gray-300/90 dark:bg-gray-600" />
        <div data-overlay-chrome="" className="flex shrink-0 items-center gap-3 px-4 pb-2 pt-3">
          <h2
            id={`${MODAL_ID}-title`}
            className="min-w-0 flex-1 text-start text-lg font-semibold tracking-tight text-gray-900 dark:text-white"
          >
            {t('series.scopeTitle')}
          </h2>
          <DrawerCloseButton aria-label={t('common.close')} className="shrink-0" />
        </div>

        <div
          ref={groupRef}
          className="flex flex-col gap-2 px-4"
          role="radiogroup"
          aria-label={t('series.scopeTitle')}
          aria-orientation="vertical"
          onKeyDown={handleScopeKeyDown}
        >
          {options.map((option) => {
            const Icon = option.icon;
            const selected = scope === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => setScope(option.id)}
                className={`flex min-h-[44px] items-center gap-3 rounded-xl border px-3 py-2 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                  selected
                    ? 'border-primary-500 bg-primary-50 text-primary-900 dark:bg-primary-950/40 dark:text-primary-100'
                    : 'border-gray-200 text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-800/60'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{option.label}</span>
              </button>
            );
          })}
        </div>

        {scope === 'future' && lockedCount > 0 && (
          <p className="mx-4 mt-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            {t('series.scopeLockedNote', { count: lockedCount })}
          </p>
        )}

        <p className="px-4 pt-2 text-xs text-gray-500 dark:text-gray-400">
          {t('series.regularsHint')}
        </p>

        <div
          className="px-4 pt-3"
          style={{ paddingBottom: 'calc(0.75rem + var(--overlay-bottom-inset, 0px))' }}
        >
          <button
            type="button"
            onClick={handleApply}
            disabled={applying}
            aria-busy={applying}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary-600 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-60"
          >
            {applying && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {t('series.scopeApply')}
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
};
