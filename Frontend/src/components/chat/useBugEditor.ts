import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { Bug, BugPriority, BugStatus, BugType } from '@/types';
import { bugsApi, type UpdateBugData } from '@/api/bugs';
import { defaultStarsWhenSwitchingToReview, isReviewBugType, type BugStars } from '@/components/bugs/reviewStars';
import { applyBugUpdateToChatList } from './applyBugUpdateToChatList';

interface UseBugEditorOptions {
  bug: Bug;
  canEdit: boolean;
  /** Channel holding this bug, so its cached thread row is patched even when not in the loaded list. */
  groupChannelId?: string;
  onUpdate?: () => void;
  onBeforeChange?: () => void;
}

/**
 * Edits a bug and keeps the shown copy coherent: adopts fresher `bug` props (parent refetch,
 * chat switch) unless a write is in flight, and pushes each saved bug into the chat list.
 */
export function useBugEditor({ bug, canEdit, groupChannelId, onUpdate, onBeforeChange }: UseBugEditorOptions) {
  const { t } = useTranslation();
  const [bugData, setBugData] = useState(bug);
  const [isUpdating, setIsUpdating] = useState(false);
  const updatingRef = useRef(false);
  const bugIdRef = useRef(bug.id);
  bugIdRef.current = bug.id;

  useEffect(() => {
    if (updatingRef.current && bugData.id === bug.id) return;
    setBugData(bug);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- adopt parent data only when it changes
  }, [bug]);

  const save = useCallback(
    async (
      buildPayload: (current: Bug) => UpdateBugData,
      messages: { successKey: string; successDefault: string; logLabel: string }
    ) => {
      if (!canEdit || updatingRef.current) return;
      const target = bugData;
      onBeforeChange?.();
      updatingRef.current = true;
      setIsUpdating(true);
      try {
        const response = await bugsApi.updateBug(target.id, buildPayload(target));
        applyBugUpdateToChatList(response.data, groupChannelId);
        if (bugIdRef.current !== target.id) return;
        setBugData(response.data);
        toast.success(t(messages.successKey, { defaultValue: messages.successDefault }));
        onUpdate?.();
      } catch (error) {
        console.error(`Failed to update bug ${messages.logLabel}:`, error);
        toast.error(t('bug.updateFailed', { defaultValue: 'Failed to update bug' }));
      } finally {
        updatingRef.current = false;
        setIsUpdating(false);
      }
    },
    [bugData, canEdit, groupChannelId, onBeforeChange, onUpdate, t]
  );

  const changeStatus = useCallback(
    (status: BugStatus) =>
      save(() => ({ status }), {
        successKey: 'bug.statusUpdated',
        successDefault: 'Bug status updated',
        logLabel: 'status',
      }),
    [save]
  );

  const changeType = useCallback(
    (bugType: BugType) =>
      save(
        (current) => {
          const payload: UpdateBugData = { bugType };
          if (isReviewBugType(bugType)) {
            payload.priority = defaultStarsWhenSwitchingToReview();
          } else if (isReviewBugType(current.bugType)) {
            payload.priority = 0;
          }
          return payload;
        },
        { successKey: 'bug.typeUpdated', successDefault: 'Bug type updated', logLabel: 'type' }
      ),
    [save]
  );

  const changePriority = useCallback(
    (priority: BugPriority) =>
      save(() => ({ priority }), {
        successKey: 'bug.priorityUpdated',
        successDefault: 'Bug priority updated',
        logLabel: 'priority',
      }),
    [save]
  );

  const changeRating = useCallback(
    (stars: BugStars) =>
      save(() => ({ priority: stars }), {
        successKey: 'bug.ratingUpdated',
        successDefault: 'Rating updated',
        logLabel: 'rating',
      }),
    [save]
  );

  return { bugData, isUpdating, changeStatus, changeType, changePriority, changeRating };
}
