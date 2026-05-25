import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Lock, Pencil } from 'lucide-react';
import { Card } from '@/components';
import { leaguesApi, type BracketPlayoffGroupDto, type BracketPlayoffResponse } from '@/api/leagues';
import type { Game } from '@/types';
import type { LeagueGroup } from '@/api/leagues';
import {
  buildBracketColumns,
  buildConsolationBracketColumns,
  buildGrandFinalColumns,
  buildLosersBracketColumns,
  hasConsolationSlots,
  hasDoubleEliminationSlots,
  resolveByeAdvanceRoundLabel,
} from '@/utils/leagueBracketLayout';
import { SegmentedSwitch } from '@/components/SegmentedSwitch';
import {
  buildBracketSlotHighlights,
  bracketHasPodium,
  isPlayInPhaseComplete,
} from '@/utils/leagueBracketOutcome';
import { buildBracketEditPositions } from '@/utils/bracketSlotEdit.util';
import { useIsAppOffline } from '@/utils/bracketOffline.util';
import { LeagueBracketByeCard } from './LeagueBracketByeCard';
import { LeagueBracketSlotCard } from './LeagueBracketSlotCard';
import { LeagueGameCard } from './LeagueGameCard';
import { BracketEditOverlay } from './BracketEditOverlay';
import { BracketShareToolbar } from './BracketShareToolbar';
import { BracketColumnPicker } from './BracketColumnPicker';
import { LeagueBracketPodiumCard } from './LeagueBracketPodiumCard';
import { isFullGame } from '@/utils/leagueBracketEnrich';
import { BRACKET_TREE_CARD_CLASS } from '@/utils/bracketTreeCard.util';
import { BRACKET_EXPORT_SCROLL_ATTR } from '@/utils/leagueBracketShare.util';

function BracketTreeLoadingSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden px-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`${BRACKET_TREE_CARD_CLASS} h-40 shrink-0 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800/80`}
        />
      ))}
    </div>
  );
}

interface LeagueBracketViewProps {
  group: BracketPlayoffGroupDto | null;
  groups: LeagueGroup[];
  crossGroupBracket?: boolean;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  onOpenGame?: (game: Game) => void;
  onEditGame?: (game: Game) => void;
  compact?: boolean;
  canEditBracket?: boolean;
  leagueSeasonId?: string;
  bracketRoundId?: string;
  seedingLocked?: boolean;
  onBracketUpdated?: (data: BracketPlayoffResponse) => void;
  onOpenListView?: () => void;
}

