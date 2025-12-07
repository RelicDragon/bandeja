import { useState, useEffect, useRef } from 'react';

export type TabType = 'scores' | 'results' | 'stats';

export const useGameResultsTabs = (resultsStatus?: string) => {
  const [activeTab, setActiveTab] = useState<TabType>('scores');
  const prevResultsStatusRef = useRef<string | undefined>(resultsStatus);

  useEffect(() => {
    const prevStatus = prevResultsStatusRef.current;
    const currentStatus = resultsStatus;

    if (currentStatus === 'FINAL' && prevStatus !== 'FINAL') {
      setActiveTab('results');
    }

    if (activeTab === 'results' && currentStatus !== 'FINAL') {
      setActiveTab('scores');
    }

    prevResultsStatusRef.current = currentStatus;
  }, [resultsStatus, activeTab]);

  return {
    activeTab,
    setActiveTab,
  };
};

