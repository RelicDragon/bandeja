import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Card } from '@/components';
import type { BracketPlayoffGroupDto, BracketPlayoffResponse } from '@/api/leagues';
import type { Game } from '@/types';
import type { LeagueGroup } from '@/api/leagues';
import { SegmentedSwitch } from '@/components/SegmentedSwitch';
import { useIsAppOffline } from '@/utils/bracketOffline.util';
import { LeagueBracketByeCard } from './LeagueBracketByeCard';
import { LeagueBracketSlotCard } from './LeagueBracketSlotCard';
import { LeagueGameCard } from './LeagueGameCard';
import { BracketEditOverlay } from './BracketEditOverlay';
import { BracketShareToolbar } from './BracketShareToolbar';
import { LeagueBracketPodiumCard } from './LeagueBracketPodiumCard';
import { useLeagueGameResultsMap } from '@/hooks/useLeagueGameResultsMap';
import {
  BRACKET_EXPORT_COLUMN_ATTR,
  BRACKET_EXPORT_SCROLL_ATTR,
  BRACKET_EXPORT_SLOTS_ATTR,
  BRACKET_TREE_CARD_CLASS,
  BRACKET_TREE_COLUMN_CLASS,
  buildBracketViewModel,
  type BracketTreeTab,
} from '@/features/leagueBracket';

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
  onBracketUpdated?: (data: BracketPlayoffResponse) => void;
  canRestartPlayoff?: boolean;
  restartingPlayoff?: boolean;
  onRestartPlayoff?: () => void;
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
  onBracketUpdated,
  canRestartPlayoff = false,
  restartingPlayoff = false,
  onRestartPlayoff,
}: LeagueBracketViewProps) {
  const { t, i18n } = useTranslation();
  const offline = useIsAppOffline();
  const [editOpen, setEditOpen] = useState(false);
  const [treeTab, setTreeTab] = useState<BracketTreeTab>('main');
  const bracketExportRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const columnRefs = useRef<Map<string, HTMLElement>>(new Map());

  const groupMeta = useMemo(
    () => groups.find((g) => g.id === group?.leagueGroupId),
    [groups, group?.leagueGroupId]
  );

  const vm = useMemo(
    () =>
      buildBracketViewModel({
        group,
        locale: i18n.language,
        translate: t,
        treeTab,
        leagueSeasonId,
        bracketRoundId,
        crossGroupBracket,
        canEditBracket,
        options: { showPodium: true, shareMode: true },
      }),
    [
      group,
      i18n.language,
      t,
      treeTab,
      leagueSeasonId,
      bracketRoundId,
      crossGroupBracket,
      canEditBracket,
    ]
  );

  const gameResultsMap = useLeagueGameResultsMap(vm.bracketGames);

  const scrollToColumn = useCallback((columnId: string) => {
    const section = columnRefs.current.get(columnId);
    const container = scrollContainerRef.current;
    if (!section || !container) return;
    const left = section.offsetLeft - container.offsetLeft;
    container.scrollTo({ left, behavior: 'smooth' });
  }, []);

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
      </Card>
    );
  }

  if (vm.empty) {
    return (
      <Card className="space-y-2 py-8 text-center">
        <p className="text-sm text-gray-600 dark:text-gray-400">{t('gameDetails.bracketEmptyNoSlots')}</p>
      </Card>
    );
  }

  return (
    <div className={compact ? 'flex min-h-0 flex-1 flex-col gap-3' : 'space-y-3'}>
      {leagueSeasonId ? (
        <div className="space-y-2">
          <div className="rounded-xl border border-gray-200/80 bg-gray-50/60 p-2 dark:border-gray-700/80 dark:bg-gray-900/50">
            <BracketShareToolbar
                leagueSeasonId={leagueSeasonId}
                bracketRoundId={bracketRoundId}
                groupId={crossGroupBracket ? null : group.leagueGroupId}
                exportTargetRef={bracketExportRef}
                canNotifySummary={canEditBracket}
                canEditBracket={vm.canOpenEdit}
                onEditBracket={() => {
                  if (offline) {
                    toast.error(t('gameDetails.bracketOfflineAction'));
                    return;
                  }
                  setEditOpen(true);
                }}
                canRestartPlayoff={canRestartPlayoff}
                restartingPlayoff={restartingPlayoff}
                onRestartPlayoff={onRestartPlayoff}
              />
          </div>
        </div>
      ) : null}
      {vm.treeTabs.showDoubleElim && (
        <div className="flex justify-center">
          <SegmentedSwitch
            tabs={[
              { id: 'main', label: t('gameDetails.bracketTabWinners') },
              { id: 'losers', label: t('gameDetails.bracketTabLosers') },
              { id: 'grand', label: t('gameDetails.bracketTabGrandFinal') },
            ]}
            activeId={treeTab === 'consolation' ? 'main' : treeTab}
            onChange={(id) => setTreeTab(id as BracketTreeTab)}
            showOnlyActiveTabText={false}
            layoutId="bracket-tree-tab-de"
          />
        </div>
      )}
      {vm.treeTabs.showConsolation && !vm.treeTabs.showDoubleElim && (
        <div className="flex justify-center">
          <SegmentedSwitch
            tabs={[
              { id: 'main', label: t('gameDetails.bracketTabMain') },
              { id: 'consolation', label: t('gameDetails.bracketTabConsolation') },
            ]}
            activeId={treeTab}
            onChange={(id) => setTreeTab(id as BracketTreeTab)}
            showOnlyActiveTabText={false}
            layoutId="bracket-tree-tab"
          />
        </div>
      )}
      {vm.showPodium && group && (
        <LeagueBracketPodiumCard
          group={group}
          rows={vm.podiumRows}
          groupMeta={groupMeta}
          crossGroupBracket={crossGroupBracket}
          fullscreenPath={vm.sharePaths?.fullscreenPath}
          showViewLink={!compact}
        />
      )}
      {vm.showPlayInGate && treeTab === 'main' ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-center dark:border-amber-800/60 dark:bg-amber-950/40">
          <p className="text-xs text-amber-900 dark:text-amber-100">
            {t('gameDetails.bracketPlayInGateHint')}
          </p>
          {vm.playInColumnId ? (
            <button
              type="button"
              onClick={() => scrollToColumn(vm.playInColumnId)}
              className="text-xs font-semibold text-amber-800 underline-offset-2 hover:underline dark:text-amber-200"
            >
              {t('gameDetails.bracketJumpToPlayIn')}
            </button>
          ) : null}
        </div>
      ) : vm.columns.length >= 2 ? (
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
        {vm.columns.map((col) => (
          <section
            key={col.id}
            ref={(node) => {
              if (node) columnRefs.current.set(col.id, node);
              else columnRefs.current.delete(col.id);
            }}
            data-column-id={col.id}
            {...{ [BRACKET_EXPORT_COLUMN_ATTR]: '' }}
            className={`flex ${BRACKET_TREE_COLUMN_CLASS} shrink-0 snap-start flex-col gap-2${
              col.fadeMainColumn ? ' opacity-45 saturate-50 transition-opacity' : ''
            }`}
          >
            <h3 className="sticky top-0 z-10 rounded-md bg-gray-50/95 px-2 py-1 text-center text-xs font-semibold uppercase tracking-wide text-gray-700 backdrop-blur-sm dark:bg-gray-900/95 dark:text-gray-200">
              {col.label}
            </h3>
            <div className="flex flex-col gap-2" {...{ [BRACKET_EXPORT_SLOTS_ATTR]: '' }}>
              {col.slots.map((slot) => {
                const highlight = vm.slotHighlights.get(slot.id);
                if (slot.slotKind === 'BYE') {
                  const byeView = vm.byeCardViews.get(slot.id);
                  if (!byeView) return null;
                  return (
                    <LeagueBracketByeCard
                      key={slot.id}
                      cardView={byeView}
                      groupColor={groupMeta?.color}
                      advanceRoundLabel={vm.byeAdvanceLabels.get(slot.id) ?? ''}
                      onChampionPath={highlight?.onChampionPath}
                      deEmphasize={highlight?.deEmphasize}
                    />
                  );
                }
                const cardView = vm.slotCardViews.get(slot.id);
                if (cardView?.fullGame) {
                  const matchGame = cardView.fullGame;
                  const gameWrapClass = [
                    `bracket-tree-game-wrap bracket-tree-card ${BRACKET_TREE_CARD_CLASS} rounded-lg`,
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
                        bracketRoundBadge={col.label}
                        allRounds={gameResultsMap.get(matchGame.id) ?? null}
                      />
                    </div>
                  );
                }
                if (!cardView) return null;
                return (
                  <LeagueBracketSlotCard
                    key={slot.id}
                    slot={slot}
                    cardView={cardView}
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
        ))}
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
