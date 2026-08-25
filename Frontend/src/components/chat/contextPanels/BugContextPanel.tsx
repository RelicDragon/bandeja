import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { Bug, BugStatus, BugType, BugPriority } from '@/types';
import { bugsApi } from '@/api/bugs';
import { BugTypeSelector } from '@/components/chat/BugTypeSelector';
import { BugStatusSelector } from '@/components/chat/BugStatusSelector';
import { BugPrioritySelector } from '@/components/chat/BugPrioritySelector';
import { BugStarRating } from '@/components/bugs/BugStarRating';
import {
  defaultStarsWhenSwitchingToReview,
  isReviewBugType,
  isValidReviewStars,
  type BugStars,
} from '@/components/bugs/reviewStars';

interface BugContextPanelProps {
  bug: Bug;
  canEdit?: boolean;
  onUpdate?: () => void;
  onCollapse?: () => void;
}

export const BugContextPanel = ({
  bug,
  canEdit = false,
  onUpdate,
  onCollapse,
}: BugContextPanelProps) => {
  const { t } = useTranslation();
  const [isUpdating, setIsUpdating] = useState(false);
  const [bugData, setBugData] = useState(bug);

  const handleStatusChange = useCallback(async (newStatus: BugStatus) => {
    if (!canEdit || isUpdating || !bugData) return;
    onCollapse?.();
    setIsUpdating(true);
    try {
      const response = await bugsApi.updateBug(bugData.id, { status: newStatus });
      setBugData(response.data);
      toast.success(t('bug.statusUpdated', { defaultValue: 'Bug status updated' }));
      onUpdate?.();
    } catch (error) {
      console.error('Failed to update bug status:', error);
      toast.error(t('bug.updateFailed', { defaultValue: 'Failed to update bug' }));
    } finally {
      setIsUpdating(false);
    }
  }, [bugData, canEdit, isUpdating, t, onUpdate, onCollapse]);

  const handleTypeChange = useCallback(async (newType: BugType) => {
    if (!canEdit || isUpdating || !bugData) return;
    onCollapse?.();
    setIsUpdating(true);
    try {
      const payload: { bugType: BugType; priority?: number } = { bugType: newType };
      if (isReviewBugType(newType)) {
        payload.priority = defaultStarsWhenSwitchingToReview();
      } else if (isReviewBugType(bugData.bugType)) {
        payload.priority = 0;
      }
      const response = await bugsApi.updateBug(bugData.id, payload);
      setBugData(response.data);
      toast.success(t('bug.typeUpdated', { defaultValue: 'Bug type updated' }));
      onUpdate?.();
    } catch (error) {
      console.error('Failed to update bug type:', error);
      toast.error(t('bug.updateFailed', { defaultValue: 'Failed to update bug' }));
    } finally {
      setIsUpdating(false);
    }
  }, [bugData, canEdit, isUpdating, t, onUpdate, onCollapse]);

  const handleRatingChange = useCallback(async (stars: BugStars) => {
    if (!canEdit || isUpdating || !bugData) return;
    onCollapse?.();
    setIsUpdating(true);
    try {
      const response = await bugsApi.updateBug(bugData.id, { priority: stars });
      setBugData(response.data);
      toast.success(t('bug.ratingUpdated', { defaultValue: 'Rating updated' }));
      onUpdate?.();
    } catch (error) {
      console.error('Failed to update bug rating:', error);
      toast.error(t('bug.updateFailed', { defaultValue: 'Failed to update bug' }));
    } finally {
      setIsUpdating(false);
    }
  }, [bugData, canEdit, isUpdating, t, onUpdate, onCollapse]);

  const handlePriorityChange = useCallback(async (newPriority: BugPriority) => {
    if (!canEdit || isUpdating || !bugData) return;
    onCollapse?.();
    setIsUpdating(true);
    try {
      const response = await bugsApi.updateBug(bugData.id, { priority: newPriority });
      setBugData(response.data);
      toast.success(t('bug.priorityUpdated', { defaultValue: 'Bug priority updated' }));
      onUpdate?.();
    } catch (error) {
      console.error('Failed to update bug priority:', error);
      toast.error(t('bug.updateFailed', { defaultValue: 'Failed to update bug' }));
    } finally {
      setIsUpdating(false);
    }
  }, [bugData, canEdit, isUpdating, t, onUpdate, onCollapse]);

  const isReview = isReviewBugType(bugData.bugType);

  return (
    <div>
      {canEdit && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <BugTypeSelector
            currentType={bugData.bugType}
            onTypeChange={handleTypeChange}
            disabled={isUpdating}
          />
          <BugStatusSelector
            currentStatus={bugData.status}
            onStatusChange={handleStatusChange}
            disabled={isUpdating}
          />
          <div className="sm:col-span-2">
            {isReview ? (
              <BugStarRating
                value={isValidReviewStars(bugData.priority ?? 0) ? bugData.priority : null}
                onChange={handleRatingChange}
                disabled={isUpdating}
              />
            ) : (
              <BugPrioritySelector
                currentPriority={bugData.priority ?? 0}
                onPriorityChange={handlePriorityChange}
                disabled={isUpdating}
              />
            )}
          </div>
        </div>
      )}

      {!canEdit && (
        <div className="flex items-center gap-4 text-sm flex-wrap">
          <BugTypeSelector
            currentType={bugData.bugType}
            onTypeChange={() => {}}
            readonly
          />
          <BugStatusSelector
            currentStatus={bugData.status}
            onStatusChange={() => {}}
            readonly
          />
          {isReview ? (
            <BugStarRating
              value={isValidReviewStars(bugData.priority ?? 0) ? bugData.priority : null}
              readonly
            />
          ) : (
            <BugPrioritySelector
              currentPriority={bugData.priority ?? 0}
              onPriorityChange={() => {}}
              readonly
            />
          )}
        </div>
      )}
    </div>
  );
};
