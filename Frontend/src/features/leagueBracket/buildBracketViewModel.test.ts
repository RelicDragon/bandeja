import { describe, expect, it } from 'vitest';
import type { BracketPlayoffGroupDto, BracketSlotDto } from '@/api/leagues';
import type { Game } from '@/types';
import { buildBracketViewModel } from './buildBracketViewModel';
import type { BracketViewModel } from './types';

function slot(partial: Partial<BracketSlotDto> & Pick<BracketSlotDto, 'id' | 'slotKind'>): BracketSlotDto {
  return {
    slotKey: partial.id,
    phaseIndex: 0,
    roundIndex: 0,
    matchIndex: 0,
    ...partial,
  };
}

function finalGame(winner: 'teamA' | 'teamB', winnerParticipant: BracketSlotDto['participant']): Game {
  const winUser = 'u-win';
  const loseUser = 'u-lose';
  return {
    id: 'g-qf0',
    resultsStatus: 'FINAL',
    fixedTeams: [
      {
        teamNumber: 1,
        players: winnerParticipant?.leagueTeam?.players ?? [{ user: { id: winUser } }],
      },
      { teamNumber: 2, players: [{ user: { id: loseUser } }] },
    ],
    outcomes: [
      { user: { id: winUser }, wins: winner === 'teamA' ? 2 : 0 },
      { user: { id: loseUser }, wins: winner === 'teamB' ? 2 : 0 },
    ],
  } as Game;
}

function eightTeamPartialGroup(): BracketPlayoffGroupDto {
  const winner = {
    id: 'p-win',
    displayName: 'Team Alpha',
    leagueTeam: { id: 't1', players: [{ id: 'tp1', userId: 'u-win', user: { id: 'u-win' } }] },
  };
  const slots: BracketSlotDto[] = [
    slot({
      id: 'qf0',
      slotKind: 'MAIN',
      roundIndex: 0,
      matchIndex: 0,
      roundLabel: 'Quarterfinals',
      winnerSlotId: 'sf0',
      gameId: 'g-qf0',
      game: finalGame('teamA', winner),
      participant: winner,
    }),
    slot({
      id: 'qf1',
      slotKind: 'MAIN',
      roundIndex: 0,
      matchIndex: 1,
      roundLabel: 'Quarterfinals',
      winnerSlotId: 'sf0',
    }),
    slot({
      id: 'qf2',
      slotKind: 'MAIN',
      roundIndex: 0,
      matchIndex: 2,
      roundLabel: 'Quarterfinals',
      winnerSlotId: 'sf1',
    }),
    slot({
      id: 'qf3',
      slotKind: 'MAIN',
      roundIndex: 0,
      matchIndex: 3,
      roundLabel: 'Quarterfinals',
      winnerSlotId: 'sf1',
    }),
    slot({
      id: 'sf0',
      slotKind: 'MAIN',
      roundIndex: 1,
      matchIndex: 0,
      roundLabel: 'Semifinals',
      feederSlotAId: 'qf0',
      feederSlotBId: 'qf1',
      winnerSlotId: 'fin',
      leagueParticipantId: 'p-win',
      participant: winner,
    }),
    slot({
      id: 'sf1',
      slotKind: 'MAIN',
      roundIndex: 1,
      matchIndex: 1,
      roundLabel: 'Semifinals',
      feederSlotAId: 'qf2',
      feederSlotBId: 'qf3',
      winnerSlotId: 'fin',
    }),
    slot({
      id: 'fin',
      slotKind: 'MAIN',
      roundIndex: 2,
      matchIndex: 0,
      roundLabel: 'Final',
      feederSlotAId: 'sf0',
      feederSlotBId: 'sf1',
    }),
  ];
  return {
    leagueGroupId: 'g1',
    entrantCount: 8,
    bracketSize: 8,
    byeCount: 0,
    playInGameCount: 0,
    slots,
  };
}

const translate = (key: string, options?: Record<string, unknown>) => {
  if (key === 'gameDetails.bracketColumnMainRound' && options?.round != null) {
    return `Round ${options.round}`;
  }
  const map: Record<string, string> = {
    'gameDetails.bracketColumnPlayIn': 'Play-in',
    'gameDetails.bracketColumnByes': 'Byes',
    'gameDetails.bracketColumnThirdPlace': 'Third place',
    'gameDetails.bracketTabGrandFinal': 'Grand final',
    'gameDetails.bracketRoundQuarterfinals': 'Quarterfinals',
    'gameDetails.bracketRoundSemifinals': 'Semifinals',
    'gameDetails.bracketRoundFinal': 'Final',
  };
  return map[key] ?? key;
};

