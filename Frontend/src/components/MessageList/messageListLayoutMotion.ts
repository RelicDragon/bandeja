import type { Transition } from 'framer-motion';

import { CHAT_LIST_HEIGHT_TRANSITION } from '@/components/chat/chatListMotion';

const INSTANT_TRANSITION: Transition = { duration: 0 };

export type MessageListLayoutMotionInput = {
  reduceMotion: boolean;
  threadLayoutSettling: boolean;
  isNearBottom: boolean;
  /** Load-more / prepend windows — never animate (fights scroll compensation). */
  suppressMotion?: boolean;
};

export type MessageListLayoutMotion = {
  /** Animated list height (tail zone only; settling stays instant for bottom pin). */
  heightTransition: Transition;
  /** CSS transition on virtual row translateY. */
  rowLayoutTransitionEnabled: boolean;
};

/**
 * Near-bottom or thread settling → smooth tail layout; mid-history → instant layout
 * so scroll-anchor compensation is not fighting animated height / row motion.
 */
export function resolveMessageListLayoutMotion(
  input: MessageListLayoutMotionInput
): MessageListLayoutMotion {
  const { reduceMotion, threadLayoutSettling, isNearBottom, suppressMotion = false } = input;
  const inTailMotionZone = threadLayoutSettling || isNearBottom;

  if (reduceMotion || suppressMotion || !inTailMotionZone) {
    return { heightTransition: INSTANT_TRANSITION, rowLayoutTransitionEnabled: false };
  }

  const heightAnimated = isNearBottom && !threadLayoutSettling;
  return {
    heightTransition: heightAnimated ? CHAT_LIST_HEIGHT_TRANSITION : INSTANT_TRANSITION,
    rowLayoutTransitionEnabled: true,
  };
}
