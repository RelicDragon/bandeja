import { useCallback, useEffect, useState } from 'react';
import {
  nextExpandedStackKey,
  resolveExpandedStackKey,
} from '@/components/trophies/trophyStackExpansion';

export function useTrophyStackExpansion(validKeys: ReadonlySet<string>) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  useEffect(() => {
    if (expandedKey != null && !validKeys.has(expandedKey)) {
      setExpandedKey(null);
    }
  }, [expandedKey, validKeys]);

  const activeKey = resolveExpandedStackKey(expandedKey, validKeys);

  const isExpanded = useCallback((key: string) => activeKey === key, [activeKey]);

  const setExpanded = useCallback((key: string, next: boolean) => {
    setExpandedKey((prev) => nextExpandedStackKey(prev, key, next));
  }, []);

  return { isExpanded, setExpanded };
}
