import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarCheck, CalendarClock } from 'lucide-react';
import type { Club, Court, EntityType, Game } from '@/types';
import { SegmentedSwitch } from '@/components/SegmentedSwitch';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import type { LocationTimeMode } from './LocationTimeMode';
import { TimeSlotsPanel } from './TimeSlotsPanel';
import { BookingsPickerPanel } from './BookingsPickerPanel';
import { BooktimeRealBookingSection } from './BooktimeRealBookingSection';
import { LocationTimeSummaryBar } from './LocationTimeSummaryBar';
import { LinkedBookingsList } from './LinkedBookingsList';
import type { BookingSelectionLimits } from '@shared/gameBooking/computeBookingSelectionLimits';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { courtHasActiveBookingIntegration } from '@/utils/clubBookingIntegration';
import { useAuthStore } from '@/store/authStore';
import { useMemo } from 'react';

export type GameLocationTimePanelProps = {
  mode: 'create' | 'edit';
  entityType: EntityType;
  club: Club | undefined;
  game?: Game;
  locationTimeMode: LocationTimeMode;
  onLocationTimeModeChange: (mode: LocationTimeMode) => void;
  showSegmentedSwitch: boolean;
  showBookingsOnly: boolean;
  skipRealCourtBooking: boolean;
  onSkipRealCourtBookingChange: (value: boolean) => void;
  selectedCourtIds: string[];
  courts: Court[];
  selectedBookingIds: string[];
  onSelectedBookingIdsChange: (ids: string[], records?: import('@/integrations/booktime/client').BooktimeBookingRecord[]) => void;
  bookingSelectionLimits: BookingSelectionLimits;
  timeOverride: boolean;
  onTimeOverrideChange: (value: boolean) => void;
  overrideStartTime?: string;
  overrideEndTime?: string;
  onOverrideTimesChange?: (start: string, end: string) => void;
  timeSlotsChildren: ReactNode;
  dateSection: ReactNode;
  courtSection: ReactNode;
  authGateSection?: ReactNode;
  needsBooktimeAuth?: boolean;
  companyId?: string;
  bookingsPanelEnabled?: boolean;
  dirtyFlags: { bookings: boolean; timeSlots: boolean };
  derivedSummary?: { startTime: string | null; endTime: string | null; count: number };
  preselectedBanner?: boolean;
  onUnlinkBooking?: (externalBookingId: string) => void;
  onDerivedTimeChange?: (start: string | null, end: string | null) => void;
};

