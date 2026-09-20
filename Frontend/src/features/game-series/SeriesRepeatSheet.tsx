import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { CalendarRange, Loader2, Minus, Plus } from 'lucide-react';
import {
  Drawer,
  DrawerCloseButton,
  DrawerContent,
  DrawerHandle,
} from '@/components/ui/Drawer';
import { OverlayKeyboardBody } from '@/components/ui/OverlayKeyboardBody';
import { SegmentedSwitch } from '@/components/SegmentedSwitch';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import {
  SEAT_DEADLINE_CHOICES,
  seriesApi,
  type SeatDeadlineChoice,
  type SeriesCadence,
} from '@/api/series';
import {
  formatDayKey,
  formatLocalTime,
  formatWeekdayName,
  weekdayOrderForLocale,
} from './seriesFormat';

/**
 * PRD 345 — the organizer "Repeat this game" sheet.
 *
 * One sheet serves both entry points: **Make this a weekly game** on a one-off
 * game (`create`, `POST /games/:id/series`) and **Edit series** on an
 * occurrence (`edit`, `PATCH /series/:id`). The contents are the PRD's list top
 * to bottom — cadence, weekday chips, read-only time, Until, Regulars with a
 * per-player keep toggle, the seat-deadline stepper, "Save series", helper line.
 *
 * Keyboard contract (CONTRACT §7.3): `DrawerContent` already carries
 * `cap-keyboard-aware-sheet`; the scrollable body is `OverlayKeyboardBody` so
 * the header sticks, and the primary action sits above
 * `var(--overlay-bottom-inset)` rather than a hard-coded inset.
 */

/**
 * `ToggleSwitch` takes no accessible name, and a `<label for>` cannot name a
 * `role="switch"` button — so the per-player keep toggle carries its own
 * `aria-label` ("Keep as regular — Ana").
 *
 * The visible track stays 28 × 48 px, but the **button** is 44 px tall with the
 * extra height as transparent padding: in a dense regulars list a 28 px target
 * is 16 px short on its vertical axis and mis-taps land on the next row
 * (CONTRACT §7.1).
 *
 * The thumb travels with `margin-inline-start`, not `translateX`, so it moves
 * toward the track's *trailing* edge in `ar` the way the switch actually reads.
 */
