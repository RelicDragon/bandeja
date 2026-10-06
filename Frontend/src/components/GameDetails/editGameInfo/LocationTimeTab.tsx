/**
 * The body of the "When and where" editor (`GameScheduleSheet`): club, date,
 * time, duration and courts. Nothing else.
 *
 * Bookings are not made here — they live on the game page's court card and
 * its sheets. What the editor does show, right where it happens:
 *  - a court the club shows taken at the new time (`claimSection`);
 *  - what happens to each linked booking when the time moves (`bookingsSection`);
 *  - what happens to linked bookings when the club or time is removed.
 * Courts: which ones, never how many — the roster decides the count.
 * Owners and admins can remove the club or the date and time (`onClearClub`,
 * `onClearTime`); a club with linked bookings can't be swapped for another.
 */
import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { CalendarOff, MapPinOff, Undo2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Club, Court, EntityType, Game } from '@/types';
import { scheduleSelectionToForm, type ClubScheduleSelection } from '@/components/clubPicker/clubScheduleSelection';
import { GameStartSection } from '@/components/createGame/GameStartSection';
import { CreateGameClubSection } from '@/components/createGame/CreateGameClubSection';
import { CreateGameCourtSection } from '@/components/createGame/CreateGameCourtSection';
import { CreateGameDateSection } from '@/components/createGame/CreateGameDateSection';
import { filterClubsBySport } from '@/utils/courtSport';
import { formatGameDurationLabel } from '@/utils/formatGameDurationLabel';
import { EditCourtSlotsPicker } from './EditCourtSlotsPicker';
import '@/features/court-reservations/courtReservations.css';

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
  /** GAME / TRAINING / TOURNAMENT / LEAGUE at a club: ordered courts (the roster sets the count). */
  slotModel: boolean;
  /** Slot model: toggle a court in/out (order = selection order). Else: pick one (`notBooked` clears). */
  onToggleCourt: (id: string) => void;
  onSetCourtIds: (ids: string[]) => void;
  /** Courts holding a linked booking (cannot be dropped; they move with the time). */
  lockedCourtIds: ReadonlySet<string>;
  /** Courts the roster needs (players ÷ players per court). */
  courtNeed: number;
  /** Linked bookings pin the club (remove them first). */
  clubLocked: boolean;
  /** Courts the organizer booked themselves: the club's block is theirs. */
  ownClubBookingCourtIds?: readonly string[];
  /** A court the club shows taken at the picked time, under the time grid. */
  claimSection?: ReactNode;
  /** What happens to each linked booking when the time moves / the club or time goes. */
  bookingsSection?: ReactNode;
  /** Owners / admins: remove the club (`null` = not offered). */
  onClearClub?: (() => void) | null;
  /** Owners / admins: remove the date and time (`null` = not offered). */
  onClearTime?: (() => void) | null;
  /** The date and time will be removed on save (Undo brings the pickers back). */
  timeCleared?: boolean;
  onUndoClearTime?: () => void;
  /** Courts are locked while linked bookings move with the time (their court changes there). */
  courtsLocked?: boolean;
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
  courtNeed,
  clubLocked,
  ownClubBookingCourtIds,
  claimSection,
  bookingsSection,
  onClearClub,
  onClearTime,
  timeCleared = false,
  onUndoClearTime,
  courtsLocked = false,
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
    onDateChange(form.selectedDate);
    onTimeChange(form.selectedTime);
    onDurationChange(form.durationHours);
    setPendingClubSchedule(null);
  }, [pendingClubSchedule, selectedClub, courts, onSetCourtIds, onDateChange, onTimeChange, onDurationChange]);

  const courtSection = slotModel ? (
    selectedClub && courts.length > 0 ? (
      <EditCourtSlotsPicker
        courts={courts}
        selectedIds={selectedCourtIds}
        lockedIds={lockedCourtIds}
        onToggle={onToggleCourt}
        need={courtNeed}
        locked={courtsLocked}
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

  const quietBtn =
    'inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-sm font-medium text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-gray-300 dark:hover:bg-gray-800';

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

      {onClearClub && selectedClub ? (
        <div className="-mt-2 flex justify-end">
          <button type="button" onClick={onClearClub} className={quietBtn} data-testid="schedule-clear-club">
            <MapPinOff size={15} aria-hidden />
            {t('gameDetails.whenWhere.removeClub')}
          </button>
        </div>
      ) : null}

      <span data-testid="schedule-time-anchor" aria-hidden className="block h-0 scroll-mt-2" />
      {timeCleared ? (
        <section
          className="cr-enter flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/60"
          data-testid="schedule-time-cleared"
        >
          <CalendarOff size={18} aria-hidden className="shrink-0 text-gray-500 dark:text-gray-400" />
          <p className="min-w-0 flex-1 text-sm text-gray-700 dark:text-gray-200">{t('gameDetails.whenWhere.timeWillBeRemoved')}</p>
          {onUndoClearTime ? (
            <button type="button" onClick={onUndoClearTime} className={quietBtn}>
              <Undo2 size={15} aria-hidden />
              {t('gameDetails.courts.clubBusyUndo')}
            </button>
          ) : null}
        </section>
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
            excludeGameId={game.id}
            ownClubBookingCourtIds={ownClubBookingCourtIds}
            hideClubBookingsInOverlay={slotModel}
          />
          {claimSection}
          {onClearTime ? (
            <div className="-mt-2 flex justify-end">
              <button type="button" onClick={onClearTime} className={quietBtn} data-testid="schedule-clear-time">
                <CalendarOff size={15} aria-hidden />
                {t('gameDetails.whenWhere.removeTime')}
              </button>
            </div>
          ) : null}
        </>
      )}

      {bookingsSection}
    </div>
  );
}
