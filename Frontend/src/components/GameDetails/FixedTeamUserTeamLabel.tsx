import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import type { BasicUser, FixedTeamUserTeam } from '@/types';
import { TeamAvatar } from '@/components/TeamAvatar';
import { avatarTeamFromFixedTeam, fixedTeamUserTeamTint, UT_ACCENT_TEXT } from '@/utils/fixedTeamUserTeam';

interface FixedTeamUserTeamLabelProps {
  userTeam: FixedTeamUserTeam;
  /** The fixed team's players (the face is drawn from them). */
  players: BasicUser[];
  /** `title`: bold team-coloured name. `eyebrow`: small caps line above a roster. */
  variant?: 'title' | 'eyebrow';
  showAvatar?: boolean;
  /** Small line under the name (e.g. "Your team"), so the name keeps the row's width. */
  subtitle?: ReactNode;
  className?: string;
}

/** Team face + name; tapping opens the team page. */
export function FixedTeamUserTeamLabel({
  userTeam,
  players,
  variant = 'title',
  showAvatar = true,
  subtitle,
  className = '',
}: FixedTeamUserTeamLabelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const avatarTeam = useMemo(() => avatarTeamFromFixedTeam(userTeam, players), [userTeam, players]);
  const { vars } = fixedTeamUserTeamTint(userTeam.color);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/user-team/${userTeam.id}`);
      }}
      aria-label={t('gameDetails.fixedTeamOpenUserTeam', { team: userTeam.name })}
      style={vars}
      className={`group flex min-w-0 items-center gap-2 rounded-lg text-start outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${className}`}
    >
      {showAvatar && avatarTeam ? (
        <TeamAvatar team={avatarTeam} size="mini" participantTip={false} />
      ) : null}
      <span className="flex min-w-0 flex-col">
        <span
          className={`min-w-0 truncate ${UT_ACCENT_TEXT} ${
            variant === 'title'
              ? 'text-sm font-extrabold tracking-tight'
              : 'text-[11px] font-bold uppercase tracking-[0.12em]'
          }`}
        >
          {userTeam.name}
        </span>
        {subtitle ? <span className="min-w-0 truncate">{subtitle}</span> : null}
      </span>
      <ChevronRight
        size={14}
        aria-hidden
        className={`shrink-0 opacity-60 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5 rtl:rotate-180 ${UT_ACCENT_TEXT}`}
      />
    </button>
  );
}