const KeepRegularToggle = ({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className="group inline-flex h-11 shrink-0 items-center px-0 focus:outline-none"
  >
    <span
      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 group-focus-visible:ring-2 group-focus-visible:ring-primary-500 group-focus-visible:ring-offset-2 dark:group-focus-visible:ring-offset-gray-900 ${
        checked ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'
      }`}
      aria-hidden
    >
      <span
        className="inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-[margin] duration-200 ease-out motion-reduce:transition-none"
        style={{ marginInlineStart: checked ? '1.5rem' : '0.25rem' }}
      />
    </span>
  </button>
);

export interface SeriesRepeatSheetRegular {
  userId: string;
  name: string;
  avatar?: string | null;
}

export interface SeriesRepeatSheetInitial {
  cadence: SeriesCadence;
  /** ISO-8601 weekday, 1 = Monday. */
  weekday: number;
  /** `HH:mm`, club-local. Read-only here by design. */
  startTimeLocal: string;
  endsOn: string | null;
  seatDeadlineHours: number;
  horizonDays: number;
}

export interface SeriesRepeatSheetProps {
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  /** `create` mode only — the game that becomes occurrence #1. */
  gameId?: string;
  /** `edit` mode only. */
  seriesId?: string;
  initial: SeriesRepeatSheetInitial;
  /** `create`: current PLAYING roster. `edit`: the active regulars. */
  regulars: SeriesRepeatSheetRegular[];
  /** Owner cap state — disables saving when the cap is already reached. */
  activeSeriesCount?: number;
  maxActiveSeries?: number;
  onManageSeries?: () => void;
  onSaved: (seriesId: string) => void;
}

const MODAL_ID = 'series-repeat-sheet';

export const SeriesRepeatSheet = ({
  open,
  onClose,
  mode,
  gameId,
  seriesId,
  initial,
  regulars,
  activeSeriesCount,
  maxActiveSeries,
  onManageSeries,
  onSaved,
}: SeriesRepeatSheetProps) => {
  const { t, i18n } = useTranslation();
  useBackButtonModal(open, onClose, MODAL_ID);

  const [cadence, setCadence] = useState<SeriesCadence>(initial.cadence);
  const [weekday, setWeekday] = useState<number>(initial.weekday);
  const [endsOn, setEndsOn] = useState<string>(initial.endsOn ?? '');
  const [seatDeadlineHours, setSeatDeadlineHours] = useState<SeatDeadlineChoice>(
    (SEAT_DEADLINE_CHOICES as readonly number[]).includes(initial.seatDeadlineHours)
      ? (initial.seatDeadlineHours as SeatDeadlineChoice)
      : 48,
  );
  const [keepIds, setKeepIds] = useState<string[]>(() => regulars.map((r) => r.userId));
  const [saving, setSaving] = useState(false);

  // Re-seed whenever the sheet is reopened for a different game / series.
  useEffect(() => {
    if (!open) return;
    setCadence(initial.cadence);
    setWeekday(initial.weekday);
    setEndsOn(initial.endsOn ?? '');
    setSeatDeadlineHours(
      (SEAT_DEADLINE_CHOICES as readonly number[]).includes(initial.seatDeadlineHours)
        ? (initial.seatDeadlineHours as SeatDeadlineChoice)
        : 48,
    );
    setKeepIds(regulars.map((r) => r.userId));
  }, [
    open,
    initial.cadence,
    initial.weekday,
    initial.endsOn,
    initial.seatDeadlineHours,
    regulars,
  ]);

  const locale = i18n.language;
  const weekdayOrder = useMemo(() => weekdayOrderForLocale(locale), [locale]);
  const capReached =
    mode === 'create' &&
    typeof activeSeriesCount === 'number' &&
    typeof maxActiveSeries === 'number' &&
    activeSeriesCount >= maxActiveSeries;

  const toggleKeep = useCallback((userId: string, next: boolean) => {
    setKeepIds((prev) =>
      next ? Array.from(new Set([...prev, userId])) : prev.filter((id) => id !== userId),
    );
  }, []);

  const stepDeadline = useCallback((direction: 1 | -1) => {
    setSeatDeadlineHours((prev) => {
      const index = SEAT_DEADLINE_CHOICES.indexOf(prev);
      const nextIndex = Math.min(
        SEAT_DEADLINE_CHOICES.length - 1,
        Math.max(0, index + direction),
      );
      return SEAT_DEADLINE_CHOICES[nextIndex];
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (saving || capReached) return;
    setSaving(true);
    try {
      if (mode === 'create') {
        if (!gameId) return;
        const response = await seriesApi.createFromGame(gameId, {
          cadence,
          weekday,
          endsOn: endsOn || null,
          seatDeadlineHours,
          keepRegularUserIds: keepIds,
        });
        toast.success(t('series.saved'));
        onSaved(response.data.data.seriesId);
      } else {
        if (!seriesId) return;
        await seriesApi.update(seriesId, {
          cadence,
          weekday,
          endsOn: endsOn || null,
          seatDeadlineHours,
          scope: 'future',
        });
        toast.success(t('series.saved'));
        onSaved(seriesId);
      }
      onClose();
    } catch {
      toast.error(t('series.saveError'));
    } finally {
      setSaving(false);
    }
  }, [
    cadence,
    capReached,
    endsOn,
    gameId,
    keepIds,
    mode,
    onClose,
    onSaved,
    saving,
    seatDeadlineHours,
    seriesId,
    t,
    weekday,
  ]);

  return (
    <Drawer
      open={open}
      handleOnly
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DrawerContent
        className="!mt-24 flex max-h-[85vh] flex-col overflow-hidden bg-white dark:bg-gray-900"
        aria-labelledby={`${MODAL_ID}-title`}
      >
        <DrawerHandle className="relative mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-gray-300/90 dark:bg-gray-600" />

        <div
          data-overlay-chrome=""
          className="flex shrink-0 items-center gap-3 px-4 pb-2 pt-3"
        >
          <h2
            id={`${MODAL_ID}-title`}
            className="min-w-0 flex-1 text-start text-lg font-semibold tracking-tight text-gray-900 dark:text-white"
          >
            {t('series.sheetTitle')}
          </h2>
          <DrawerCloseButton aria-label={t('common.close')} className="shrink-0" />
        </div>

        <OverlayKeyboardBody className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
          <section>
            <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
              {t('series.cadenceLabel')}
            </h3>
            <SegmentedSwitch
              layoutId={`${MODAL_ID}-cadence`}
              ariaLabel={t('series.cadenceAriaLabel')}
              fullWidth
              size="sm"
              showOnlyActiveTabText={false}
              activeId={cadence}
              onChange={(id) => setCadence(id as SeriesCadence)}
              tabs={[
                { id: 'WEEKLY', label: t('series.cadenceWeekly') },
                { id: 'BIWEEKLY', label: t('series.cadenceBiweekly') },
              ]}
            />
          </section>

          <section>
            <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
              {t('series.weekdayLabel')}
            </h3>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('series.weekdayLabel')}>
              {weekdayOrder.map((day) => {
                const selected = day === weekday;
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setWeekday(day)}
                    aria-pressed={selected}
                    className={`min-h-[44px] min-w-[44px] rounded-xl px-3 text-sm font-medium transition-colors ${
                      selected
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {formatWeekdayName(day, locale, 'short')}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">
                {t('series.timeLabel')}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('series.timeReadOnlyHint')}
              </p>
            </div>
            <span className="shrink-0 rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold tabular-nums text-gray-900 dark:bg-gray-800 dark:text-white">
              {formatLocalTime(initial.startTimeLocal, locale)}
            </span>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
              {t('series.until')}
            </h3>
            <div className="flex items-center gap-2">
              <label className="inline-flex min-h-[44px] flex-1 items-center gap-2 rounded-xl bg-gray-100 px-3 dark:bg-gray-800">
                <CalendarRange
                  className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400"
                  aria-hidden
                />
                <span className="sr-only">{t('series.until')}</span>
                <input
                  type="date"
                  value={endsOn}
                  onChange={(event) => setEndsOn(event.target.value)}
                  className="w-full bg-transparent text-sm text-gray-900 outline-none dark:text-white"
                />
              </label>
              {endsOn && (
                <button
                  type="button"
                  onClick={() => setEndsOn('')}
                  className="min-h-[44px] rounded-lg px-3 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  {t('series.untilClear')}
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {endsOn
                ? t('series.untilValue', { date: formatDayKey(endsOn, locale, 'dayMonth') })
                : t('series.untilNotSet')}
            </p>
          </section>

          {regulars.length > 0 && (
            <section>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">
                {t('series.regularsTitle')}
              </h3>
              <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                {t('series.regularsHint')}
              </p>
              <ul className="flex flex-col gap-1">
                {regulars.map((regular) => {
                  const keep = keepIds.includes(regular.userId);
                  return (
                    <li
                      key={regular.userId}
                      className="flex min-h-[44px] items-center gap-3 rounded-xl px-1 py-1"
                    >
                      {regular.avatar ? (
                        <img
                          src={regular.avatar}
                          alt=""
                          loading="lazy"
                          className="h-8 w-8 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-700 dark:bg-gray-600 dark:text-gray-100"
                          aria-hidden
                        >
                          {regular.name.trim()
                            ? [...regular.name.trim()][0].toLocaleUpperCase('und')
                            : '?'}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm text-gray-900 dark:text-white">
                        {regular.name}
                      </span>
                      <KeepRegularToggle
                        checked={keep}
                        onChange={(next) => toggleKeep(regular.userId, next)}
                        label={`${t('series.keepAsRegular')} — ${regular.name}`}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
              {t('series.seatDeadlineTitle')}
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => stepDeadline(-1)}
                disabled={seatDeadlineHours === SEAT_DEADLINE_CHOICES[0]}
                aria-label={t('series.seatDeadlineLess')}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-gray-700 disabled:opacity-40 dark:bg-gray-800 dark:text-gray-200"
              >
                <Minus className="h-4 w-4" aria-hidden />
              </button>
              <output
                className="flex-1 rounded-xl bg-gray-50 py-2.5 text-center text-sm font-semibold tabular-nums text-gray-900 dark:bg-gray-800/60 dark:text-white"
                aria-live="polite"
              >
                {t('series.seatDeadlineValue', { hours: seatDeadlineHours })}
              </output>
              <button
                type="button"
                onClick={() => stepDeadline(1)}
                disabled={
                  seatDeadlineHours ===
                  SEAT_DEADLINE_CHOICES[SEAT_DEADLINE_CHOICES.length - 1]
                }
                aria-label={t('series.seatDeadlineMore')}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-gray-700 disabled:opacity-40 dark:bg-gray-800 dark:text-gray-200"
              >
                <Plus className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </section>

          {capReached && (
            <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              {t('series.capReached', { count: maxActiveSeries })}
              {onManageSeries && (
                <button
                  type="button"
                  onClick={onManageSeries}
                  className="ms-1 font-semibold underline-offset-2 hover:underline"
                >
                  {t('series.capReachedLink')}
                </button>
              )}
            </p>
          )}
        </OverlayKeyboardBody>

        <div
          className="shrink-0 border-t border-gray-100 px-4 pt-3 dark:border-gray-800"
          style={{ paddingBottom: 'calc(0.75rem + var(--overlay-bottom-inset, 0px))' }}
        >
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || capReached}
            aria-busy={saving}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary-600 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {saving ? t('series.saving') : t('series.save')}
          </button>
          <p className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">
            {t('series.helper', { days: initial.horizonDays })}
          </p>
        </div>
      </DrawerContent>
    </Drawer>
  );
};
