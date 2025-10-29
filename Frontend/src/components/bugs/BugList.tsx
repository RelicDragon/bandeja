import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Loading } from '@/components';
import { BugCard } from './BugCard';
import { Bug, BugStatus, BugType } from '@/types';

const BUG_TYPE_VALUES: BugType[] = ['BUG', 'CRITICAL', 'SUGGESTION', 'QUESTION'];
const BUG_STATUS_VALUES: BugStatus[] = ['CREATED', 'CONFIRMED', 'IN_PROGRESS', 'TEST', 'FINISHED', 'ARCHIVED'];
import { bugsApi } from '@/api';
import { toast } from 'react-hot-toast';
import { Plus } from 'lucide-react';
import { BugModal } from './BugModal';

interface BugListProps {
  isVisible?: boolean;
}

export const BugList = ({ isVisible = true }: BugListProps) => {
  const { t } = useTranslation();
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filters, setFilters] = useState<{
    status?: BugStatus;
    bugType?: BugType;
  }>({});

  const loadBugs = async () => {
    try {
      setLoading(true);
      const response = await bugsApi.getBugs(filters);
      setBugs(response.data.bugs);
    } catch (error) {
      toast.error(t('bug.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isVisible) {
      loadBugs();
    } else {
      // Clear bugs when not visible to free up memory
      setBugs([]);
    }
  }, [filters, isVisible]);

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

  const FilterSection = () => (
    <div className="mb-4 flex flex-wrap gap-2">
      <select
        value={filters.bugType || ''}
        onChange={(e) => setFilters(prev => ({
          ...prev,
          bugType: e.target.value as BugType || undefined
        }))}
        className="px-3 py-1 border border-gray-300 rounded-md text-sm"
      >
        <option value="">{t('bug.allTypes')}</option>
        {BUG_TYPE_VALUES.map((type) => (
          <option key={type} value={type}>{type}</option>
        ))}
      </select>

      <select
        value={filters.status || ''}
        onChange={(e) => setFilters(prev => ({
          ...prev,
          status: e.target.value as BugStatus || undefined
        }))}
        className="px-3 py-1 border border-gray-300 rounded-md text-sm"
      >
        <option value="">{t('bug.allStatuses')}</option>
        {BUG_STATUS_VALUES.map((status) => (
          <option key={status} value={status}>
            {status.replace('_', ' ')}
          </option>
        ))}
      </select>
    </div>
  );

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
    <div className="max-w-4xl mx-auto p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">{t('bug.bugTracker')}</h1>
        <p className="text-gray-600">{t('bug.description')}</p>
      </div>

      <FilterSection />

      <AddBugCard />

      {bugs.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-gray-500">{t('bug.noBugs')}</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {bugs.map((bug) => (
            <BugCard
              key={bug.id}
              bug={bug}
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
