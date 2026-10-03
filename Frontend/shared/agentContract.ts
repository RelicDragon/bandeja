/**
 * AI agent chat wire contract (docs/plans/ai-agent.md).
 *
 * Shared by Backend (`@bandeja/shared/agentContract`) and Frontend (`@shared/agentContract`).
 * REST responses use the usual `{ success: true, data }` envelope; `data` types are below.
 */
import type { ClubIntegrationType } from './clubIntegration';

export type AgentMessageRole = 'USER' | 'ASSISTANT' | 'TOOL';

/** QUEUED: accepted, waiting for a worker slot (global + per-user concurrency caps). */
export type AgentRunStatus = 'QUEUED' | 'RUNNING' | 'AWAITING_CONFIRMATION' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

/** UNKNOWN: a client-executed action's lease expired with no report (booking plan §14.5); a late report can still upgrade it. */
export type AgentActionStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'EXPIRED' | 'EXECUTED' | 'FAILED' | 'UNKNOWN';

export type AgentErrorCode =
  | 'RATE_LIMITED'
  | 'BUDGET_EXCEEDED'
  | 'CHAT_BUSY'
  | 'LLM_ERROR'
  | 'TIMEOUT'
  | 'INTERNAL'
  /** `/confirm` on a client-executed action (booking plan §14.5): only the app can run it (claim → report). */
  | 'CLIENT_EXECUTION_REQUIRED';

/** Typed references the UI renders as cards/links. Built from tool data, never from model text. */
export type AgentEntityRef =
  | {
      type: 'game';
      id: string;
      title: string;
      entityType: string;
      status: string;
      startTime: string | null;
      clubName: string | null;
    }
  | { type: 'league_season'; id: string; title: string }
  | { type: 'club'; id: string; name: string; cityName: string | null }
  | { type: 'user'; id: string; name: string; avatar: string | null }
  | {
      /** A provider court booking (docs/plans/ai-agent-booking.md §14.7). `ref` is the server-minted `bookingRef`. */
      type: 'booking';
      ref: string;
      clubId: string;
      clubName: string;
      courtNames: string[];
      /** ISO instants; render in `timeZone` (the club's city tz). */
      start: string;
      end: string;
      timeZone: string;
      provider: ClubIntegrationType;
      state: AgentBookingState;
      linkedGameIds: string[];
      canCancel: boolean;
    }
  | {
      /** A bookable slot. `slotRef` is signed (15 min TTL); tapping it proposes `book_court`. */
      type: 'slot';
      slotRef: string;
      clubId: string;
      clubName: string;
      courtNames: string[];
      start: string;
      end: string;
      timeZone: string;
      confidence: AgentSlotConfidence;
      /** When the availability was observed (snapshot); null for `live` / `app_only`. */
      asOf: string | null;
    }
  /** Deep link the user finishes in the app. `url` is an in-app path (`/create-game?…`) or an absolute URL. */
  | { type: 'handoff'; url: string; label: string };

/** Booking as the agent reports it. PAST: ended; UNKNOWN: provider state could not be read. */
export type AgentBookingState = 'CONFIRMED' | 'CANCELLED' | 'PAST' | 'UNKNOWN';

/** live: provider re-checked now; snapshot: cached busy data (never "free" for sure); app_only: only the app can check. */
export type AgentSlotConfidence = 'live' | 'snapshot' | 'app_only';

/** Who runs the provider write after Confirm (§14.5): the server, or the app (claim → adapter → report). */
export type AgentActionExecution = 'server' | 'client';

/** Client capabilities the app sends as `X-Agent-Client-Caps` (comma-separated) on `POST .../messages`. */
export const AGENT_CLIENT_CAPS_HEADER = 'X-Agent-Client-Caps';
export type AgentClientCap = 'booking-v1';

export interface AgentClientPlanCourt {
  /** Our `Court.id`. */
  courtId: string;
  /** Provider court id the adapter books. */
  externalCourtId: string | null;
}

