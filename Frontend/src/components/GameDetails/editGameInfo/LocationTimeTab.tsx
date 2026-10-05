/**
 * Edit drawer → Location & time: club, courts, date and time. Nothing else.
 *
 * Reservations (reserve, link, mark as reserved, unlink, cancel) are not made
 * here any more — they live on the game page's Courts card and its sheets.
 * Courts use the slot model (ordered courts + total count). A game whose time
 * can affect reservations (linked reservations or several court slots) shows
 * its time with a "Change time" button that opens the reschedule planner
 * instead of the plain time editor. A club with linked reservations is locked
 * (unlink first).
 */
import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { CalendarClock } from 'lucide-react';
import type { Club, Court, EntityType, Game } from '@/types';
import { scheduleSelectionToForm, type ClubScheduleSelection } from '@/components/clubPicker/clubScheduleSelection';
import { GameStartSection } from '@/components/createGame/GameStartSection';
import { CreateGameClubSection } from '@/components/createGame/CreateGameClubSection';
import { CreateGameCourtSection } from '@/components/createGame/CreateGameCourtSection';
import { CreateGameDateSection } from '@/components/createGame/CreateGameDateSection';
import { filterClubsBySport } from '@/utils/courtSport';
import { formatGameDurationLabel } from '@/utils/formatGameDurationLabel';
import { getClubTimezone } from '@/utils/gameTimeDisplay';
import { pressScaleGuard } from '@/components/motion/pressScale';
import { useClubTime } from '@/features/court-reservations';
import { EditCourtSlotsPicker } from './EditCourtSlotsPicker';

type LocationTimeTabProps = {
  game: Game;
  entityType: EntityType;
  clubs: Club[];
  courts: Court[];
  selectedClub: string;
  selectedCourtIds: string[];
  onSelectClub?: (id: string, club?: Club) => void;
  onVenueCityChange?: (cityId: string) => void;
  venueCityId?: string;
  /** GAME / TRAINING / TOURNAMENT / LEAGUE at a club: ordered courts + count. */
  slotModel: boolean;
  /** Slot model: toggle a court in/out (order = selection order). Else: pick one (`notBooked` clears). */
  onToggleCourt: (id: string) => void;
  onSetCourtIds: (ids: string[]) => void;
  /** Courts holding a linked reservation (cannot be dropped). */
  lockedCourtIds: ReadonlySet<string>;
  courtCount: number;
  onCourtCountChange: (count: number) => void;
  /** Linked reservations pin the club (unlink them on the game page first). */
  clubLocked: boolean;
  /** The reschedule planner moves this game's time (reservations / several courts). */
  timeManagedByPlanner: boolean;
  onRequestReschedule?: () => void;
  selectedDate: Date;
  selectedTime: string;
  duration: number;
  showDatePicker: boolean;
  onDateChange: (date: Date) => void;
  onTimeChange: (time: string) => void;
  onDurationChange: (duration: number) => void;
  onShowDatePickerChange: (open: boolean) => void;
  generateTimeOptions: () => string[];
  generateTimeOptionsForDate: (date: Date) => string[];
  canAccommodateDuration: (time: string, duration: number) => boolean;
  getAdjustedStartTime: (clickedTime: string, duration: number) => string | null;
  getTimeSlotsForDuration: (startTime: string, duration: number) => string[];
  isSlotHighlighted: (time: string) => boolean;
  dateInputRef: RefObject<HTMLInputElement | null>;
  panelRef?: RefObject<HTMLDivElement | null>;
};

function PlannerTimeRow({ game, onRequestReschedule }: { game: Game; onRequestReschedule?: () => void }) {
  const { t } = useTranslation();
  const clock = useClubTime(getClubTimezone(game));
  const day = useMemo(() => {
    const tz = getClubTimezone(game) ?? undefined;
    return new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(
      new Date(game.startTime),
    );
  }, [game]);
  return (
    <section
      className="rounded-2xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/60"
      data-testid="edit-time-planner-row"
    >
      <div className="flex items-center gap-3">
        <CalendarClock size={18} aria-hidden className="shrink-0 text-primary-600 dark:text-primary-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
            {day} · {clock.range(game.startTime, game.endTime)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('gameDetails.courts.timeByPlanner')}</p>
        </div>
      </div>
      {onRequestReschedule ? (
        <button
          type="button"
          onClick={onRequestReschedule}
          className={`mt-3 flex min-h-[44px] w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 active:scale-[0.98] ${pressScaleGuard}`}
        >
          {t('gameDetails.courts.changeTime')}
        </button>
      ) : null}
    </section>
  );
}

