import type {
  AgentActionStatus,
  AgentEntityRef,
  AgentMessageDto,
  AgentPendingActionDto,
} from '@shared/agentContract';

/**
 * Follow-up chips under the latest finished reply (docs/domains/agent.md, app section).
 * Deterministic and free: derived from what the last run did (tool names, results, writes),
 * never from an extra model call. Each key is `agent.followUps.<key>`; tapping a chip sends
 * that text as a user message.
 */
export const AGENT_FOLLOW_UP_KEYS = [
  'whoMissing',
  'weatherNext',
  'bookFirstSlot',
  'laterSlots',
  'otherDay',
  'standings',
  'nextRound',
  'invitePlayers',
  'splitCost',
  'postInChat',
  'enterScore',
  'finishResults',
  'showResults',
  'remindUnpaid',
  'markMyPaid',
  'createGameForBooking',
  'findIndoor',
  'moveGame',
  'joinBestMatch',
  'freeCourtThere',
  'inviteToNextGame',
  'replyInChat',
  'myBookings',
  'retry',
  'adminApproveFirst',
] as const;

export type AgentFollowUpKey = (typeof AGENT_FOLLOW_UP_KEYS)[number];

export const AGENT_FOLLOW_UP_MAX = 3;

export interface AgentTurnToolCall {
  name: string;
  /** null: the call has no result (the run ended before it finished). */
  ok: boolean | null;
  entities: AgentEntityRef[];
}

export interface AgentTurnAction {
  toolName: string;
  status: AgentActionStatus;
}

/** What the latest reply turn did: everything after the last USER message. */
export interface AgentTurnSummary {
  tools: AgentTurnToolCall[];
  actions: AgentTurnAction[];
  hasText: boolean;
}

export interface AgentFollowUpOptions {
  /** Platform admin: only then may `admin_*` follow-ups appear. */
  isAdmin: boolean;
}

/**
 * Build the summary of the latest turn from persisted messages. Null when the chat is empty,
 * ends with the user's message, or the turn has nothing to follow up on.
 */
export function summarizeAgentTurn(
  messages: readonly AgentMessageDto[],
  actions: readonly AgentPendingActionDto[],
): AgentTurnSummary | null {
  let lastUser = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'USER') {
      lastUser = i;
      break;
    }
  }
  const turn = messages.slice(lastUser + 1);
  if (turn.length === 0) return null;

  const actionById = new Map(actions.map((a) => [a.id, a]));
  const calls = new Map<string, AgentTurnToolCall>();
  const order: string[] = [];
  const turnActions: AgentTurnAction[] = [];
  let hasText = false;

  for (const message of turn) {
    for (const block of message.blocks) {
      if (block.type === 'text') {
        if (block.text.trim()) hasText = true;
      } else if (block.type === 'tool_call') {
        if (!calls.has(block.callId)) {
          calls.set(block.callId, { name: block.name, ok: null, entities: [] });
          order.push(block.callId);
        }
      } else if (block.type === 'tool_result') {
        const call = calls.get(block.callId);
        if (call) {
          call.ok = block.ok;
          call.entities = block.entities ?? [];
        }
      } else if (block.type === 'action') {
        const action = actionById.get(block.actionId);
        if (action) turnActions.push({ toolName: action.toolName, status: action.status });
      }
    }
  }

  // Actions the turn proposed but whose block was not persisted yet (same run).
  const runIds = new Set(turn.map((m) => m.runId).filter((id): id is string => Boolean(id)));
  for (const action of actions) {
    if (!runIds.has(action.runId)) continue;
    if (turn.some((m) => m.blocks.some((b) => b.type === 'action' && b.actionId === action.id))) continue;
    turnActions.push({ toolName: action.toolName, status: action.status });
  }

  const tools = order.map((id) => calls.get(id)!);
  if (tools.length === 0 && turnActions.length === 0 && !hasText) return null;
  return { tools, actions: turnActions, hasText };
}

const GAME_WRITE_TOOLS = new Set(['create_game', 'create_game_with_booking', 'update_game']);
const GAME_READ_TOOLS = new Set(['list_my_games', 'search_games', 'get_game']);
const LEAGUE_READ_TOOLS = new Set(['get_league_season', 'get_league_schedule', 'get_league_standings']);
const MONEY_READ_TOOLS = new Set(['list_my_cost_balances', 'get_game_cost', 'list_cost_shares', 'get_my_wallet']);

