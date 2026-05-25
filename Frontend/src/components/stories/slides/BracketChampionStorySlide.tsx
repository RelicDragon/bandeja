import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Crown, Trophy } from 'lucide-react';
import type { StorySegment } from '@/api/stories';
import { getStoryGameBackdropUrl } from '@/utils/storyGameBackdrop';
import { buildLeagueBracketStoryPath } from '@/utils/leagueBracketStoryPath';
import { StoryActivitySlideShell } from './StoryActivitySlideShell';
import { GameResultStorySummary } from './GameResultStorySummary';
import { STORY_GLOSSY_CTA_CLASS } from '../storyGlossyControl';

type BracketChampionStorySlideProps = {
  segment: Extract<StorySegment, { sourceType: 'BRACKET_CHAMPION' }>;
  onOpenBracket: (path: string) => void;
};

function championInitials(label: string): string[] {
  return label
    .split(/\s*\/\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const words = part.split(/\s+/).filter(Boolean);
      if (words.length >= 2) return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase();
      return (words[0]?.slice(0, 2) ?? '?').toUpperCase();
    });
}

export function BracketChampionStorySlide({ segment, onOpenBracket }: BracketChampionStorySlideProps) {
  const { t } = useTranslation();
  const { game, leagueName, championTeamLabel, bracket } = segment;
  const bracketPath = buildLeagueBracketStoryPath(bracket);
  const scoreSummary = game.telegramResultsSummary?.trim() || null;
  const avatarUrl = game.mainPhoto?.thumbnailUrl ?? game.avatar ?? null;
  const playerInitials = useMemo(() => championInitials(championTeamLabel), [championTeamLabel]);

  return (
    <StoryActivitySlideShell entityType={game.entityType} backdropUrl={getStoryGameBackdropUrl(game)}>
      <div className="flex flex-col items-center gap-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-yellow-300/25 shadow-[0_0_24px_rgba(250,204,21,0.45)] ring-2 ring-yellow-200/70">
          <Crown size={26} className="text-yellow-200" strokeWidth={1.75} />
        </div>

        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/85">
          {t('stories.bracketChampion')}
        </p>

        <h2 className="text-lg font-bold leading-snug text-white drop-shadow-sm">{leagueName}</h2>

        <div className="flex flex-col items-center gap-2">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="h-14 w-14 rounded-full object-cover ring-2 ring-yellow-200/50"
            />
          ) : playerInitials.length > 0 ? (
            <div className="flex -space-x-2">
              {playerInitials.map((initials, i) => (
                <span
                  key={`${initials}-${i}`}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-yellow-300/25 text-xs font-bold text-yellow-50 ring-2 ring-yellow-200/50"
                  style={{ zIndex: playerInitials.length - i }}
                >
                  {initials}
                </span>
              ))}
            </div>
          ) : null}

          <div className="flex items-center justify-center gap-2 rounded-full bg-yellow-300/20 px-3 py-1 ring-1 ring-yellow-200/40">
            <Trophy size={14} className="shrink-0 text-yellow-100" />
            <span className="text-sm font-semibold text-yellow-50">{championTeamLabel}</span>
          </div>
        </div>

        {scoreSummary ? (
          <div className="w-full px-1">
            <GameResultStorySummary text={scoreSummary} />
          </div>
        ) : (
          <p className="text-xs text-white/75">{t('stories.bracketChampionSubtitle')}</p>
        )}

        <button
          type="button"
          data-story-interactive
          className={`mt-1 w-full ${STORY_GLOSSY_CTA_CLASS}`}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onOpenBracket(bracketPath);
          }}
        >
          {t('stories.viewBracket')}
        </button>
      </div>
    </StoryActivitySlideShell>
  );
}
