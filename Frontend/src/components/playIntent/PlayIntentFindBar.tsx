import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatedMount } from '@/components/motion/AnimatedMount';
import { useAuthStore } from '@/store/authStore';
import { usePlayIntentMutations, usePlayIntentPool } from '@/hooks/usePlayIntent';
import { PlayIntentSheet } from './PlayIntentSheet';
import { PlayIntentLookingStrip } from './PlayIntentLookingStrip';
import { PlayIntentIdleCtaCard } from './PlayIntentIdleCtaCard';
import { resolvePlayIntentProposal } from './playIntentProposal';
import { playIntentsApi, type MatchProposalSummary, type PlayIntent } from '@/api/playIntents';
import { getViewerPrimarySport } from '@/utils/profileSports';
import { parseSport } from '@/sport/sportRegistry';
import type { Sport } from '@/types';
import toast from 'react-hot-toast';
import { SharedPlayIntentDialog } from './SharedPlayIntentDialog';
import { SharedPlayIntentProgressDialog } from './SharedPlayIntentProgressDialog';
import { useSharedPlayIntentEntry } from './useSharedPlayIntentEntry';

type PlayIntentCtx = {
  enabled: boolean;
  looking: boolean;
  isLoading: boolean;
  openCompose: () => void;
  openLobby: () => void;
  openProposal: () => void;
  stopLooking: () => void;
  proposal: MatchProposalSummary | null;
  whenLabel: string;
  idleWhenLabel: string;
  emptyPool: boolean;
  othersCount: number;
  stripMembers: {
    userId: string;
    firstName?: string | null;
    lastName?: string | null;
    avatar: string | null;
  }[];
  proposalArrivalToken: number;
};

const Ctx = createContext<PlayIntentCtx | null>(null);

function usePlayIntentUi() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('PlayIntent UI must be inside PlayIntentProvider');
  return ctx;
}

function humanDays(dateKeys: string[], todayKey: string, t: (k: string) => string): string {
  if (!dateKeys.length) return t('playIntent.looking');
  const addDays = (key: string, n: number) => {
    const [y, m, d] = key.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + n));
    return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
  };
  const tomorrow = addDays(todayKey, 1);
  const dayAfter = addDays(todayKey, 2);
  return dateKeys
    .map((key) => {
      if (key === todayKey) return t('playIntent.today');
      if (key === tomorrow) return t('playIntent.tomorrow');
      if (key === dayAfter) return t('playIntent.dayAfter');
      return key.slice(5);
    })
    .join(', ');
}

function timeHint(intent: PlayIntent | null | undefined, t: (k: string) => string): string {
  if (!intent) return '';
  switch (intent.timeOfDay) {
    case 'MORNING':
      return t('playIntent.morning');
    case 'AFTERNOON':
      return t('playIntent.afternoon');
    case 'EVENING':
      return t('playIntent.evening');
    case 'CUSTOM':
      return [intent.startTime, intent.endTime].filter(Boolean).join('–');
    default:
      return t('playIntent.anytime');
  }
}

/** My + Find both mount providers; only one may claim a proposal deep link. */
const proposalDeepLinkLocks = new Set<string>();

type ProviderProps = {
  cityId?: string | null;
  sport?: Sport | string | null;
  /** Push/Telegram “play too” deep links are owned by My tab only. */
  acceptSharedDeepLinks?: boolean;
  children: ReactNode;
};

