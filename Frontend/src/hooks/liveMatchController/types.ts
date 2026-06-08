import type { ComponentType } from 'react';
import type { BasicUser, Game } from '@/types';
import type { LiveScoringPlugin } from '@/liveScoring/registry';
import type { RallyCourtProps } from '@/components/liveScoring/rally/RallyCourtProps';
import type { RawMatch } from '@/hooks/useLiveMatchBoardState';
import type { MatchTimerSnapshot } from '@/utils/matchTimer';
import type {
  LiveBoardTheme,
  LiveOptionalDeciderFormat,
  LiveMatchCourtOrientation,
  LivePointsServeRotation,
  LiveScoringActionResult,
  LiveScoringState,
  LiveTeamSide,
  ServeGuideSnapshot,
} from '@/utils/liveScoring';
import type { ScoringRules } from '@/utils/scoring';

export type CanScoreResult =
  | { ok: true }
  | { ok: false; reason: string; toastKey?: string };

export type LiveMatchPlayersByTeam = {
  teamA: BasicUser[];
  teamB: BasicUser[];
};

export type UseLiveMatchControllerOptions = {
  tv?: boolean;
  themeParam?: string | null;
  spectatorToken?: string | null;
  pathname?: string;
  locationSearch?: string;
};

export type UseLiveMatchControllerReturn = {
  game: Game | null;
  match: RawMatch | null;
  gameTitle: string;
  liveState: LiveScoringState | null;
  rules: ScoringRules | null;
  revision: number;
  loading: boolean;
  error: string | null;
  boardTheme: LiveBoardTheme;
  tvMode: boolean;
  plugin: LiveScoringPlugin | null;
  courtComponent: ComponentType<RallyCourtProps> | null;
  playersByTeam: LiveMatchPlayersByTeam;
  playersPerMatch: number;
  timerDisplay: string | null;
  timerSnap: MatchTimerSnapshot | undefined;
  refresh: () => Promise<void>;
  saving: boolean;
  scorePoint: (team: LiveTeamSide) => void;
  unscorePoint: (team: LiveTeamSide) => void;
  applyOptionalDecider: (format: LiveOptionalDeciderFormat) => void;
  kitchenFault: (faultingTeam: LiveTeamSide) => void;
  letPending: () => void;
  letReplay: () => void;
  serviceFault: () => void;
  serveSetupComplete: (
    side: LiveTeamSide,
    doublesPlayerIndex: number,
    rotation: LivePointsServeRotation,
    courtOrientation: LiveMatchCourtOrientation
  ) => void;
  skipServeGuide: () => void;
  timedFreeze: () => void;
  timedUnlock: () => void;
  canScore: (team: LiveTeamSide) => CanScoreResult;
  serveGuide: ServeGuideSnapshot | null;
  scoringLocked: boolean;
  liveMatchStatusNote: string | null;
  showOptionalDeciderSheet: boolean;
  canTimedSetFreeze: boolean;
  canTimedSetUnlock: boolean;
  shareBoardThemeParam: 'light' | 'dark';
  effectiveSpectatorToken: string | null;
  spectatorTvUrl: string;
  broadcastShareUrl: string;
  controlUrl: string;
  mintedSpectatorToken: string | null;
};

export type ScorePointContext = {
  game: Game | null;
  teamAPlayers: BasicUser[];
  teamBPlayers: BasicUser[];
  playersPerMatch: number;
};

export type LiveScoringMutation = LiveScoringActionResult;
