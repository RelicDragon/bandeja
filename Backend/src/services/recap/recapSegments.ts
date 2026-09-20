import { StorySourceType } from '@prisma/client';
import type { StorySegment } from '../story/story.feed.service';
import { segmentKey } from '../story/story.feed.service';
import type {
  MonthlyRecapPayload,
  RecapSegmentPayload,
  RecapSlide,
  RecapSportGroup,
} from './recap.types';

/**
 * PRD 353 — turns a stored recap payload into the story segments the viewer
 * plays.
 *
 * The segment key is `MONTHLY_RECAP:<monthKey>#<slideKey>`, which is stable
 * across regenerations and unique per slide: the viewer's progress bars, the
 * share sheet's checkboxes and the playback identity all key off it.
 */
export function recapSegmentKey(monthKey: string, slideKey: string): string {
  return segmentKey(StorySourceType.MONTHLY_RECAP, `${monthKey}#${slideKey}`);
}

function sportGroup(payload: MonthlyRecapPayload, slide: RecapSlide): RecapSportGroup | null {
  if (!slide.sport) return null;
  return payload.sports.find((group) => group.sport === slide.sport) ?? null;
}

function slideDetails(
  payload: MonthlyRecapPayload,
  slide: RecapSlide,
): Partial<RecapSegmentPayload> {
  const group = sportGroup(payload, slide);

  switch (slide.kind) {
    case 'COVER':
    case 'LOW_ACTIVITY':
    case 'OUTRO':
      return { totals: payload.totals };
    case 'GAMES':
      if (!group) return {};
      return {
        games: {
          count: group.games,
          daysInMonth: payload.daysInMonth,
          weekdayOffset: payload.weekdayOffset,
          playedDays: group.playedDays,
        },
      };
    case 'WINS':
      if (!group || group.winRatePct == null) return {};
      return {
        wins: {
          wins: group.wins,
          losses: group.losses,
          ties: group.ties,
          games: group.games,
          winRatePct: group.winRatePct,
        },
      };
    case 'LEVEL':
      return group?.level ? { level: group.level } : {};
    case 'PARTNER':
      return group?.partner ? { partner: group.partner } : {};
    case 'CLUB':
      return group?.club ? { club: group.club } : {};
    case 'STREAK':
      return payload.streak ? { streak: payload.streak } : {};
    default:
      return {};
  }
}

export function buildRecapSegmentPayload(
  payload: MonthlyRecapPayload,
  slide: RecapSlide,
): RecapSegmentPayload {
  return {
    monthKey: payload.monthKey,
    monthStart: payload.monthStart,
    slideKey: slide.key,
    kind: slide.kind,
    sport: slide.sport,
    sports: payload.sports.map((group) => group.sport),
    variant: payload.variant,
    sensitive: slide.sensitive,
    owner: payload.owner,
    ...slideDetails(payload, slide),
  };
}

export function buildRecapStorySegments(
  payload: MonthlyRecapPayload,
  options: { createdAt: Date; viewed: boolean; slideKeys?: string[] },
): StorySegment[] {
  const allowed = options.slideKeys ? new Set(options.slideKeys) : null;
  return payload.slides
    .filter((slide) => !allowed || allowed.has(slide.key))
    .map((slide) => ({
      key: recapSegmentKey(payload.monthKey, slide.key),
      sourceType: 'MONTHLY_RECAP' as const,
      viewed: options.viewed,
      createdAt: options.createdAt.toISOString(),
      recap: buildRecapSegmentPayload(payload, slide),
    }));
}
