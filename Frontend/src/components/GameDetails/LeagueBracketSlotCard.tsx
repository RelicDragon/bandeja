import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ConfirmationModal, PlayerAvatar } from '@/components';
import { leaguesApi } from '@/api/leagues';
import type { BracketOriginGroupDto, BracketPlayoffResponse, BracketSlotDto } from '@/api/leagues';
import type { LeagueGroup } from '@/api/leagues';
import { getLeagueGroupColor } from '@/utils/leagueGroupColors';
import type { Game } from '@/types';
import { isFullGame } from '@/utils/leagueBracketEnrich';
import { bracketWalkoverErrorMessage } from '@/utils/bracketApiError.util';
import { useIsAppOffline } from '@/utils/bracketOffline.util';
import {
  bracketMatchStatusBadgeClass,
  bracketMatchStatusFromGame,
  bracketMatchStatusI18nKey,
  type BracketMatchStatus,
} from '@/utils/leagueBracketMatchStatus';
import {
  participantDisplayName,
  resolveFeederParticipant,
  resolveSlotSideParticipants,
  slotsById,
  teamUsersFromParticipant,
} from '@/utils/leagueBracketLayout';
import { BRACKET_TREE_CARD_CLASS } from '@/utils/bracketTreeCard.util';

function resolveOriginGroup(
  participant: BracketSlotDto['participant'],
  groups: LeagueGroup[]
): BracketOriginGroupDto | null {
  if (!participant) return null;
  if (participant.originGroup) return participant.originGroup;
  const id = participant.originGroupId;
  if (!id) return null;
  const g = groups.find((x) => x.id === id);
  return g ? { id: g.id, name: g.name, color: g.color ?? null } : null;
}

function OriginGroupBadge({ origin }: { origin: BracketOriginGroupDto }) {
  const { t } = useTranslation();
  const color = getLeagueGroupColor(origin.color);
  return (
    <span
      className="inline-flex max-w-full truncate rounded px-1.5 py-0.5 text-[9px] font-semibold"
      style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}55` }}
      title={t('gameDetails.bracketOriginGroup', { name: origin.name })}
    >
      {origin.name}
    </span>
  );
}

interface LeagueBracketSlotCardProps {
  slot: BracketSlotDto;
  allSlots: BracketSlotDto[];
  groups?: LeagueGroup[];
  showOriginGroupBadge?: boolean;
  onOpenGame?: (game: Game) => void;
  compact?: boolean;
  winnerSide?: 'A' | 'B' | null;
  loserSide?: 'A' | 'B' | null;
  onChampionPath?: boolean;
  deEmphasize?: boolean;
  canAwardWalkover?: boolean;
  leagueSeasonId?: string;
  onBracketUpdated?: (data: BracketPlayoffResponse) => void;
}

function StatusBadge({ status }: { status: BracketMatchStatus }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${bracketMatchStatusBadgeClass(status)}`}
    >
      {t(`gameDetails.${bracketMatchStatusI18nKey(status)}`)}
    </span>
  );
}

function SideRow({
  label,
  users,
  seed,
  highlight,
  loser,
  originGroup,
}: {
  label: string;
  users: ReturnType<typeof teamUsersFromParticipant>;
  seed?: number | null;
  highlight?: boolean;
  loser?: boolean;
  originGroup?: BracketOriginGroupDto | null;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-0.5 rounded-md py-1 px-1 ${
        highlight
          ? 'bg-amber-50 ring-1 ring-amber-300/80 dark:bg-amber-950/40 dark:ring-amber-600/60'
          : loser
            ? 'bg-gray-50/60 opacity-70 dark:bg-gray-900/40'
            : ''
      }`}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {seed != null && (
          <span
            className={`shrink-0 text-[10px] font-bold ${
              loser ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            #{seed}
          </span>
        )}
        {users.length > 0 ? (
          <div className="flex shrink-0 -space-x-1">
            {users.map((u, i) => (
              <span key={u.id} className="relative rounded-full ring-1 ring-white dark:ring-gray-800" style={{ zIndex: i + 1 }}>
                <PlayerAvatar player={u} inlineFace inlineFacePlain inlineFaceSize="sm" showName={false} subscribePresence={false} asDiv />
              </span>
            ))}
          </div>
        ) : null}
        <span
          className={`min-w-0 truncate text-xs font-medium ${
            loser
              ? 'text-gray-400 line-through decoration-gray-400/70 dark:text-gray-500 dark:decoration-gray-500/70'
              : 'text-gray-800 dark:text-gray-100'
          }`}
        >
          {label}
        </span>
      </div>
      {originGroup ? <OriginGroupBadge origin={originGroup} /> : null}
    </div>
  );
}

