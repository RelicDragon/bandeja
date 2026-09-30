import { createContext, useContext } from 'react';

export interface AgentSendApi {
  /** Sends a user message in the open chat (slot pick, booking cancel). */
  send: (text: string) => void;
  /** A run is active: the server would answer CHAT_BUSY, so cards wait. */
  disabled: boolean;
}

/** Provided by `AgentChatView`; null outside a chat, where message-sending cards render inert. */
export const AgentSendContext = createContext<AgentSendApi | null>(null);

export function useAgentSend(): AgentSendApi | null {
  return useContext(AgentSendContext);
}
