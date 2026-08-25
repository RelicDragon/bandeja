import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Bug as BugIcon } from 'lucide-react';
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

interface BugInfoPanelProps {
  bug: Bug;
  canEdit: boolean;
  onUpdate?: () => void;
}

export const BugInfoPanel = ({ bug, canEdit, onUpdate }: BugInfoPanelProps) => {
  const { t } = useTranslation();
  const [isUpdating, setIsUpdating] = useState(false);
  const [bugData, setBugData] = useState(bug);

  const handleStatusChange = useCallback(async (newStatus: BugStatus) => {
    if (!canEdit || isUpdating) return;

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
  }, [bugData.id, canEdit, isUpdating, t, onUpdate]);

  const handleTypeChange = useCallback(async (newType: BugType) => {
    if (!canEdit || isUpdating) return;

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
  }, [bugData.id, bugData.bugType, canEdit, isUpdating, t, onUpdate]);

  const handlePriorityChange = useCallback(async (newPriority: BugPriority) => {
    if (!canEdit || isUpdating) return;

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
  }, [bugData.id, canEdit, isUpdating, t, onUpdate]);

  const handleRatingChange = useCallback(async (stars: BugStars) => {
    if (!canEdit || isUpdating) return;

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
  }, [bugData.id, canEdit, isUpdating, t, onUpdate]);

  const isReview = isReviewBugType(bugData.bugType);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 space-y-4">
      <BugIcon size={16} className="text-red-500" />

      <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">
        {bugData.text}
      </p>

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