/** Cancel target: the server-minted `bookingRef` and the provider booking id the adapter cancels. */
export interface AgentClientPlanBooking {
  bookingRef: string;
  externalBookingId: string;
  courtId: string | null;
}

/** What the server does after the app reports (shown on the card; the server holds the details). */
export type AgentClientPostStepKind = 'none' | 'create_game' | 'link_game' | 'unlink_game' | 'delete_game';

export interface AgentClientPostStep {
  kind: AgentClientPostStepKind;
  gameId: string | null;
}

/**
 * What the app runs on Confirm for a client-executed action (`execution: 'client'`,
 * booking plan §14.5): `createHydratedClubBookingProvider(...).bookSlot` per court, or
 * `cancelBooking` per booking. Times are club-local wall clock.
 */
export interface AgentClientPlan {
  provider: ClubIntegrationType;
  clubId: string;
  courts: AgentClientPlanCourt[];
  /** `YYYY-MM-DD`, club timezone. */
  date: string;
  /** `HH:mm`, club timezone. */
  start: string;
  durationMinutes: number;
  operation: 'book' | 'cancel';
  /** `cancel` only. */
  bookings: AgentClientPlanBooking[];
  postStep: AgentClientPostStep;
  /**
   * `book` only (booking plan §14.6): when a later court fails, the app cancels the courts it
   * already booked in this attempt and reports each with `rolledBack`.
   */
  rollbackOnPartial?: boolean;
}

/** One provider call's outcome. `book`: one per court; `cancel`: one per booking. */
export interface AgentClientReportResult {
  provider: ClubIntegrationType;
  courtId: string | null;
  date: string;
  start: string;
  durationMinutes: number;
  ok: boolean;
  /** `book`: the new provider booking id (required when ok); `cancel`: the cancelled one. */
  externalBookingId: string | null;
  /** `cancel`: which planned booking this is. */
  bookingRef: string | null;
  price?: number | null;
  currency?: string | null;
  /** Short provider error (stored for the audit, never shown to the model). */
  error?: string | null;
  /**
   * `book` + `rollbackOnPartial`, on an `ok` court only: `true` = cancelled again after a later
   * court failed (nothing stays booked); `false` = the undo failed or its outcome is unknown
   * (the court may still be booked). Absent = no rollback was attempted for it.
   */
  rolledBack?: boolean | null;
}

export interface AgentClientClaimRequest {
  /** Per-device random key; a repeated claim with the same key within the lease gets the same attempt. */
  clientKey: string;
}

export interface AgentClientClaimResponse {
  action: AgentPendingActionDto;
  /** null when the claim re-authorization failed (the action is FAILED; `runId` reports it). */
  attemptId: string | null;
  clientPlan: AgentClientPlan | null;
  leaseExpiresAt: string | null;
  runId: string | null;
}

export interface AgentClientReportRequest {
  attemptId: string;
  results: AgentClientReportResult[];
}

/** Stable dedupe key for an entity ref (booking/slot/handoff carry no `id`). */
export function agentEntityKey(entity: AgentEntityRef): string {
  switch (entity.type) {
    case 'booking':
      return `booking:${entity.ref}`;
    case 'slot':
      return `slot:${entity.slotRef}`;
    case 'handoff':
      return `handoff:${entity.url}`;
    default:
      return `${entity.type}:${entity.id}`;
  }
}

/** Search provider that answered a `web_search` (docs/plans/ai-agent-web-search.md §13.11). */
export type AgentWebProvider = 'tavily' | 'brave' | 'duckduckgo';

export interface AgentWebSearchLink {
  title: string;
  /** http(s) only. */
  url: string;
  /** Hostname without `www.`. */
  host: string;
  snippet: string;
}

/**
 * Server-built view of a web tool step for the UI (never model text). Optional and additive:
 * old app builds ignore it and show the plain chip.
 */
