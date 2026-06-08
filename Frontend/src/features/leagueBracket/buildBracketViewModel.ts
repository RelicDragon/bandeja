import type { BracketSlotDto } from '@/api/leagues';
import { resolveBracketSideDisplayLabel } from '@/utils/bracketFeederSlotLabel.util';
import { translateBracketRoundLabel } from '@/utils/bracketRoundDisplay.util';
import { buildBracketPodiumDisplayRows } from '@/utils/bracketPodiumProgress.util';
import { collectBracketScheduleGames } from '@/utils/bracketScheduleListSort.util';
import { buildLeagueBracketScheduleQuery } from '@/utils/leagueBracketShare.util';
import { isFullGame } from '@/utils/leagueBracketEnrich';
import {
  buildBracketColumns,
  buildConsolationBracketColumns,
  buildGrandFinalColumns,
  buildLosersBracketColumns,
  hasConsolationSlots,
  hasDoubleEliminationSlots,
  participantDisplayName,
  resolveByeAdvanceRoundLabel,
  resolveFeederParticipant,
  resolveSlotSideParticipants,
  slotsById,
  teamUsersFromParticipant,
} from '@/utils/leagueBracketLayout';
import {
  bracketHasPodium,
  buildBracketSlotHighlights,
  isPlayInPhaseComplete,
} from '@/utils/leagueBracketOutcome';
import {
  bracketMatchStatusBadgeClass,
  bracketMatchStatusFromGame,
  bracketMatchStatusI18nKey,
  isBracketMatchComplete,
} from '@/utils/leagueBracketMatchStatus';
import { buildBracketEditPositions } from '@/utils/bracketSlotEdit.util';
import type { Game } from '@/types';
import type {
  BracketByeCardView,
  BracketScheduleListRowView,
  BracketSlotCardView,
  BracketTreeColumnView,
  BracketViewModel,
  BuildBracketViewModelInput,
} from './types';

function columnLabels(translate: BuildBracketViewModelInput['translate']) {
  return {
    playIn: translate('gameDetails.bracketColumnPlayIn'),
    byes: translate('gameDetails.bracketColumnByes'),
    thirdPlace: translate('gameDetails.bracketColumnThirdPlace'),
    mainFallback: (roundIndex: number) =>
      translate('gameDetails.bracketColumnMainRound', { round: roundIndex + 1 }),
  };
}

function buildTreeColumns(
  slots: BracketSlotDto[],
  treeTab: NonNullable<BuildBracketViewModelInput['treeTab']>,
  showConsolationTab: boolean,
  showDoubleElimTabs: boolean,
  translate: BuildBracketViewModelInput['translate']
) {
  if (treeTab === 'consolation' && showConsolationTab) {
    return buildConsolationBracketColumns(slots, (roundIndex) =>
      translate('gameDetails.bracketColumnMainRound', { round: roundIndex + 1 })
    );
  }
  if (treeTab === 'losers' && showDoubleElimTabs) {
    return buildLosersBracketColumns(slots, (roundIndex) =>
      translate('gameDetails.bracketColumnMainRound', { round: roundIndex + 1 })
    );
  }
  if (treeTab === 'grand' && showDoubleElimTabs) {
    return buildGrandFinalColumns(slots, translate('gameDetails.bracketTabGrandFinal'));
  }
  return buildBracketColumns(slots, columnLabels(translate));
}

function collectBracketGames(slots: BracketSlotDto[]): Game[] {
  const seen = new Set<string>();
  const list: Game[] = [];
  for (const slot of slots) {
    if (!slot.game || !isFullGame(slot.game) || seen.has(slot.game.id)) continue;
    seen.add(slot.game.id);
    list.push(slot.game);
  }
  return list;
}

function buildFeederLabels(slots: BracketSlotDto[]): Map<string, string> {
  const lookup = slotsById(slots);
  const labels = new Map<string, string>();
  for (const slot of slots) {
    if (slot.feederSlotAId) {
      const label = resolveBracketSideDisplayLabel(null, slot.feederSlotAId, lookup);
      if (label) labels.set(`${slot.id}:A`, label);
    }
    if (slot.feederSlotBId) {
      const label = resolveBracketSideDisplayLabel(null, slot.feederSlotBId, lookup);
      if (label) labels.set(`${slot.id}:B`, label);
    }
  }
  return labels;
}