export function LocationTimeTab({
  game,
  entityType,
  clubs,
  courts,
  selectedClub,
  selectedCourtIds,
  onSelectClub,
  onVenueCityChange,
  venueCityId,
  slotModel,
  onToggleCourt,
  onSetCourtIds,
  lockedCourtIds,
  courtCount,
  onCourtCountChange,
  clubLocked,
  timeManagedByPlanner,
  onRequestReschedule,
  selectedDate,
  selectedTime,
  duration,
  showDatePicker,
  onDateChange,
  onTimeChange,
  onDurationChange,
  onShowDatePickerChange,
  generateTimeOptions,
  generateTimeOptionsForDate,
  canAccommodateDuration,
  getAdjustedStartTime,
  getTimeSlotsForDuration,
  isSlotHighlighted,
  dateInputRef,
  panelRef,
}: LocationTimeTabProps) {
  const { t } = useTranslation();
  const clubsForSport = useMemo(
    () => (game.sport ? filterClubsBySport(clubs, game.sport, game.clubId ?? undefined) : clubs),
    [clubs, game.sport, game.clubId],
  );
  const club = clubsForSport.find((c) => c.id === selectedClub) ?? clubs.find((c) => c.id === selectedClub);
  const [isClubModalOpen, setIsClubModalOpen] = useState(false);
  const [pendingClubSchedule, setPendingClubSchedule] = useState<ClubScheduleSelection | null>(null);
  const selectedCourt = selectedCourtIds[0] ?? 'notBooked';

  const getDurationLabel = useCallback((dur: number) => formatGameDurationLabel(dur, t), [t]);

  // A slot picked in the club's schedule applies once that club's courts are loaded.
  useEffect(() => {
    if (!pendingClubSchedule || selectedClub !== pendingClubSchedule.club.id) return;
    if (!courts.some((court) => court.id === pendingClubSchedule.courtId)) return;
    const form = scheduleSelectionToForm(pendingClubSchedule);
    onSetCourtIds(form.courtIds);
    if (!timeManagedByPlanner) {
      onDateChange(form.selectedDate);
      onTimeChange(form.selectedTime);
      onDurationChange(form.durationHours);
    }
    setPendingClubSchedule(null);
  }, [pendingClubSchedule, selectedClub, courts, timeManagedByPlanner, onSetCourtIds, onDateChange, onTimeChange, onDurationChange]);

  const courtSection = slotModel ? (
    selectedClub && courts.length > 0 ? (
      <EditCourtSlotsPicker
        courts={courts}
        selectedIds={selectedCourtIds}
        lockedIds={lockedCourtIds}
        onToggle={onToggleCourt}
        count={courtCount}
        onCountChange={onCourtCountChange}
      />
    ) : null
  ) : (
    <CreateGameCourtSection
      clubs={clubsForSport}
      courts={courts}
      selectedClub={selectedClub}
      selectedCourt={selectedCourt}
      selectedCourtIds={selectedCourtIds}
      maxParticipants={game.maxParticipants}
      playersPerMatch={game.playersPerMatch ?? 4}
      selectedDate={selectedDate}
      hasBookedCourt={false}
      entityType={entityType}
      onSelectCourt={onToggleCourt}
      onToggleHasBookedCourt={() => undefined}
      preferredSport={game.sport}
      showHasBookedSwitch={false}
    />
  );

  return (
    <div ref={panelRef} data-testid="edit-location-time-panel" className="space-y-4">
      <CreateGameClubSection
        clubs={clubsForSport}
        courts={courts}
        selectedClub={selectedClub}
        selectedCourt={selectedCourt}
        isClubModalOpen={isClubModalOpen}
        schedulePicker={{
          selectedDate,
          allowBookingLink: false,
          onSelect: (selection) => {
            onSelectClub?.(selection.club.id, selection.club);
            setPendingClubSchedule(selection);
          },
        }}
        onSelectClub={(id, nextClub) => onSelectClub?.(id, nextClub)}
        onOpenClubModal={() => setIsClubModalOpen(true)}
        onCloseClubModal={() => setIsClubModalOpen(false)}
        venueCityId={venueCityId}
        onVenueCityChange={onVenueCityChange}
        entityType={entityType}
        preferredSport={game.sport}
        locked={clubLocked}
        onLockedActivate={() => toast(t('gameDetails.courts.clubLocked'))}
      />

      {timeManagedByPlanner ? (
        <>
          <PlannerTimeRow game={game} onRequestReschedule={onRequestReschedule} />
          {courtSection}
        </>
      ) : (
        <>
          <CreateGameDateSection
            selectedDate={selectedDate}
            showDatePicker={showDatePicker}
            onDateSelect={onDateChange}
            onCalendarClick={() => onShowDatePickerChange(true)}
            onCloseDatePicker={() => onShowDatePickerChange(false)}
            generateTimeOptionsForDate={generateTimeOptionsForDate}
          />
          {courtSection}
          <GameStartSection
            selectedDate={selectedDate}
            selectedTime={selectedTime}
            duration={duration}
            showDatePicker={showDatePicker}
            selectedClub={selectedClub}
            selectedCourt={selectedCourt}
            club={club}
            courts={courts}
            preferredSport={game.sport}
            generateTimeOptions={generateTimeOptions}
            generateTimeOptionsForDate={generateTimeOptionsForDate}
            canAccommodateDuration={canAccommodateDuration}
            getAdjustedStartTime={getAdjustedStartTime}
            getTimeSlotsForDuration={getTimeSlotsForDuration}
            isSlotHighlighted={isSlotHighlighted}
            getDurationLabel={getDurationLabel}
            onDateSelect={onDateChange}
            onCalendarClick={() => onShowDatePickerChange(true)}
            onCloseDatePicker={() => onShowDatePickerChange(false)}
            onTimeSelect={onTimeChange}
            onDurationChange={onDurationChange}
            entityType={entityType}
            dateInputRef={dateInputRef}
            panelMode="edit"
            compact
            hideDateSection
          />
        </>
      )}
    </div>
  );
}
