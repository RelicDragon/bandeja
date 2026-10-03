import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence } from 'framer-motion';
import { ChevronDown, Pencil, Undo2, UserX } from 'lucide-react';
import { Card } from '@/components/Card';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useNetworkStore } from '@/utils/networkStatus';
import { entitySupportsParticipantSetup } from '@/components/gameFormat/gameFormatTeamsVisibility';
import { formatCostMinor } from '@/features/cost/costMoney';
import {
  remindCooldownMs,
  summariseSettlement,
  viewerPrimaryAction,
} from '@/features/cost/costViewModel';
import type { AttendanceDotState } from '@/features/attendance/attendanceVisuals';
import type { UseGameAttendanceResult } from '@/features/attendance/useGameAttendance';
import type { Game, Invite } from '@/types';
import { CostSettleSheet } from '../cost/CostSettleSheet';
import { CostShareEditSheet } from '../cost/CostShareEditSheet';
import { ParticipantsActionBar } from '../ParticipantsActionBar';
import {
  COLLAPSED_ROW_LIMIT,
  availableFilters,
  buildRosterGroups,
  canSeeAllShares,
  countRows,
  isFaceOff,
  matchesFilter,
  openSeats,
  type RosterFilter,
  type RosterGroup,
  type RosterRowModel,
} from './rosterModel';
import { RosterFaceOff } from './RosterFaceOff';
import { RosterFilterChips } from './RosterFilterChips';
import { RosterHeader } from './RosterHeader';
import { RosterJoinPanel } from './RosterJoinPanel';
import { RosterOpenSpots } from './RosterOpenSpots';
import { RosterRow, type RosterRowMoney } from './RosterRow';
import type { RosterRowMenuItem } from './RosterRowMenu';
import { RosterSeatBar } from './RosterSeatBar';
import { RosterTray } from './RosterTray';
import { RosterWaitingList } from './RosterWaitingList';
import { RosterYouCard } from './RosterYouCard';
import { useRosterAttendanceActions } from './useRosterAttendanceActions';
import { useRosterCost } from './useRosterCost';

/**
 * One card for the people in a game. It replaces three lists that described
 * the same players — the roster (`GameParticipants`), attendance
 * (`AttendanceCard`, PRD 346) and the cost split (`GameCostCard`, PRD 348).
 *
 * - Every PLAYING participant appears once. Their answer is the dot on the
 *   avatar, a line in words and their seat in the strip; their share is a pill
 *   on the row.
 * - The viewer's row is pinned first and is where they answer and settle.
 * - Another player's amount is shown only to collectors (`canManage ||
 *   canConfirm`) — the server redacts it and `rosterModel` checks again.
 *   Everyone who plays sees everyone's answer.
 *
 * `mode="ledger"` is the same card once the roster is no longer the page's
 * subject (results entered, league fixtures): no seats, no joining — only what
 * the viewer still has to do, and the ledger for those who collect. It renders
 * nothing when there is nothing left to do.
 */

export interface GameRosterProps {
  game: Game;
  mode: 'live' | 'ledger';
  myInvites: Invite[];
  gameInvites: Invite[];
  userId: string | undefined;
  isGuest: boolean;
  isFull: boolean;
  /** Owner or admin of this game. */
  isOwner: boolean;
  /** The viewer's own role is OWNER — never asked "Are you coming?". */
  isUserOwner: boolean;
  isInJoinQueue: boolean;
  isUserPlaying: boolean;
  canInvitePlayers: boolean;
  canManageJoinQueue: boolean;
  canViewSettings: boolean;
  /** `canViewGameCost` — gates mounting the cost request at all. */
  costEnabled: boolean;
  /** The game's own payload says there is a price to split. */
  expectCost: boolean;
  attendance: UseGameAttendanceResult;
  attendanceByUserId: Record<string, AttendanceDotState> | undefined;
  /** PRD 364 — "Next steps" hosts Nudge; the tray must not show it twice. */
  hideNudge: boolean;
  onJoin: () => void;
  onAddToGame: () => void;
  onLeave: () => void;
  onAcceptInvite: (inviteId: string) => void;
  onDeclineInvite: (inviteId: string) => void;
  onCancelInvite: (inviteId: string) => void;
  onAcceptJoinQueue: (userId: string) => void;
  onDeclineJoinQueue: (userId: string) => void;
  onCancelJoinQueue?: () => void;
  onShowPlayerList: (gender?: 'MALE' | 'FEMALE') => void;
  onShowManageUsers: () => void;
  onEditMaxParticipants?: () => void;
  onShowAttendanceLegend?: () => void;
}