export type AgentWebView =
  | {
      kind: 'search';
      query: string;
      provider: AgentWebProvider | null;
      cached: boolean;
      /** Every provider failed (the trail is in `tried`). */
      exhausted: boolean;
      /** The provider's own summary (Tavily), if any. */
      answer: string | null;
      results: AgentWebSearchLink[];
      /** Failover trail: error / skip kinds only, never messages. */
      tried: { provider: string; error?: string; skipped?: string }[];
    }
  | { kind: 'fetch'; url: string; host: string; title: string | null; cached: boolean; truncated: boolean };

/**
 * One picture a `web_images` call found. Server-built: `src` / `thumb` are signed image-proxy
 * paths relative to the API base (`/link-preview/image?…`), never a third-party URL, so the
 * app never loads an image the server did not vet. The model shows it inline by writing
 * `![caption](img:<id>)`; an id that no tool step of the chat returned renders nothing.
 */
export interface AgentWebImage {
  /** Stable short id from the image URL (`img:<id>` in assistant markdown). */
  id: string;
  /** Whole image within 640×640 (inline). */
  src: string;
  /** Whole image within 1600×1600 (fullscreen viewer). */
  full: string;
  /** Square crop for the step's thumbnail strip. */
  thumb: string;
  alt: string;
  /** Page the image comes from (http(s)), when the provider knows it. */
  pageUrl: string | null;
  /** Hostname without `www.` (page, else image). */
  host: string;
  width: number | null;
  height: number | null;
}

/** Prefix of an inline image reference in assistant markdown. */
export const AGENT_IMAGE_REF_PREFIX = 'img:';

/**
 * Rich result cards (plan §16.6 slice 9e). Server-built from tool data, never model text, and
 * never sent to the model. A separate optional `card` field (not an `entities` kind) so old app
 * builds, whose entity card has no fallback for unknown kinds, ignore it. Display strings
 * (names, chip labels) are already localized; enums are translated by the app.
 */
export interface AgentCardPlayer {
  name: string;
  /** The signed-in user. */
  you?: boolean;
}

export type AgentResultsCardSide = 'teamA' | 'teamB';

export interface AgentResultsCardMatch {
  round: number;
  match: number;
  teamA: AgentCardPlayer[];
  teamB: AgentCardPlayer[];
  /** Official sets in order, scores as teamA-teamB. */
  sets: { teamA: number; teamB: number; tieBreak?: boolean }[];
  /** null: not decided (unscored or incomplete). */
  winner: AgentResultsCardSide | 'tie' | null;
}

export interface AgentResultsCardStanding {
  position: number | null;
  name: string;
  you?: boolean;
  isWinner: boolean;
  wins: number;
  ties: number;
  losses: number;
}

/** Most matches / standings rows a results card carries (`matchCount` says how many exist). */
export const AGENT_RESULTS_CARD_MAX_MATCHES = 6;
export const AGENT_RESULTS_CARD_MAX_STANDINGS = 3;

export interface AgentResultsCard {
  kind: 'results';
  gameId: string;
  title: string;
  resultsStatus: 'NONE' | 'IN_PROGRESS' | 'FINAL';
  matchCount: number;
  matches: AgentResultsCardMatch[];
  /** FINAL only: the top of the standings. */
  standings?: AgentResultsCardStanding[];
}

export type AgentPlayIntentChipKind = 'days' | 'time' | 'clubs' | 'level' | 'players';

export interface AgentPlayIntentCard {
  kind: 'play_intent';
  status: 'OPEN' | 'MATCHED';
  cityName: string;
  /** "Padel game" / "Bar meetup" (localized). */
  lookingFor: string;
  /** Localized when / where / level chips. */
  chips: { kind: AgentPlayIntentChipKind; label: string }[];
  /** Visible games that fit (the radar; listed as `entities` by `list_play_intent_matches`). */
  matchingGameCount: number;
  /** The match proposal the user is in, if any. */
  proposal: { memberCount: number; status: string } | null;
}

