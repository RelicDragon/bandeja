import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Calendar, MapPin, Sparkles, Users } from 'lucide-react';
import { Button } from '@/components';
import type { StorySegment } from '@/api/stories';
import { getStoryGameBackdropUrl } from '@/utils/storyGameBackdrop';
import { StoryActivitySlideShell } from './StoryActivitySlideShell';

type GamePromoStorySlideProps = {
  segment: Extract<StorySegment, { sourceType: 'GAME_CREATED' }>;
  onOpenGame: (gameId: string) => void;
};

export function GamePromoStorySlide({ segment, onOpenGame }: GamePromoStorySlideProps) {
  const { t } = useTranslation();
  const { game } = segment;
  const dateLabel = format(new Date(game.startTime), 'PPp');

  return (
    <StoryActivitySlideShell entityType={game.entityType} backdropUrl={getStoryGameBackdropUrl(game)}>
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 shadow-[0_0_20px_rgba(255,255,255,0.2)] ring-1 ring-white/35">
          <Sparkles size={26} className="text-white" strokeWidth={1.75} />
        </div>

        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/85">
          {t('stories.newGame')}
        </p>

        <h2 className="text-xl font-bold leading-snug text-white drop-shadow-sm">
          {game.name || t('stories.unnamedGame')}
        </h2>

        <div className="w-full space-y-2.5 text-sm text-white/95">
          <p className="flex items-center justify-center gap-2">
            <Calendar size={16} className="shrink-0 text-white/75" />
            {dateLabel}
          </p>
          {(game.clubName || game.cityName) && (
            <p className="flex items-center justify-center gap-2">
              <MapPin size={16} className="shrink-0 text-white/75" />
              {[game.clubName, game.cityName].filter(Boolean).join(', ')}
            </p>
          )}
          {(game.entityType === 'BAR' || game.maxParticipants != null) && (
            <p className="flex items-center justify-center gap-2">
              <Users size={16} className="shrink-0 text-white/75" />
              {game.entityType === 'BAR'
                ? (game.participantCount ?? 0)
                : `${game.participantCount ?? 0}/${game.maxParticipants}`}
            </p>
          )}
        </div>

        <Button
          variant="secondary"
          data-story-interactive
          className="mt-1 w-full border-0 bg-white font-semibold text-gray-900 shadow-md hover:bg-white/95"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onOpenGame(game.id);
          }}
        >
          {t('stories.viewGame')}
        </Button>
      </div>
    </StoryActivitySlideShell>
  );
}
