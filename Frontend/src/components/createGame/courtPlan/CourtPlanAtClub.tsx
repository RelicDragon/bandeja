/**
 * "At the club?" — Book now · Already booked · Not booked: the court
 * states of the game page, the same answers at every club (Book now only where
 * the club has an integration).
 *
 * Already reserved lists the player's reservations at this club for the date
 * as selectable cards (each fills a court slot); every court without one is
 * marked reserved. Picking a reservation whose time differs from the game's
 * asks once whether to use the reservation's time (already applied).
 */
import { useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { BadgeCheck, CalendarPlus, Clock, Store } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Club, Court } from '@/types';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import type { BookingListClubRow } from '@/hooks/connectedBookingClubs';
import { ClubBookingConnectInline } from '@/components/booktime/ClubBookingConnectInline';
import type { BooktimeIntegrationConfig } from '@/components/booktime/ConnectClubSheet';
import { BooktimeBookingRow } from '@/components/booktime/BooktimeBookingRow';
import { useBooktimeLinkedGames } from '@/hooks/useBooktimeLinkedGames';
import '@/features/court-reservations/courtReservations.css';
import { isDocumentRtl, isRovingNavKey, nextRovingIndex, rovingTabIndex } from '@/utils/rovingFocus';
import type { AtClubChoice } from './courtPlanModel';
import type { ReservationTimePrompt } from './useCreateGameCourtPlan';

const ICONS = { reserveNow: CalendarPlus, alreadyReserved: BadgeCheck, notYet: Clock } as const;

type Props = {
  club: Club;
  courts: Court[];
  choice: AtClubChoice;
  choices: AtClubChoice[];
  onChoiceChange: (choice: AtClubChoice) => void;
  courtCount: number;
  /** Reserve now needs the provider account first. */
  needsAuth: boolean;
  integrationConfig?: BooktimeIntegrationConfig | null;
  onAuthConnected: () => void;
  /** The club can list this player's reservations. */
  canListReservations: boolean;
  connected: boolean;
  reservations: {
    dateBookings: BooktimeBookingRecord[];
    loading: boolean;
    loaded: boolean;
    clubTimezone: string;
  };
  linkedIds: readonly string[];
  onToggleReservation: (record: BooktimeBookingRecord) => void;
  unlinkedReservedCount: number;
  timePrompt: ReservationTimePrompt | null;
  formatRange: (time: string, durationHours: number) => string;
  onAnswerTimePrompt: (answer: 'use' | 'keep') => void;
};

function ReservationCard({
  booking,
  clubRow,
  selected,
  onToggle,
  clubTimezone,
}: {
  booking: BooktimeBookingRecord;
  clubRow: BookingListClubRow;
  selected: boolean;
  onToggle: () => void;
  clubTimezone: string;
}) {
  const { linkedGames } = useBooktimeLinkedGames(booking.uuid);
  return (
    <li>
      <BooktimeBookingRow
        nested
        compact
        booking={booking}
        club={clubRow}
        selectable
        selected={selected}
        linkedGames={linkedGames}
        onToggleSelect={onToggle}
        clubTimezone={clubTimezone}
      />
    </li>
  );
}

/**
 * Equal-width answer segments with the icon above a label that may wrap to two
 * lines, so the control always fits 320px in every locale without scrolling.
 */
