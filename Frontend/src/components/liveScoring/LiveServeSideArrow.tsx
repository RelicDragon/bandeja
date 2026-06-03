import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { CourtServeSide } from '@/utils/liveScoring';

type LiveServeSideArrowProps = {
  courtSide: CourtServeSide;
};

export function LiveServeSideArrow({ courtSide }: LiveServeSideArrowProps) {
  const Icon = courtSide === 'rightDeuce' ? ArrowRight : ArrowLeft;
  return (
    <Icon
      size={16}
      strokeWidth={2.5}
      aria-hidden
      className="shrink-0 text-primary-700 dark:text-primary-300"
    />
  );
}
