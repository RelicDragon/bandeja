import { PlayIntentStatus } from '@prisma/client';

export function shouldLinkPlayIntent(
  intent: { userId: string; status: PlayIntentStatus | string },
  receiverId: string,
  inProposal: boolean,
): boolean {
  return intent.userId === receiverId && intent.status === PlayIntentStatus.OPEN && !inProposal;
}

export function invitePlayIntentLinkOutcome(input: {
  requestedPlayIntentId?: string | null;
  asTrainer?: boolean;
  intent: { id: string; userId: string; status: PlayIntentStatus | string } | null;
  receiverId: string;
  inProposal: boolean;
  linkedIntentId: string | null;
}): boolean | null {
  if (!input.requestedPlayIntentId || input.asTrainer) return null;
  if (input.linkedIntentId === input.requestedPlayIntentId) return true;
  if (!input.intent) return null;
  if (shouldLinkPlayIntent(input.intent, input.receiverId, input.inProposal)) return false;
  if (input.intent.status === PlayIntentStatus.MATCHED || input.inProposal) return false;
  return null;
}