export interface AgentWeatherCardHour {
  /** Local `HH:mm` (card's place timezone). */
  time: string;
  tempC: number;
  /** Open-Meteo condition key (`clear`, `rain`, `thunderstorm`…). */
  condition: string;
  isDay: boolean | null;
  rainChancePct: number | null;
  rainMm: number | null;
  windKmh: number | null;
  /** No rain / wind / storm risk this hour (the weather-alert thresholds). */
  playable: boolean;
}

/** good: no risk · risky: rain or wind likely · bad: heavy rain or storm · indoor: the courts are indoor. */
export type AgentWeatherVerdict = 'good' | 'risky' | 'bad' | 'indoor';

export interface AgentWeatherCard {
  kind: 'weather';
  /** City name. */
  place: string;
  /** Set when the forecast is for one game (tap opens it). */
  gameId: string | null;
  gameTitle: string | null;
  /** `YYYY-MM-DD` local. */
  date: string | null;
  /** Game start / end (local `HH:mm`). */
  window: { start: string; end: string } | null;
  source: 'forecast' | 'archive';
  stale: boolean;
  /** null: unknown (no courts to judge by). */
  outdoor: boolean | null;
  /** null: no hint (past day, unknown courts). */
  verdict: AgentWeatherVerdict | null;
  /** Day view: the longest stretch of playable hours (≥ 2 h), when the day is mixed. */
  bestWindow: { start: string; end: string } | null;
  hours: AgentWeatherCardHour[];
}

export type AgentToolCard = AgentResultsCard | AgentPlayIntentCard | AgentWeatherCard;

export interface AgentActionPreviewLine {
  label: string;
  /** Value before the change (struck through), or null for a new / context value. */
  from: string | null;
  /** Value after the change (highlighted), or null when it goes away. */
  to: string | null;
}

/** Server-rendered (never model-written) description of what a write will do. */
export interface AgentActionPreview {
  title: string;
  /** Field changes are `from → to` rows; Telegram and old builds render these as text too. */
  lines: AgentActionPreviewLine[];
  warnings: string[];
  /** Optional rich card (e.g. the scoreboard of `enter_match_score`); old builds ignore it. */
  card?: AgentToolCard;
  /** The card shows everything `lines` says: new clients may show the card instead of the lines. */
  linesInCard?: boolean;
}

export interface AgentActionResult {
  ok: boolean;
  message: string | null;
  entities?: AgentEntityRef[];
  /** Only part of the change happened (e.g. "2 of 3 courts booked"); `message` says what. */
  partial?: boolean;
}

/** Per user and write tool (plan §15). No stored row = ASK. */
export type AgentToolPermissionMode = 'ASK' | 'ALWAYS_ALLOW';

/** `critical` write tools always ask; only `standard` ones can be ALWAYS_ALLOW. */
export type AgentToolRiskTier = 'standard' | 'critical';

export interface AgentToolPermissionDto {
  toolName: string;
  /** Localized (`X-App-Locale`). */
  name: string;
  description: string;
  riskTier: AgentToolRiskTier;
  mode: AgentToolPermissionMode;
  /** false for critical tools: the Ask ↔ Always allow toggle is disabled. */
  canAlwaysAllow: boolean;
}

/** Phase 11 memory (docs/plans/ai-agent-memory.md). */
export type AgentMemoryType = 'PREFERENCE' | 'FEEDBACK' | 'FACT';
/** `USER_ASKED`: the user added it or asked the assistant to remember it ("You added"); `MODEL_INFERRED`: "Learned". */
export type AgentMemorySource = 'USER_ASKED' | 'MODEL_INFERRED';

export const AGENT_MEMORY_BODY_MAX_LENGTH = 500;
export const AGENT_MEMORY_MAX_ITEMS = 50;

