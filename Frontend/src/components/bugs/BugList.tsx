import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card, Loading, ToggleSwitch, Select } from '@/components';
import { BugCard } from './BugCard';
import { Bug, BugStatus, BugType } from '@/types';

const BUG_STATUS_VALUES: BugStatus[] = ['CREATED', 'CONFIRMED', 'IN_PROGRESS', 'TEST', 'FINISHED', 'ARCHIVED'];
import { bugsApi } from '@/api';
import { chatApi } from '@/api/chat';
import { toast } from 'react-hot-toast';
import { Plus } from 'lucide-react';
import { BugModal } from './BugModal';
import { get, set } from 'idb-keyval';
import { useAuthStore } from '@/store/authStore';

interface BugListProps {
  isVisible?: boolean;
  onBugSelect?: (bugId: string) => void;
  isDesktop?: boolean;
  selectedBugId?: string | null;
}

const STORAGE_KEY = 'bugs-filters';
const IDB_TAB_KEY = 'padelpulse-bugs-active-tab';

export const BugList = ({ 
  isVisible = true, 
  onBugSelect,
  isDesktop = false,
  selectedBugId = null
}: BugListProps) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [allBugs, setAllBugs] = useState<Bug[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  
  const [activeTab, setActiveTab] = useState<BugType | null>(null);
  
  const [filters, setFilters] = useState<{
    status?: BugStatus;
    myBugsOnly?: boolean;
  }>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return { myBugsOnly: true };
      }
    }
    return { myBugsOnly: true };
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [animatedTextIndex, setAnimatedTextIndex] = useState(0);
  const [nextIndex, setNextIndex] = useState(1);
  const [isAnimating, setIsAnimating] = useState(false);
  const hasInitializedTab = useRef(false);
  const touchHandledRef = useRef(false);

  const animatedTexts = useMemo(() => [
    t('bug.addBug'),
    t('bug.addSuggestion'),
    t('bug.addQuestion'),
    t('bug.addProblem'),
    t('bug.addTask')
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

  const loadBugs = useCallback(async (page: number = 1, append: boolean = false) => {
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      
      const isArchived = filters.status === 'ARCHIVED';
      const response = await bugsApi.getBugs({
        ...filters,
        ...(isArchived ? { page, limit: 30 } : { all: true }),
      });
      
      if (append) {
        setAllBugs(prev => [...prev, ...response.data.bugs]);
      } else {
        setAllBugs(response.data.bugs);
      }

      setCurrentPage(page);
      setHasMore(isArchived && page < response.data.pagination.pages);

      // Fetch unread counts for all bugs
      if (response.data.bugs.length > 0) {
        const bugIds = response.data.bugs.map(bug => bug.id);
        const unreadResponse = await chatApi.getBugsUnreadCounts(bugIds);
        if (append) {
          setUnreadCounts(prev => ({ ...prev, ...unreadResponse.data }));
        } else {
          setUnreadCounts(unreadResponse.data);
        }
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'bug.loadError';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filters, t]);

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      loadBugs(currentPage + 1, true);
    }
  }, [currentPage, hasMore, loadingMore, loadBugs]);

  const refreshUnreadCounts = useCallback(async () => {
    if (allBugs.length > 0) {
      try {
        const bugIds = allBugs.map(bug => bug.id);
        const unreadResponse = await chatApi.getBugsUnreadCounts(bugIds);
        setUnreadCounts(unreadResponse.data);
      } catch (error: any) {
        const errorMessage = error.response?.data?.message || 'bug.loadError';
        toast.error(t(errorMessage, { defaultValue: errorMessage }));
      }
    }
  }, [allBugs, t]);

  useEffect(() => {
    if (isVisible) {
      setCurrentPage(1);
      hasInitializedTab.current = false;
      loadBugs(1, false);
    } else {
      // Clear bugs when not visible to free up memory
      setAllBugs([]);
      setUnreadCounts({});
      setCurrentPage(1);
      setHasMore(false);
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
      const order = ['CRITICAL', 'BUG', 'SUGGESTION', 'QUESTION', 'TASK'];
      return order.indexOf(a) - order.indexOf(b);
    });
  }, [allBugs]);

  useEffect(() => {
    if (activeTab !== null) {
      set(IDB_TAB_KEY, activeTab);
    }
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

  useEffect(() => {
    let isMounted = true;

    if (availableTypes.length > 0) {
      const restoreTab = async () => {
        if (!hasInitializedTab.current) {
          const storedTab = await get<BugType>(IDB_TAB_KEY);
          if (!isMounted) return;
          if (storedTab && availableTypes.includes(storedTab)) {
            setActiveTab(storedTab);
          } else {
            setActiveTab(availableTypes[0]);
          }
          hasInitializedTab.current = true;
        } else if (!activeTab || !availableTypes.includes(activeTab)) {
          if (!isMounted) return;
          setActiveTab(availableTypes[0]);
        }
      };
      restoreTab();
    } else {
      if (!isMounted) return;
      setActiveTab(null);
      hasInitializedTab.current = false;
    }

    return () => {
      isMounted = false;
    };
  }, [availableTypes, activeTab]);

  const filteredBugs = useMemo(() => {
    let filtered = allBugs;
    
    if (activeTab) {
      filtered = filtered.filter(bug => bug.bugType === activeTab);
    }
    
    if (!filters.status) {
      filtered = filtered.filter(bug => {
        if (bug.status === 'ARCHIVED') {
          return false;
        }
        if (bug.status === 'FINISHED') {
          return bug.senderId === user?.id;
        }
        return true;
      });
    }
    
    return filtered;
  }, [allBugs, activeTab, filters.status, user?.id]);

  const handleBugCreated = () => {
    setShowAddModal(false);
    setCurrentPage(1);
    loadBugs(1, false);
  };

  const handleBugUpdated = () => {
    setCurrentPage(1);
    loadBugs(1, false);
  };

  const handleBugDeleted = (bugId: string) => {
    setAllBugs(prev => prev.filter(bug => bug.id !== bugId));
  };

  const handleBugCardClick = useCallback((bugId: string) => {
    if (isDesktop && onBugSelect) {
      onBugSelect(bugId);
    } else {
      navigate(`/bugs/${bugId}/chat`);
    }
  }, [isDesktop, onBugSelect, navigate]);

  const handleAddBugClick = (e: React.MouseEvent) => {
    if (touchHandledRef.current) {
      e.preventDefault();
      e.stopPropagation();
      touchHandledRef.current = false;
      return;
    }
    setShowAddModal(true);
  };

  const handleAddBugTouch = () => {
    touchHandledRef.current = true;
    setShowAddModal(true);
    setTimeout(() => {
      touchHandledRef.current = false;
    }, 500);
  };

  const handleAddBugTouchEnd = (e: React.TouchEvent) => {
    if (touchHandledRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const AddBugCard = () => (
    <Card
      className="p-6 mb-4 border-dashed border-2 border-gray-300 hover:border-blue-400 transition-colors cursor-pointer"
      onClick={handleAddBugClick}
      onTouchStart={handleAddBugTouch}
      onTouchEnd={handleAddBugTouchEnd}
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
    { value: '', label: t('bug.allActive') },
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
    <div className={isDesktop ? "overflow-y-auto scrollbar-auto h-full bg-white dark:bg-gray-900 flex flex-col min-h-0 pb-20" : "max-w-4xl mx-auto"}>
      <div className={isDesktop ? "px-3 py-4" : ""}>
        {!isDesktop && <p className="text-xs text-gray-500 mb-6">{t('bug.description')}</p>}

        <div className={isDesktop ? "mb-4 sticky top-0 bg-white dark:bg-gray-900 z-10 pb-4 border-b border-gray-200 dark:border-gray-700" : "mb-4"}>
        <div className="flex flex-wrap gap-2 items-center mb-4">
          <Select
            options={statusOptions}
            value={filters.status || ''}
            onChange={(value) => setFilters(prev => ({
              ...prev,
              status: value as BugStatus || undefined
            }))}
            placeholder={t('bug.allActive')}
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
              return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            }).map((bug) => (
              <BugCard
                key={bug.id}
                bug={bug}
                unreadCount={unreadCounts[bug.id] || 0}
                onUpdate={handleBugUpdated}
                onDelete={handleBugDeleted}
                onBugSelect={handleBugCardClick}
                isDesktop={isDesktop}
                isSelected={selectedBugId === bug.id}
              />
            ))}
            {hasMore && filters.status === 'ARCHIVED' && (
              <div className="flex justify-center pt-4">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loadingMore ? t('common.loading') || 'Loading...' : t('home.loadMore')}
                </button>
              </div>
            )}
          </div>
        )}

        <BugModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSuccess={handleBugCreated}
        />
      </div>
    </div>
  );
};