function buildByeAdvanceLabels(
  slots: BracketSlotDto[],
  translate: BuildBracketViewModelInput['translate']
): Map<string, string> {
  const labels = new Map<string, string>();
  for (const slot of slots) {
    if (slot.slotKind !== 'BYE') continue;
    const raw = resolveByeAdvanceRoundLabel(slot, slots, (roundIndex) =>
      translate('gameDetails.bracketColumnMainRound', { round: roundIndex + 1 })
    );
    labels.set(slot.id, translateBracketRoundLabel(raw, translate));
  }
  return labels;
}

function buildSlotCardViews(
  slots: BracketSlotDto[],
  translate: BuildBracketViewModelInput['translate']
): Map<string, BracketSlotCardView> {
  const lookup = slotsById(slots);
  const tbd = translate('gameDetails.bracketTbd');
  const views = new Map<string, BracketSlotCardView>();

  for (const slot of slots) {
    if (slot.slotKind === 'BYE') continue;

    const sideAParticipant =
      resolveFeederParticipant(slot.feederSlotAId, lookup) ??
      (slot.slotKind === 'PLAY_IN' ? null : slot.participant);
    const sideBParticipant = resolveFeederParticipant(slot.feederSlotBId, lookup);
    const { participantAId, participantBId } = resolveSlotSideParticipants(slot, lookup);
    const game = slot.game ?? null;
    const matchStatus = bracketMatchStatusFromGame(game);
    const walkoverEligible =
      !isBracketMatchComplete(matchStatus) &&
      !!participantAId &&
      !!participantBId &&
      participantAId !== participantBId;

    views.set(slot.id, {
      sideA: {
        label:
          resolveBracketSideDisplayLabel(sideAParticipant, slot.feederSlotAId, lookup) ?? tbd,
        users: teamUsersFromParticipant(sideAParticipant),
        seed: sideAParticipant?.seedRank,
        participant: sideAParticipant,
        participantId: participantAId,
      },
      sideB: {
        label:
          resolveBracketSideDisplayLabel(sideBParticipant, slot.feederSlotBId, lookup) ?? tbd,
        users: teamUsersFromParticipant(sideBParticipant),
        seed: sideBParticipant?.seedRank,
        participant: sideBParticipant,
        participantId: participantBId,
      },
      roundLabel: slot.roundLabel ? translateBracketRoundLabel(slot.roundLabel, translate) : null,
      fullGame: game && isFullGame(game) ? game : null,
      matchStatus,
      matchStatusBadgeClass: bracketMatchStatusBadgeClass(matchStatus),
      matchStatusI18nKey: bracketMatchStatusI18nKey(matchStatus),
      walkoverEligible,
    });
  }

  return views;
}

function buildByeCardViews(slots: BracketSlotDto[]): Map<string, BracketByeCardView> {
  const views = new Map<string, BracketByeCardView>();
  for (const slot of slots) {
    if (slot.slotKind !== 'BYE') continue;
    views.set(slot.id, {
      name: participantDisplayName(slot.participant),
      users: teamUsersFromParticipant(slot.participant),
      seed: slot.seedRank ?? slot.participant?.seedRank ?? null,
    });
  }
  return views;
}

function buildScheduleListRows(
  scheduleRows: ReturnType<typeof collectBracketScheduleGames>,
  translate: BuildBracketViewModelInput['translate']
): BracketScheduleListRowView[] {
  return scheduleRows.map((entry) => ({
    ...entry,
    roundBadge: entry.roundLabel
      ? translateBracketRoundLabel(entry.roundLabel, translate)
      : entry.kind === 'PLAY_IN'
        ? translate('gameDetails.bracketColumnPlayIn')
        : translate('gameDetails.bracketColumnMainRound', { round: entry.roundIndex + 1 }),
  }));
}

