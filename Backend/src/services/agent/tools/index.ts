/**
 * The agent's tool catalogue (docs/plans/ai-agent.md §5). Adding a tool:
 *   1. `defineTool({ name, description, kind, scope, input, label, handler })` in a
 *      `*.tools.ts` file; output through `services/agent/dto/`.
 *   2. Add it to `AGENT_TOOL_DEFINITIONS` below.
 *   3. Add its authorization cases to `__tests__/agentToolCoverage.ts` and the matrix test
 *      (`npm run test:agent`); the registry invariant test fails otherwise.
 * Write tools (`kind: 'write'`) propose an `AgentPendingAction` (`proposeAgentAction`) and
 * define `confirm { authorize, execute }`; nothing mutates until the user confirms
 * (`agentActions.service.ts`).
 */
import { ADMIN_TOOLS } from './admin.tools';
import { BOOKING_TOOLS } from './bookings.tools';
import { BOOK_COURT_TOOLS } from './bookCourt.tools';
import { BOOKING_LINK_TOOLS } from './bookingLinks.tools';
import { CANCEL_BOOKING_TOOLS } from './cancelBooking.tools';
import { CANCEL_GAME_TOOLS } from './cancelGame.tools';
import { CLUB_TOOLS } from './clubs.tools';
import { COST_SHARE_LIST_TOOLS } from './costShares.tools';
import { CREATE_GAME_TOOLS } from './createGame.tools';
import { CREATE_GAME_WITH_BOOKING_TOOLS } from './createGameWithBooking.tools';
import { GAME_CHAT_TOOLS } from './gameChat.tools';
import { GAME_WRITE_TOOLS } from './gameWrites.tools';
import { ROSTER_WRITE_TOOLS } from './rosterWrites.tools';
import { ROSTER_TOOLS } from './roster.tools';
import { GAME_TOOLS } from './games.tools';
import { LEAGUE_TOOLS } from './leagues.tools';
import { LEAGUE_SCHEDULE_TOOLS } from './leagueSchedule.tools';
import { LEAGUE_WRITE_TOOLS } from './leagues.write.tools';
import { MONEY_TOOLS } from './money.tools';
import { PLAYER_TOOLS } from './players.tools';
import { RESULTS_TOOLS } from './results.tools';
import { PLAY_INTENT_TOOLS } from './playIntent.tools';
import { SLOT_TOOLS } from './slots.tools';
import { WEATHER_TOOLS } from './weather.tools';
import { AgentToolRegistry, type AgentToolDefinition } from './registry';

export const AGENT_TOOL_DEFINITIONS: AgentToolDefinition[] = [
  ...GAME_TOOLS,
  ...LEAGUE_TOOLS,
  ...LEAGUE_SCHEDULE_TOOLS,
  ...CLUB_TOOLS,
  ...BOOKING_TOOLS,
  ...SLOT_TOOLS,
  ...WEATHER_TOOLS,
  ...PLAYER_TOOLS,
  ...GAME_WRITE_TOOLS,
  ...GAME_CHAT_TOOLS,
  ...ROSTER_WRITE_TOOLS,
  ...BOOKING_LINK_TOOLS,
  ...BOOK_COURT_TOOLS,
  ...CANCEL_GAME_TOOLS,
  ...CANCEL_BOOKING_TOOLS,
  ...ROSTER_TOOLS,
  ...CREATE_GAME_TOOLS,
  ...CREATE_GAME_WITH_BOOKING_TOOLS,
  ...LEAGUE_WRITE_TOOLS,
  ...RESULTS_TOOLS,
  ...PLAY_INTENT_TOOLS,
  ...MONEY_TOOLS,
  ...COST_SHARE_LIST_TOOLS,
  ...ADMIN_TOOLS,
] as AgentToolDefinition[];

let defaultRegistry: AgentToolRegistry | null = null;

export function getAgentToolRegistry(): AgentToolRegistry {
  if (!defaultRegistry) defaultRegistry = new AgentToolRegistry(AGENT_TOOL_DEFINITIONS);
  return defaultRegistry;
}
