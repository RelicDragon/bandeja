import { useEffect, useId, useState } from 'react';
import type { BasicUser, UserTeam } from '@/types';
import { teamAvatarHalfPlaneClipPath } from '@/utils/teamAvatarClipPolygon';
import { getTeamAvatarPair } from '@/utils/teamAvatarPair';
import { userTeamColorTones } from '@/utils/userTeamColor';
import { teamNameInitials, userInitialsFromBasicUser } from '@/utils/teamAvatarText';
import {
  avatarImageOnError,
  avatarImageSrcToLoad,
  useAvatarImageFallbackState,
} from '@/utils/userAvatarImageFallback';
import { TeamAvatarParticipantTipShell } from '@/components/TeamAvatarParticipantTipShell';
import { UserAvatarFallbackImg } from '@/components/UserAvatarFallbackImg';
import { animatedAvatarSrc, userFaceTinySrc } from '@/utils/animatedAvatar';

type Tones = { light: string; dark: string } | null;

function SoloFace({
  user,
  teamName,
  tile,
  tones,
}: {
  user: BasicUser;
  teamName: string;
  tile: boolean;
  tones: Tones;
}) {
  const useTiny = tile;
  const tinyUrl = useTiny ? userFaceTinySrc(user) : animatedAvatarSrc(user);
  const [state, setState] = useAvatarImageFallbackState(`${user.id}:${user.avatar ?? ''}:${useTiny}`);
  const src = avatarImageSrcToLoad({ avatar: user.avatar, tinyUrl, state });
  const textCls = tile ? 'text-sm' : 'text-lg';

  return (
    <>
      <div
        aria-hidden={Boolean(src)}
        className={`flex h-full w-full items-center justify-center font-semibold text-white ${tones ? '' : 'bg-primary-600'} ${textCls}`}
        style={tones ? { backgroundImage: `linear-gradient(135deg, ${tones.light}, ${tones.dark})` } : undefined}
      >
        {teamNameInitials(teamName)}
      </div>
      {src ? (
        <UserAvatarFallbackImg
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setState((current) => avatarImageOnError(current, tinyUrl, src))}
        />
      ) : null}
    </>
  );
}

/** How far (in % of the box) a half's initials sit from the centre, along the seam's normal. */
const SPLIT_INITIALS_OFFSET = 24;

function SplitFaceHalf({
  user,
  tile,
  clipPath,
  z,
  side,
  cutAngle,
  tones,
}: {
  user: BasicUser;
  tile: boolean;
  clipPath: string;
  z: string;
  side: 'first' | 'second';
  cutAngle: number;
  tones: Tones;
}) {
  const tinyUrl = tile ? userFaceTinySrc(user) : animatedAvatarSrc(user);
  const [state, setState] = useAvatarImageFallbackState(`${user.id}:${user.avatar ?? ''}:${tile}`);
  const src = avatarImageSrcToLoad({ avatar: user.avatar, tinyUrl, state });
  const textCls = tile ? 'text-[10px]' : 'text-lg';
  // Centre the initials inside this half (along the normal of the seam, the
  // same normal `teamAvatarHalfPlaneClipPath` uses), so two photo-less players
  // never print their initials on top of each other at the seam.
  const rad = (cutAngle * Math.PI) / 180;
  const sign = side === 'first' ? 1 : -1;
  const left = 50 + sign * -Math.sin(rad) * SPLIT_INITIALS_OFFSET;
  const top = 50 + sign * Math.cos(rad) * SPLIT_INITIALS_OFFSET;
  const tone = tones ? '' : side === 'first' ? 'bg-primary-500' : 'bg-primary-700';
  const toneStyle = tones ? { backgroundColor: side === 'first' ? tones.light : tones.dark } : undefined;

  return (
    <div
      className={`absolute inset-0 ${z}`}
      style={{
        clipPath,
        WebkitBackfaceVisibility: 'hidden',
        backfaceVisibility: 'hidden',
        transform: 'translateZ(0)',
      }}
    >
      <div
        aria-hidden={Boolean(src)}
        className={`relative h-full w-full font-semibold text-white ${tone} ${textCls}`}
        style={toneStyle}
      >
        <span
          className="absolute -translate-x-1/2 -translate-y-1/2 leading-none"
          style={{ left: `${left}%`, top: `${top}%` }}
        >
          {userInitialsFromBasicUser(user)}
        </span>
      </div>
      {src ? (
        <UserAvatarFallbackImg
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setState((current) => avatarImageOnError(current, tinyUrl, src))}
        />
      ) : null}
    </div>
  );
}

