import { PlayerAvatar } from '@/components';
import type { BasicUser } from '@/types';
import { COURT_AVATAR_SHADOW_RY, courtAvatarGroundShadowStyle } from './courtGroundShadow';

type ServeCourtPlayerAvatarProps = {
  player?: BasicUser | null;
  /** Box-shadow highlight when serving (must stay circular — use {@link serveCourtHighlight} tokens). */
  servingHighlightClassName?: string;
  /** Perspective depth scale — 1 at far baseline, grows toward near POV. */
  scale?: number;
};

const AVATAR_PX = 24;
const SHADOW_BOTTOM = COURT_AVATAR_SHADOW_RY * 2;

/** Participant face on serve-guide courts with a ground-contact ellipse shadow. */
export function ServeCourtPlayerAvatar({
  player,
  servingHighlightClassName,
  scale = 1,
}: ServeCourtPlayerAvatarProps) {
  const scaled = scale !== 1;
  return (
    <div
      className="relative shrink-0 overflow-visible"
      style={{
        width: AVATAR_PX,
        height: AVATAR_PX + SHADOW_BOTTOM - 2,
        transformOrigin: '50% 100%',
        transform: scaled ? `scale(${scale})` : undefined,
      }}
    >
      <span
        className="pointer-events-none absolute bottom-0 left-1/2 z-[1] -translate-x-1/2 rounded-[50%]"
        style={courtAvatarGroundShadowStyle()}
        aria-hidden
      />
      <div
        className={`absolute left-0 top-0 z-[2] flex size-6 items-center justify-center rounded-full ${servingHighlightClassName ?? ''}`}
      >
        <PlayerAvatar
          player={player}
          showName={false}
          inlineFace
          inlineFacePlain
          inlineFaceSize="sm"
          asDiv
          subscribePresence={false}
        />
      </div>
    </div>
  );
}
