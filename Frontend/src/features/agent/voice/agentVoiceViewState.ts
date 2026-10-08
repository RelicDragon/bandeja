import type { AgentVoiceTimings } from '@shared/agentVoiceRealtime';
import type { AgentVoiceState } from './agentVoiceSession';

/** The user's words as the server hears them (v2): a ghost bubble in the chat until stored. */
export interface AgentVoiceLiveCaption {
  turnId: string;
  text: string;
  final: boolean;
  /** Set once the turn became a run (`voice:turn`); the bubble hides when its message lands. */
  runId: string | null;
}

/** A spoken sentence of the reply; `startMs` = where its audio starts in the turn's audio. */
export interface AgentVoiceReplyLine {
  seq: number;
  kind: 'reply' | 'confirm';
  text: string;
  startMs: number;
}

export interface AgentVoiceReply {
  turnId: string;
  lines: AgentVoiceReplyLine[];
  /** The line being spoken (karaoke highlight). */
  activeSeq: number | null;
}

export interface AgentVoiceTurnTimings {
  turnId: string;
  marks: AgentVoiceTimings;
}

export type AgentVoiceTransportKind = 'v1' | 'v2';

/** What the voice UI renders: the v1 state plus the realtime extras (null / false on v1). */
export interface AgentVoiceViewState extends AgentVoiceState {
  /** null while starting / off. */
  transport: AgentVoiceTransportKind | null;
  reconnecting: boolean;
  liveCaption: AgentVoiceLiveCaption | null;
  reply: AgentVoiceReply | null;
  /** Short filler while a tool runs ("Checking your games…"). */
  progress: string | null;
  confirmTitle: string | null;
  timings: AgentVoiceTurnTimings | null;
}

export const INITIAL_VOICE_VIEW_STATE: AgentVoiceViewState = {
  phase: 'off',
  muted: false,
  notice: null,
  userCaption: null,
  agentCaption: null,
  transport: null,
  reconnecting: false,
  liveCaption: null,
  reply: null,
  progress: null,
  confirmTitle: null,
  timings: null,
};

/** Playback position for word-level karaoke (polled per frame, not part of the state). */
export interface AgentVoicePlaybackPosition {
  turnId: string;
  playedMs: number;
  receivedMs: number;
  /** All of the turn's audio arrived. */
  complete: boolean;
}