export function LeagueBracketView({
  group,
  groups,
  crossGroupBracket = false,
  loading,
  error,
  onRetry,
  onOpenGame,
  onEditGame,
  compact,
  canEditBracket = false,
  leagueSeasonId,
  bracketRoundId,
  seedingLocked = false,
  onBracketUpdated,
  onOpenListView,
}: LeagueBracketViewProps) {
  const { t } = useTranslation();
  const offline = useIsAppOffline();
  const [editOpen, setEditOpen] = useState(false);
  const [treeTab, setTreeTab] = useState<'main' | 'consolation' | 'losers' | 'grand'>('main');
  const [lockingSeeding, setLockingSeeding] = useState(false);
  const [selectedColumnId, setSelectedColumnId] = useState('');
  const bracketExportRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const columnRefs = useRef<Map<string, HTMLElement>>(new Map());

  const groupMeta = useMemo(
    () => groups.find((g) => g.id === group?.leagueGroupId),
    [groups, group?.leagueGroupId]
  );

  const showConsolationTab = useMemo(
    () => (group?.slots?.length ? hasConsolationSlots(group.slots) : false),
    [group?.slots]
  );

  const showDoubleElimTabs = useMemo(
    () => (group?.slots?.length ? hasDoubleEliminationSlots(group.slots) : false),
    [group?.slots]
  );

  const columns = useMemo(() => {
    if (!group?.slots?.length) return [];
    if (treeTab === 'consolation' && showConsolationTab) {
      return buildConsolationBracketColumns(group.slots, (roundIndex) =>
        t('gameDetails.bracketColumnMainRound', { round: roundIndex + 1 })
      );
    }
    if (treeTab === 'losers' && showDoubleElimTabs) {
      return buildLosersBracketColumns(group.slots, (roundIndex) =>
        t('gameDetails.bracketColumnMainRound', { round: roundIndex + 1 })
      );
    }
    if (treeTab === 'grand' && showDoubleElimTabs) {
      return buildGrandFinalColumns(group.slots, t('gameDetails.bracketTabGrandFinal'));
    }
    return buildBracketColumns(group.slots, {
      playIn: t('gameDetails.bracketColumnPlayIn'),
      byes: t('gameDetails.bracketColumnByes'),
      thirdPlace: t('gameDetails.bracketColumnThirdPlace'),
      mainFallback: (roundIndex) =>
        t('gameDetails.bracketColumnMainRound', { round: roundIndex + 1 }),
    });
  }, [group?.slots, showConsolationTab, showDoubleElimTabs, treeTab, t]);

  const playInComplete = useMemo(
    () => !group || isPlayInPhaseComplete(group),
    [group]
  );

  const showPlayInGate = !!group && group.playInGameCount > 0 && !playInComplete;

  const slotHighlights = useMemo(
    () => (group ? buildBracketSlotHighlights(group) : new Map()),
    [group]
  );

  const showPodium = !!group && !!leagueSeasonId && bracketHasPodium(group);

  const playInColumnId = useMemo(
    () => columns.find((col) => col.kind === 'PLAY_IN')?.id ?? columns[0]?.id ?? '',
    [columns]
  );

  useEffect(() => {
    if (columns.length === 0) {
      setSelectedColumnId('');
      return;
    }
    setSelectedColumnId((prev) =>
      columns.some((col) => col.id === prev) ? prev : columns[0].id
    );
  }, [columns, treeTab]);

  const scrollToColumn = useCallback((columnId: string) => {
    setSelectedColumnId(columnId);
    const section = columnRefs.current.get(columnId);
    const container = scrollContainerRef.current;
    if (!section || !container) return;
    const left = section.offsetLeft - container.offsetLeft;
    container.scrollTo({ left, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || columns.length < 2) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target instanceof HTMLElement) {
          const id = visible.target.dataset.columnId;
          if (id) setSelectedColumnId(id);
        }
      },
      { root: container, threshold: [0.35, 0.5, 0.65] }
    );

    for (const col of columns) {
      const node = columnRefs.current.get(col.id);
      if (node) observer.observe(node);
    }

    return () => observer.disconnect();
  }, [columns]);

  const canOpenEdit =
    canEditBracket &&
    !seedingLocked &&
    !!leagueSeasonId &&
    !!group?.slots?.length &&
    buildBracketEditPositions(group.slots).some((p) => !p.locked && p.participantId);

  const handleToggleSeedingLock = async () => {
    if (!leagueSeasonId || !bracketRoundId || !onBracketUpdated) return;
    if (offline) {
      toast.error(t('gameDetails.bracketOfflineAction'));
      return;
    }
    setLockingSeeding(true);
    try {
      const res = await leaguesApi.patchBracketSlots(leagueSeasonId, {
        roundId: bracketRoundId,
        seedingLocked: !seedingLocked,
      });
      if (res.data) onBracketUpdated(res.data);
      toast.success(
        seedingLocked
          ? t('gameDetails.bracketSeedingUnlocked')
          : t('gameDetails.bracketSeedingLocked')
      );
    } catch {
      toast.error(t('errors.generic'));
    } finally {
      setLockingSeeding(false);
    }
  };

  if (loading) {
    return <BracketTreeLoadingSkeleton />;
  }

  if (error) {
    return (
      <Card className="space-y-3 py-8 text-center">
        <p className="text-sm text-gray-600 dark:text-gray-400">{t('gameDetails.bracketLoadError')}</p>
        <p className="text-xs text-gray-500 dark:text-gray-500">{t('gameDetails.bracketLoadErrorHint')}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center justify-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700"
          >
            {t('common.retry')}
          </button>
        ) : null}
      </Card>
    );
  }

  if (!group) {
    return (
      <Card className="space-y-2 py-8 text-center">
        <p className="text-sm text-gray-600 dark:text-gray-400">{t('gameDetails.bracketEmpty')}</p>
        {onOpenListView ? (
          <button
            type="button"
            onClick={onOpenListView}
            className="text-xs font-semibold text-primary-700 underline-offset-2 hover:underline dark:text-primary-300"
          >
            {t('gameDetails.bracketListFallbackLink')}
          </button>
        ) : null}
      </Card>
    );
  }

  if (columns.length === 0) {
    return (
      <Card className="space-y-2 py-8 text-center">
        <p className="text-sm text-gray-600 dark:text-gray-400">{t('gameDetails.bracketEmptyNoSlots')}</p>
        {onOpenListView ? (
          <button
            type="button"
            onClick={onOpenListView}
            className="text-xs font-semibold text-primary-700 underline-offset-2 hover:underline dark:text-primary-300"
          >
            {t('gameDetails.bracketListFallbackLink')}
          </button>
        ) : null}
      </Card>
    );
  }

  return (
    <div className={compact ? 'flex min-h-0 flex-1 flex-col gap-3' : 'space-y-3'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {onOpenListView ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('gameDetails.bracketListFallbackHint')}{' '}
            <button
              type="button"
              onClick={onOpenListView}
              className="font-semibold text-primary-700 underline-offset-2 hover:underline dark:text-primary-300"
            >
              {t('gameDetails.bracketListFallbackLink')}
            </button>
          </p>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {leagueSeasonId && (
            <BracketShareToolbar
              leagueSeasonId={leagueSeasonId}
              bracketRoundId={bracketRoundId}
              groupId={crossGroupBracket ? null : group.leagueGroupId}
              exportTargetRef={bracketExportRef}
              canNotifySummary={canEditBracket}
            />
          )}
          {canEditBracket && leagueSeasonId && bracketRoundId && onBracketUpdated && (
            <button
              type="button"
              disabled={lockingSeeding || offline}
              title={offline ? t('gameDetails.bracketOfflineAction') : undefined}
              onClick={handleToggleSeedingLock}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                seedingLocked
                  ? 'border border-amber-400/80 bg-amber-50 text-amber-900 dark:border-amber-600/70 dark:bg-amber-950/50 dark:text-amber-100'
                  : 'border-0 bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              <Lock className="h-3.5 w-3.5" aria-hidden />
              {seedingLocked
                ? t('gameDetails.bracketSeedingUnlockButton')
                : t('gameDetails.bracketSeedingLockButton')}
            </button>
          )}
          {canOpenEdit && (
            <button
              type="button"
              disabled={offline}
              title={offline ? t('gameDetails.bracketOfflineAction') : undefined}
              onClick={() => {
                if (offline) {
                  toast.error(t('gameDetails.bracketOfflineAction'));
                  return;
                }
                setEditOpen(true);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-primary-400/80 px-2.5 py-1.5 text-xs font-semibold text-primary-800 transition hover:bg-primary-50 dark:border-primary-600/60 dark:text-primary-200 dark:hover:bg-primary-950/40"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              {t('gameDetails.bracketEditButton')}
            </button>
          )}
        </div>
      </div>
      {seedingLocked && (
        <p className="text-center text-xs text-amber-700 dark:text-amber-300">
          {t('gameDetails.bracketSeedingLockedHint')}
        </p>
      )}
      {showDoubleElimTabs && (
        <div className="flex justify-center">
          <SegmentedSwitch
            tabs={[
              { id: 'main', label: t('gameDetails.bracketTabWinners') },
              { id: 'losers', label: t('gameDetails.bracketTabLosers') },
              { id: 'grand', label: t('gameDetails.bracketTabGrandFinal') },
            ]}
            activeId={treeTab === 'consolation' ? 'main' : treeTab}
            onChange={(id) => setTreeTab(id as 'main' | 'losers' | 'grand')}
            showOnlyActiveTabText={false}
            layoutId="bracket-tree-tab-de"
          />
        </div>
      )}
      {showConsolationTab && !showDoubleElimTabs && (
        <div className="flex justify-center">
          <SegmentedSwitch
            tabs={[
              { id: 'main', label: t('gameDetails.bracketTabMain') },
              { id: 'consolation', label: t('gameDetails.bracketTabConsolation') },
            ]}
            activeId={treeTab}
            onChange={(id) => setTreeTab(id as 'main' | 'consolation')}
            showOnlyActiveTabText={false}
            layoutId="bracket-tree-tab"
          />
        </div>
      )}
      {showPodium && leagueSeasonId && group && (
        <LeagueBracketPodiumCard
          leagueSeasonId={leagueSeasonId}
          group={group}
          groupMeta={groupMeta}
          crossGroupBracket={crossGroupBracket}
          bracketRoundId={bracketRoundId}
          showViewLink={!compact}
        />
      )}
      {columns.length >= 2 && selectedColumnId && (
        <BracketColumnPicker
          columns={columns}
          selectedColumnId={selectedColumnId}
          onSelect={scrollToColumn}
          layoutIdPrefix={leagueSeasonId ?? 'bracket'}
        />
      )}
      {showPlayInGate && treeTab === 'main' ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-center dark:border-amber-800/60 dark:bg-amber-950/40">
          <p className="text-xs text-amber-900 dark:text-amber-100">
            {t('gameDetails.bracketPlayInGateHint')}
          </p>
          {playInColumnId ? (
            <button
              type="button"
              onClick={() => scrollToColumn(playInColumnId)}
              className="text-xs font-semibold text-amber-800 underline-offset-2 hover:underline dark:text-amber-200"
            >
              {t('gameDetails.bracketJumpToPlayIn')}
            </button>
          ) : null}
        </div>
      ) : columns.length >= 2 ? (
        <p className="text-center text-xs text-gray-500 dark:text-gray-400">
          {t('gameDetails.bracketScrollHint')}
        </p>
      ) : null}
      <div
        ref={bracketExportRef}
        role="region"
        aria-label={t('gameDetails.bracketTreeRegionLabel')}
        id="bracket-tree-region"
        aria-describedby="bracket-list-fallback-hint"
        className={compact ? 'flex min-h-0 min-w-0 flex-1 flex-col' : 'space-y-0'}
      >
        <div
          ref={scrollContainerRef}
          {...{ [BRACKET_EXPORT_SCROLL_ATTR]: '' }}
          className="-mx-1 flex min-h-0 flex-1 gap-3 overflow-x-auto overscroll-x-contain px-1 pb-2 snap-x snap-mandatory"
        >
        {columns.map((col) => {
          const fadeMainColumn =
            treeTab === 'main' && showPlayInGate && (col.kind === 'MAIN' || col.kind === 'THIRD_PLACE');
          return (
          <section
            key={col.id}
            ref={(node) => {
              if (node) columnRefs.current.set(col.id, node);
              else columnRefs.current.delete(col.id);
            }}
            data-column-id={col.id}
            className={`flex w-[min(88vw,14rem)] shrink-0 snap-start flex-col gap-2${
              fadeMainColumn ? ' opacity-45 saturate-50 transition-opacity' : ''
            }`}
          >
            <h3 className="sticky top-0 z-10 rounded-md bg-gray-50/95 px-2 py-1 text-center text-xs font-semibold uppercase tracking-wide text-gray-700 backdrop-blur-sm dark:bg-gray-900/95 dark:text-gray-200">
              {col.label}
            </h3>
            <div className="flex flex-col gap-2">
              {col.slots.map((slot) => {
                const highlight = slotHighlights.get(slot.id);
                if (slot.slotKind === 'BYE') {
                  const advanceRoundLabel = resolveByeAdvanceRoundLabel(
                    slot,
                    group.slots,
                    (roundIndex) => t('gameDetails.bracketColumnMainRound', { round: roundIndex + 1 })
                  );
                  return (
                    <LeagueBracketByeCard
                      key={slot.id}
                      slot={slot}
                      groupColor={groupMeta?.color}
                      advanceRoundLabel={advanceRoundLabel}
                      onChampionPath={highlight?.onChampionPath}
                      deEmphasize={highlight?.deEmphasize}
                    />
                  );
                }
                if (slot.game && isFullGame(slot.game)) {
                  const matchGame = slot.game;
                  const gameWrapClass = [
                    `min-w-0 ${BRACKET_TREE_CARD_CLASS} rounded-lg`,
                    highlight?.deEmphasize ? 'pointer-events-none opacity-45 saturate-50' : '',
                    highlight?.onChampionPath && !highlight.deEmphasize
                      ? 'ring-1 ring-amber-300/80 dark:ring-amber-600/50'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <div key={slot.id} className={gameWrapClass}>
                      <LeagueGameCard
                        game={matchGame}
                        onOpen={onOpenGame ? () => onOpenGame(matchGame) : undefined}
                        onEdit={onEditGame ? () => onEditGame(matchGame) : undefined}
                        showGroupTag={false}
                        showLeagueGroupSideAccent={!crossGroupBracket}
                        seasonPlayoffBadge={crossGroupBracket}
                      />
                    </div>
                  );
                }
                return (
                  <LeagueBracketSlotCard
                    key={slot.id}
                    slot={slot}
                    allSlots={group.slots}
                    groups={groups}
                    showOriginGroupBadge={crossGroupBracket}
                    onOpenGame={onOpenGame}
                    compact={compact}
                    winnerSide={highlight?.winnerSide}
                    loserSide={highlight?.loserSide}
                    onChampionPath={highlight?.onChampionPath}
                    deEmphasize={highlight?.deEmphasize}
                    canAwardWalkover={canEditBracket}
                    leagueSeasonId={leagueSeasonId}
                    onBracketUpdated={onBracketUpdated}
                  />
                );
              })}
            </div>
          </section>
          );
        })}
        </div>
      </div>

      {leagueSeasonId && (
        <BracketEditOverlay
          open={editOpen}
          onClose={() => setEditOpen(false)}
          slots={group.slots}
          leagueSeasonId={leagueSeasonId}
          roundId={bracketRoundId}
          canEdit={canEditBracket}
          crossGroupBracket={crossGroupBracket}
          groups={groups}
          onSaved={onBracketUpdated}
        />
      )}
    </div>
  );
}
