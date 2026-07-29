import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Loader2,
  Radio,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/Drawer';
import { Button } from '@/components';
import { PlayersCarousel } from '@/components/GameDetails/PlayersCarousel';
import { PlayIntentClusterProgress } from '@/components/playIntent/PlayIntentClusterProgress';
import { CourtLobbyArena } from '@/components/playIntent/CourtLobbyArena';
import {
  playIntentsApi,
  type MatchProposalSummary,
  type PlayIntent,
  type PoolMember,
} from '@/api/playIntents';
import { usePlayerCardModal } from '@/hooks/usePlayerCardModal';
import { useFavoritesStore } from '@/store/favoritesStore';
import { useAuthStore } from '@/store/authStore';
import { SportPublicIcon } from '@/components/sport/SportPublicIcon';
import type { GameParticipant, Sport } from '@/types';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: PoolMember[];
  overflow: number;
  partySize: number;
  availableCount: number;
  clusterProgress: number;
  sport: Sport;
  intent?: PlayIntent | null;
  proposal?: MatchProposalSummary | null;
  onChanged?: () => void;
};

function directCreateWindow(intent: PlayIntent) {
  const dateKey = intent.dateKeys[0];
  if (!dateKey) return {};

  const fallbackTime =
    intent.timeOfDay === 'MORNING'
      ? '09:00'
      : intent.timeOfDay === 'AFTERNOON'
        ? '14:00'
        : '18:00';
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hour, minute] = (intent.startTime || fallbackTime).split(':').map(Number);
  const start = new Date(year, month - 1, day, hour, minute);
  if (Number.isNaN(start.getTime())) return {};

  return {
    startTime: start.toISOString(),
    endTime: new Date(start.getTime() + 90 * 60 * 1000).toISOString(),
  };
}

