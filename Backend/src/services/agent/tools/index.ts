/**
 * The agent's tool catalogue. Adding a tool:
 *   1. `defineTool({ name, description, kind, scope, input, label, handler })` in a
 *      `*.tools.ts` file; output through `services/agent/dto/`.
 *   2. Add it to `AGENT_TOOL_DEFINITIONS` below, inside the `inGroup(...)` of its tool group
 *      (`toolGroups.ts`; `core` is sent every step, other groups load on demand).
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
import { HELP_TOOLS } from './help.tools';
import { ROSTER_WRITE_TOOLS } from './rosterWrites.tools';
import { ROSTER_TOOLS } from './roster.tools';
import { GAME_TOOLS } from './games.tools';
import { LEAGUE_TOOLS } from './leagues.tools';
import { LEAGUE_SCHEDULE_TOOLS } from './leagueSchedule.tools';
import { LEAGUE_WRITE_TOOLS } from './leagues.write.tools';
import { MEMORY_TOOLS } from './memory.tools';
import { MONEY_TOOLS } from './money.tools';
import { PLAYER_TOOLS } from './players.tools';
import { RESULTS_TOOLS } from './results.tools';
import { PLAY_INTENT_TOOLS } from './playIntent.tools';
import { SLOT_TOOLS } from './slots.tools';
import { WEATHER_TOOLS } from './weather.tools';
import { WEB_TOOLS } from './web.tools';
import { AgentToolRegistry, type AgentToolDefinition } from './registry';
import type { AgentToolGroup } from './toolGroups';

/**
 * Stamps the tool group (`toolGroups.ts`) on a file's tools at registration, in place (the
 * definitions keep their identity). A tool that set its own `group` keeps it.
 */
function inGroup(group: AgentToolGroup, tools: readonly object[]): AgentToolDefinition[] {
  const definitions = tools as AgentToolDefinition[];
  for (const tool of definitions) tool.group ??= group;
  return [...definitions];
}

export const AGENT_TOOL_DEFINITIONS: AgentToolDefinition[] = [
  ...inGroup('core', GAME_TOOLS),
  ...inGroup('league', LEAGUE_TOOLS),
  ...inGroup('league', LEAGUE_SCHEDULE_TOOLS),
  ...inGroup('core', CLUB_TOOLS),
  ...inGroup('booking', BOOKING_TOOLS),
  ...inGroup('booking', SLOT_TOOLS),
  ...inGroup('weather', WEATHER_TOOLS),
  ...inGroup('core', PLAYER_TOOLS),
  ...inGroup('games', GAME_WRITE_TOOLS),
  ...inGroup('chat', GAME_CHAT_TOOLS),
  ...inGroup('games', ROSTER_WRITE_TOOLS),
  ...inGroup('booking', BOOKING_LINK_TOOLS),
  ...inGroup('booking', BOOK_COURT_TOOLS),
  ...inGroup('games', CANCEL_GAME_TOOLS),
  ...inGroup('booking', CANCEL_BOOKING_TOOLS),
  ...inGroup('roster', ROSTER_TOOLS),
  ...inGroup('games', CREATE_GAME_TOOLS),
  ...inGroup('booking', CREATE_GAME_WITH_BOOKING_TOOLS),
  ...inGroup('league', LEAGUE_WRITE_TOOLS),
  ...inGroup('results', RESULTS_TOOLS),
  ...inGroup('play_intent', PLAY_INTENT_TOOLS),
  ...inGroup('money', MONEY_TOOLS),
  ...inGroup('money', COST_SHARE_LIST_TOOLS),
  ...inGroup('core', MEMORY_TOOLS),
  ...inGroup('core', HELP_TOOLS),
  ...inGroup('web', WEB_TOOLS),
  ...inGroup('admin', ADMIN_TOOLS),
];

let defaultRegistry: AgentToolRegistry | null = null;

export function getAgentToolRegistry(): AgentToolRegistry {
  if (!defaultRegistry) defaultRegistry = new AgentToolRegistry(AGENT_TOOL_DEFINITIONS);
  return defaultRegistry;
}
