import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { LeagueGroupProgressIndicator } from './LeagueGroupProgressIndicator';
import { getLeagueGroupColor, getLeagueGroupSoftColor } from '@/utils/leagueGroupColors';
import type { LeagueGroupGameProgressRow } from '@/utils/leagueGroupGameProgress';

const ALL_GROUPS_PROGRESS_COLOR = '#64748b';

interface GroupOption {
  id: string;
  name: string;
  color?: string;
}

interface GroupFilterDropdownProps {
  selectedGroupId: string;
  groups: GroupOption[];
  allGroupsLabel: string;
  onSelect: (groupId: string) => void;
  allGroupId?: string;
  showAllOption?: boolean;
  groupProgress?: LeagueGroupGameProgressRow[];
}

export const GroupFilterDropdown = ({
  selectedGroupId,
  groups,
  allGroupsLabel,
  onSelect,
  allGroupId = 'ALL',
  showAllOption = true,
  groupProgress,
}: GroupFilterDropdownProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  const progressByGroupId = useMemo(
    () => new Map((groupProgress ?? []).map((row) => [row.groupId, row])),
    [groupProgress]
  );

  const allProgress = useMemo(() => {
    const rows = (groupProgress ?? []).filter((row) => row.total > 0);
    return rows.reduce(
      (acc, row) => ({ finished: acc.finished + row.finished, total: acc.total + row.total }),
      { finished: 0, total: 0 }
    );
  }, [groupProgress]);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);
  const selectedLabel =
    showAllOption && selectedGroupId === allGroupId ? allGroupsLabel : selectedGroup?.name || allGroupsLabel;

  const selectedProgress =
    showAllOption && selectedGroupId === allGroupId
      ? allProgress.total > 0
        ? allProgress
        : null
      : (() => {
          const row = progressByGroupId.get(selectedGroupId);
          return row && row.total > 0 ? row : null;
        })();

  const selectedProgressColor =
    showAllOption && selectedGroupId === allGroupId
      ? ALL_GROUPS_PROGRESS_COLOR
      : getLeagueGroupColor(selectedGroup?.color);

  const updateMenuPosition = useCallback(() => {
    if (!dropdownRef.current) return;
    const rect = dropdownRef.current.getBoundingClientRect();
    setMenuPosition({
      top: rect.bottom + 8,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        (dropdownRef.current && dropdownRef.current.contains(target)) ||
        (menuRef.current && menuRef.current.contains(target))
      ) {
        return;
      }
      setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    updateMenuPosition();

    const handleReposition = () => {
      updateMenuPosition();
    };

    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isOpen, updateMenuPosition]);

  const handleSelect = (groupId: string) => {
    onSelect(groupId);
    setIsOpen(false);
  };

  const renderProgress = (groupId: string, color: string) => {
    const row =
      groupId === allGroupId
        ? allProgress.total > 0
          ? allProgress
          : null
        : progressByGroupId.get(groupId);
    if (!row || row.total <= 0) return null;
    return <LeagueGroupProgressIndicator finished={row.finished} total={row.total} color={color} />;
  };

  const renderMenu = () => {
    if (!isOpen || !menuPosition || typeof document === 'undefined') {
      return null;
    }

    return createPortal(
      <div
        ref={menuRef}
        className="z-[1000] bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
        style={{
          position: 'fixed',
          top: menuPosition.top,
          left: menuPosition.left,
          width: menuPosition.width,
        }}
      >
        <div className="max-h-80 overflow-y-auto">
          {showAllOption && (
            <>
              <button
                onClick={() => handleSelect(allGroupId)}
                className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors duration-150 ${
                  selectedGroupId === allGroupId
                    ? 'bg-primary-50 dark:bg-primary-900/20'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <span
                  className={`min-w-0 truncate text-sm font-medium ${
                    selectedGroupId === allGroupId
                      ? 'text-primary-700 dark:text-primary-400'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {allGroupsLabel}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  {renderProgress(allGroupId, ALL_GROUPS_PROGRESS_COLOR)}
                  {selectedGroupId === allGroupId && (
                    <Check className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                  )}
                </div>
              </button>
              <div className="border-t border-gray-200 dark:border-gray-700" />
            </>
          )}

          {groups.map((group) => {
            const isSelected = selectedGroupId === group.id;
            const accent = getLeagueGroupColor(group.color);
            const soft = getLeagueGroupSoftColor(group.color, '1A');

            return (
              <button
                key={group.id}
                onClick={() => handleSelect(group.id)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                style={isSelected ? { backgroundColor: soft } : undefined}
              >
                <div className="flex min-w-0 items-center gap-2">
                  {group.color && (
                    <span
                      className="h-3 w-3 shrink-0 rounded-full border-2"
                      style={{
                        backgroundColor: accent,
                        borderColor: accent,
                      }}
                    />
                  )}
                  <span
                    className={`truncate text-sm font-medium ${
                      isSelected ? '' : 'text-gray-700 dark:text-gray-300'
                    }`}
                    style={isSelected ? { color: accent } : undefined}
                  >
                    {group.name}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {renderProgress(group.id, accent)}
                  {isSelected && <Check className="h-4 w-4 shrink-0" style={{ color: accent }} />}
                </div>
              </button>
            );
          })}
        </div>
      </div>,
      document.body
    );
  };

  return (
    <>
      <button
        ref={dropdownRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:border-primary-500 dark:hover:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all duration-200"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
          {selectedGroup?.color && (
            <span
              className="h-3 w-3 shrink-0 rounded-full border-2"
              style={{
                backgroundColor: getLeagueGroupColor(selectedGroup.color),
                borderColor: getLeagueGroupColor(selectedGroup.color),
              }}
            />
          )}
          <span className="truncate text-sm font-medium text-gray-900 dark:text-white">{selectedLabel}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {selectedProgress && (
            <LeagueGroupProgressIndicator
              finished={selectedProgress.finished}
              total={selectedProgress.total}
              color={selectedProgressColor}
            />
          )}
          <ChevronDown
            className={`h-5 w-5 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>

      {renderMenu()}
    </>
  );
};