export function CourtLobbyPanel({
  open,
  onOpenChange,
  members,
  overflow,
  partySize,
  availableCount,
  clusterProgress,
  sport,
  intent,
  proposal,
  onChanged,
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const userId = user?.id;
  const { openPlayerCard } = usePlayerCardModal();
  const fetchFavorites = useFavoritesStore((s) => s.fetchFavorites);
  const [busy, setBusy] = useState(false);
  const [waitingHost, setWaitingHost] = useState(false);

  const hasProposal = !!proposal;
  const rosterLocked = !!(proposal?.hostUserId || proposal?.status === 'ACCEPTED');
  const isHost = !!proposal?.hostUserId && proposal.hostUserId === userId;
  const showWaiting = waitingHost || (rosterLocked && !isHost);
  const vacancy = Math.max(0, partySize - (proposal?.members.length ?? 0));
  const rosterFull = (proposal?.members.length ?? 0) >= partySize;
  const proposalId = proposal?.id;
  const directCandidates = useMemo(
    () =>
      [...members]
        .filter(
          (member) => !member.busyInGame && member.affinity !== 'far',
        )
        .sort(
          (a, b) =>
            b.affinityScore - a.affinityScore ||
            a.userId.localeCompare(b.userId),
        )
        .slice(0, Math.max(0, partySize - 1)),
    [members, partySize],
  );
  const [directSelectedIds, setDirectSelectedIds] = useState<string[]>([]);
  const directSelectionSessionRef = useRef<string | null>(null);
  const directCandidateIdsKey = directCandidates
    .map((member) => member.userId)
    .join('|');

  useEffect(() => {
    const sessionKey = open && intent && !proposal ? intent.id : null;
    if (!sessionKey) {
      directSelectionSessionRef.current = null;
      return;
    }

    const candidateIds = directCandidates.map((member) => member.userId);
    if (directSelectionSessionRef.current !== sessionKey) {
      directSelectionSessionRef.current = sessionKey;
      setDirectSelectedIds(candidateIds);
      return;
    }

    const candidateIdSet = new Set(candidateIds);
    setDirectSelectedIds((current) =>
      current.filter((userId) => candidateIdSet.has(userId)),
    );
  }, [directCandidateIdsKey, directCandidates, intent, open, proposal]);

  const directSelectedIdSet = useMemo(
    () => new Set(directSelectedIds),
    [directSelectedIds],
  );
  const directMembers = useMemo(
    () =>
      directCandidates.filter((member) =>
        directSelectedIdSet.has(member.userId),
      ),
    [directCandidates, directSelectedIdSet],
  );
  const directInviteeIds = useMemo(
    () => [...directSelectedIds],
    [directSelectedIds],
  );
  const canCreateFromLobby =
    !proposal &&
    !!intent &&
    directCandidates.length > 0;

  const rosterParticipants = useMemo<GameParticipant[]>(() => {
    if (!proposal) return [];
    return proposal.members.map((m) => ({
      userId: m.userId,
      role: 'PARTICIPANT' as const,
      status: 'PLAYING' as const,
      joinedAt: new Date(0).toISOString(),
      user: {
        id: m.userId,
        firstName: m.firstName ?? undefined,
        lastName: m.lastName ?? undefined,
        avatar: m.avatar,
        level: m.level ?? 0,
        socialLevel: 0,
        gender: 'PREFER_NOT_TO_SAY' as const,
        approvedLevel: false,
        isTrainer: false,
      },
    }));
  }, [proposal]);
  const directRosterParticipants = useMemo<GameParticipant[]>(() => {
    if (!user) return [];
    return [
      {
        userId: user.id,
        role: 'PARTICIPANT' as const,
        status: 'PLAYING' as const,
        joinedAt: new Date(0).toISOString(),
        user,
      },
      ...directMembers.map((member) => ({
        userId: member.userId,
        role: 'PARTICIPANT' as const,
        status: 'PLAYING' as const,
        joinedAt: new Date(0).toISOString(),
        user: {
          id: member.userId,
          firstName: member.firstName ?? undefined,
          lastName: member.lastName ?? undefined,
          avatar: member.avatar,
          level: member.level ?? 0,
          socialLevel: 0,
          gender: 'PREFER_NOT_TO_SAY' as const,
          approvedLevel: false,
          isTrainer: false,
        },
      })),
    ];
  }, [directMembers, user]);
  const displayedRosterParticipants = proposal
    ? rosterParticipants
    : directRosterParticipants;
  const displayedVacancy = proposal
    ? vacancy
    : Math.max(0, partySize - directRosterParticipants.length);
  const arenaMembers = useMemo(
    () =>
      proposal
        ? members
        : members.map((member) => {
            const compatible =
              !member.busyInGame && member.affinity !== 'far';
            const selected = directSelectedIdSet.has(member.userId);
            return {
              ...member,
              inProposal: selected,
              eligibleForProposal: compatible && !selected,
            };
          }),
    [directSelectedIdSet, members, proposal],
  );

  useEffect(() => {
    if (open) void fetchFavorites();
  }, [open, fetchFavorites]);

  useEffect(() => {
    if (!open) setWaitingHost(false);
  }, [open, proposal?.id]);

  const onPoolAvatarClick = useCallback(async (member: PoolMember) => {
    if (!proposalId && intent) {
      const compatible = !member.busyInGame && member.affinity !== 'far';
      if (!compatible) {
        openPlayerCard(member.userId);
        return;
      }
      if (directSelectedIdSet.has(member.userId)) {
        setDirectSelectedIds((current) =>
          current.filter((userId) => userId !== member.userId),
        );
        return;
      }
      if (directSelectedIds.length >= Math.max(0, partySize - 1)) {
        toast.error(t('playIntent.rosterFullHint'));
        return;
      }
      setDirectSelectedIds((current) => [...current, member.userId]);
      return;
    }

    const canAddToMatch =
      !!proposalId &&
      hasProposal &&
      !rosterLocked &&
      !member.inProposal &&
      !!member.eligibleForProposal;

    if (!canAddToMatch) {
      openPlayerCard(member.userId);
      return;
    }
    if (rosterFull) {
      toast.error(t('playIntent.rosterFullHint'));
      return;
    }
    setBusy(true);
    try {
      await playIntentsApi.addProposalMember(proposalId, {
        userId: member.userId,
        intentId: member.intentId,
      });
      onChanged?.();
    } catch {
      openPlayerCard(member.userId);
    } finally {
      setBusy(false);
    }
  }, [
    hasProposal,
    directSelectedIds.length,
    directSelectedIdSet,
    intent,
    onChanged,
    openPlayerCard,
    partySize,
    proposalId,
    rosterFull,
    rosterLocked,
    t,
  ]);

  const onRemoveMember = async (targetUserId: string) => {
    if (!proposal) {
      if (targetUserId !== userId) {
        setDirectSelectedIds((current) =>
          current.filter((id) => id !== targetUserId),
        );
      }
      return;
    }
    if (!proposal || rosterLocked || targetUserId === userId) return;
    setBusy(true);
    try {
      const result = await playIntentsApi.removeProposalMember(proposal.id, targetUserId);
      onChanged?.();
      if (result.dissolved) {
        onOpenChange(false);
      }
    } catch {
      toast.error(t('common.error', { defaultValue: 'Something went wrong' }));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!proposal) return;
    setBusy(true);
    try {
      const result = await playIntentsApi.confirmProposal(proposal.id);
      onChanged?.();
      if (result.role === 'host' && result.createPrefill) {
        const prefill = result.createPrefill;
        onOpenChange(false);
        navigate('/create-game', {
          state: {
            entityType: prefill.entityType === 'BAR' ? 'BAR' : 'GAME',
            initialGameData: {
              sport: prefill.sport,
              clubId: prefill.clubId,
              startTime: prefill.startTime,
              endTime: prefill.endTime,
              isPublic: true,
            },
            invitedPlayerIds: prefill.inviteeIds,
            matchProposalId: prefill.proposalId,
          },
        });
        return;
      }
      setWaitingHost(true);
    } catch {
      toast.error(t('common.error', { defaultValue: 'Something went wrong' }));
    } finally {
      setBusy(false);
    }
  };

  const dismissProposal = () => {
    onOpenChange(false);
    setWaitingHost(false);
  };

  const createFromLobby = () => {
    if (!intent || !canCreateFromLobby) return;
    const window = directCreateWindow(intent);
    onOpenChange(false);
    navigate('/create-game', {
      state: {
        entityType: intent.entityType,
        initialGameData: {
          sport: intent.sport,
          clubId: intent.clubIds[0],
          minLevel: intent.minLevel ?? undefined,
          maxLevel: intent.maxLevel ?? undefined,
          genderTeams: intent.genderTeams,
          isPublic: true,
          maxParticipants: partySize,
          playersPerMatch: partySize === 2 ? 2 : 4,
          ...window,
        },
        invitedPlayerIds: directInviteeIds,
      },
    });
  };

  return (
    <>
        <DrawerHeader className="relative shrink-0 gap-0 px-4 pb-3 pt-3 text-left">
          <div className="flex items-center gap-3 pr-11">
            <div className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-sky-50 shadow-sm dark:border-emerald-300/15 dark:from-emerald-400/15 dark:via-white/5 dark:to-sky-400/10">
              <div
                className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.9),transparent_45%)] opacity-80 dark:opacity-20"
                aria-hidden
              />
              <SportPublicIcon sport={sport} className="relative h-7 w-7 object-contain" />
            </div>

            <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-300">
              <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <DrawerTitle className="text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-300">
                {t('playIntent.looking')}
              </DrawerTitle>
            </div>
          </div>

        </DrawerHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-5">
          <div className="rounded-2xl border border-gray-200/80 bg-white/90 p-3.5 shadow-[0_8px_30px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-white/[0.055] dark:shadow-none">
            <PlayIntentClusterProgress
              current={clusterProgress}
              needed={partySize}
              freeCount={availableCount}
            />
          </div>

          {members.length === 0 ? (
            <div className="relative isolate flex min-h-[330px] flex-col items-center justify-center overflow-hidden rounded-[28px] border border-dashed border-gray-300 bg-white px-8 text-center dark:border-white/15 dark:bg-white/[0.035]">
              <div
                className="absolute left-1/2 top-1/2 -z-10 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.13),transparent_65%)]"
                aria-hidden
              />
              <div className="mb-5 grid h-16 w-16 place-items-center rounded-[22px] border border-emerald-200 bg-emerald-50 text-emerald-600 shadow-[0_12px_35px_rgba(16,185,129,0.14)] dark:border-emerald-300/15 dark:bg-emerald-400/10 dark:text-emerald-300">
                <UsersRound size={28} strokeWidth={1.8} />
              </div>
              <p className="max-w-[240px] text-sm font-semibold leading-relaxed text-gray-700 dark:text-gray-200">
                {t('playIntent.emptyPool')}
              </p>
              <div className="mt-5 flex items-center gap-2 rounded-full border border-gray-200 bg-white/80 px-3 py-1.5 text-[11px] font-medium text-gray-500 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-gray-400">
                <Radio size={13} className="text-emerald-500" />
                {t('playIntent.looking')}
              </div>
            </div>
          ) : (
            <CourtLobbyArena
              members={arenaMembers}
              overflow={overflow}
              busy={busy}
              hasProposal={hasProposal || canCreateFromLobby}
              vacancy={displayedVacancy}
              rosterLocked={rosterLocked}
              sport={sport}
              partySize={partySize}
              onAvatarClick={onPoolAvatarClick}
            />
          )}

          {(proposal || canCreateFromLobby) && (
            <section
              data-testid="match-editor"
              className="relative isolate overflow-hidden rounded-[24px] border border-emerald-200/90 bg-white p-4 shadow-[0_14px_38px_rgba(5,150,105,0.10)] dark:border-emerald-300/15 dark:bg-white/[0.06] dark:shadow-none"
            >
              <div
                className="absolute -right-16 -top-20 -z-10 h-48 w-48 rounded-full bg-emerald-100/70 blur-3xl dark:bg-emerald-400/10"
                aria-hidden
              />
              <div className="mb-4 flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300">
                  {rosterLocked ? (
                    <CheckCircle2 size={20} strokeWidth={2.2} />
                  ) : (
                    <Sparkles size={20} strokeWidth={2.2} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[15px] font-bold tracking-[-0.01em] text-gray-950 dark:text-white">
                    {t('playIntent.proposalTitle')}
                  </h2>
                  <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                    {t('playIntent.proposalSubtitle')}
                  </p>
                  {proposal && (proposal.dateKeys.length > 0 || proposal.startTime || proposal.endTime) && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      {proposal.dateKeys.length > 0 && (
                        <div className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-emerald-50/90 px-2 py-1 text-[11px] font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200/70 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-300/15">
                          <CalendarDays size={12} className="shrink-0 opacity-80" />
                          <span className="truncate">{proposal.dateKeys.join(', ')}</span>
                        </div>
                      )}
                      {(proposal.startTime || proposal.endTime) && (
                        <div className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50/90 px-2 py-1 text-[11px] font-semibold tabular-nums text-emerald-800 ring-1 ring-inset ring-emerald-200/70 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-300/15">
                          <Clock3 size={12} className="shrink-0 opacity-80" />
                          <span>
                            {proposal.startTime || '–'}
                            {proposal.endTime ? `–${proposal.endTime}` : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <PlayersCarousel
                participants={displayedRosterParticipants}
                emptySlots={displayedVacancy}
                userId={userId}
                autoHideNames={false}
                onRemoveParticipant={
                  rosterLocked || busy ? undefined : (id) => void onRemoveMember(id)
                }
                canRemoveParticipant={(id) => !!userId && id !== userId}
              />

              <div className="mt-4 border-t border-gray-200/80 pt-4 dark:border-white/10">
                {!proposal ? (
                  <div className="space-y-3">
                    <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                      {t('playIntent.readyCreateHint', { count: availableCount })}
                    </p>
                    <Button
                      variant="primary"
                      className="h-12 w-full rounded-2xl shadow-[0_10px_25px_rgba(14,165,233,0.22)]"
                      onClick={createFromLobby}
                    >
                      <Sparkles className="h-4 w-4" />
                      {t('playIntent.createGame')}
                    </Button>
                  </div>
                ) : showWaiting ? (
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                        {t('playIntent.waitingHost')}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {proposal.dateKeys.join(', ')}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      className="shrink-0 rounded-xl px-4"
                      onClick={dismissProposal}
                      disabled={busy}
                    >
                      {t('playIntent.decline')}
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2.5">
                    <Button
                      variant="secondary"
                      className="h-12 rounded-2xl px-4"
                      onClick={dismissProposal}
                      disabled={busy}
                    >
                      {t('playIntent.decline')}
                    </Button>
                    <Button
                      variant="primary"
                      className="h-12 flex-1 rounded-2xl shadow-[0_10px_25px_rgba(14,165,233,0.22)]"
                      onClick={() => void confirm()}
                      disabled={busy || !rosterFull}
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          {t('playIntent.createGame')}
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
    </>
  );
}
