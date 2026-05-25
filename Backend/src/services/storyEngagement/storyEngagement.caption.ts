import { StorySourceType } from '@prisma/client';
import {
  MAX_SYNTHETIC_CAPTION_LENGTH,
  normalizeCaption,
} from './storyEngagement.constants';
import type { GameStorySummary, ResultSummary } from '../story/story.feed.service';

export type CaptionContext =
  | { type: 'USER_STORY_ITEM'; caption: string | null }
  | { type: 'GAME_PHOTO'; gameName: string | null; sport: string; clubName: string | null }
  | { type: 'GAME_CREATED'; clubName: string | null; createdAt: Date }
  | { type: 'GAME_RESULT'; gameName: string | null; isWinner: boolean; wins: number; losses: number }
  | { type: 'BRACKET_CHAMPION'; leagueName: string; championTeamLabel: string };

function formatRelativeTime(date: Date, now = new Date()): string {
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export function resolveSyntheticCaption(context: CaptionContext, now = new Date()): string | null {
  switch (context.type) {
    case 'USER_STORY_ITEM':
      return normalizeCaption(context.caption, MAX_SYNTHETIC_CAPTION_LENGTH);
    case 'GAME_PHOTO': {
      const title = context.gameName?.trim() || context.sport;
      const club = context.clubName?.trim();
      const raw = club ? `${title} · ${club}` : title;
      return normalizeCaption(raw, MAX_SYNTHETIC_CAPTION_LENGTH);
    }
    case 'GAME_CREATED': {
      const club = context.clubName?.trim() || 'game';
      const raw = `New game · ${club} · ${formatRelativeTime(context.createdAt, now)}`;
      return normalizeCaption(raw, MAX_SYNTHETIC_CAPTION_LENGTH);
    }
    case 'GAME_RESULT': {
      const wl = context.isWinner ? 'W' : 'L';
      const name = context.gameName?.trim() || 'Game';
      const raw = `${wl} · ${name} · ${context.wins}-${context.losses}`;
      return normalizeCaption(raw, MAX_SYNTHETIC_CAPTION_LENGTH);
    }
    case 'BRACKET_CHAMPION': {
      const raw = `🏆 ${context.leagueName} · ${context.championTeamLabel}`;
      return normalizeCaption(raw, MAX_SYNTHETIC_CAPTION_LENGTH);
    }
    default:
      return null;
  }
}

export function captionContextFromStorySegment(
  segment: {
    sourceType: StorySourceType | string;
    createdAt?: string;
    media?: { overlayText?: string };
    game?: GameStorySummary;
    result?: ResultSummary;
    leagueName?: string;
    championTeamLabel?: string;
  },
  manualCaption?: string | null,
): CaptionContext | null {
  switch (segment.sourceType) {
    case StorySourceType.USER_STORY_ITEM:
    case 'USER_STORY_ITEM':
      return { type: 'USER_STORY_ITEM', caption: manualCaption ?? null };
    case StorySourceType.GAME_PHOTO:
    case 'GAME_PHOTO':
      if (!segment.game) return null;
      return {
        type: 'GAME_PHOTO',
        gameName: segment.game.name,
        sport: segment.game.sport,
        clubName: segment.game.clubName ?? null,
      };
    case StorySourceType.GAME_CREATED:
    case 'GAME_CREATED':
      if (!segment.game) return null;
      return {
        type: 'GAME_CREATED',
        clubName: segment.game.clubName ?? null,
        createdAt: new Date(segment.createdAt ?? segment.game.startTime),
      };
    case StorySourceType.GAME_RESULT:
    case 'GAME_RESULT':
      if (!segment.game || !segment.result) return null;
      return {
        type: 'GAME_RESULT',
        gameName: segment.game.name,
        isWinner: segment.result.isWinner,
        wins: segment.result.wins,
        losses: segment.result.losses,
      };
    case StorySourceType.BRACKET_CHAMPION:
    case 'BRACKET_CHAMPION': {
      const leagueName = segment.leagueName?.trim();
      const championTeamLabel = segment.championTeamLabel?.trim();
      if (!leagueName || !championTeamLabel) return null;
      return { type: 'BRACKET_CHAMPION', leagueName, championTeamLabel };
    }
    default:
      return null;
  }
}

export function resolveCaptionForStorySegment(
  segment: {
    sourceType: StorySourceType | string;
    createdAt?: string;
    game?: GameStorySummary;
    result?: ResultSummary;
  },
  manualCaption?: string | null,
  now = new Date(),
): string | null {
  const ctx = captionContextFromStorySegment(segment, manualCaption);
  if (!ctx) return null;
  return resolveSyntheticCaption(ctx, now);
}
