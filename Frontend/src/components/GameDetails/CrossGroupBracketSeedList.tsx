import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, ChevronsDown, ChevronsUp } from 'lucide-react';
import type { LeagueGroup, LeagueStanding } from '@/api/leagues';
import { getLeagueGroupColor } from '@/utils/leagueGroupColors';

interface CrossGroupBracketSeedListProps {
  globalIds: string[];
  standingsById: Map<string, LeagueStanding>;
  groupsById: Map<string, LeagueGroup>;
  onReorder?: (next: string[]) => void;
  readOnly?: boolean;
}

function displayName(standing: LeagueStanding | undefined): string {
  if (!standing) return '—';
  if (standing.leagueTeam?.players?.length) {
    return standing.leagueTeam.players
      .map((p) => [p.user?.firstName, p.user?.lastName].filter(Boolean).join(' '))
      .filter(Boolean)
      .join(', ');
  }
  if (standing.user) {
    return [standing.user.firstName, standing.user.lastName].filter(Boolean).join(' ');
  }
  return '—';
}

export function CrossGroupBracketSeedList({
  globalIds,
  standingsById,
  groupsById,
  onReorder,
  readOnly = false,
}: CrossGroupBracketSeedListProps) {
  const { t } = useTranslation();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const move = (index: number, dir: -1 | 1) => {
    if (!onReorder) return;
    const next = index + dir;
    if (next < 0 || next >= globalIds.length) return;
    const copy = [...globalIds];
    [copy[index], copy[next]] = [copy[next], copy[index]];
    onReorder(copy);
    setSelectedIndex(next);
  };

  const moveToEdge = (index: number, edge: 'start' | 'end') => {
    if (!onReorder) return;
    const copy = [...globalIds];
    const [item] = copy.splice(index, 1);
    if (edge === 'start') copy.unshift(item);
    else copy.push(item);
    onReorder(copy);
    setSelectedIndex(edge === 'start' ? 0 : copy.length - 1);
  };

  const handleRowClick = (index: number) => {
    if (readOnly || !onReorder) return;
    if (selectedIndex == null) {
      setSelectedIndex(index);
      return;
    }
    if (selectedIndex === index) {
      setSelectedIndex(null);
      return;
    }
    const copy = [...globalIds];
    const [item] = copy.splice(selectedIndex, 1);
    copy.splice(index, 0, item);
    onReorder(copy);
    setSelectedIndex(index);
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <p className="text-xs text-center text-gray-500 dark:text-gray-400 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        {readOnly
          ? t('gameDetails.bracketSeedingOrderPreview', {
              defaultValue: 'Global seed order from your preset.',
            })
          : t('gameDetails.bracketSeedingManualTapHint', {
              defaultValue: 'Tap a team, then tap where it should go. Or use arrows.',
            })}
      </p>
      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        {globalIds.map((id, index) => {
          const standing = standingsById.get(id);
          const groupId = standing?.currentGroupId ?? standing?.currentGroup?.id;
          const group = groupId ? groupsById.get(groupId) : undefined;
          const accent = group?.color ? getLeagueGroupColor(group.color) : undefined;
          const selected = !readOnly && selectedIndex === index;
          return (
            <li key={id}>
              <div
                className={`flex items-center gap-2 px-2 py-2 text-sm ${
                  selected ? 'bg-primary-50 dark:bg-primary-950/30' : ''
                }`}
              >
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => handleRowClick(index)}
                  className={`flex flex-1 min-w-0 items-center gap-2 text-left rounded-md px-1 py-1 ${
                    readOnly ? 'cursor-default' : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'
                  }`}
                >
                  <span className="w-6 text-center font-bold text-primary-600 dark:text-primary-400 shrink-0">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-gray-900 dark:text-white truncate block">{displayName(standing)}</span>
                    {group && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        {accent && (
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: accent }}
                          />
                        )}
                        {group.name}
                      </span>
                    )}
                  </div>
                </button>
                {!readOnly && onReorder && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => moveToEdge(index, 'start')}
                      className="p-2 text-gray-500 hover:text-primary-600 disabled:opacity-30 min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center"
                      aria-label={t('common.moveToTop', { defaultValue: 'Move to top' })}
                    >
                      <ChevronsUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      className="p-2 text-gray-500 hover:text-primary-600 disabled:opacity-30 min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center"
                      aria-label={t('common.moveUp', { defaultValue: 'Move up' })}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={index === globalIds.length - 1}
                      onClick={() => move(index, 1)}
                      className="p-2 text-gray-500 hover:text-primary-600 disabled:opacity-30 min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center"
                      aria-label={t('common.moveDown', { defaultValue: 'Move down' })}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={index === globalIds.length - 1}
                      onClick={() => moveToEdge(index, 'end')}
                      className="p-2 text-gray-500 hover:text-primary-600 disabled:opacity-30 min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center"
                      aria-label={t('common.moveToBottom', { defaultValue: 'Move to bottom' })}
                    >
                      <ChevronsDown className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
