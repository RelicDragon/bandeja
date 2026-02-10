import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Bug as BugIcon } from 'lucide-react';
import type { Bug, BugStatus, BugType } from '@/types';
import { bugsApi } from '@/api/bugs';
import { BugTypeSelector } from '@/components/chat/BugTypeSelector';
import { BugStatusSelector } from '@/components/chat/BugStatusSelector';

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
  }, [bugData.id, canEdit, isUpdating, t, onUpdate]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <BugIcon size={18} className="text-red-500" />
        {t('bug.information', { defaultValue: 'Bug Information' })}
      </h3>

      {/* Bug Text */}
      <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
        <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">
          {bugData.text}
        </p>
      </div>

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
        <div className="flex items-center gap-4 text-sm">
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
