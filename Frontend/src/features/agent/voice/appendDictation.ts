import { AGENT_MESSAGE_MAX_LENGTH } from '@shared/agentContract';

/** Appends dictated text to the composer draft with one space between, within the message cap. */
export function appendDictation(draft: string, text: string): string {
  const head = draft.replace(/\s+$/, '');
  return (head ? `${head} ${text}` : text).slice(0, AGENT_MESSAGE_MAX_LENGTH);
}
