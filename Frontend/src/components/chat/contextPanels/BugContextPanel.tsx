import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { Bug, BugStatus, BugType, BugPriority } from '@/types';
import { bugsApi } from '@/api/bugs';
import { BugTypeSelector } from '@/components/chat/BugTypeSelector';
import { BugStatusSelector } from '@/components/chat/BugStatusSelector';
import { BugPrioritySelector } from '@/components/chat/BugPrioritySelector';

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
      const response = await bugsApi.updateBug(bugData.id, { bugType: newType });
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
            <BugPrioritySelector
              currentPriority={bugData.priority ?? 0}
              onPriorityChange={handlePriorityChange}
              disabled={isUpdating}
            />
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
          <BugPrioritySelector
            currentPriority={bugData.priority ?? 0}
            onPriorityChange={() => {}}
            readonly
          />
        </div>
      )}
    </div>
  );
};
