/**
 * Self-contained playground for the court-reservation UI (no network).
 * Mount anywhere, e.g. temporarily in a page: `<CourtReservationsPreview />`.
 *
 * Fixture: X-Padel, 18:00–19:30 club time. Scenarios switch the slot mix;
 * "Organizer" toggles the read-only variant; "Club says no" makes the second
 * club booking fail so the rollback path can be seen; "Another change
 * running" makes the server refuse the run (409) as if one of yours / someone
 * else's were in progress. Runs use fake executors with short delays and an
 * in-memory journal.
 */
import { useMemo, useState } from 'react';
import type { CourtSlotView, DeriveCourtReservationsInput } from '@shared/gameBooking/courtReservations';
import { defaultCourtSlotCount, deriveCourtReservations } from '@shared/gameBooking/courtReservations';
import type { BookStep, PlanStep } from '@shared/gameBooking/planReschedule';
import {
  buildCourtSlotsBody,
  reportedAnyCourtCountOf,
  type CourtsCardAction,
} from './courtReservationsModel';
import {
  FIXTURE_CLUB_NAME,
  FIXTURE_COURTS,
  FIXTURE_COURTS_BY_ID,
  FIXTURE_DRIFTS,
  FIXTURE_FOLLOW_UPS,
  FIXTURE_GAME_ID,
  FIXTURE_SHARED_WITH,
  FIXTURE_TIME_ZONE,
  at,
  fixtureInput,
  type FixtureScenario,
} from './courtReservationsFixtures';
import { CourtsCard } from './CourtsCard';
import { CourtSlotSheet, type CourtSlotSheetAction } from './CourtSlotSheet';
import { ReservationDriftBanner } from './ReservationDriftBanner';
import { UnfinishedChangesBanner } from './UnfinishedChangesBanner';
import {
  createRunJournal,
  runReservationChanges,
  type ReservationExecutors,
  type RunJournal,
} from './reservationRunner';
import { providerCanCancel } from './reservationExecutors';

