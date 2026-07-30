import { PlayerAvatar } from '@/components/PlayerAvatar';
import { SportPublicIcon } from '@/components/sport/SportPublicIcon';
import type { BasicUser, Sport } from '@/types';

type IdleMember = {
  userId: string;
  firstName?: string | null;
  lastName?: string | null;
  avatar: string | null;
};

type Props = {
  sport: Sport;
  title: string;
  hint: string;
  members: IdleMember[];
  onClick: () => void;
};

export function PlayIntentIdleCtaCard({
  sport,
  title,
  hint,
  members,
  onClick,
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="play-intent-cta"
      className="flex w-full items-center gap-2.5 rounded-xl border border-border/70 bg-white px-2.5 py-2 text-left transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/5 dark:bg-gray-900"
    >
      <SportPublicIcon sport={sport} className="h-5 w-5 shrink-0 object-contain" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{title}</div>
        <p className="text-xs leading-snug text-muted-foreground">{hint}</p>
      </div>
      {members.length > 0 && (
        <div className="flex shrink-0 -space-x-1.5" aria-hidden>
          {members.slice(0, 3).map((member) => {
            const player: BasicUser = {
              id: member.userId,
              firstName: member.firstName ?? undefined,
              lastName: member.lastName ?? undefined,
              avatar: member.avatar,
              level: 0,
              socialLevel: 0,
              gender: 'PREFER_NOT_TO_SAY',
              approvedLevel: false,
              isTrainer: false,
            };
            return (
              <PlayerAvatar
                key={member.userId}
                player={player}
                subscribePresence={false}
                fullHideName
                inlineFace
                inlineFacePlain
                inlineFaceFlatStack
                asDiv
              />
            );
          })}
        </div>
      )}
    </button>
  );
}