/** `PlayerAvatar` draws a crown for OWNER / ADMIN; anything else is a plain player. */
function crownOf(row: RosterRowModel): 'OWNER' | 'ADMIN' | 'PLAYER' {
  return row.role === 'OWNER' || row.role === 'ADMIN' ? row.role : 'PLAYER';
}

function personName(user: { firstName?: string | null; lastName?: string | null } | null | undefined) {
  if (!user) return '';
  return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
}

export function GameRoster(props: GameRosterProps) {
  const {
    game,
    mode,
    userId,
    isOwner,
    isUserOwner,
    isUserPlaying,
    isGuest,
    canInvitePlayers,
    attendance,
    attendanceByUserId,
  } = props;
  const { t, i18n } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();
  const isOnline = useNetworkStore((state) => state.isOnline);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [filter, setFilter] = useState<RosterFilter>('ALL');
  const [showAll, setShowAll] = useState(false);

  const cost = useRosterCost({
    gameId: game.id,
    viewerUserId: userId,
    enabled: props.costEnabled,
    anchorRef,
    reducedMotion,
  });
  const actions = useRosterAttendanceActions(attendance);
  const summary = cost.summary;
  const details = attendance.details;

  const isLedger = mode === 'ledger';
  const groups = useMemo(() => {
    const built = buildRosterGroups(game, { viewerUserId: userId, attendanceByUserId, cost: summary });
    if (!isLedger || built.length === 1) return built;
    // The ledger has no seats to split by gender: one list, viewer first.
    const rows = built.flatMap((group) => group.rows);
    const ordered = [...rows.filter((row) => row.isViewer), ...rows.filter((row) => !row.isViewer)];
    return [{ key: 'ALL' as const, gender: undefined, rows: ordered, capacity: null }];
  }, [game, userId, attendanceByUserId, summary, isLedger]);
  const allRows = useMemo(() => groups.flatMap((group) => group.rows), [groups]);
  const counts = useMemo(() => countRows(allRows), [allRows]);

  const collector = canSeeAllShares(summary);
  const frozen = summary?.frozenAt != null;
  const hasAttendance = allRows.some((row) => row.attendance != null);
  const askOpen = Boolean(details?.answersOpen && isUserPlaying && !isGuest && !isUserOwner);
  const canNoteNoShow = Boolean(isOwner && details?.noShowWindowOpen);
  const faceOff = !isLedger && isFaceOff(game);
  const showCrowns =
    game.participants.filter((p) => p.status === 'PLAYING' && (p.role === 'OWNER' || p.role === 'ADMIN'))
      .length > 1;

  const money = (minor: number) => formatCostMinor(minor, summary?.currency ?? 'EUR', i18n.language);
  const settlement = summary ? summariseSettlement(summary) : null;
  const settledText = settlement
    ? t('cost.summaryAllSettled', { settled: settlement.settled, total: settlement.total })
    : null;

  const menuItemsFor = (row: RosterRowModel): RosterRowMenuItem[] => {
    const items: RosterRowMenuItem[] = [];
    const name = personName(row.user);
    if (summary?.canManage && !frozen && row.share) {
      const share = row.share;
      items.push({
        key: 'edit',
        label: t('cost.editShareFor', { name }),
        icon: <Pencil size={16} />,
        onSelect: () => cost.setEditShare(share),
      });
    }
    if (canNoteNoShow && !row.isViewer) {
      items.push(
        row.attendance === 'NO_SHOW'
          ? {
              key: 'undo-no-show',
              label: t('attendance.noShow.undoAction'),
              icon: <Undo2 size={16} />,
              onSelect: () => void actions.undoNoShow(row.userId),
            }
          : {
              key: 'no-show',
              label: t('attendance.noShow.action'),
              icon: <UserX size={16} />,
              onSelect: () => actions.requestNoShow(row.userId),
            },
      );
    }
    return items;
  };

  const moneyFor = (row: RosterRowModel): RosterRowMoney | null => {
    if (!collector || !row.share || !summary) return null;
    const share = row.share;
    return {
      amount: money(share.amountMinor),
      toggle:
        summary.canConfirm && !share.isPayer
          ? {
              name: personName(row.user),
              disabled: cost.pending.confirm || share.method === 'COINS',
              onChange: (received) => cost.setReceived(share, received),
            }
          : null,
    };
  };

  const othersVisible = isLedger
    ? collector || canNoteNoShow || Boolean(isOwner && details?.answersOpen)
    : true;
  const viewerRow = allRows.find((row) => row.isViewer);
  const viewerCardVisible = Boolean(viewerRow && (!isLedger || askOpen || viewerRow.share));
  const othersFor = (group: RosterGroup) => {
    if (!othersVisible) return [];
    const others = group.rows.filter((row) => !row.isViewer);
    // The face-off already shows both players; a row is only worth repeating
    // when it carries something to act on.
    return faceOff ? others.filter((row) => moneyFor(row) || menuItemsFor(row).length > 0) : others;
  };

  if (isLedger && !viewerCardVisible && groups.every((group) => othersFor(group).length === 0)) {
    return null;
  }

  const primaryAction = summary ? viewerPrimaryAction(summary, userId) : 'NONE';
  const cooldownMs = summary ? remindCooldownMs(summary.remindAvailableAt) : 0;
  const split = groups.length > 1;
  const pendingNoShowRow = allRows.find((row) => row.userId === actions.pendingNoShowUserId) ?? null;
  const inviteFor = (group: RosterGroup) =>
    !isLedger && userId && canInvitePlayers ? () => props.onShowPlayerList(group.gender) : undefined;

  const viewerCanEditShare = Boolean(summary?.canManage && !frozen && viewerRow?.share);
  // When any line has a ⋮, the others keep its slot so the pills line up.
  const reserveMenu =
    viewerCanEditShare ||
    groups.some((group) => othersFor(group).some((row) => menuItemsFor(row).length > 0));

  const youCard = (row: RosterRowModel) => (
    <RosterYouCard
      key={`you-${row.userId}`}
      row={row}
      crownRole={showCrowns ? crownOf(row) : undefined}
      isOrganizer={isUserOwner}
      askOpen={askOpen}
      isAnswering={attendance.isAnswering}
      isOffline={!isOnline}
      onAnswer={actions.answer}
      onRequestLeave={isLedger ? undefined : props.onLeave}
      onRemove={isLedger ? undefined : props.onLeave}
      share={row.share}
      money={money}
      payerName={summary?.payer ? personName(summary.payer) : null}
      settledLine={collector ? null : settledText}
      primaryAction={primaryAction}
      settlePending={cost.pending.settle}
      onOpenSettle={() => cost.setSettleOpen(true)}
      onEditShare={viewerCanEditShare && row.share ? () => cost.setEditShare(row.share) : undefined}
      reserveMenu={reserveMenu}
      flashing={cost.flashUserId === row.userId && !reducedMotion}
      onLegend={props.onShowAttendanceLegend}
    />
  );

  const renderRow = (row: RosterRowModel) => (
    <RosterRow
      key={row.userId}
      row={row}
      crownRole={showCrowns ? crownOf(row) : undefined}
      money={moneyFor(row)}
      menuItems={menuItemsFor(row)}
      flashing={cost.flashUserId === row.userId && !reducedMotion}
      reserveMenu={reserveMenu}
      onLegend={props.onShowAttendanceLegend}
    />
  );

  // Big rosters: filter chips and a collapsed list. Mixed pairs stay small.
  const single = groups[0];
  const singleOthers = split ? [] : othersFor(single);
  const filters = !split && singleOthers.length > COLLAPSED_ROW_LIMIT
    ? // Counted over everyone, the pinned viewer included, so "All" matches the seat count.
      availableFilters(countRows(othersVisible ? single.rows : singleOthers), {
        hasAttendance,
        collector,
        active: filter,
      })
    : null;
  const filtered = filters ? singleOthers.filter((row) => matchesFilter(row, filter)) : singleOthers;
  // The chips count the pinned viewer too, so the "Showing n of m" note does.
  const pinnedViewer = othersVisible && viewerCardVisible ? viewerRow : undefined;
  const shownCount = filtered.length + (pinnedViewer && matchesFilter(pinnedViewer, filter) ? 1 : 0);
  const totalCount = singleOthers.length + (pinnedViewer ? 1 : 0);
  const collapsed = Boolean(filters) && filter === 'ALL' && !showAll && filtered.length > COLLAPSED_ROW_LIMIT;
  const listed = collapsed ? filtered.slice(0, COLLAPSED_ROW_LIMIT) : filtered;

  const nudge =
    isOwner && !props.hideNudge && details?.answersOpen
      ? {
          unanswered: details.unansweredCount ?? counts.unanswered,
          allowed: details.nudge.allowed,
          remainingHours: details.nudge.remainingHours,
          pending: attendance.isNudging,
          onNudge: () => void actions.nudge(),
        }
      : null;
  const remind =
    summary?.canConfirm && settlement && !settlement.allSettled
      ? {
          disabled: cooldownMs > 0 || !summary.canRemind,
          cooldownHours: cooldownMs > 0 ? Math.max(1, Math.ceil(cooldownMs / 3_600_000)) : null,
          pending: cost.pending.remind,
          onRemind: cost.remind,
        }
      : null;
  const totals =
    collector && summary && settlement
      ? {
          total: summary.totalMinor != null ? money(summary.totalMinor) : null,
          settledLine:
            settlement.allSettled || settlement.outstandingMinor == null
              ? t('cost.summaryAllSettled', { settled: settlement.settled, total: settlement.total })
              : t('cost.summaryStrip', {
                  settled: settlement.settled,
                  total: settlement.total,
                  amount: money(settlement.outstandingMinor),
                }),
        }
      : null;

  const showInviteButton = Boolean(userId) && canInvitePlayers;
  const showManageButton = Boolean(userId) && isOwner && props.canViewSettings;
  const canEditParticipantsSetup =
    !isLedger &&
    props.canViewSettings &&
    entitySupportsParticipantSetup(game.entityType) &&
    Boolean(props.onEditMaxParticipants);

  return (
    <div ref={anchorRef} data-cost-card={summary ? '' : undefined} data-roster-mode={mode}>
      <Card className="p-3 sm:p-4">
        <RosterHeader
          game={game}
          playingCount={counts.total}
          canEditParticipantsSetup={canEditParticipantsSetup}
          onEditMaxParticipants={props.onEditMaxParticipants}
          subline={isLedger ? (frozen ? t('cost.frozen') : settledText ?? undefined) : undefined}
        />

        {faceOff ? (
          <RosterFaceOff
            rows={single.rows}
            canInvite={Boolean(userId && canInvitePlayers)}
            onInvite={() => props.onShowPlayerList(single.gender)}
            onLegend={props.onShowAttendanceLegend}
          />
        ) : !isLedger ? (
          <RosterSeatBar
            groups={groups}
            counts={counts}
            hasAttendance={hasAttendance}
            onLegend={props.onShowAttendanceLegend}
          />
        ) : null}

        {!isLedger ? (
          <RosterJoinPanel
            game={game}
            myInvites={props.myInvites}
            userId={userId}
            isGuest={isGuest}
            isFull={props.isFull}
            isOwner={isOwner}
            isInJoinQueue={props.isInJoinQueue}
            isUserPlaying={isUserPlaying}
            onJoin={props.onJoin}
            onAddToGame={props.onAddToGame}
            onAcceptInvite={props.onAcceptInvite}
            onDeclineInvite={props.onDeclineInvite}
            onCancelJoinQueue={props.onCancelJoinQueue}
          />
        ) : null}

        {split ? (
          <div className="mt-3 space-y-3">
            {groups.map((group) => {
              const viewerHere = viewerCardVisible ? group.rows.find((row) => row.isViewer) : undefined;
              const others = othersFor(group);
              return (
                <section key={group.key} aria-label={group.gender === 'FEMALE' ? t('games.female') : t('games.male')}>
                  <h3 className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {group.gender === 'FEMALE' ? t('games.female') : t('games.male')}
                    <span className="tabular-nums">
                      {group.rows.length}/{group.capacity}
                    </span>
                  </h3>
                  <ul className="space-y-1.5">
                    {viewerHere ? <li className="list-none">{youCard(viewerHere)}</li> : null}
                    <AnimatePresence initial={false}>{others.map(renderRow)}</AnimatePresence>
                    {!isLedger ? <RosterOpenSpots count={openSeats(group)} onInvite={inviteFor(group)} /> : null}
                  </ul>
                </section>
              );
            })}
          </div>
        ) : (
          <>
            {viewerCardVisible && viewerRow ? <div className="mt-3">{youCard(viewerRow)}</div> : null}
            {filters ? <RosterFilterChips filters={filters} active={filter} onChange={setFilter} /> : null}
            {listed.length > 0 || (!isLedger && !faceOff && openSeats(single) > 0) ? (
              <ul className={`${viewerCardVisible || filters ? 'mt-2' : 'mt-3'} space-y-1.5`}>
                <AnimatePresence initial={false}>{listed.map(renderRow)}</AnimatePresence>
                {collapsed ? (
                  <li className="list-none">
                    <button
                      type="button"
                      onClick={() => setShowAll(true)}
                      className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl text-sm font-medium text-primary-700 hover:bg-primary-50/60 dark:text-primary-300 dark:hover:bg-primary-950/30"
                    >
                      {t('attendance.roster.showAll', { total: totalCount })}
                      <ChevronDown size={16} aria-hidden />
                    </button>
                  </li>
                ) : null}
                {filters && filter !== 'ALL' ? (
                  <li className="flex list-none items-center justify-between px-0.5 pt-0.5 text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
                    <span>
                      {t('attendance.roster.showingOf', { shown: shownCount, total: totalCount })}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFilter('ALL')}
                      className="inline-flex min-h-9 items-center font-medium text-primary-700 dark:text-primary-300"
                    >
                      {t('attendance.roster.showAll', { total: totalCount })}
                    </button>
                  </li>
                ) : null}
                {!isLedger && !faceOff ? (
                  <RosterOpenSpots count={openSeats(single)} onInvite={inviteFor(single)} />
                ) : null}
              </ul>
            ) : null}
          </>
        )}

        <RosterTray
          nudge={nudge}
          remind={remind}
          totals={totals}
          frozen={collector && frozen}
          showUpdatedCaption={cost.showUpdatedCaption}
          costError={
            cost.isError && props.expectCost ? { retrying: cost.isRetrying, onRetry: cost.retry } : null
          }
        />

        {!isLedger ? (
          <>
            {showInviteButton || showManageButton ? (
              <div className="mt-3">
                <ParticipantsActionBar
                  showInviteButton={showInviteButton}
                  showManageButton={showManageButton}
                  onInvite={() => props.onShowPlayerList()}
                  onManage={props.onShowManageUsers}
                />
              </div>
            ) : null}
            <RosterWaitingList
              game={game}
              gameInvites={props.gameInvites}
              userId={userId}
              isOwner={isOwner}
              canManageJoinQueue={props.canManageJoinQueue}
              onCancelInvite={props.onCancelInvite}
              onAcceptJoinQueue={props.onAcceptJoinQueue}
              onDeclineJoinQueue={props.onDeclineJoinQueue}
            />
          </>
        ) : null}
      </Card>

      {summary ? (
        <CostSettleSheet
          open={cost.settleOpen}
          onOpenChange={cost.setSettleOpen}
          summary={summary}
          pending={cost.pending.settle}
          onSettle={cost.settle}
        />
      ) : null}

      {summary?.canManage && summary.totalMinor != null && summary.currency ? (
        <CostShareEditSheet
          open={cost.editShare != null}
          onOpenChange={(next) => {
            if (!next) cost.setEditShare(null);
          }}
          share={cost.editShare}
          currency={summary.currency}
          totalMinor={summary.totalMinor}
          pending={cost.pending.update}
          onSave={cost.saveShare}
        />
      ) : null}

      <ConfirmationModal
        isOpen={Boolean(pendingNoShowRow)}
        tone="info"
        confirmVariant="primary"
        title={t('attendance.noShow.dialogTitle', { name: personName(pendingNoShowRow?.user) })}
        message={t('attendance.noShow.dialogBody')}
        confirmText={t('attendance.noShow.confirm')}
        cancelText={t('attendance.noShow.cancel')}
        onConfirm={() => void actions.confirmNoShow()}
        onClose={actions.cancelNoShow}
      />
    </div>
  );
}
