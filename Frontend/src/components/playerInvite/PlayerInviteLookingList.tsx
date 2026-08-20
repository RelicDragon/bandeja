import { Radio } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Sport } from '@/types';
import { PlayerInviteLookingRow } from './PlayerInviteLookingRow';
import type { InviteLookingMember } from './lookingTypes';

type Props = {
  members: InviteLookingMember[];
  selectedUserIds: string[];
  onSelect: (userId: string) => void;
  greatFitCount: number;
  loading: boolean;
  failed?: boolean;
  onRetry?: () => void;
  levelSport?: Sport;
  listPadClass: string;
};

function LookingSkeleton() {
  return (
    <div className="space-y-1 px-2.5 pt-3">
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-xl px-2 py-2.5">
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-gray-200 dark:bg-gray-800" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-36 animate-pulse rounded-full bg-gray-200 dark:bg-gray-800" />
            <div className="h-3 w-24 animate-pulse rounded-full bg-gray-100 dark:bg-gray-800/80" />
          </div>
          <div className="h-5 w-5 shrink-0 animate-pulse rounded-full border-2 border-gray-200 dark:border-gray-700" />
        </div>
      ))}
    </div>
  );
}

export function PlayerInviteLookingList({
  members,
  selectedUserIds,
  onSelect,
  greatFitCount,
  loading,
  failed = false,
  onRetry,
  levelSport,
  listPadClass,
}: Props) {
  const { t } = useTranslation();
  const selected = new Set(selectedUserIds);

  if (loading) {
    return <LookingSkeleton />;
  }

  if (failed) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          {t('playerInvite.lookingLoadError')}
        </p>
        <p className="mt-1 max-w-[16rem] text-sm text-gray-500 dark:text-gray-400">
          {t('playerInvite.lookingLoadErrorHint')}
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 rounded-full bg-gray-100 px-3.5 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {t('playerInvite.lookingRetry')}
          </button>
        ) : null}
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/40">
          <Radio className="h-6 w-6 text-emerald-500 dark:text-emerald-400" />
        </div>
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          {t('playerInvite.lookingEmpty')}
        </p>
        <p className="mt-1 max-w-[16rem] text-sm text-gray-500 dark:text-gray-400">
          {t('playerInvite.lookingEmptyHint')}
        </p>
      </div>
    );
  }

  return (
    <div className={`min-h-0 flex-1 overflow-y-auto scrollbar-auto px-2.5 ${listPadClass}`}>
      <div className="sticky top-0 z-[1] -mx-2.5 mb-1 border-b border-gray-100/80 bg-white/90 px-2.5 py-2 backdrop-blur-md dark:border-gray-800/80 dark:bg-gray-950/90">
        <p className="text-center text-[12px] font-medium text-gray-500 dark:text-gray-400">
          {t('playerInvite.lookingHint', { great: greatFitCount, total: members.length })}
        </p>
      </div>
      <div className="pb-2">
        {members.map((member) => (
          <PlayerInviteLookingRow
            key={member.userId}
            member={member}
            isSelected={selected.has(member.userId)}
            onSelect={() => onSelect(member.userId)}
            levelSport={levelSport}
          />
        ))}
      </div>
    </div>
  );
}