export interface AgentMemoryDto {
  id: string;
  /** Internal slug the model uses (`read_memory(name)`); unique per user. */
  name: string;
  /** One line; the list title. */
  description: string;
  body: string;
  type: AgentMemoryType;
  source: AgentMemorySource;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

export interface AgentMemoryOverviewDto {
  /** The master switch (`User.agentMemoryEnabled`). OFF: items stay, dormant (deletable, not editable). */
  enabled: boolean;
  /** Most recently used first. */
  items: AgentMemoryDto[];
}

/** Undo of a delete: the deleted item's own fields (`POST /agent/memory/items {text: body, restore}`). */
export interface AgentMemoryRestore {
  name: string;
  description: string;
  type: AgentMemoryType;
  source: AgentMemorySource;
}

/** `code` on memory route / tool errors. */
export type AgentMemoryErrorCode = 'MEMORY_DISABLED' | 'MEMORY_LIMIT' | 'MEMORY_SENSITIVE';

export interface AgentPendingActionDto {
  id: string;
  chatId: string;
  runId: string;
  toolName: string;
  status: AgentActionStatus;
  preview: AgentActionPreview;
  expiresAt: string;
  result: AgentActionResult | null;
  createdAt: string;
  /** Executed without a tap because the user always allows this tool ("executed automatically" card). */
  autoApproved: boolean;
  /** Effective tier of THIS call (a standard tool can be escalated per call, e.g. `update_game` making a game private). */
  riskTier: AgentToolRiskTier;
  /** Whether the card may offer "Always allow" (confirm with `{ remember: 'always' }`). */
  canAlwaysAllow: boolean;
  /** `server` unless the action is client-executed (booking plan §14.5). */
  execution: AgentActionExecution;
}

export type AgentContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; callId: string; name: string; label: string }
  | {
      type: 'tool_result';
      callId: string;
      ok: boolean;
      summary: string;
      entities?: AgentEntityRef[];
      web?: AgentWebView;
      /** `web_images` results. A separate field (not a `web` kind) so old app builds ignore it. */
      images?: AgentWebImage[];
      /** Rich result card (results, play intent, weather). Old app builds ignore it. */
      card?: AgentToolCard;
    }
  | { type: 'action'; actionId: string };

export interface AgentMessageDto {
  id: string;
  chatId: string;
  seq: number;
  role: AgentMessageRole;
  blocks: AgentContentBlock[];
  runId: string | null;
  createdAt: string;
}

export interface AgentRunSummaryDto {
  id: string;
  status: AgentRunStatus;
}

