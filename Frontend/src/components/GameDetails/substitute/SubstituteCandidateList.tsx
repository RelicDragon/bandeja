import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Search } from 'lucide-react';
import { PlayerAvatar } from '@/components';
import { usersApi, type InvitablePlayer } from '@/api/users';
import { matchesSearch } from '@/utils/transliteration';
import type { BasicUser } from '@/types';

interface SubstituteCandidateListProps {
  gameId: string;
  gameSport?: string;
  excludeUserIds: readonly string[];
  onSelect: (user: BasicUser) => void;
}

/** Replacement picker: any invitable player, not just people already on the roster. */
export const SubstituteCandidateList = ({
  gameId,
  gameSport,
  excludeUserIds,
  onSelect,
}: SubstituteCandidateListProps) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [players, setPlayers] = useState<InvitablePlayer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    usersApi
      .getInvitablePlayers(gameId, gameSport)
      .then((res) => {
        if (!cancelled) setPlayers(res.data?.players ?? []);
      })
      .catch(() => {
        if (!cancelled) setPlayers([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [gameId, gameSport]);

  const excluded = useMemo(() => new Set(excludeUserIds), [excludeUserIds]);

  const visible = useMemo(() => {
    const eligible = players.filter((player) => !excluded.has(player.id));
    if (!query.trim()) return eligible;
    return eligible.filter((player) =>
      matchesSearch(query, `${player.firstName || ''} ${player.lastName || ''}`),
    );
  }, [players, excluded, query]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('common.search')}
          className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 ps-9 pe-3 text-sm text-gray-900 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="animate-spin text-gray-400" size={22} />
        </div>
      ) : visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
          {t('gameDetails.substitutePlayerNoCandidates')}
        </p>
      ) : (
        <div className="max-h-64 space-y-1.5 overflow-y-auto">
          {visible.map((player) => (
            <button
              key={player.id}
              type="button"
              onClick={() => onSelect(player)}
              className="flex w-full items-center gap-3 rounded-xl border border-transparent px-2.5 py-2 text-start transition hover:border-gray-200 hover:bg-gray-50 dark:hover:border-gray-700 dark:hover:bg-gray-800/60"
            >
              <PlayerAvatar player={player} showName={false} fullHideName extrasmall asDiv />
              <span className="min-w-0 flex-1 text-sm font-medium text-gray-900 dark:text-white">
                {[player.firstName, player.lastName].filter(Boolean).join(' ').trim()}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