function snapshotShape(vm: BracketViewModel) {
  return {
    empty: vm.empty,
    treeTabs: vm.treeTabs,
    columns: vm.columns.map((col) => ({
      id: col.id,
      kind: col.kind,
      label: col.label,
      fadeMainColumn: col.fadeMainColumn,
      slotIds: col.slots.map((s) => s.id),
    })),
    scheduleRows: vm.scheduleRows.map((row) => ({
      gameId: row.game.id,
      kind: row.kind,
      roundIndex: row.roundIndex,
      roundLabel: row.roundLabel,
    })),
    podiumRows: vm.podiumRows,
    showPodium: vm.showPodium,
    showPlayInGate: vm.showPlayInGate,
    playInComplete: vm.playInComplete,
    canOpenEdit: vm.canOpenEdit,
    playInColumnId: vm.playInColumnId,
    bracketGameIds: vm.bracketGames.map((g) => g.id),
    sharePaths: vm.sharePaths
      ? {
          scheduleQuery: vm.sharePaths.scheduleQuery,
          schedulePath: vm.sharePaths.schedulePath,
          fullscreenPath: vm.sharePaths.fullscreenPath,
        }
      : null,
    slotHighlightIds: [...vm.slotHighlights.keys()].sort(),
    feederLabels: Object.fromEntries([...vm.feederLabels.entries()].sort(([a], [b]) => a.localeCompare(b))),
    byeAdvanceLabels: Object.fromEntries([...vm.byeAdvanceLabels.entries()].sort(([a], [b]) => a.localeCompare(b))),
    slotCardViews: Object.fromEntries(
      [...vm.slotCardViews.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, view]) => [
          id,
          {
            matchStatus: view.matchStatus,
            matchStatusI18nKey: view.matchStatusI18nKey,
            walkoverEligible: view.walkoverEligible,
            sideALabel: view.sideA.label,
            sideBLabel: view.sideB.label,
          },
        ])
    ),
  };
}

describe('buildBracketViewModel', () => {
  it('maps fixture API payload to stable view model shape', () => {
    const group = eightTeamPartialGroup();
    const vm = buildBracketViewModel({
      group,
      locale: 'en',
      translate,
      leagueSeasonId: 'season-1',
      bracketRoundId: 'round-1',
      crossGroupBracket: false,
      canEditBracket: true,
    });

    expect(snapshotShape(vm)).toMatchInlineSnapshot(`
      {
        "bracketGameIds": [
          "g-qf0",
        ],
        "byeAdvanceLabels": {},
        "canOpenEdit": false,
        "columns": [
          {
            "fadeMainColumn": false,
            "id": "main-0",
            "kind": "MAIN",
            "label": "Quarterfinals",
            "slotIds": [
              "qf0",
              "qf1",
              "qf2",
              "qf3",
            ],
          },
          {
            "fadeMainColumn": false,
            "id": "main-1",
            "kind": "MAIN",
            "label": "Semifinals",
            "slotIds": [
              "sf0",
              "sf1",
            ],
          },
          {
            "fadeMainColumn": false,
            "id": "main-2",
            "kind": "MAIN",
            "label": "Final",
            "slotIds": [
              "fin",
            ],
          },
        ],
        "empty": false,
        "feederLabels": {
          "fin:A": "SF1",
          "fin:B": "SF2",
          "sf0:A": "QF1",
          "sf0:B": "QF2",
          "sf1:A": "QF3",
          "sf1:B": "QF4",
        },
        "playInColumnId": "main-0",
        "playInComplete": true,
        "podiumRows": [],
        "scheduleRows": [
          {
            "gameId": "g-qf0",
            "kind": "MAIN",
            "roundIndex": 0,
            "roundLabel": "Quarterfinals",
          },
        ],
        "sharePaths": {
          "fullscreenPath": "/games/season-1/league-bracket?roundId=round-1&round=round-1&group=g1",
          "schedulePath": "/games/season-1?tab=schedule&subtab=bracket&roundId=round-1&round=round-1&group=g1",
          "scheduleQuery": "tab=schedule&subtab=bracket&roundId=round-1&round=round-1&group=g1",
        },
        "showPlayInGate": false,
        "showPodium": false,
        "slotCardViews": {
          "fin": {
            "matchStatus": "TBD",
            "matchStatusI18nKey": "bracketStatusTbd",
            "sideALabel": "SF1",
            "sideBLabel": "SF2",
            "walkoverEligible": false,
          },
          "qf0": {
            "matchStatus": "FINAL",
            "matchStatusI18nKey": "bracketStatusFinal",
            "sideALabel": "Team Alpha",
            "sideBLabel": "gameDetails.bracketTbd",
            "walkoverEligible": false,
          },
          "qf1": {
            "matchStatus": "TBD",
            "matchStatusI18nKey": "bracketStatusTbd",
            "sideALabel": "gameDetails.bracketTbd",
            "sideBLabel": "gameDetails.bracketTbd",
            "walkoverEligible": false,
          },
          "qf2": {
            "matchStatus": "TBD",
            "matchStatusI18nKey": "bracketStatusTbd",
            "sideALabel": "gameDetails.bracketTbd",
            "sideBLabel": "gameDetails.bracketTbd",
            "walkoverEligible": false,
          },
          "qf3": {
            "matchStatus": "TBD",
            "matchStatusI18nKey": "bracketStatusTbd",
            "sideALabel": "gameDetails.bracketTbd",
            "sideBLabel": "gameDetails.bracketTbd",
            "walkoverEligible": false,
          },
          "sf0": {
            "matchStatus": "TBD",
            "matchStatusI18nKey": "bracketStatusTbd",
            "sideALabel": "Team Alpha",
            "sideBLabel": "QF2",
            "walkoverEligible": false,
          },
          "sf1": {
            "matchStatus": "TBD",
            "matchStatusI18nKey": "bracketStatusTbd",
            "sideALabel": "QF3",
            "sideBLabel": "QF4",
            "walkoverEligible": false,
          },
        },
        "slotHighlightIds": [
          "fin",
          "qf0",
          "qf1",
          "qf2",
          "qf3",
          "sf0",
          "sf1",
        ],
        "treeTabs": {
          "showConsolation": false,
          "showDoubleElim": false,
        },
      }
    `);
  });
});
