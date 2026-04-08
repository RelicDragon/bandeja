import { useEffect, useId, useState } from 'react';
import type { BasicUser, UserTeam } from '@/types';
import { teamAvatarHalfPlaneClipPath } from '@/utils/teamAvatarClipPolygon';
import { getTeamAvatarPair } from '@/utils/teamAvatarPair';
import { teamNameInitials, userInitialsFromBasicUser } from '@/utils/teamAvatarText';
import { userAvatarTinyUrlFromStandard } from '@/utils/userAvatarTinyUrl';

function SoloFace({
  user,
  teamName,
  tile,
}: {
  user: BasicUser;
  teamName: string;
  tile: boolean;
}) {
  const useTiny = tile;
  const tinyUrl = useTiny ? userAvatarTinyUrlFromStandard(user.avatar) : null;
  const [tinyFailed, setTinyFailed] = useState(false);
  useEffect(() => {
    setTinyFailed(false);
  }, [user.id, user.avatar, useTiny]);
  const src = tinyUrl && !tinyFailed ? tinyUrl : user.avatar ?? '';
  const textCls = tile ? 'text-sm' : 'text-lg';

  if (user.avatar && src) {
    return (
      <img
        src={src}
        alt=""
        className="h-full w-full object-cover"
        onError={() => {
          if (tinyUrl) setTinyFailed(true);
        }}
      />
    );
  }
  return (
    <div
      className={`flex h-full w-full items-center justify-center bg-primary-600 font-semibold text-white ${textCls}`}
    >
      {teamNameInitials(teamName)}
    </div>
  );
}

function SplitFaceHalf({
  user,
  tile,
  clipPath,
  z,
}: {
  user: BasicUser;
  tile: boolean;
  clipPath: string;
  z: string;
}) {
  const tinyUrl = tile ? userAvatarTinyUrlFromStandard(user.avatar) : null;
  const [tinyFailed, setTinyFailed] = useState(false);
  useEffect(() => {
    setTinyFailed(false);
  }, [user.id, user.avatar, tile]);
  const src = tinyUrl && !tinyFailed ? tinyUrl : user.avatar ?? '';
  const textCls = tile ? 'text-sm' : 'text-lg';

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
      {user.avatar && src ? (
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          onError={() => {
            if (tinyUrl) setTinyFailed(true);
          }}
        />
      ) : (
        <div
          className={`flex h-full w-full items-center justify-center bg-primary-600 font-semibold text-white ${textCls}`}
        >
          {userInitialsFromBasicUser(user)}
        </div>
      )}
    </div>
  );
}

export type TeamAvatarSize = 'tile' | 'hero' | 'fill';

interface TeamAvatarProps {
  team: UserTeam;
  size?: TeamAvatarSize;
  className?: string;
  showRing?: boolean;
}

export function TeamAvatar({ team, size = 'hero', className = '', showRing }: TeamAvatarProps) {
  const seamMaskId = useId().replace(/:/g, '');
  const tile = size === 'tile';
  const ring = showRing ?? tile;
  const { primary, secondary } = getTeamAvatarPair(team);
  const cutAngle = team.cutAngle ?? 45;

  const boxCls =
    size === 'tile'
      ? `h-11 w-11 rounded-2xl${ring ? ' ring-2 ring-white dark:ring-gray-800' : ''}`
      : size === 'fill'
        ? 'h-full min-h-0 w-full rounded-[1.2rem]'
        : 'h-[7.5rem] w-[7.5rem] sm:h-32 sm:w-32 rounded-[1.2rem]';

  const shrink = size === 'fill' ? '' : 'shrink-0';
  const wrapCls = `relative overflow-hidden ${shrink} ${boxCls} ${className}`.trim();

  if (team.avatar) {
    return (
      <div className={wrapCls}>
        <img src={team.avatar} alt="" className="h-full w-full object-cover" />
      </div>
    );
  }

  if (!secondary) {
    return (
      <div className={wrapCls}>
        <SoloFace user={primary} teamName={team.name} tile={tile} />
      </div>
    );
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

  return (
    <div className={splitWrapCls}>
      <SplitFaceHalf user={primary} tile={tile} clipPath={clip1} z="z-0" />
      <SplitFaceHalf user={secondary} tile={tile} clipPath={clip2} z="z-[1]" />
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
}
