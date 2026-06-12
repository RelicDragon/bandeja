import type { Sport } from '@/types';
import { SportPublicIcon } from '@/components/sport/SportPublicIcon';

export function SummarySportIcon({ sport }: { sport: Sport }) {
  return (
    <SportPublicIcon
      sport={sport}
      className="h-3 w-3 shrink-0 object-contain grayscale"
    />
  );
}
