/** Empty-state prompts (`agent.examples.*`). Tapping one creates/uses a chat and sends it. */
export const AGENT_EXAMPLE_PROMPT_KEYS = [
  'agent.examples.nextGames',
  'agent.examples.findGame',
  'agent.examples.moveGame',
  'agent.examples.league',
] as const;

/** Router state key for "send this once the chat view opens". */
export const AGENT_INITIAL_PROMPT_STATE_KEY = 'agentInitialPrompt';

export function readAgentInitialPrompt(state: unknown): string | null {
  if (!state || typeof state !== 'object') return null;
  const value = (state as Record<string, unknown>)[AGENT_INITIAL_PROMPT_STATE_KEY];
  return typeof value === 'string' && value.trim() ? value : null;
}