export interface AgentChatDto {
  id: string;
  title: string | null;
  lastMessagePreview: string | null;
  activeRun: AgentRunSummaryDto | null;
  /** Pinned to the top of the list; null = not pinned. Absent from servers that predate it. */
  pinnedAt?: string | null;
  /** In the Archived list; null = main list. Absent from servers that predate it. */
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentChatDetailDto extends AgentChatDto {
  messages: AgentMessageDto[];
  actions: AgentPendingActionDto[];
  /** Context meter + daily budget. Absent from servers that predate it. */
  usage?: AgentChatUsageDto;
}

/** Context meter thresholds (share of `contextWindowTokens`): warn shows the "start a new chat" hint. */
export const AGENT_CONTEXT_WARN_RATIO = 0.5;
export const AGENT_CONTEXT_CRITICAL_RATIO = 0.75;

export interface AgentChatUsageDto {
  /** Prompt + reply tokens of the chat's latest model call (what the next turn builds on); 0 before the first reply. */
  contextTokens: number;
  contextWindowTokens: number;
  /** The user's agent tokens today (all chats, web tool charges included). */
  dailyUsedTokens: number;
  dailyBudgetTokens: number;
  /** ISO time of the next budget reset (UTC midnight). */
  dailyResetsAt: string;
}

export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * SSE frames on `GET /api/agent/runs/:runId/events`:
 *   id: <monotonic event id>   (client resends as `Last-Event-ID` or `?after=` to replay)
 *   event: <AgentStreamEvent['type']>
 *   data: <JSON AgentStreamEvent>
 * Keep-alive comment lines (`: keepalive`) every ≤15s. The stream closes after a terminal event
 * (`run.completed` | `run.failed` | `run.cancelled`).
 */
export type AgentStreamEvent =
  | { type: 'run.queued'; runId: string; chatId: string; position: number }
  | { type: 'run.started'; runId: string; chatId: string }
  | { type: 'text.delta'; text: string }
  | { type: 'tool.started'; callId: string; name: string; label: string }
  | {
      type: 'tool.finished';
      callId: string;
      ok: boolean;
      summary: string;
      entities?: AgentEntityRef[];
      web?: AgentWebView;
      images?: AgentWebImage[];
      card?: AgentToolCard;
    }
  /** A proposed write (PENDING), or one already settled when `action.autoApproved` (EXECUTED / FAILED, no tap). */
  | { type: 'action.pending'; action: AgentPendingActionDto }
  | { type: 'message.saved'; message: AgentMessageDto }
  /**
   * `save_memory` stored (or updated) a memory without a confirmation card, right after that
   * call's `tool.finished` (`callId`). The chip offers Undo (`DELETE /agent/memory/items/:id`).
   */
  | { type: 'memory.saved'; callId: string; memory: { id: string; name: string; description: string; created: boolean } }
  | { type: 'run.completed'; status: 'COMPLETED' | 'AWAITING_CONFIRMATION'; usage: AgentUsage }
  | { type: 'run.failed'; code: AgentErrorCode; message: string | null }
  | { type: 'run.cancelled' };

export type AgentStreamEventType = AgentStreamEvent['type'];

export const AGENT_TERMINAL_EVENT_TYPES: readonly AgentStreamEventType[] = [
  'run.completed',
  'run.failed',
  'run.cancelled',
];

/**
 * REST surface (all behind `authenticate`):
 *   GET    /api/agent/chats                   -> { chats: AgentChatDto[]; archivedCount?: number } (not deleted; ?archived=1 → the Archived list instead; pinned first by pinnedAt desc, then updatedAt desc; activeRun set while QUEUED/RUNNING/AWAITING_CONFIRMATION)
 *   POST   /api/agent/chats                   -> AgentChatDto
 *   GET    /api/agent/chats/:chatId           -> AgentChatDetailDto           (`usage`: context meter + daily budget)
 *   PATCH  /api/agent/chats/:chatId {title?, pinned?, archived?} -> AgentChatDto  (pin / archive alone keep updatedAt)
 *   DELETE /api/agent/chats/:chatId           -> { ok: true }                    (bare = archive, for store builds; ?mode=delete = soft delete: hidden everywhere, rows kept)
 *   POST   /api/agent/chats/:chatId/messages {text, editMessageId?, voice?} -> { message: AgentMessageDto; runId: string }
 *                                                (run starts QUEUED; 409 code CHAT_BUSY if the chat has a QUEUED/RUNNING run;
 *                                                 `editMessageId`: that USER message and everything after it are deleted first;
 *                                                 `voice: true`: a voice-conversation turn, the reply is written to be read aloud)
 *   POST   /api/agent/voice/transcriptions   raw audio body (Content-Type audio/*) -> AgentVoiceTranscriptionDto
 *                                              (≤ AGENT_VOICE_MAX_AUDIO_BYTES and AGENT_VOICE_MAX_AUDIO_MS; 400 code VOICE_AUDIO_INVALID,
 *                                               503 code VOICE_UNAVAILABLE, 429 RATE_LIMITED / BUDGET_EXCEEDED)
 *   POST   /api/agent/voice/speech {text}     -> audio/mpeg bytes (text ≤ AGENT_VOICE_SPEECH_MAX_CHARS; same error codes)
 *   GET    /api/agent/runs/:runId/events      -> SSE (see above)
 *   POST   /api/agent/runs/:runId/cancel      -> { ok: true }
 *   POST   /api/agent/actions/:actionId/confirm {remember?: 'always'}
 *                                           -> { action: AgentPendingActionDto; runId: string | null; remembered: boolean }
 *                                              (`remember` on a critical tool / escalated call → 400 code PERMISSION_NOT_ALLOWED, nothing runs;
 *                                               `remembered` = ALWAYS_ALLOW stored, only after EXECUTED)
 *   POST   /api/agent/actions/:actionId/reject  -> { action: AgentPendingActionDto }
 *   POST   /api/agent/actions/:actionId/claim {clientKey} -> AgentClientClaimResponse
 *                                              (client-executed only: PENDING → CONFIRMED with a 3 min lease; same clientKey within
 *                                               the lease → same attemptId; `/confirm` on such an action → 409 CLIENT_EXECUTION_REQUIRED)
 *   POST   /api/agent/actions/:actionId/report AgentClientReportRequest
 *                                           -> { action: AgentPendingActionDto; runId: string | null }
 *                                              (wrong attemptId → 409 ACTION_HANDLED; results outside the plan → 400; a repeat
 *                                               after EXECUTED/FAILED → current state; a late report upgrades UNKNOWN)
 *   GET    /api/agent/permissions             -> { tools: AgentToolPermissionDto[] }   (write tools this user has)
 *   PUT    /api/agent/permissions/:toolName {mode: AgentToolPermissionMode} -> AgentToolPermissionDto
 *                                              (ALWAYS_ALLOW on a critical tool → 400 code PERMISSION_NOT_ALLOWED; unknown/unavailable tool → 404)
 *   DELETE /api/agent/permissions             -> { tools: AgentToolPermissionDto[] }   (reset all to ASK)
 *   DELETE /api/agent/permissions/:toolName   -> AgentToolPermissionDto                (reset one to ASK)
 *   GET    /api/agent/memory                  -> AgentMemoryOverviewDto                (own rows only)
 *   PUT    /api/agent/memory/settings {enabled: boolean} -> AgentMemoryOverviewDto
 *   POST   /api/agent/memory/items {text, restore?} -> AgentMemoryDto                  (server derives name/description; USER_ASKED.
 *                                              `restore: AgentMemoryRestore` puts a just-deleted item back as it was: the Undo toast)
 *   PATCH  /api/agent/memory/items/:id {text} -> AgentMemoryDto
 *   DELETE /api/agent/memory/items/:id        -> { ok: true }
 *   DELETE /api/agent/memory/items            -> { ok: true; deleted: number }
 *                                              (add / edit while OFF → 409 MEMORY_DISABLED; delete / clear always allowed;
 *                                               a 51st item → 409 MEMORY_LIMIT; contact details / secrets → 400 MEMORY_SENSITIVE;
 *                                               another user's id → 404)
 * Errors: `ApiError` JSON with `code: AgentErrorCode` where applicable.
 */
export const AGENT_MESSAGE_MAX_LENGTH = 4000;

/**
 * Voice (docs/domains/agent.md § Voice). Dictation and voice-conversation turns are transcribed
 * server-side; replies are spoken sentence by sentence through `/voice/speech`. Both are charged
 * to the daily token budget as token-equivalents. Voice never confirms a write: that stays a tap.
 */
export const AGENT_VOICE_MAX_AUDIO_BYTES = 6 * 1024 * 1024;
export const AGENT_VOICE_MAX_AUDIO_MS = 2 * 60 * 1000;
export const AGENT_VOICE_SPEECH_MAX_CHARS = 600;

export type AgentVoiceErrorCode = 'VOICE_UNAVAILABLE' | 'VOICE_AUDIO_INVALID';

export interface AgentVoiceTranscriptionDto {
  /** Trimmed transcript; empty when no speech was heard. */
  text: string;
  /** Audio length the charge was based on. */
  durationMs: number;
}
