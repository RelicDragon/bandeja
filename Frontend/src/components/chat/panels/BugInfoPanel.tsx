import { Bug as BugIcon } from 'lucide-react';
import type { Bug } from '@/types';
import { BugTypeSelector } from '@/components/chat/BugTypeSelector';
import { BugStatusSelector } from '@/components/chat/BugStatusSelector';
import { BugPrioritySelector } from '@/components/chat/BugPrioritySelector';
import { BugStarRating } from '@/components/bugs/BugStarRating';
import { isReviewBugType, isValidReviewStars } from '@/components/bugs/reviewStars';
import { useBugEditor } from '@/components/chat/useBugEditor';

interface BugInfoPanelProps {
  bug: Bug;
  groupChannelId?: string;
  canEdit: boolean;
  onUpdate?: () => void;
}

export const BugInfoPanel = ({ bug, groupChannelId, canEdit, onUpdate }: BugInfoPanelProps) => {
  const {
    bugData,
    isUpdating,
    changeStatus: handleStatusChange,
    changeType: handleTypeChange,
    changePriority: handlePriorityChange,
    changeRating: handleRatingChange,
  } = useBugEditor({ bug, canEdit, groupChannelId, onUpdate });

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