const SCENARIOS: { id: FixtureScenario; label: string }[] = [
  { id: 'mixed', label: 'Mixed' },
  { id: 'planned', label: 'Planned' },
  { id: 'reserved', label: 'All reserved' },
  { id: 'gap', label: 'Gap' },
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fakeExecutors(opts: { failSecondBook: boolean }): ReservationExecutors {
  let books = 0;
  let id = 100;
  return {
    async book(step: BookStep) {
      await wait(700);
      books += 1;
      if (opts.failSecondBook && books === 2) throw new Error('slot_taken');
      id += 1;
      return { externalBookingId: `bt-${id}`, bookingStart: step.start, bookingEnd: step.end };
    },
    async findExistingBooking() {
      await wait(300);
      return null;
    },
    async cancelBooking() {
      await wait(500);
    },
    async saveGame() {
      await wait(800);
    },
    async moveSharedGame() {
      await wait(500);
    },
  };
}

function interruptedJournal(): RunJournal {
  const steps: PlanStep[] = [
    {
      kind: 'book',
      idempotencyKey: 'demo:book:c1',
      slotKey: 'gc:gc1',
      courtId: 'c1',
      provider: 'BOOKTIME',
      start: at('19:00'),
      end: at('21:00'),
      purpose: 'move',
      extraMinutes: 30,
      requiresVerifyBeforeRetry: true,
    },
    { kind: 'save_game', idempotencyKey: 'demo:save', start: at('19:00'), end: at('20:30') },
    { kind: 'cancel', idempotencyKey: 'demo:cancel', slotKey: 'gc:gc1', linkId: 'l1', externalBookingId: 'bt-9001', provider: 'BOOKTIME' },
  ];
  const journal = createRunJournal(FIXTURE_GAME_ID, steps);
  journal.steps[0] = { ...journal.steps[0], status: 'running', attempts: 1 };
  return journal;
}

export function CourtReservationsPreview() {
  const [scenario, setScenario] = useState<FixtureScenario>('mixed');
  const [inputs, setInputs] = useState<Record<FixtureScenario, DeriveCourtReservationsInput>>(() => ({
    mixed: fixtureInput('mixed'),
    planned: fixtureInput('planned'),
    reserved: fixtureInput('reserved'),
    gap: fixtureInput('gap'),
  }));
  const [organizer, setOrganizer] = useState(true);
  const [openSlotKey, setOpenSlotKey] = useState<string | null>(null);
  const [followUps, setFollowUps] = useState(FIXTURE_FOLLOW_UPS);
  const [drifts, setDrifts] = useState(FIXTURE_DRIFTS);
  const [log, setLog] = useState<string[]>([]);
  const [interrupted, setInterrupted] = useState<RunJournal | null>(() => interruptedJournal());
  const [interruptedBusy, setInterruptedBusy] = useState(false);

  const input = inputs[scenario];
  const reservations = useMemo(() => deriveCourtReservations(input), [input]);
  const window = { start: input.game.startTime, end: input.game.endTime };
  const openSlot = reservations.slots.find((s) => s.key === openSlotKey) ?? null;
  const say = (line: string) => setLog((prev) => [line, ...prev].slice(0, 6));


  const editSlots = (change: Parameters<typeof buildCourtSlotsBody>[1]) => {
    const body = buildCourtSlotsBody(
      {
        gameCourts: input.gameCourts,
        reportedAnyCourtCount: reportedAnyCourtCountOf(reservations.slots),
        courtSlotCount: input.courtSlotCount,
      },
      change,
    );
    setInputs((prev) => ({
      ...prev,
      [scenario]: {
        ...prev[scenario],
        gameCourts: body.slots.map((s, i) => {
          const existing = prev[scenario].gameCourts.find((gc) => gc.courtId === s.courtId);
          return { gameCourtId: existing?.gameCourtId ?? `gc-${s.courtId}`, courtId: s.courtId, order: i + 1, reservation: s.reservation };
        }),
        reportedAnyCourtCount: body.reportedAnyCourtCount,
        courtSlotCount: body.courtSlotCount ?? prev[scenario].courtSlotCount ?? null,
      },
    }));
    say(`PUT court-slots ${JSON.stringify(body)}`);
  };

  const onSlotAction = (action: CourtSlotSheetAction) => {
    const slot: CourtSlotView = action.slot;
    switch (action.kind) {
      case 'mark_reserved':
        editSlots({ kind: 'mark_reserved', slot, courtId: action.courtId });
        setOpenSlotKey(null);
        break;
      case 'mark_not_reserved':
        editSlots({ kind: 'mark_not_reserved', slot });
        setOpenSlotKey(null);
        break;
      case 'assign_court':
        if (action.courtId) {
          editSlots(
            slot.courtId
              ? { kind: 'reassign_court', fromCourtId: slot.courtId, toCourtId: action.courtId }
              : { kind: 'assign_court', slot, courtId: action.courtId },
          );
        }
        setOpenSlotKey(null);
        break;
      case 'unlink':
        setInputs((prev) => ({
          ...prev,
          [scenario]: { ...prev[scenario], links: prev[scenario].links.filter((l) => l.id !== action.linkId) },
        }));
        setOpenSlotKey(null);
        say(`PATCH bookings remove ${action.linkId}`);
        break;
      default:
        say(`${action.kind} → ${slot.key}${action.courtId ? ` (${action.courtId})` : ''}`);
    }
  };

  const onPrimary = (action: CourtsCardAction) => say(`primary: ${JSON.stringify(action)}`);

  const segment = (active: boolean) =>
    `min-h-[36px] rounded-full px-3 text-xs font-medium ${
      active ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'text-gray-600 dark:text-gray-300'
    }`;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <div className="flex flex-wrap gap-1 rounded-full bg-gray-100 p-1 dark:bg-gray-800">
        {SCENARIOS.map((s) => (
          <button key={s.id} type="button" className={segment(s.id === scenario)} onClick={() => setScenario(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-gray-600 dark:text-gray-300">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={organizer} onChange={(e) => setOrganizer(e.target.checked)} /> Organizer
        </label>
      </div>

      {interrupted ? (
        <UnfinishedChangesBanner
          journal={interrupted}
          timeZone={FIXTURE_TIME_ZONE}
          busy={interruptedBusy}
          onFinish={async () => {
            setInterruptedBusy(true);
            const done = await runReservationChanges(interrupted, {
              executors: fakeExecutors({ failSecondBook: false }),
              canCancel: providerCanCancel,
            });
            setInterruptedBusy(false);
            setInterrupted(done.phase === 'done' ? null : done);
            say(`resumed: ${done.phase}`);
          }}
          onUndo={() => {
            setInterrupted(null);
            say('undo interrupted run');
          }}
        />
      ) : null}

      {organizer && drifts.length > 0 ? (
        <ReservationDriftBanner
          drifts={drifts}
          courtsById={FIXTURE_COURTS_BY_ID}
          timeZone={FIXTURE_TIME_ZONE}
          onAction={(drift, kind) => {
            setDrifts((prev) => prev.filter((d) => d.linkId !== drift.linkId));
            say(`drift ${kind} → ${drift.linkId}`);
          }}
        />
      ) : null}

      <CourtsCard
        reservations={reservations}
        window={window}
        courtsById={FIXTURE_COURTS_BY_ID}
        timeZone={FIXTURE_TIME_ZONE}
        courtNeed={Math.max(defaultCourtSlotCount(input.game), input.courtSlotCount ?? 0)}
        playerCount={input.game.maxParticipants}
        clubName={FIXTURE_CLUB_NAME}
        hasClub
        canEdit={organizer}
        onChange={(focus) => say(`open "When and where"${focus ? ` on ${focus}` : ''}`)}
        followUps={followUps}
        onSlotPress={(slot) => setOpenSlotKey(slot.key)}
        onAction={onPrimary}
        onFollowUpDone={(id) => setFollowUps((prev) => prev.filter((f) => f.id !== id))}
      />

      {log.length > 0 ? (
        <ol className="space-y-1 rounded-xl bg-gray-50 p-3 font-mono text-[10px] text-gray-500 dark:bg-gray-900 dark:text-gray-400">
          {log.map((line, i) => (
            <li key={`${i}:${line}`} className="break-all">
              {line}
            </li>
          ))}
        </ol>
      ) : null}

      <CourtSlotSheet
        open={openSlot != null}
        onOpenChange={(open) => !open && setOpenSlotKey(null)}
        slot={openSlot}
        window={window}
        courtsById={FIXTURE_COURTS_BY_ID}
        timeZone={FIXTURE_TIME_ZONE}
        canEdit={organizer}
        canBookHere
        canVerify={(provider) => provider === 'BOOKTIME'}
        sharedWith={FIXTURE_SHARED_WITH}
        pickableCourts={FIXTURE_COURTS.filter((c) => !reservations.slots.some((s) => s.effectiveCourtId === c.id))}
        onAction={onSlotAction}
        canAssignCourt
      />

    </div>
  );
}
