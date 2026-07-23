import type { ChatContextType, ChatType } from '@/api/chat';

export type DraftComposerSlot = {
  contextType: ChatContextType;
  contextId: string;
  chatType: ChatType;
  userId: string | undefined;
};

export type DraftSlotTransitionPlan = {
  flush: null | {
    slot: DraftComposerSlot;
    content: string;
    mentionIds: string[];
  };
  adoptNext: boolean;
};

export function draftSlotsEqual(a: DraftComposerSlot, b: DraftComposerSlot): boolean {
  return (
    a.contextType === b.contextType &&
    a.contextId === b.contextId &&
    a.chatType === b.chatType &&
    a.userId === b.userId
  );
}

/** True when composer text still belongs to `prev` and must be flushed before adopting `next`. */
export function shouldFlushDraftOnSlotChange(
  prev: DraftComposerSlot,
  next: DraftComposerSlot,
  content: string,
  mentionIds: string[]
): boolean {
  if (!prev.contextId || !prev.userId) return false;
  if (draftSlotsEqual(prev, next)) return false;
  return content.trim().length > 0 || mentionIds.length > 0;
}

export function planDraftSlotTransition(input: {
  prev: DraftComposerSlot;
  next: DraftComposerSlot;
  content: string;
  mentionIds: string[];
  isEditing: boolean;
}): DraftSlotTransitionPlan {
  const changed = !draftSlotsEqual(input.prev, input.next);
  if (!changed) {
    return { flush: null, adoptNext: false };
  }

  const shouldFlush =
    !input.isEditing &&
    shouldFlushDraftOnSlotChange(input.prev, input.next, input.content, input.mentionIds);

  return {
    flush: shouldFlush
      ? {
          slot: input.prev,
          content: input.content,
          mentionIds: input.mentionIds,
        }
      : null,
    adoptNext: true,
  };
}

/** After an async persist, only update lastSaved if the composer is still on that slot. */
export function shouldCommitLastSavedAfterPersist(
  active: DraftComposerSlot,
  savedTo: DraftComposerSlot,
  updateLastSaved: boolean
): boolean {
  if (!updateLastSaved) return false;
  return (
    active.contextType === savedTo.contextType &&
    active.contextId === savedTo.contextId &&
    active.chatType === savedTo.chatType
  );
}

/** Skip applying a loaded draft when the user already typed in the active slot. */
export function shouldApplyLoadedDraft(composerHasTypedContent: boolean): boolean {
  return !composerHasTypedContent;
}
