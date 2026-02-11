import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { Bug, BugStatus, BugType } from '@/types';
import { bugsApi } from '@/api/bugs';
import { BugTypeSelector } from '@/components/chat/BugTypeSelector';
import { BugStatusSelector } from '@/components/chat/BugStatusSelector';

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

  return (
    <div>
      {/* Bug Type and Status Selectors (only for admins) */}
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
        </div>
      )}

      {/* Read-only view for non-admins */}
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
        </div>
      )}
    </div>
  );
};
