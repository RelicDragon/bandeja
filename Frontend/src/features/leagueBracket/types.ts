import type { BracketPlayoffGroupDto, BracketPlayoffResponse, BracketSlotDto } from '@/api/leagues';
import type { BasicUser, Game } from '@/types';
import type { BracketColumn } from '@/utils/leagueBracketLayout';
import type { BracketScheduleListEntry } from '@/utils/bracketScheduleListSort.util';
import type { BracketMatchStatus } from '@/utils/leagueBracketMatchStatus';
import type { BracketSlotHighlight } from '@/utils/leagueBracketOutcome';
import type { BracketEditTreeColumn } from '@/utils/bracketEditTreeLayout.util';
import type { BracketEditPosition } from '@/utils/bracketSlotEdit.util';
import type { PatchBracketSlotsRequest } from '@/api/leagues';
import type { PerGroupBracketCreateGroup } from '@/utils/playoffWizardCreatePayload.util';
import type { PlayInSeedPair } from '@/utils/bracketCustomPlayIn.util';

export type BracketTreeTab = 'main' | 'consolation' | 'losers' | 'grand';

export type BracketListFilter = 'ALL' | 'PLAY_IN' | 'KNOCKOUT';

export type BracketTranslate = (key: string, options?: Record<string, unknown>) => string;

export type BracketViewModelSharePaths = {
  scheduleQuery: string;
  schedulePath: string;
  fullscreenPath: string;
  shareUrl: string | null;
};

export type BracketTreeColumnView = {
  id: string;
  label: string;
  kind: BracketColumn['kind'];
  roundIndex?: number;
  slots: BracketSlotDto[];
  fadeMainColumn: boolean;
};

export type BracketSlotSideView = {
  label: string;
  users: BasicUser[];
  seed?: number | null;
  participant: BracketSlotDto['participant'];
  participantId: string | null;
};

export type BracketPodiumRowStatus = 'resolved' | 'in_progress';

export type BracketPodiumRowKind = 'champion' | 'finalist' | 'thirdPlace' | 'semifinalist';

export type BracketPodiumDisplayRow = {
  kind: BracketPodiumRowKind;
  participantId: string | null;
  status: BracketPodiumRowStatus;
  semifinalistIndex?: number;
};

export type BracketSlotCardView = {
  sideA: BracketSlotSideView;
  sideB: BracketSlotSideView;
  roundLabel: string | null;
  fullGame: Game | null;
  matchStatus: BracketMatchStatus;
  matchStatusBadgeClass: string;
  matchStatusI18nKey: string;
  walkoverEligible: boolean;
};

export type BracketByeCardView = {
  name: string;
  users: BasicUser[];
  seed: number | null;
};

export type BracketScheduleListRowView = BracketScheduleListEntry & {
  roundBadge: string;
};

export type BracketViewModel = {
  group: BracketPlayoffGroupDto | null;
  empty: boolean;
  columns: BracketTreeColumnView[];
  treeTabs: {
    showConsolation: boolean;
    showDoubleElim: boolean;
  };
  scheduleRows: BracketScheduleListEntry[];
  scheduleListRows: BracketScheduleListRowView[];
  podiumRows: BracketPodiumDisplayRow[];
  slotHighlights: Map<string, BracketSlotHighlight>;
  slotCardViews: Map<string, BracketSlotCardView>;
  byeCardViews: Map<string, BracketByeCardView>;
  byeAdvanceLabels: Map<string, string>;
  feederLabels: Map<string, string>;
  showPodium: boolean;
  showPlayInGate: boolean;
  playInComplete: boolean;
  playInColumnId: string;
  canOpenEdit: boolean;
  bracketGames: Game[];
  sharePaths: BracketViewModelSharePaths | null;
};

export type BuildBracketViewModelInput = {
  bracketApiData?: BracketPlayoffResponse | null;
  group: BracketPlayoffGroupDto | null;
  game?: Game | null;
  locale: string;
  translate: BracketTranslate;
  treeTab?: BracketTreeTab;
  leagueSeasonId?: string;
  bracketRoundId?: string;
  crossGroupBracket?: boolean;
  canEditBracket?: boolean;
  options?: {
    showPodium?: boolean;
    shareMode?: boolean;
  };
};

export type EditTreeLayout = BracketEditTreeColumn[];

export type BracketEditValidationError = 'invalidSwap' | 'nothingToSave';

export type PlanBracketEditInput =
  | { mode: 'init'; slots: BracketSlotDto[] }
  | {
      mode: 'swap';
      draft: BracketEditPosition[];
      fromKey: string;
      toKey: string;
      pool: Map<string, NonNullable<BracketSlotDto['participant']>>;
    }
  | { mode: 'save'; baseline: BracketEditPosition[]; draft: BracketEditPosition[] };

export type PlanBracketEditResult = {
  treeLayout: EditTreeLayout;
  positions: BracketEditPosition[];
  validationErrors: BracketEditValidationError[];
  payload: NonNullable<PatchBracketSlotsRequest['slots']>;
  nextDraft?: BracketEditPosition[];
};

export type BuildCreatePayloadInput = {
  leagueGroupId: string;
  participantIds: string[];
  customByeEnabled: boolean;
  customByeSeedRanks: number[];
  customPlayInEnabled: boolean;
  playInSeedPairs: PlayInSeedPair[];
  includeThirdPlace?: boolean;
  includeConsolationBracket?: boolean;
  includeDoubleElimination?: boolean;
};

export type CreateBracketPayload = PerGroupBracketCreateGroup;

export type Phase4CreateOptionsVisibility = {
  showThird: boolean;
  showConsolation: boolean;
  showDoubleElim: boolean;
  byeCount: number;
};

export type BracketWizardValidationError =
  | { kind: 'bye'; code: import('@/utils/customByeSeedRanks.util').CustomByeValidationError }
  | { kind: 'playIn'; code: import('@/utils/bracketCustomPlayIn.util').CustomPlayInValidationError };
