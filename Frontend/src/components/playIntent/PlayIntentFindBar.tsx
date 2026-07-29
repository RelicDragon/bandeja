import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatedMount } from '@/components/motion/AnimatedMount';
import { useAuthStore } from '@/store/authStore';
import { usePlayIntentMutations, usePlayIntentPool } from '@/hooks/usePlayIntent';
import { PlayIntentSheet } from './PlayIntentSheet';
import { PlayIntentLookingStrip } from './PlayIntentLookingStrip';
import { resolvePlayIntentProposal } from './playIntentProposal';
import { playIntentsApi, type MatchProposalSummary, type PlayIntent } from '@/api/playIntents';
import { SportPublicIcon } from '@/components/sport/SportPublicIcon';
import { getViewerPrimarySport } from '@/utils/profileSports';
import { parseSport } from '@/sport/sportRegistry';
import type { Sport } from '@/types';
import toast from 'react-hot-toast';

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
  emptyPool: boolean;
  othersCount: number;
  stripMembers: {
    userId: string;
    firstName?: string | null;
    lastName?: string | null;
    avatar: string | null;
  }[];
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

type ProviderProps = {
  cityId?: string | null;
  sport?: Sport | string | null;
  children: ReactNode;
};

export function PlayIntentProvider({ cityId, sport, children }: ProviderProps) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<'compose' | 'lobby'>('compose');
  const [deepProposal, setDeepProposal] = useState<MatchProposalSummary | null>(null);

  const resolvedSport = parseSport(sport || user?.primarySport || 'PADEL');
  const enabled = !!user && !!cityId;
  const { data: pool, refetch, isLoading } = usePlayIntentPool(
    enabled ? cityId : undefined,
    enabled ? resolvedSport : undefined,
  );
  const { cancel } = usePlayIntentMutations(cityId, resolvedSport);

  const proposal = resolvePlayIntentProposal(pool?.pendingProposal, deepProposal);
  const looking = !!pool?.myIntent || !!proposal;

  useEffect(() => {
    const proposalId = searchParams.get('proposal');
    if (!proposalId || !user) return;
    void playIntentsApi
      .getProposal(proposalId)
      .then((p) => {
        setDeepProposal(p);
        setSheetMode('lobby');
        setSheetOpen(true);
      })
      .catch(() => {})
      .finally(() => {
        const next = new URLSearchParams(searchParams);
        next.delete('proposal');
        setSearchParams(next, { replace: true });
      });
  }, [searchParams, setSearchParams, user]);

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
      emptyPool: (pool?.total ?? 0) === 0,
      othersCount: pool?.total ?? 0,
      stripMembers,
    }),
    [enabled, looking, isLoading, openCompose, openLobby, stopLooking, proposal, whenLabel, pool?.total, stripMembers],
  );

  return (
    <Ctx.Provider value={value}>
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
  const { enabled, looking, openCompose } = usePlayIntentUi();
  const primarySport = getViewerPrimarySport(user);

  if (!enabled || looking) return null;

  return (
    <AnimatedMount className="mb-3">
      <button
        type="button"
        onClick={openCompose}
        data-testid="play-intent-cta"
        className="flex w-full items-center gap-2.5 rounded-xl border border-border/70 bg-muted/40 px-2.5 py-2 text-left transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/5"
      >
        <SportPublicIcon sport={primarySport} className="h-5 w-5 shrink-0 object-contain" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">{t('playIntent.wantToPlay')}</div>
          <p className="text-xs leading-snug text-muted-foreground">{t('playIntent.ctaHint')}</p>
        </div>
      </button>
    </AnimatedMount>
  );
}

/** Idle + Looking strips for Find / My — same slot, swaps on start/stop. */
export function PlayIntentHomeStrip({
  cityId,
  sport,
}: {
  cityId?: string | null;
  sport?: Sport | string | null;
}) {
  return (
    <PlayIntentProvider cityId={cityId} sport={sport}>
      <PlayIntentIdleCta />
      <PlayIntentActiveStrip />
    </PlayIntentProvider>
  );
}
