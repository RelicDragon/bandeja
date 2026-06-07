import { Users } from 'lucide-react';
import type { TFunction } from 'i18next';
import type { GroupChannel } from '@/api/chat';
import { GroupChannelCard } from '@/components/chat/GroupChannelCard';
import { Loading } from '@/components/Loading';

interface PlayerCardCommonGroupsProps {
  groups: GroupChannel[];
  loading: boolean;
  t: TFunction;
  onGroupClick: (group: GroupChannel) => void;
}

export const PlayerCardCommonGroups = ({
  groups,
  loading,
  t,
  onGroupClick,
}: PlayerCardCommonGroupsProps) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loading />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-gray-500 dark:text-gray-400">
        <Users size={32} className="opacity-50" />
        <p className="text-sm">{t('playerCard.noCommonGroups')}</p>
      </div>
    );
  }

  return (
    <div className="-mx-3 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
      {groups.map((group) => (
        <GroupChannelCard
          key={group.id}
          groupChannel={group}
          listPresenceBatched
          onClick={() => onGroupClick(group)}
        />
      ))}
    </div>
  );
};