export function GameLocationTimePanel({
  mode,
  entityType: _entityType,
  club,
  game,
  locationTimeMode,
  onLocationTimeModeChange,
  showSegmentedSwitch,
  showBookingsOnly,
  skipRealCourtBooking,
  onSkipRealCourtBookingChange,
  selectedCourtIds,
  courts,
  selectedBookingIds,
  onSelectedBookingIdsChange,
  bookingSelectionLimits,
  timeOverride,
  onTimeOverrideChange,
  overrideStartTime,
  overrideEndTime,
  onOverrideTimesChange,
  timeSlotsChildren,
  dateSection,
  courtSection,
  authGateSection,
  needsBooktimeAuth,
  companyId,
  bookingsPanelEnabled = true,
  dirtyFlags,
  derivedSummary,
  preselectedBanner,
  onUnlinkBooking,
  onDerivedTimeChange,
}: GameLocationTimePanelProps) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);
  const [pendingTab, setPendingTab] = useState<LocationTimeMode | null>(null);

  const integratedCourts = useMemo(
    () =>
      selectedCourtIds
        .map((id) => courts.find((c) => c.id === id))
        .filter((c): c is Court => c != null && courtHasActiveBookingIntegration(club, c)),
    [selectedCourtIds, courts, club],
  );

  const requestTabChange = (next: LocationTimeMode) => {
    if (next === locationTimeMode) return;
    const dirty = locationTimeMode === 'bookings' ? dirtyFlags.bookings : dirtyFlags.timeSlots;
    if (dirty) {
      setPendingTab(next);
      return;
    }
    onLocationTimeModeChange(next);
  };

  const confirmTabSwitch = () => {
    if (!pendingTab) return;
    onLocationTimeModeChange(pendingTab);
    if (pendingTab === 'timeSlots') {
      onSelectedBookingIdsChange([], []);
    }
    setPendingTab(null);
  };

  return (
    <div className="space-y-4">
      {preselectedBanner ? (
        <div className="rounded-lg border border-primary-200 dark:border-primary-800 bg-primary-50/60 dark:bg-primary-950/30 px-3 py-2 text-sm text-primary-800 dark:text-primary-200">
          {t('createGame.locationTime.preselectedBanner')}
        </div>
      ) : null}

      {showSegmentedSwitch && club ? (
        <div className="flex justify-center">
          <SegmentedSwitch
            tabs={[
              {
                id: 'timeSlots',
                label: t('createGame.locationTime.tabTimeSlots'),
                icon: CalendarClock,
              },
              {
                id: 'bookings',
                label: t('createGame.locationTime.tabBookings'),
                icon: CalendarCheck,
              },
            ]}
            activeId={locationTimeMode}
            onChange={(id) => requestTabChange(id as LocationTimeMode)}
            showOnlyActiveTabText={false}
            layoutId={`location-time-tabs-${mode}`}
            className="w-fit max-w-full"
          />
        </div>
      ) : null}

      <AnimatePresence mode="wait">
        {showBookingsOnly && game ? (
          <motion.div
            key="linked-only"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="space-y-4"
          >
            <LinkedBookingsList
              game={game}
              club={club}
              courts={courts}
              onRemove={(id) => onUnlinkBooking?.(id)}
              readOnlyLabel
            />
            {club && companyId ? (
              <BookingsPickerPanel
                club={club}
                courts={courts}
                companyId={companyId}
                enabled={bookingsPanelEnabled}
                selectedBookingIds={selectedBookingIds}
                onSelectedBookingIdsChange={onSelectedBookingIdsChange}
                selectionLimits={bookingSelectionLimits}
                timeOverride={timeOverride}
                onTimeOverrideChange={onTimeOverrideChange}
                overrideStartTime={overrideStartTime}
                overrideEndTime={overrideEndTime}
                onOverrideTimesChange={onOverrideTimesChange ?? (() => {})}
                onSwitchToTimeSlots={() => onLocationTimeModeChange('timeSlots')}
                onDerivedTimeChange={onDerivedTimeChange}
              />
            ) : null}
          </motion.div>
        ) : locationTimeMode === 'bookings' && club && companyId ? (
          <motion.div
            key="bookings"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <BookingsPickerPanel
              club={club}
              courts={courts}
              companyId={companyId}
              enabled={bookingsPanelEnabled}
              selectedBookingIds={selectedBookingIds}
              onSelectedBookingIdsChange={onSelectedBookingIdsChange}
              selectionLimits={bookingSelectionLimits}
              timeOverride={timeOverride}
              onTimeOverrideChange={onTimeOverrideChange}
              overrideStartTime={overrideStartTime}
              overrideEndTime={overrideEndTime}
              onOverrideTimesChange={onOverrideTimesChange ?? (() => {})}
              onSwitchToTimeSlots={() => onLocationTimeModeChange('timeSlots')}
              onDerivedTimeChange={onDerivedTimeChange}
            />
          </motion.div>
        ) : (
          <motion.div
            key="timeSlots"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <TimeSlotsPanel
              dateSection={dateSection}
              courtSection={courtSection}
              timeSlotsChildren={timeSlotsChildren}
              needsBooktimeAuth={needsBooktimeAuth}
              authGateSection={authGateSection}
              hintSection={
                club ? (
                  <BooktimeRealBookingSection
                    mode={mode}
                    club={club}
                    courts={integratedCourts}
                    skipRealCourtBooking={skipRealCourtBooking}
                    onSkipRealCourtBookingChange={onSkipRealCourtBookingChange}
                  />
                ) : null
              }
            />
          </motion.div>
        )}
      </AnimatePresence>

      {derivedSummary && locationTimeMode === 'bookings' ? (
        <LocationTimeSummaryBar
          bookingCount={derivedSummary.count}
          startTime={derivedSummary.startTime}
          endTime={derivedSummary.endTime}
          displaySettings={displaySettings}
          visible={derivedSummary.count > 0}
        />
      ) : null}

      <ConfirmationModal
        isOpen={pendingTab != null}
        onClose={() => setPendingTab(null)}
        onConfirm={confirmTabSwitch}
        title={t('createGame.locationTime.tabSwitchDiscardTitle')}
        message={t('createGame.locationTime.tabSwitchDiscardBody')}
        confirmText={t('common.continue')}
        cancelText={t('common.cancel')}
      />
    </div>
  );
}