export function PlayIntentProvider({
  cityId,
  sport,
  acceptSharedDeepLinks = false,
  children,
}: ProviderProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<'compose' | 'lobby'>('compose');
  const [deepProposal, setDeepProposal] = useState<MatchProposalSummary | null>(null);
  const [proposalArrivalToken, setProposalArrivalToken] = useState(0);
  const [proposalAnnouncement, setProposalAnnouncement] = useState<{
    id: string;
    text: string;
  } | null>(null);
  const proposalRequestRef = useRef<string | null>(null);
  const previousLiveProposalIdRef = useRef<string | null | undefined>(
    undefined,
  );

  const sharedEntry = useSharedPlayIntentEntry(!!user && acceptSharedDeepLinks);
  const { clearJoinedSport, joinedSport } = sharedEntry;
  const resolvedSport = parseSport(
    joinedSport || sport || user?.primarySport || 'PADEL',
  );
  const enabled = !!user && !!cityId;
  const { data: pool, refetch, isLoading } = usePlayIntentPool(
    enabled ? cityId : undefined,
    enabled ? resolvedSport : undefined,
  );
  const { cancel } = usePlayIntentMutations(cityId, resolvedSport);

  const proposal = resolvePlayIntentProposal(pool?.pendingProposal, deepProposal);
  const looking = !!pool?.myIntent || !!proposal;

  useEffect(() => {
    if (!pool) return;
    const nextId = pool.pendingProposal?.id ?? null;
    const previousId = previousLiveProposalIdRef.current;
    previousLiveProposalIdRef.current = nextId;
    if (previousId === undefined || !nextId || nextId === previousId) return;
    setProposalArrivalToken((token) => token + 1);
    setProposalAnnouncement({
      id: nextId,
      text: t('playIntent.proposalArrivedAnnouncement', {
        defaultValue: 'Match found. Players are ready to form a game.',
      }),
    });
  }, [pool, t]);

  useEffect(() => {
    if (
      joinedSport &&
      pool &&
      !isLoading &&
      !looking &&
      !sheetOpen &&
      searchParams.get('lobby') !== '1'
    ) {
      clearJoinedSport();
    }
  }, [
    isLoading,
    looking,
    pool,
    searchParams,
    clearJoinedSport,
    joinedSport,
    sheetOpen,
  ]);

  useEffect(() => {
    const proposalId = searchParams.get('proposal');
    if (!proposalId) {
      proposalRequestRef.current = null;
      return;
    }
    if (
      !user ||
      proposalRequestRef.current === proposalId ||
      proposalDeepLinkLocks.has(proposalId)
    ) {
      return;
    }
    proposalRequestRef.current = proposalId;
    proposalDeepLinkLocks.add(proposalId);
    let clearProposalParam = false;
    void playIntentsApi
      .getProposal(proposalId)
      .then((p) => {
        if (proposalRequestRef.current !== proposalId) return;
        clearProposalParam = true;
        if (p.gameId) {
          navigate(`/games/${p.gameId}`);
          return;
        }
        setDeepProposal(p);
        setSheetMode('lobby');
        setSheetOpen(true);
      })
      .catch((error: unknown) => {
        if (proposalRequestRef.current !== proposalId) return;
        const response = (
          error as {
            response?: { status?: number; data?: { code?: string } };
          }
        ).response;
        const unavailable =
          response?.data?.code === 'playIntent.proposalUnavailable' ||
          response?.status === 404;
        if (unavailable) {
          clearProposalParam = true;
          toast.error(t('playIntent.proposalUnavailable'));
          void refetch();
          if (looking) {
            setSheetMode('lobby');
            setSheetOpen(true);
          }
          return;
        }
        // Keep ?proposal= for retry after transient network/API failures.
        proposalRequestRef.current = null;
        toast.error(
          t('common.error', { defaultValue: 'Something went wrong' }),
        );
      })
      .finally(() => {
        proposalDeepLinkLocks.delete(proposalId);
        if (!clearProposalParam) return;
        setSearchParams(
          (current) => {
            const next = new URLSearchParams(current);
            if (next.get('proposal') === proposalId) {
              next.delete('proposal');
            }
            return next;
          },
          { replace: true },
        );
      });
  }, [
    looking,
    navigate,
    refetch,
    searchParams,
    setSearchParams,
    t,
    user,
  ]);

  useEffect(() => {
    if (searchParams.get('lobby') === '1' && looking) {
      setSheetMode('lobby');
      setSheetOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('lobby');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, looking]);

  useEffect(() => {
    if (!deepProposal) return;
    const liveId = pool?.pendingProposal?.id;
    if (liveId && liveId !== deepProposal.id) {
      setDeepProposal(null);
    }
    if (pool && !pool.pendingProposal) {
      setDeepProposal(null);
    }
  }, [pool, deepProposal]);

  const stripMembers = useMemo(
    () =>
      (pool?.members.filter((m) => m.affinity !== 'far').slice(0, 3) ?? []).map((m) => ({
        userId: m.userId,
        firstName: m.firstName,
        lastName: m.lastName,
        avatar: m.avatar,
      })),
    [pool?.members],
  );
  const dayLabel = humanDays(pool?.myIntent?.dateKeys || [], pool?.todayKey || '', t);
  const whenLabel = [dayLabel, timeHint(pool?.myIntent, t)].filter(Boolean).join(' · ');
  const idleWhenLabel = humanDays(
    pool?.discoveryDateKeys || [],
    pool?.todayKey || '',
    t,
  );

  const stopLooking = useCallback(() => {
    void cancel.mutateAsync(pool?.myIntent?.id).catch(() => {
      toast.error(t('common.error', { defaultValue: 'Something went wrong' }));
    });
  }, [cancel, pool?.myIntent?.id, t]);

  const openLobby = useCallback(() => {
    setSheetMode('lobby');
    setSheetOpen(true);
  }, []);
  const openCompose = useCallback(() => {
    setSheetMode('compose');
    setSheetOpen(true);
  }, []);
  const handleLobbyChanged = useCallback(() => {
    void refetch();
  }, [refetch]);

  const value = useMemo<PlayIntentCtx>(
    () => ({
      enabled,
      looking,
      isLoading,
      openCompose,
      openLobby,
      openProposal: openLobby,
      stopLooking,
      proposal,
      whenLabel,
      idleWhenLabel,
      emptyPool: (pool?.total ?? 0) === 0,
      othersCount: pool?.total ?? 0,
      stripMembers,
      proposalArrivalToken,
    }),
    [
      enabled,
      looking,
      isLoading,
      openCompose,
      openLobby,
      stopLooking,
      proposal,
      whenLabel,
      idleWhenLabel,
      pool?.total,
      stripMembers,
      proposalArrivalToken,
    ],
  );

  return (
    <Ctx.Provider value={value}>
      <div
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
        role="status"
      >
        {proposalAnnouncement ? (
          <span key={proposalAnnouncement.id}>
            {proposalAnnouncement.text}
          </span>
        ) : null}
      </div>
      {children}
      {enabled && (
        <PlayIntentSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          initialMode={sheetMode}
          cityId={cityId}
          sport={resolvedSport}
          todayKey={pool?.todayKey}
          members={pool?.members ?? []}
          overflow={pool?.overflow ?? 0}
          partySize={pool?.partySize ?? 4}
          availableCount={pool?.availableCount ?? 0}
          clusterProgress={pool?.clusterProgress ?? 1}
          intent={pool?.myIntent}
          proposal={proposal}
          onChanged={handleLobbyChanged}
        />
      )}
      {sharedEntry.intent && (
        <SharedPlayIntentDialog
          intent={sharedEntry.intent}
          open
          joining={sharedEntry.joining}
          onOpenChange={(open) => {
            if (!open) sharedEntry.dismiss();
          }}
          onJoin={() => sharedEntry.join?.()}
        />
      )}
      {sharedEntry.progress && (
        <SharedPlayIntentProgressDialog mode={sharedEntry.progress} />
      )}
    </Ctx.Provider>
  );
}

/** Slim status above the game list — only while looking. */
export function PlayIntentActiveStrip() {
  const {
    enabled,
    looking,
    proposal,
    whenLabel,
    emptyPool,
    othersCount,
    stripMembers,
    proposalArrivalToken,
    openLobby,
    stopLooking,
  } = usePlayIntentUi();

  if (!enabled || !looking) return null;

  return (
    <PlayIntentLookingStrip
      proposal={!!proposal}
      whenLabel={whenLabel}
      emptyPool={emptyPool}
      othersCount={othersCount}
      stripMembers={stripMembers}
      proposalArrivalToken={proposalArrivalToken}
      onOpenLobby={openLobby}
      onOpenProposal={openLobby}
      onConfirmStop={stopLooking}
    />
  );
}

/** Idle entry above the game list — same slot as Looking strip. */
export function PlayIntentIdleCta() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const {
    enabled,
    looking,
    openCompose,
    idleWhenLabel,
    othersCount,
    stripMembers,
  } = usePlayIntentUi();
  const primarySport = getViewerPrimarySport(user);

  if (!enabled || looking) return null;

  return (
    <AnimatedMount className="mb-3">
      <PlayIntentIdleCtaCard
        sport={primarySport}
        title={t('playIntent.wantToPlay')}
        hint={
          othersCount > 0
            ? t('playIntent.idleOthersLooking', {
                count: othersCount,
                days: idleWhenLabel,
              })
            : t('playIntent.ctaHint')
        }
        members={stripMembers}
        onClick={openCompose}
      />
    </AnimatedMount>
  );
}

/** Idle + Looking strips for Find / My — same slot, swaps on start/stop. */
export function PlayIntentHomeStrip({
  cityId,
  sport,
  acceptSharedDeepLinks = false,
}: {
  cityId?: string | null;
  sport?: Sport | string | null;
  acceptSharedDeepLinks?: boolean;
}) {
  return (
    <PlayIntentProvider
      cityId={cityId}
      sport={sport}
      acceptSharedDeepLinks={acceptSharedDeepLinks}
    >
      <PlayIntentIdleCta />
      <PlayIntentActiveStrip />
    </PlayIntentProvider>
  );
}
