import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { LeagueGroup, LeagueStanding } from '@/api/leagues';
import { SegmentedSwitch } from '@/components/SegmentedSwitch';
import { BracketStructureSummary } from './BracketStructureSummary';
import { CrossGroupBracketSeedList } from './CrossGroupBracketSeedList';
import { BracketPlayInPairEditor } from './BracketPlayInPairEditor';
import { getLeagueGroupColor, getLeagueGroupSoftColor } from '@/utils/leagueGroupColors';
import { type CrossGroupSeedingPreset, sortCanonicalGroups } from '@/utils/crossGroupBracketSeeding';
import { BRACKET_MAX_ENTRANTS, BRACKET_MIN_ENTRANTS } from '@/utils/bracketStructure';
import { BracketPhase4CreateOptions } from './BracketPhase4CreateOptions';
import type { PlayInSeedPair } from '@/utils/bracketCustomPlayIn.util';
import {
  crossGroupTotalFromTeamsPerGroup,
  deriveCrossGroupPool,
  maxTopKForGroup,
  type TeamsPerGroupMap,
} from '@/utils/crossGroupUnequalK.util';

interface CrossGroupBracketConfigStepProps {
  groups: LeagueGroup[];
  getStandingsForGroup: (groupId: string) => LeagueStanding[];
  teamsPerGroup: TeamsPerGroupMap;
  onTeamsPerGroupChange: (next: TeamsPerGroupMap) => void;
  includedGroupIds: Set<string>;
  onIncludedGroupIdsChange: (next: Set<string>) => void;
  seedingPreset: CrossGroupSeedingPreset;
  onSeedingPresetChange: (preset: CrossGroupSeedingPreset) => void;
  manualGlobalIds: string[] | null;
  onManualGlobalIdsChange: (ids: string[] | null) => void;
  phase4EntrantCount?: number;
  includeThirdPlace?: boolean;
  onIncludeThirdPlaceChange?: (value: boolean) => void;
  includeConsolationBracket?: boolean;
  onIncludeConsolationBracketChange?: (value: boolean) => void;
  includeDoubleElimination?: boolean;
  onIncludeDoubleEliminationChange?: (value: boolean) => void;
  customByeEnabled?: boolean;
  onCustomByeEnabledChange?: (value: boolean) => void;
  customByeSeedRanks?: number[];
  onCustomByeSeedRanksChange?: (ranks: number[]) => void;
  customPlayInEnabled?: boolean;
  onCustomPlayInEnabledChange?: (value: boolean) => void;
  playInPairs?: PlayInSeedPair[];
  onPlayInPairsChange?: (pairs: PlayInSeedPair[]) => void;
  seedLabels?: Record<number, string>;
}