/** Chips for one executed write, most specific first. */
function chipsForExecutedWrite(toolName: string): AgentFollowUpKey[] {
  if (GAME_WRITE_TOOLS.has(toolName)) return ['invitePlayers', 'splitCost', 'weatherNext'];
  switch (toolName) {
    case 'invite_players':
    case 'join_game':
    case 'accept_from_queue':
      return ['whoMissing', 'postInChat'];
    case 'book_court':
      return ['createGameForBooking', 'myBookings'];
    case 'enter_match_score':
      return ['finishResults', 'showResults'];
    case 'finish_results':
      return ['showResults', 'remindUnpaid'];
    case 'set_game_price':
      return ['remindUnpaid'];
    case 'reschedule_league_fixture':
    case 'send_league_round_start_message':
      return ['nextRound', 'standings'];
    case 'cancel_game':
    case 'leave_game':
      return ['myBookings'];
    default:
      return [];
  }
}

/** Chips for one successful read. */
function chipsForRead(call: AgentTurnToolCall): AgentFollowUpKey[] {
  const { name, entities } = call;
  if (GAME_READ_TOOLS.has(name)) {
    const hasGame = entities.some((e) => e.type === 'game');
    return hasGame || name === 'list_my_games' ? ['whoMissing', 'weatherNext', 'splitCost'] : [];
  }
  if (LEAGUE_READ_TOOLS.has(name)) {
    return [
      ...(name === 'get_league_standings' ? [] : (['standings'] as const)),
      ...(name === 'get_league_schedule' ? [] : (['nextRound'] as const)),
    ];
  }
  if (MONEY_READ_TOOLS.has(name)) return ['remindUnpaid', 'markMyPaid'];
  switch (name) {
    case 'find_available_slots':
      return entities.some((e) => e.type === 'slot') ? ['bookFirstSlot', 'laterSlots'] : ['otherDay'];
    case 'get_game_results':
      return ['enterScore', 'finishResults'];
    case 'list_my_bookings':
      return ['createGameForBooking'];
    case 'get_weather':
      return ['findIndoor', 'moveGame'];
    case 'get_my_play_intent':
    case 'list_play_intent_matches':
      return entities.some((e) => e.type === 'game') ? ['joinBestMatch'] : [];
    case 'search_clubs':
    case 'get_club':
      return entities.some((e) => e.type === 'club') ? ['freeCourtThere'] : [];
    case 'search_players':
    case 'get_player':
      return entities.some((e) => e.type === 'user') ? ['inviteToNextGame'] : [];
    case 'summarize_game_chat':
      return ['replyInChat'];
    case 'admin_list_pending_events':
      return ['adminApproveFirst'];
    default:
      return [];
  }
}

/**
 * 0–3 follow-up keys for the latest turn. None while a write card waits for the user (the card
 * is the next step). An executed write leads, then the newest successful reads; a turn whose
 * every tool failed offers a retry.
 */
export function agentFollowUps(
  turn: AgentTurnSummary | null,
  options: AgentFollowUpOptions,
): AgentFollowUpKey[] {
  if (!turn) return [];
  if (turn.actions.some((a) => a.status === 'PENDING' || a.status === 'CONFIRMED')) return [];

  const out: AgentFollowUpKey[] = [];
  const add = (keys: readonly AgentFollowUpKey[]) => {
    for (const key of keys) {
      if (key === 'adminApproveFirst' && !options.isAdmin) continue;
      if (!out.includes(key)) out.push(key);
    }
  };

  for (let i = turn.actions.length - 1; i >= 0; i--) {
    const action = turn.actions[i];
    if (action.status === 'EXECUTED') add(chipsForExecutedWrite(action.toolName));
  }
  for (let i = turn.tools.length - 1; i >= 0; i--) {
    const call = turn.tools[i];
    if (call.ok === true) add(chipsForRead(call));
  }

  const failedAction = turn.actions.some((a) => a.status === 'FAILED' || a.status === 'UNKNOWN');
  const allToolsFailed = turn.tools.length > 0 && turn.tools.every((c) => c.ok !== true);
  if (out.length === 0 && (failedAction || (allToolsFailed && turn.actions.length === 0))) add(['retry']);

  return out.slice(0, AGENT_FOLLOW_UP_MAX);
}
