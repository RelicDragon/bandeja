import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import type { BasicUser, Gender, Sport } from '@/types';
import { mismatchLabel } from '@/components/playIntent/mismatchLabel';
import { LookingFitDots } from './LookingFitDots';
import type { InviteLookingMember } from './lookingTypes';

type Props = {
  member: InviteLookingMember;
  isSelected: boolean;
  onSelect: () => void;
  levelSport?: Sport;
};

function memberGender(member: InviteLookingMember): Gender {
  const value = member.gender;
  if (value === 'MALE' || value === 'FEMALE' || value === 'PREFER_NOT_TO_SAY') return value;
  return 'PREFER_NOT_TO_SAY';
}

function toPlayer(member: InviteLookingMember, sport?: Sport): BasicUser {
  return {
    id: member.userId,
    firstName: member.firstName ?? undefined,
    lastName: member.lastName ?? undefined,
    avatar: member.avatar,
    level: member.level ?? 0,
    socialLevel: 0,
    gender: memberGender(member),
    approvedLevel: false,
    isTrainer: false,
    primarySport: sport,
  };
}

export function PlayerInviteLookingRow({ member, isSelected, onSelect, levelSport }: Props) {
  const { t } = useTranslation();
  const dim = !member.matchesGame;
  const conflict =
    member.inProposal || member.status === 'MATCHED'
      ? t('playerInvite.lookingBadgeMatch')
      : member.inGame
        ? t('playerInvite.lookingBadgeInGame')
        : null;
  const mismatchLine =
    member.mismatch && !member.matchesGame ? mismatchLabel(t, member.mismatch) : null;
  const name = [member.firstName, member.lastName].filter(Boolean).join(' ');
  const gender = memberGender(member);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`flex items-center gap-3 rounded-xl px-2 py-2.5 cursor-pointer select-none transition-colors duration-150 ${
        isSelected
          ? 'bg-sky-500/15 dark:bg-sky-500/20'
          : 'hover:bg-gray-100 dark:hover:bg-white/5'
      } ${dim && !isSelected ? 'opacity-60' : ''}`}
    >
      <PlayerAvatar
        player={toPlayer(member, levelSport)}
        showName={false}
        fullHideName
        smallLayout={false}
        extrasmall
        levelSport={levelSport}
        asDiv
      />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
            {name || '—'}
            {gender !== 'PREFER_NOT_TO_SAY' && (
              <i
                className={`bi ms-1.5 text-[11px] ${
                  gender === 'MALE' ? 'bi-gender-male text-sky-500' : 'bi-gender-female text-rose-400'
                }`}
              />
            )}
          </p>
          {conflict && (
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              {conflict}
            </span>
          )}
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-2">
          <LookingFitDots fit={member.fit} />
          {member.gamesTogetherCount > 0 && (
            <span className="truncate text-[11px] font-medium text-emerald-500 dark:text-emerald-400">
              {t('playerInvite.gamesTogetherBadge', { count: member.gamesTogetherCount })}
            </span>
          )}
        </div>
        {mismatchLine && (
          <p className="mt-0.5 text-[11px] text-amber-600/90 dark:text-amber-400/90">{mismatchLine}</p>
        )}
      </div>

      <div
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-all duration-150 ${
          isSelected
            ? 'bg-sky-500 dark:bg-sky-400'
            : 'border-2 border-gray-300 dark:border-gray-600'
        }`}
      >
        {isSelected && <Check size={11} className="text-white dark:text-gray-900" strokeWidth={3.5} />}
      </div>
    </div>
  );
}
