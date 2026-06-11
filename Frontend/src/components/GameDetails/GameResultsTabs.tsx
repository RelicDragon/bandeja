import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy, BarChart3, ClipboardList } from 'lucide-react';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';
import { TabType } from '@/hooks/useGameResultsTabs';

interface GameResultsTabsProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  resultsStatus?: string;
}

export const GameResultsTabs = ({ activeTab, onTabChange, resultsStatus }: GameResultsTabsProps) => {
  const { t } = useTranslation();
  const isFinal = resultsStatus === 'FINAL';

  const tabs = useMemo<SegmentedSwitchTab[]>(() => {
    const scores: SegmentedSwitchTab = {
      id: 'scores',
      label: t('gameResults.scores'),
      icon: ClipboardList,
    };
    const stats: SegmentedSwitchTab = {
      id: 'stats',
      label: t('gameResults.stats') || 'Stats',
      icon: BarChart3,
    };
    if (!isFinal) return [scores, stats];
    return [
      { id: 'results', label: t('gameResults.results'), icon: Trophy },
      stats,
      scores,
    ];
  }, [isFinal, t]);

  return (
    <div className="flex justify-center py-2">
      <SegmentedSwitch
        tabs={tabs}
        activeId={activeTab}
        onChange={(id) => onTabChange(id as TabType)}
        showOnlyActiveTabText={false}
        layoutId="game-results-tabs"
        ariaLabel={t('gameResults.results')}
      />
    </div>
  );
};