function emptyViewModel(): BracketViewModel {
  return {
    group: null,
    empty: true,
    columns: [],
    treeTabs: { showConsolation: false, showDoubleElim: false },
    scheduleRows: [],
    scheduleListRows: [],
    podiumRows: [],
    slotHighlights: new Map(),
    slotCardViews: new Map(),
    byeCardViews: new Map(),
    byeAdvanceLabels: new Map(),
    feederLabels: new Map(),
    showPodium: false,
    showPlayInGate: false,
    playInComplete: true,
    playInColumnId: '',
    canOpenEdit: false,
    bracketGames: [],
    sharePaths: null,
  };
}

export function buildBracketViewModel(input: BuildBracketViewModelInput): BracketViewModel {
  const {
    group,
    translate,
    treeTab = 'main',
    leagueSeasonId,
    bracketRoundId,
    crossGroupBracket = false,
    canEditBracket = false,
    options,
  } = input;

  if (!group?.slots?.length) {
    return { ...emptyViewModel(), group };
  }

  const slots = group.slots;
  const showConsolationTab = hasConsolationSlots(slots);
  const showDoubleElimTabs = hasDoubleEliminationSlots(slots);
  const playInComplete = isPlayInPhaseComplete(group);
  const showPlayInGate = group.playInGameCount > 0 && !playInComplete;
  const showPodium =
    (options?.showPodium ?? true) && !!leagueSeasonId && bracketHasPodium(group);

  const rawColumns = buildTreeColumns(
    slots,
    treeTab,
    showConsolationTab,
    showDoubleElimTabs,
    translate
  );

  const columns: BracketTreeColumnView[] = rawColumns.map((col) => ({
    id: col.id,
    label: translateBracketRoundLabel(col.label, translate),
    kind: col.kind,
    roundIndex: col.roundIndex,
    slots: col.slots,
    fadeMainColumn:
      treeTab === 'main' &&
      showPlayInGate &&
      (col.kind === 'MAIN' || col.kind === 'THIRD_PLACE'),
  }));

  const playInColumnId =
    columns.find((col) => col.kind === 'PLAY_IN')?.id ?? columns[0]?.id ?? '';

  const groupIdForShare =
    crossGroupBracket || group.leagueGroupId == null ? null : group.leagueGroupId;

  const sharePaths =
    leagueSeasonId && (options?.shareMode ?? true)
      ? {
          scheduleQuery: buildLeagueBracketScheduleQuery({
            roundId: bracketRoundId,
            groupId: groupIdForShare,
          }),
          schedulePath: `/games/${leagueSeasonId}?${buildLeagueBracketScheduleQuery({
            roundId: bracketRoundId,
            groupId: groupIdForShare,
          })}`,
          fullscreenPath: (() => {
            const sp = new URLSearchParams();
            if (bracketRoundId) {
              sp.set('roundId', bracketRoundId);
              sp.set('round', bracketRoundId);
            }
            if (groupIdForShare) sp.set('group', groupIdForShare);
            const q = sp.toString();
            return `/games/${leagueSeasonId}/league-bracket${q ? `?${q}` : ''}`;
          })(),
          shareUrl: null,
        }
      : null;

  const scheduleRows = collectBracketScheduleGames(slots);

  return {
    group,
    empty: columns.length === 0,
    columns,
    treeTabs: {
      showConsolation: showConsolationTab,
      showDoubleElim: showDoubleElimTabs,
    },
    scheduleRows,
    scheduleListRows: buildScheduleListRows(scheduleRows, translate),
    podiumRows: buildBracketPodiumDisplayRows(group),
    slotHighlights: buildBracketSlotHighlights(group),
    slotCardViews: buildSlotCardViews(slots, translate),
    byeCardViews: buildByeCardViews(slots),
    byeAdvanceLabels: buildByeAdvanceLabels(slots, translate),
    feederLabels: buildFeederLabels(slots),
    showPodium,
    showPlayInGate,
    playInComplete,
    playInColumnId,
    canOpenEdit:
      canEditBracket &&
      !!leagueSeasonId &&
      buildBracketEditPositions(slots).some((p) => !p.locked && p.participantId),
    bracketGames: collectBracketGames(slots),
    sharePaths,
  };
}
