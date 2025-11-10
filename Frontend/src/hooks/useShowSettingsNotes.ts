import { useState, useEffect } from 'react';

const STORAGE_KEY = 'gameSettings.showNotes';

export const useShowSettingsNotes = () => {
  const [showNotes, setShowNotes] = useState<boolean>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored !== null ? stored === 'true' : false;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(showNotes));
  }, [showNotes]);

  const toggleShowNotes = () => {
    setShowNotes((prev) => !prev);
  };

  return { showNotes, toggleShowNotes };
};