/** `mini`: 32px inline badge (fixed-team rows); tile-style text, never a ring. */
export type TeamAvatarSize = 'mini' | 'tile' | 'hero' | 'fill';

interface TeamAvatarProps {
  team: UserTeam;
  size?: TeamAvatarSize;
  className?: string;
  showRing?: boolean;
  participantTip?: boolean;
}

export function TeamAvatar({ team, size = 'hero', className = '', showRing, participantTip }: TeamAvatarProps) {
  const showParticipantTip = participantTip ?? size === 'tile';
  const seamMaskId = useId().replace(/:/g, '');
  const tile = size === 'tile' || size === 'mini';
  const ring = size === 'mini' ? false : (showRing ?? tile);
  const { primary, secondary } = getTeamAvatarPair(team);
  const cutAngle = team.cutAngle ?? 45;
  const tones = userTeamColorTones(team.color);
  const [customAvatarFailed, setCustomAvatarFailed] = useState(false);
  useEffect(() => {
    setCustomAvatarFailed(false);
  }, [team.id, team.avatar]);

  const boxCls =
    size === 'mini'
      ? 'h-8 w-8 rounded-xl'
      : size === 'tile'
      ? `h-11 w-11 rounded-2xl${ring ? ' ring-2 ring-white dark:ring-gray-800' : ''}`
      : size === 'fill'
        ? 'h-full min-h-0 w-full rounded-[1.2rem]'
        : 'h-[7.5rem] w-[7.5rem] sm:h-32 sm:w-32 rounded-[1.2rem]';

  const shrink = size === 'fill' ? '' : 'shrink-0';
  const wrapCls = `relative overflow-hidden ${shrink} ${boxCls} ${className}`.trim();

  if (team.avatar && !customAvatarFailed) {
    const inner = (
      <div className={wrapCls}>
        <UserAvatarFallbackImg
          src={team.avatar}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setCustomAvatarFailed(true)}
        />
      </div>
    );
    return showParticipantTip ? <TeamAvatarParticipantTipShell team={team}>{inner}</TeamAvatarParticipantTipShell> : inner;
  }

  if (!secondary) {
    const inner = (
      <div className={wrapCls}>
        <SoloFace user={primary} teamName={team.name} tile={tile} tones={tones} />
      </div>
    );
    return showParticipantTip ? <TeamAvatarParticipantTipShell team={team}>{inner}</TeamAvatarParticipantTipShell> : inner;
  }

  const clip1 = teamAvatarHalfPlaneClipPath(cutAngle, 'first');
  const clip2 = teamAvatarHalfPlaneClipPath(cutAngle, 'second');
  const rad = (cutAngle * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const L = 72;

  const splitWrapCls = tile
    ? wrapCls
    : `${wrapCls} ring-1 ring-inset ring-black/[0.06] dark:ring-white/[0.08]`;

  const splitInner = (
    <div className={splitWrapCls}>
      <SplitFaceHalf user={primary} tile={tile} clipPath={clip1} z="z-0" side="first" cutAngle={cutAngle} tones={tones} />
      <SplitFaceHalf user={secondary} tile={tile} clipPath={clip2} z="z-[1]" side="second" cutAngle={cutAngle} tones={tones} />
      <svg
        className="pointer-events-none absolute inset-0 z-[2] h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <mask id={seamMaskId}>
            <rect width="100" height="100" fill="black" />
            <line
              x1={50 - L * c}
              y1={50 - L * s}
              x2={50 + L * c}
              y2={50 + L * s}
              stroke="white"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
          </mask>
        </defs>
        <rect width="100" height="100" fill="rgba(255,255,255,0.2)" mask={`url(#${seamMaskId})`} />
        <line
          x1={50 - L * c}
          y1={50 - L * s}
          x2={50 + L * c}
          y2={50 + L * s}
          stroke="rgba(0,0,0,0.14)"
          strokeWidth="0.55"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className="dark:stroke-black/35"
        />
        <line
          x1={50 - L * c}
          y1={50 - L * s}
          x2={50 + L * c}
          y2={50 + L * s}
          stroke="rgba(255,255,255,0.5)"
          strokeWidth="0.55"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className="dark:stroke-white/35"
        />
      </svg>
    </div>
  );
  return showParticipantTip ? <TeamAvatarParticipantTipShell team={team}>{splitInner}</TeamAvatarParticipantTipShell> : splitInner;
}