export function LeagueBracketSlotCard({
  slot,
  allSlots,
  groups = [],
  showOriginGroupBadge = false,
  onOpenGame,
  compact,
  winnerSide,
  loserSide,
  onChampionPath,
  deEmphasize,
  canAwardWalkover = false,
  leagueSeasonId,
  onBracketUpdated,
}: LeagueBracketSlotCardProps) {
  const { t } = useTranslation();
  const offline = useIsAppOffline();
  const [walkoverOpen, setWalkoverOpen] = useState(false);
  const [pendingWalkover, setPendingWalkover] = useState<{ participantId: string; name: string } | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);
  const lookup = slotsById(allSlots);
  const game = slot.game ?? null;
  const fullGame = game && isFullGame(game) ? game : null;
  const status = bracketMatchStatusFromGame(game);

  const sideA =
    resolveFeederParticipant(slot.feederSlotAId, lookup) ??
    (slot.slotKind === 'PLAY_IN' ? null : slot.participant);
  const sideB = resolveFeederParticipant(slot.feederSlotBId, lookup);

  const { participantAId, participantBId } = resolveSlotSideParticipants(slot, lookup);
  const canWalkover =
    canAwardWalkover &&
    !!leagueSeasonId &&
    !!onBracketUpdated &&
    status !== 'FINAL' &&
    status !== 'WALKOVER' &&
    status !== 'FORFEIT' &&
    slot.slotKind !== 'BYE' &&
    !!participantAId &&
    !!participantBId &&
    participantAId !== participantBId;

  const nameA = participantDisplayName(sideA) || t('gameDetails.bracketTbd');
  const nameB = participantDisplayName(sideB) || t('gameDetails.bracketTbd');
  const usersA = teamUsersFromParticipant(sideA);
  const usersB = teamUsersFromParticipant(sideB);

  const clickable = !!fullGame && onOpenGame;

  const awardWalkover = async (leagueParticipantId: string) => {
    if (!leagueSeasonId || !onBracketUpdated) return;
    if (offline) {
      toast.error(t('gameDetails.bracketOfflineAction'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await leaguesApi.awardBracketWalkover(leagueSeasonId, slot.id, {
        leagueParticipantId,
      });
      if (res.data) onBracketUpdated(res.data);
      toast.success(t('gameDetails.bracketWalkoverAwarded'));
      setPendingWalkover(null);
      setWalkoverOpen(false);
    } catch (err: unknown) {
      toast.error(bracketWalkoverErrorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={`relative ${BRACKET_TREE_CARD_CLASS} rounded-lg border bg-white text-left shadow-sm transition dark:bg-gray-900 ${
        onChampionPath && !deEmphasize
          ? 'border-amber-400/90 ring-1 ring-amber-300/70 dark:border-amber-600/70 dark:ring-amber-600/50'
          : 'border-gray-200 dark:border-gray-700'
      } ${deEmphasize ? 'pointer-events-none opacity-45 saturate-50' : ''} ${compact ? 'px-2 py-1.5' : 'px-2.5 py-2'}`}
    >
      <button
        type="button"
        disabled={!clickable}
        onClick={() => fullGame && onOpenGame?.(fullGame)}
        className={`w-full text-left ${clickable ? 'hover:opacity-95' : 'cursor-default'}`}
      >
        <div className="mb-1.5 flex items-center justify-between gap-1">
          <StatusBadge status={status} />
          {slot.roundLabel && !compact ? (
            <span className="truncate text-[10px] text-gray-500 dark:text-gray-400">{slot.roundLabel}</span>
          ) : null}
        </div>
        <SideRow
          label={nameA}
          users={usersA}
          seed={sideA?.seedRank}
          highlight={winnerSide === 'A'}
          loser={loserSide === 'A'}
          originGroup={showOriginGroupBadge ? resolveOriginGroup(sideA, groups) : null}
        />
        <p className="py-0.5 text-center text-[10px] font-bold uppercase text-indigo-600 dark:text-indigo-400">
          {t('gameDetails.fixtureVsShort')}
        </p>
        <SideRow
          label={nameB}
          users={usersB}
          seed={sideB?.seedRank}
          highlight={winnerSide === 'B'}
          loser={loserSide === 'B'}
          originGroup={showOriginGroupBadge ? resolveOriginGroup(sideB, groups) : null}
        />
      </button>
      {canWalkover && (
        <div className="mt-1.5 border-t border-gray-100 pt-1.5 dark:border-gray-800">
          {!walkoverOpen ? (
            <button
              type="button"
              disabled={submitting || offline}
              title={offline ? t('gameDetails.bracketOfflineAction') : undefined}
              onClick={() => {
                if (offline) {
                  toast.error(t('gameDetails.bracketOfflineAction'));
                  return;
                }
                setWalkoverOpen(true);
              }}
              className="w-full rounded-md px-2 py-1 text-[10px] font-semibold text-primary-700 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-950/40"
            >
              {t('gameDetails.bracketAwardWalkover')}
            </button>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-center text-[10px] text-gray-500 dark:text-gray-400">
                {t('gameDetails.bracketWalkoverPickWinner')}
              </p>
              <button
                type="button"
                disabled={submitting || !participantAId}
                onClick={() =>
                  participantAId && setPendingWalkover({ participantId: participantAId, name: nameA })
                }
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-md border border-gray-200 px-2 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                {nameA}
              </button>
              <button
                type="button"
                disabled={submitting || !participantBId}
                onClick={() =>
                  participantBId && setPendingWalkover({ participantId: participantBId, name: nameB })
                }
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-md border border-gray-200 px-2 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                {nameB}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setWalkoverOpen(false)}
                className="text-[10px] text-gray-500 hover:underline dark:text-gray-400"
              >
                {t('common.cancel')}
              </button>
            </div>
          )}
        </div>
      )}
      {pendingWalkover && (
        <ConfirmationModal
          isOpen={!!pendingWalkover}
          title={t('gameDetails.bracketWalkoverConfirmTitle')}
          message={t('gameDetails.bracketWalkoverConfirmMessage')}
          highlightedText={pendingWalkover.name}
          confirmText={t('gameDetails.bracketAwardWalkover')}
          cancelText={t('common.cancel')}
          confirmVariant="danger"
          isLoading={submitting}
          closeOnConfirm={false}
          onConfirm={() => void awardWalkover(pendingWalkover.participantId)}
          onClose={() => setPendingWalkover(null)}
        />
      )}
    </div>
  );
}