function AtClubChoiceControl({
  choices,
  choice,
  onChange,
  label,
}: {
  choices: AtClubChoice[];
  choice: AtClubChoice;
  onChange: (choice: AtClubChoice) => void;
  label: string;
}) {
  const { t } = useTranslation();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = choices.indexOf(choice);
  const enabled = choices.map(() => true);
  const tabStop = rovingTabIndex(selectedIndex, enabled);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!isRovingNavKey(event.key)) return;
    const next = nextRovingIndex({ key: event.key, currentIndex: selectedIndex, enabled, rtl: isDocumentRtl() });
    if (next === null) return;
    event.preventDefault();
    onChange(choices[next]);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="grid gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800"
      style={{ gridTemplateColumns: `repeat(${choices.length}, minmax(0, 1fr))` }}
    >
      {choices.map((id, index) => {
        const Icon = ICONS[id];
        const active = id === choice;
        return (
          <button
            key={id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={index === tabStop ? 0 : -1}
            onClick={() => onChange(id)}
            className={`flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-center text-xs font-medium leading-tight transition-colors ${
              active
                ? 'bg-white text-primary-700 shadow-sm dark:bg-gray-900 dark:text-primary-300'
                : 'text-gray-600 dark:text-gray-300'
            }`}
          >
            <Icon size={16} className="shrink-0" aria-hidden />
            <span className="line-clamp-2 w-full break-words [hyphens:auto]">
              {t(`createGame.courtPlan.atClub.${id}`)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function CourtPlanAtClub({
  club,
  courts,
  choice,
  choices,
  onChoiceChange,
  courtCount,
  needsAuth,
  integrationConfig,
  onAuthConnected,
  canListReservations,
  connected,
  reservations,
  linkedIds,
  onToggleReservation,
  unlinkedReservedCount,
  timePrompt,
  formatRange,
  onAnswerTimePrompt,
}: Props) {
  const { t } = useTranslation();
  const [connectOpen, setConnectOpen] = useState(false);

  const clubRow = useMemo<BookingListClubRow>(
    () => ({
      integrationType: club.integrationType ?? undefined,
      clubId: club.id,
      clubName: club.name,
      avatar: null,
      companyId: integrationConfig?.companyId ?? null,
      padelooClubId: club.integrationConfig?.clubId,
      klikterenVenueId: club.integrationConfig?.venueId,
      connected: true,
      phoneNumber: null,
      scoutOptIn: false,
      cityTimezone: reservations.clubTimezone,
      courts: (club.courts ?? courts).map((c) => ({
        id: c.id,
        name: c.name,
        externalCourtId: c.externalCourtId ?? null,
        integrationCourtName: c.integrationCourtName ?? null,
      })),
    }),
    [club, courts, integrationConfig?.companyId, reservations.clubTimezone],
  );

  const hint = (() => {
    if (choice === 'reserveNow') return t('createGame.courtPlan.atClub.reserveNowHint', { count: courtCount, club: club.name });
    if (choice === 'alreadyReserved') {
      return canListReservations
        ? t('createGame.courtPlan.atClub.alreadyReservedHint')
        : t('createGame.courtPlan.atClub.alreadyReservedMarkHint');
    }
    return t('createGame.courtPlan.atClub.notYetHint');
  })();

  const showNudge =
    choice !== 'alreadyReserved' && connected && reservations.loaded && reservations.dateBookings.length > 0;

  return (
    <section className="space-y-3" aria-label={t('createGame.courtPlan.atClub.title')}>
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          <Store size={13} aria-hidden />
        </span>
        <span className="text-sm font-semibold text-gray-900 dark:text-white">{t('createGame.courtPlan.atClub.title')}</span>
      </div>
      <AtClubChoiceControl
        choices={choices}
        choice={choice}
        onChange={onChoiceChange}
        label={t('createGame.courtPlan.atClub.title')}
      />

      <div key={choice} className="cr-enter space-y-3">
          {choice === 'reserveNow' && needsAuth ? (
            <ClubBookingConnectInline
              club={club}
              integrationConfig={integrationConfig ?? undefined}
              onConnected={onAuthConnected}
              onSkip={() => onChoiceChange('notYet')}
              skipLabel={t('createGame.courtPlan.atClub.authSkip')}
            />
          ) : (
            <p className="text-xs leading-snug text-gray-600 dark:text-gray-400">{hint}</p>
          )}

          {showNudge ? (
            <button
              type="button"
              onClick={() => onChoiceChange('alreadyReserved')}
              className="flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 text-start text-sm text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-100"
            >
              <BadgeCheck size={16} className="shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">{t('createGame.courtPlan.atClub.reservationsNudge')}</span>
              <span className="shrink-0 font-semibold">{t('createGame.courtPlan.atClub.useThem')}</span>
            </button>
          ) : null}

          {choice === 'alreadyReserved' && canListReservations ? (
            connected ? (
              reservations.loading && !reservations.loaded ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
              ) : reservations.dateBookings.length === 0 ? (
                <p className="rounded-xl bg-gray-50 px-3 py-2.5 text-sm text-gray-600 dark:bg-gray-900/60 dark:text-gray-300">
                  {t('createGame.courtPlan.reservations.empty', { club: club.name })}
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    {t('createGame.courtPlan.reservations.title')}
                  </p>
                  <ul className="space-y-2">
                    {reservations.dateBookings.map((booking) => (
                      <ReservationCard
                        key={booking.uuid}
                        booking={booking}
                        clubRow={clubRow}
                        selected={linkedIds.includes(booking.uuid)}
                        onToggle={() => onToggleReservation(booking)}
                        clubTimezone={reservations.clubTimezone}
                      />
                    ))}
                  </ul>
                </div>
              )
            ) : (
              <ClubBookingConnectInline
                club={club}
                integrationConfig={integrationConfig ?? undefined}
                onConnected={() => {
                  setConnectOpen(false);
                  onAuthConnected();
                }}
                onSkip={() => setConnectOpen(false)}
                skipLabel={t('createGame.courtPlan.atClub.markSkip')}
                collapsed={!connectOpen}
                onCollapsedClick={() => setConnectOpen(true)}
              />
            )
          ) : null}

          {choice === 'alreadyReserved' && timePrompt ? (
              <div
                key={`prompt-${timePrompt.key}`}
                role="group"
                aria-label={t('createGame.courtPlan.timePrompt.question', {
                  range: formatRange(timePrompt.reservation.time, timePrompt.reservation.duration),
                })}
                className="cr-enter rounded-xl border border-primary-100 bg-primary-50/60 p-3 dark:border-primary-900/50 dark:bg-primary-950/30"
              >
                <p className="text-sm text-gray-900 dark:text-white">
                  {t('createGame.courtPlan.timePrompt.question', {
                    range: formatRange(timePrompt.reservation.time, timePrompt.reservation.duration),
                  })}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onAnswerTimePrompt('use')}
                    className="min-h-[40px] rounded-full bg-primary-600 px-4 text-sm font-semibold text-white"
                  >
                    {t('createGame.courtPlan.timePrompt.yes')}
                  </button>
                  {timePrompt.previous.time ? (
                    <button
                      type="button"
                      onClick={() => onAnswerTimePrompt('keep')}
                      className="min-h-[40px] rounded-full border border-gray-200 bg-white px-4 text-sm font-medium text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                    >
                      {t('createGame.courtPlan.timePrompt.keep', {
                        range: formatRange(timePrompt.previous.time, timePrompt.previous.duration),
                      })}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

          {choice === 'alreadyReserved' && unlinkedReservedCount > 0 && linkedIds.length > 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('createGame.courtPlan.reservations.markRest')}</p>
          ) : null}
      </div>
    </section>
  );
}