export function CrossGroupBracketConfigStep({
  groups,
  getStandingsForGroup,
  teamsPerGroup,
  onTeamsPerGroupChange,
  includedGroupIds,
  onIncludedGroupIdsChange,
  seedingPreset,
  onSeedingPresetChange,
  manualGlobalIds,
  onManualGlobalIdsChange,
  phase4EntrantCount,
  includeThirdPlace = false,
  onIncludeThirdPlaceChange,
  includeConsolationBracket = false,
  onIncludeConsolationBracketChange,
  includeDoubleElimination = false,
  onIncludeDoubleEliminationChange,
  customByeEnabled = false,
  onCustomByeEnabledChange,
  customByeSeedRanks = [],
  onCustomByeSeedRanksChange,
  customPlayInEnabled = false,
  onCustomPlayInEnabledChange,
  playInPairs = [],
  onPlayInPairsChange,
  seedLabels,
}: CrossGroupBracketConfigStepProps) {
  const { t } = useTranslation();

  const canonicalGroups = useMemo(() => sortCanonicalGroups(groups), [groups]);
  const includedList = useMemo(
    () => canonicalGroups.filter((g) => includedGroupIds.has(g.id)),
    [canonicalGroups, includedGroupIds]
  );

  const standingsByGroup = useMemo(() => {
    const map: Record<string, LeagueStanding[]> = {};
    for (const g of groups) {
      map[g.id] = getStandingsForGroup(g.id);
    }
    return map;
  }, [groups, getStandingsForGroup]);

  const groupOrder = includedList.map((g) => g.id);
  const totalN = crossGroupTotalFromTeamsPerGroup(teamsPerGroup, groupOrder);
  const advancedReady = totalN >= BRACKET_MIN_ENTRANTS && totalN <= BRACKET_MAX_ENTRANTS;

  const { globalParticipantIds: autoGlobalIds } = useMemo(
    () =>
      deriveCrossGroupPool({
        standingsByGroup,
        includedGroupIds: groupOrder,
        teamsPerGroup,
        seedingPreset,
        manualGlobalIds: null,
      }),
    [standingsByGroup, groupOrder, teamsPerGroup, seedingPreset]
  );

  const globalIds =
    seedingPreset === 'MANUAL' && manualGlobalIds?.length ? manualGlobalIds : autoGlobalIds;

  const standingsById = useMemo(
    () =>
      new Map(
        Object.values(standingsByGroup)
          .flat()
          .map((s) => [s.id, s] as const)
      ),
    [standingsByGroup]
  );

  const setGroupK = (groupId: string, k: number) => {
    onTeamsPerGroupChange({ ...teamsPerGroup, [groupId]: k });
    onManualGlobalIdsChange(null);
  };

  const toggleIncluded = (groupId: string) => {
    const next = new Set(includedGroupIds);
    if (next.has(groupId)) {
      if (next.size <= 2) return;
      next.delete(groupId);
    } else {
      next.add(groupId);
    }
    onIncludedGroupIdsChange(next);
  };

  const groupTooSmall = includedList.find((g) => {
    const k = teamsPerGroup[g.id] ?? 0;
    return k >= 1 && (standingsByGroup[g.id] ?? []).length < k;
  });

  const summaryParts = includedList
    .filter((g) => (teamsPerGroup[g.id] ?? 0) >= 1)
    .map((g) => `${g.name}×${teamsPerGroup[g.id]}`)
    .join(', ');

  const customByesForSummary =
    customByeEnabled && customByeSeedRanks.length > 0 ? customByeSeedRanks : undefined;

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block text-center">
          {t('gameDetails.bracketTeamsPerGroupLabel')}
        </label>
        <div className="space-y-3">
          {includedList.map((g) => {
            const count = standingsByGroup[g.id]?.length ?? 0;
            const maxK = maxTopKForGroup(count);
            const k = teamsPerGroup[g.id] ?? 0;
            const accent = g.color ? getLeagueGroupColor(g.color) : undefined;
            const kOptions = maxK >= 1 ? Array.from({ length: maxK }, (_, i) => i + 1) : [];
            return (
              <div key={g.id} className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                    {g.color && (
                      <span
                        className="inline-block w-2 h-2 rounded-full mr-1.5"
                        style={{ backgroundColor: accent }}
                      />
                    )}
                    {g.name}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">({count})</span>
                </div>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {kOptions.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setGroupK(g.id, n)}
                      className={`min-w-[2rem] px-2 py-1 rounded-md text-sm font-bold transition-all ${
                        k === n
                          ? 'bg-primary-500 text-white shadow'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block text-center">
          {t('gameDetails.bracketIncludedGroups')}
        </label>
        <div className="flex flex-wrap gap-2 justify-center">
          {canonicalGroups.map((g) => {
            const included = includedGroupIds.has(g.id);
            const accent = g.color ? getLeagueGroupColor(g.color) : undefined;
            const soft = g.color ? getLeagueGroupSoftColor(g.color, '20') : undefined;
            const count = standingsByGroup[g.id]?.length ?? 0;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => toggleIncluded(g.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-all ${
                  included
                    ? 'border-primary-500 bg-primary-500/15 text-primary-700 dark:text-primary-300'
                    : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 opacity-70'
                }`}
                style={included && soft ? { backgroundColor: soft, borderColor: accent } : undefined}
              >
                {g.color && (
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: accent }}
                  />
                )}
                <span>{g.name}</span>
                <span className="text-xs">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {includedList.length >= 2 && totalN >= BRACKET_MIN_ENTRANTS && (
        <p className="text-sm text-center text-gray-700 dark:text-gray-300">
          {t('gameDetails.bracketCrossGroupUnequalSummary', {
            defaultValue: '{{total}} teams ({{breakdown}})',
            total: totalN,
            breakdown: summaryParts,
          })}
        </p>
      )}

      {totalN > BRACKET_MAX_ENTRANTS && (
        <p className="text-xs text-center text-amber-600 dark:text-amber-400">
          {t('gameDetails.bracketErrorTotalOver16')}
        </p>
      )}

      {groupTooSmall && (
        <p className="text-xs text-center text-amber-600 dark:text-amber-400">
          {t('gameDetails.bracketErrorGroupTooSmall', {
            group: groupTooSmall.name,
            n: (standingsByGroup[groupTooSmall.id] ?? []).length,
            k: teamsPerGroup[groupTooSmall.id],
          })}
        </p>
      )}

      {includedList.length >= 2 && totalN >= BRACKET_MIN_ENTRANTS && (
        <>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block text-center">
              {t('gameDetails.bracketSeedingPreset')}
            </label>
            <SegmentedSwitch
              tabs={[
                {
                  id: 'WINNERS_THEN_RUNNERS_UP',
                  label: t('gameDetails.bracketSeedingWinnersThenRunnersUp'),
                },
                {
                  id: 'GROUP_BLOCK',
                  label: t('gameDetails.bracketSeedingGroupBlock'),
                },
                {
                  id: 'MANUAL',
                  label: t('gameDetails.bracketSeedingManual'),
                },
              ]}
              activeId={seedingPreset}
              onChange={(id) => {
                onSeedingPresetChange(id as CrossGroupSeedingPreset);
                if (id !== 'MANUAL') onManualGlobalIdsChange(null);
                else onManualGlobalIdsChange(autoGlobalIds);
              }}
              showOnlyActiveTabText={false}
              layoutId="cross-group-seeding"
              orientation="vertical"
            />
          </div>

          {globalIds.length > 0 && (
            <CrossGroupBracketSeedList
              globalIds={globalIds}
              standingsById={standingsById}
              groupsById={new Map(groups.map((g) => [g.id, g]))}
              readOnly={seedingPreset !== 'MANUAL'}
              onReorder={
                seedingPreset === 'MANUAL'
                  ? (next) => onManualGlobalIdsChange(next)
                  : undefined
              }
            />
          )}
        </>
      )}

      {advancedReady && (
        <>
          <BracketStructureSummary entrantCount={totalN} customByeSeedRanks={customByesForSummary} />
          {phase4EntrantCount != null &&
            onIncludeThirdPlaceChange &&
            onIncludeConsolationBracketChange &&
            onIncludeDoubleEliminationChange &&
            onCustomByeEnabledChange &&
            onCustomByeSeedRanksChange && (
              <BracketPhase4CreateOptions
                entrantCount={phase4EntrantCount}
                includeThirdPlace={includeThirdPlace}
                onIncludeThirdPlaceChange={onIncludeThirdPlaceChange}
                includeConsolationBracket={includeConsolationBracket}
                onIncludeConsolationBracketChange={onIncludeConsolationBracketChange}
                includeDoubleElimination={includeDoubleElimination}
                onIncludeDoubleEliminationChange={onIncludeDoubleEliminationChange}
                customByeEnabled={customByeEnabled}
                onCustomByeEnabledChange={onCustomByeEnabledChange}
                customByeSeedRanks={customByeSeedRanks}
                onCustomByeSeedRanksChange={onCustomByeSeedRanksChange}
                seedLabels={seedLabels}
              />
            )}
          {onCustomPlayInEnabledChange && onPlayInPairsChange && (
            <BracketPlayInPairEditor
              entrantCount={totalN}
              enabled={customPlayInEnabled}
              onEnabledChange={onCustomPlayInEnabledChange}
              pairs={playInPairs}
              onPairsChange={onPlayInPairsChange}
              customByeSeedRanks={customByeEnabled ? customByeSeedRanks : undefined}
              seedLabels={seedLabels}
            />
          )}
        </>
      )}
    </div>
  );
}
