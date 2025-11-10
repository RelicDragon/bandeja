import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Loading, ToggleSwitch, Select } from '@/components';
import { BugCard } from './BugCard';
import { Bug, BugStatus, BugType } from '@/types';

const BUG_TYPE_VALUES: BugType[] = ['BUG', 'CRITICAL', 'SUGGESTION', 'QUESTION'];
const BUG_STATUS_VALUES: BugStatus[] = ['CREATED', 'CONFIRMED', 'IN_PROGRESS', 'TEST', 'FINISHED', 'ARCHIVED'];
import { bugsApi } from '@/api';
import { bugChatApi } from '@/api/bugChat';
import { toast } from 'react-hot-toast';
import { Plus } from 'lucide-react';
import { BugModal } from './BugModal';

interface BugListProps {
  isVisible?: boolean;
}

export const BugList = ({ isVisible = true }: BugListProps) => {
  const { t } = useTranslation();
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filters, setFilters] = useState<{
    status?: BugStatus;
    bugType?: BugType;
    myBugsOnly?: boolean;
  }>({});

  const loadBugs = useCallback(async () => {
    try {
      setLoading(true);
      const response = await bugsApi.getBugs(filters);
      setBugs(response.data.bugs);

      // Fetch unread counts for all bugs
      if (response.data.bugs.length > 0) {
        const bugIds = response.data.bugs.map(bug => bug.id);
        const unreadResponse = await bugChatApi.getBugsUnreadCounts(bugIds);
        setUnreadCounts(unreadResponse.data);
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'bug.loadError';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setLoading(false);
    }
  }, [filters, t]);

  const refreshUnreadCounts = useCallback(async () => {
    if (bugs.length > 0) {
      try {
        const bugIds = bugs.map(bug => bug.id);
        const unreadResponse = await bugChatApi.getBugsUnreadCounts(bugIds);
        setUnreadCounts(unreadResponse.data);
      } catch (error: any) {
        const errorMessage = error.response?.data?.message || 'bug.loadError';
        toast.error(t(errorMessage, { defaultValue: errorMessage }));
      }
    }
  }, [bugs, t]);

  useEffect(() => {
    if (isVisible) {
      loadBugs();
    } else {
      // Clear bugs when not visible to free up memory
      setBugs([]);
      setUnreadCounts({});
    }
  }, [filters, isVisible, loadBugs]);

  // Refresh unread counts when component becomes visible (e.g., when navigating back from chat)
  useEffect(() => {
    if (isVisible && bugs.length > 0) {
      refreshUnreadCounts();
    }
  }, [isVisible, refreshUnreadCounts, bugs.length]);

  const handleBugCreated = () => {
    setShowAddModal(false);
    loadBugs();
  };

  const handleBugUpdated = () => {
    loadBugs();
  };

  const handleBugDeleted = (bugId: string) => {
    setBugs(prev => prev.filter(bug => bug.id !== bugId));
  };

  const AddBugCard = () => (
    <Card
      className="p-6 mb-4 border-dashed border-2 border-gray-300 hover:border-blue-400 transition-colors cursor-pointer"
      onClick={() => setShowAddModal(true)}
    >
      <div className="flex items-center justify-center text-gray-500 hover:text-blue-600">
        <Plus className="w-6 h-6 mr-2" />
        <span className="text-lg font-medium">{t('bug.addBug')}</span>
      </div>
    </Card>
  );

  const FilterSection = () => {
    const bugTypeOptions = [
      { value: '', label: t('bug.allTypes') },
      ...BUG_TYPE_VALUES.map((type) => ({
        value: type,
        label: t(`bug.types.${type}`)
      }))
    ];

    const statusOptions = [
      { value: '', label: t('bug.allStatuses') },
      ...BUG_STATUS_VALUES.map((status) => ({
        value: status,
        label: t(`bug.statuses.${status}`)
      }))
    ];

    return (
      <div className="mb-4 space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          <Select
            options={bugTypeOptions}
            value={filters.bugType || ''}
            onChange={(value) => setFilters(prev => ({
              ...prev,
              bugType: value as BugType || undefined
            }))}
            placeholder={t('bug.allTypes')}
            className="min-w-32"
          />

          <Select
            options={statusOptions}
            value={filters.status || ''}
            onChange={(value) => setFilters(prev => ({
              ...prev,
              status: value as BugStatus || undefined
            }))}
            placeholder={t('bug.allStatuses')}
            className="min-w-32"
          />
        </div>

        <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/70 transition-colors">
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
            {t('bug.myBugsOnly')}
          </span>
          <ToggleSwitch
            checked={filters.myBugsOnly || false}
            onChange={(checked) => setFilters(prev => ({
              ...prev,
              myBugsOnly: checked
            }))}
          />
        </div>
      </div>
    );
  };

  if (!isVisible) {
    return null;
  }

  if (loading && bugs.length === 0) {
    return (
      <div className="flex justify-center items-center py-8">
        <Loading />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <p className="text-xs text-gray-500 mb-6">{t('bug.description')}</p>

      <FilterSection />

      <AddBugCard />

      {bugs.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-gray-500">{t('bug.noBugs')}</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {[...bugs].sort((a, b) => {
            if (a.status === 'ARCHIVED' && b.status !== 'ARCHIVED') return 1;
            if (a.status !== 'ARCHIVED' && b.status === 'ARCHIVED') return -1;
            return 0;
          }).map((bug) => (
            <BugCard
              key={bug.id}
              bug={bug}
              unreadCount={unreadCounts[bug.id] || 0}
              onUpdate={handleBugUpdated}
              onDelete={handleBugDeleted}
            />
          ))}
        </div>
      )}

      <BugModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={handleBugCreated}
      />
    </div>
  );
};
