import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Loading, ToggleSwitch, Select } from '@/components';
import { BugCard } from './BugCard';
import { Bug, BugStatus, BugType } from '@/types';

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
  const [allBugs, setAllBugs] = useState<Bug[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeTab, setActiveTab] = useState<BugType | null>(null);
  const [filters, setFilters] = useState<{
    status?: BugStatus;
    myBugsOnly?: boolean;
  }>({});
  const [animatedTextIndex, setAnimatedTextIndex] = useState(0);
  const [nextIndex, setNextIndex] = useState(1);
  const [isAnimating, setIsAnimating] = useState(false);

  const animatedTexts = useMemo(() => [
    t('bug.addBug'),
    t('bug.addSuggestion'),
    t('bug.addQuestion'),
    t('bug.addProblem')
  ], [t]);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      const newIndex = (animatedTextIndex + 1) % animatedTexts.length;
      setNextIndex(newIndex);
      
      setTimeout(() => {
        setAnimatedTextIndex(newIndex);
        setIsAnimating(false);
      }, 500);
    }, 2000);
    return () => clearInterval(interval);
  }, [animatedTextIndex, animatedTexts.length]);

  const loadBugs = useCallback(async () => {
    try {
      setLoading(true);
      const response = await bugsApi.getBugs(filters);
      setAllBugs(response.data.bugs);

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
    if (allBugs.length > 0) {
      try {
        const bugIds = allBugs.map(bug => bug.id);
        const unreadResponse = await bugChatApi.getBugsUnreadCounts(bugIds);
        setUnreadCounts(unreadResponse.data);
      } catch (error: any) {
        const errorMessage = error.response?.data?.message || 'bug.loadError';
        toast.error(t(errorMessage, { defaultValue: errorMessage }));
      }
    }
  }, [allBugs, t]);

  useEffect(() => {
    if (isVisible) {
      loadBugs();
    } else {
      // Clear bugs when not visible to free up memory
      setAllBugs([]);
      setUnreadCounts({});
    }
  }, [filters, isVisible, loadBugs]);

  // Refresh unread counts when component becomes visible (e.g., when navigating back from chat)
  useEffect(() => {
    if (isVisible && allBugs.length > 0) {
      refreshUnreadCounts();
    }
  }, [isVisible, refreshUnreadCounts, allBugs.length]);

  const availableTypes = useMemo(() => {
    const types = new Set<BugType>();
    allBugs.forEach(bug => {
      types.add(bug.bugType);
    });
    return Array.from(types).sort((a, b) => {
      const order = ['CRITICAL', 'BUG', 'SUGGESTION', 'QUESTION'];
      return order.indexOf(a) - order.indexOf(b);
    });
  }, [allBugs]);

  useEffect(() => {
    if (availableTypes.length > 0) {
      if (!activeTab || !availableTypes.includes(activeTab)) {
        setActiveTab(availableTypes[0]);
      }
    } else {
      setActiveTab(null);
    }
  }, [availableTypes, activeTab]);

  const filteredBugs = useMemo(() => {
    let filtered = allBugs;
    
    if (activeTab) {
      filtered = filtered.filter(bug => bug.bugType === activeTab);
    }
    
    return filtered;
  }, [allBugs, activeTab]);

  const handleBugCreated = () => {
    setShowAddModal(false);
    loadBugs();
  };

  const handleBugUpdated = () => {
    loadBugs();
  };

  const handleBugDeleted = (bugId: string) => {
    setAllBugs(prev => prev.filter(bug => bug.id !== bugId));
  };

  const AddBugCard = () => (
    <Card
      className="p-6 mb-4 border-dashed border-2 border-gray-300 hover:border-blue-400 transition-colors cursor-pointer"
      onClick={() => setShowAddModal(true)}
    >
      <div className="flex items-center justify-center text-gray-500 hover:text-blue-600">
        <Plus className="w-6 h-6 mr-2" />
        <div className="relative h-7 overflow-hidden min-w-[240px]">
          <span 
            className={`text-lg font-medium absolute inset-0 flex items-center justify-center ${
              isAnimating ? 'animate-bugs-slide-out' : ''
            }`}
          >
            {animatedTexts[animatedTextIndex]}
          </span>
          {isAnimating && (
            <span 
              className="text-lg font-medium absolute inset-0 flex items-center justify-center animate-bugs-slide-in"
            >
              {animatedTexts[nextIndex]}
            </span>
          )}
        </div>
      </div>
    </Card>
  );

  const statusOptions = [
    { value: '', label: t('bug.allStatuses') },
    ...BUG_STATUS_VALUES.map((status) => ({
      value: status,
      label: t(`bug.statuses.${status}`)
    }))
  ];

  if (!isVisible) {
    return null;
  }

  if (loading && allBugs.length === 0) {
    return (
      <div className="flex justify-center items-center py-8">
        <Loading />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <p className="text-xs text-gray-500 mb-6">{t('bug.description')}</p>

      <div className="mb-4">
        <div className="flex flex-wrap gap-2 items-center mb-4">
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

        <AddBugCard />

        {availableTypes.length > 0 && (
          <div className="mb-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex gap-2 overflow-x-auto">
              {availableTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => setActiveTab(type)}
                  className={`px-3 py-1.5 text-sm font-medium transition-all duration-200 border-b-2 whitespace-nowrap ${
                    activeTab === type
                      ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  {t(`bug.types.${type}`)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {filteredBugs.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-gray-500">{t('bug.noBugs')}</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {[...filteredBugs].sort((a, b) => {
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
