import { describe, expect, it } from 'vitest';
import {
  draftSlotsEqual,
  planDraftSlotTransition,
  shouldApplyLoadedDraft,
  shouldCommitLastSavedAfterPersist,
  shouldFlushDraftOnSlotChange,
  type DraftComposerSlot,
} from './messageInputDraftSwitch';

const slot = (
  contextId: string,
  extras?: Partial<DraftComposerSlot>
): DraftComposerSlot => ({
  contextType: 'USER',
  contextId,
  chatType: 'PUBLIC',
  userId: 'u1',
  ...extras,
});

describe('shouldFlushDraftOnSlotChange', () => {
  it('flushes when switching chats with composer text', () => {
    expect(shouldFlushDraftOnSlotChange(slot('a'), slot('b'), 'hello', [])).toBe(true);
  });

  it('flushes when switching chats with mentions only', () => {
    expect(shouldFlushDraftOnSlotChange(slot('a'), slot('b'), '  ', ['u2'])).toBe(true);
  });

  it('does not flush when slot is unchanged', () => {
    expect(shouldFlushDraftOnSlotChange(slot('a'), slot('a'), 'hello', [])).toBe(false);
  });

  it('does not flush empty composer', () => {
    expect(shouldFlushDraftOnSlotChange(slot('a'), slot('b'), '   ', [])).toBe(false);
  });

  it('does not flush when previous slot has no context', () => {
    expect(shouldFlushDraftOnSlotChange(slot(''), slot('b'), 'hello', [])).toBe(false);
  });

  it('does not flush when previous user is missing', () => {
    expect(
      shouldFlushDraftOnSlotChange(slot('a', { userId: undefined }), slot('b'), 'hello', [])
    ).toBe(false);
  });

  it('flushes on context type change with same id', () => {
    expect(
      shouldFlushDraftOnSlotChange(
        slot('a', { contextType: 'USER' }),
        slot('a', { contextType: 'GAME' }),
        'x',
        []
      )
    ).toBe(true);
  });

  it('flushes on game chat type change', () => {
    expect(
      shouldFlushDraftOnSlotChange(
        slot('g1', { contextType: 'GAME', chatType: 'PUBLIC' }),
        slot('g1', { contextType: 'GAME', chatType: 'PRIVATE' }),
        'notes',
        []
      )
    ).toBe(true);
  });
});

describe('planDraftSlotTransition', () => {
  it('flushes previous chat and adopts next on switch with text', () => {
    expect(
      planDraftSlotTransition({
        prev: slot('a'),
        next: slot('b'),
        content: 'hello from A',
        mentionIds: [],
        isEditing: false,
      })
    ).toEqual({
      flush: { slot: slot('a'), content: 'hello from A', mentionIds: [] },
      adoptNext: true,
    });
  });

  it('adopts next without flush when composer empty', () => {
    expect(
      planDraftSlotTransition({
        prev: slot('a'),
        next: slot('b'),
        content: '',
        mentionIds: [],
        isEditing: false,
      })
    ).toEqual({ flush: null, adoptNext: true });
  });

  it('skips flush while editing but still adopts next', () => {
    expect(
      planDraftSlotTransition({
        prev: slot('a'),
        next: slot('b'),
        content: 'edit body',
        mentionIds: [],
        isEditing: true,
      })
    ).toEqual({ flush: null, adoptNext: true });
  });

  it('no-ops when slot unchanged', () => {
    expect(
      planDraftSlotTransition({
        prev: slot('a'),
        next: slot('a'),
        content: 'hello',
        mentionIds: [],
        isEditing: false,
      })
    ).toEqual({ flush: null, adoptNext: false });
  });

  it('adopts on first mount from empty prev slot', () => {
    expect(
      planDraftSlotTransition({
        prev: slot('', { userId: undefined }),
        next: slot('a'),
        content: '',
        mentionIds: [],
        isEditing: false,
      })
    ).toEqual({ flush: null, adoptNext: true });
  });
});

describe('shouldCommitLastSavedAfterPersist', () => {
  it('commits only while still on the saved slot', () => {
    expect(shouldCommitLastSavedAfterPersist(slot('a'), slot('a'), true)).toBe(true);
    expect(shouldCommitLastSavedAfterPersist(slot('b'), slot('a'), true)).toBe(false);
    expect(shouldCommitLastSavedAfterPersist(slot('a'), slot('a'), false)).toBe(false);
  });

  it('ignores userId when matching persist slot', () => {
    expect(
      shouldCommitLastSavedAfterPersist(slot('a', { userId: 'u2' }), slot('a', { userId: 'u1' }), true)
    ).toBe(true);
  });
});

describe('shouldApplyLoadedDraft', () => {
  it('applies only when composer has no typed content', () => {
    expect(shouldApplyLoadedDraft(false)).toBe(true);
    expect(shouldApplyLoadedDraft(true)).toBe(false);
  });
});

describe('draftSlotsEqual', () => {
  it('compares context identity', () => {
    expect(draftSlotsEqual(slot('a'), slot('a'))).toBe(true);
    expect(draftSlotsEqual(slot('a'), slot('b'))).toBe(false);
    expect(draftSlotsEqual(slot('a'), slot('a', { contextType: 'GAME' }))).toBe(false);
  });

  it('treats userId change as a different slot', () => {
    expect(draftSlotsEqual(slot('a', { userId: undefined }), slot('a', { userId: 'u1' }))).toBe(
      false
    );
  });
});
