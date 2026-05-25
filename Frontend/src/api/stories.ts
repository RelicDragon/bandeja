import api from './axios';
import type { ApiResponse, BasicUser, EntityType, Sport, WinnerOfGame } from '@/types';

import type { StorySegmentEngagement } from './storyEngagement';

export type StorySourceType =
  | 'USER_STORY_ITEM'
  | 'GAME_PHOTO'
  | 'GAME_CREATED'
  | 'GAME_RESULT'
  | 'BRACKET_CHAMPION';

export type BracketChampionStoryBracket = {
  leagueSeasonId: string;
  leagueRoundId: string;
  leagueGroupId: string | null;
  bracketScope: 'PER_GROUP' | 'CROSS_GROUP';
};

export type GameStorySummary = {
  id: string;
  name?: string | null;
  entityType: EntityType;
  startTime: string;
  clubName?: string | null;
  cityName?: string | null;
  avatar?: string | null;
  mainPhoto?: { thumbnailUrl: string; originalUrl?: string } | null;
  sport?: Sport;
  status?: string;
  participantCount?: number;
  maxParticipants?: number;
  telegramResultsSummary?: string | null;
};

export type ResultSummary = {
  isWinner: boolean;
  position: number | null;
  wins: number;
  losses: number;
  ties: number;
  scoresMade: number;
  scoresLost: number;
  pointsEarned: number;
  winnerOfGame?: WinnerOfGame;
  levelChange?: number | null;
  matches?: StoryResultMatch[];
};

export type StoryResultMatchSet = {
  myScore: number;
  oppScore: number;
  isTieBreak: boolean;
};

export type StoryResultMatchPlayer = {
  userId: string;
  displayName: string;
  avatar?: string | null;
};

export type StoryResultMatch = {
  matchId: string;
  roundNumber: number;
  matchNumber: number;
  result: 'W' | 'L' | 'T' | null;
  teamA: StoryResultMatchPlayer[];
  teamB: StoryResultMatchPlayer[];
  sets: StoryResultMatchSet[];
};

export type StoryMediaPayload = {
  url: string;
  thumbnailUrl: string;
  type: 'IMAGE' | 'VIDEO';
  durationMs?: number;
  width?: number;
  height?: number;
  overlayText?: string;
  overlayStyle?: unknown;
};

export type StorySegmentBase = {
  key: string;
  viewed: boolean;
  createdAt: string;
  engagement?: StorySegmentEngagement;
};

export type StorySegment =
  | (StorySegmentBase & {
      sourceType: 'USER_STORY_ITEM';
      media: StoryMediaPayload;
    })
  | (StorySegmentBase & {
      sourceType: 'GAME_PHOTO';
      media: { url: string; thumbnailUrl: string; type: 'IMAGE'; width?: number; height?: number };
      game: GameStorySummary;
    })
  | (StorySegmentBase & {
      sourceType: 'GAME_CREATED';
      game: GameStorySummary;
    })
  | (StorySegmentBase & {
      sourceType: 'GAME_RESULT';
      game: GameStorySummary;
      result: ResultSummary;
    })
  | (StorySegmentBase & {
      sourceType: 'BRACKET_CHAMPION';
      leagueName: string;
      championTeamLabel: string;
      bracket: BracketChampionStoryBracket;
      game: GameStorySummary;
    });

export type StoryBubble = {
  user: BasicUser;
  isSelf: boolean;
  hasUnseen: boolean;
  previewThumbnailUrl: string | null;
  segments: StorySegment[];
};

export type StoryFeed = {
  serverTime: string;
  bubbles: StoryBubble[];
};

export type StoryViewEntry = {
  sourceType: StorySourceType;
  sourceId: string;
  ownerUserId: string;
};

export type StoryImageUploadResponse = {
  mediaUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
};

export type StoryVideoUploadResponse = {
  mediaUrl: string;
  thumbnailUrl: string;
  posterUrl?: string | null;
  durationMs: number;
  width: number;
  height: number;
};

export type CreateStoryItemPayload = {
  mediaUrl: string;
  thumbnailUrl: string;
  posterUrl?: string | null;
  messageType: 'IMAGE' | 'VIDEO';
  videoDurationMs?: number;
  width?: number;
  height?: number;
  overlayText?: string;
  overlayStyle?: unknown;
  caption?: string;
  clientUploadId: string;
};

export const STORY_IMAGE_DURATION_MS = 5000;
export const STORY_GAME_PROMO_DURATION_MS = 7000;
export const STORY_GAME_RESULT_DURATION_MS = 10000;
export const STORY_BRACKET_CHAMPION_DURATION_MS = 9000;
export const STORY_MAX_VIDEO_DURATION_MS = 60000;
export const STORY_MARK_VIEWED_MS = 800;
export const STORY_FEED_TTL_MS = 60_000;
export const STORY_OVERLAY_MAX_CHARS = 80;

function newClientUploadId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function parseStorySegmentKey(key: string): { sourceType: StorySourceType; sourceId: string } | null {
  const idx = key.indexOf(':');
  if (idx <= 0) return null;
  const sourceType = key.slice(0, idx) as StorySourceType;
  const sourceId = key.slice(idx + 1);
  if (!sourceId) return null;
  return { sourceType, sourceId };
}

export function getStorySegmentDurationMs(segment: StorySegment): number {
  if (segment.sourceType === 'USER_STORY_ITEM') {
    if (segment.media.type === 'VIDEO') {
      const raw = segment.media.durationMs ?? STORY_MAX_VIDEO_DURATION_MS;
      return Math.min(Math.max(raw, 1000), STORY_MAX_VIDEO_DURATION_MS);
    }
    return STORY_IMAGE_DURATION_MS;
  }
  if (segment.sourceType === 'GAME_PHOTO') return STORY_IMAGE_DURATION_MS;
  if (segment.sourceType === 'GAME_CREATED') return STORY_GAME_PROMO_DURATION_MS;
  if (segment.sourceType === 'BRACKET_CHAMPION') return STORY_BRACKET_CHAMPION_DURATION_MS;
  return STORY_GAME_RESULT_DURATION_MS;
}

export const storiesApi = {
  getFeed: async (): Promise<StoryFeed> => {
    const response = await api.get<ApiResponse<StoryFeed>>('/stories/feed');
    return response.data.data;
  },

  createItem: async (payload: CreateStoryItemPayload): Promise<StorySegment> => {
    const response = await api.post<ApiResponse<StorySegment>>('/stories/items', payload);
    return response.data.data;
  },

  deleteItem: async (itemId: string): Promise<void> => {
    await api.delete(`/stories/items/${itemId}`);
  },

  markViews: async (entries: StoryViewEntry[]): Promise<void> => {
    if (entries.length === 0) return;
    await api.post('/stories/views', { entries });
  },

  uploadImage: async (file: File, options?: { signal?: AbortSignal }): Promise<StoryImageUploadResponse> => {
    const formData = new FormData();
    formData.append('image', file);
    const response = await api.post<ApiResponse<StoryImageUploadResponse>>('/media/upload/story/image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      signal: options?.signal,
    });
    return response.data.data;
  },

  uploadVideo: async (
    videoFile: File,
    options?: {
      signal?: AbortSignal;
      posterFile?: File;
      durationMs?: number;
      width?: number;
      height?: number;
      onUploadProgress?: (progress: number) => void;
    }
  ): Promise<StoryVideoUploadResponse> => {
    const formData = new FormData();
    formData.append('video', videoFile);
    if (options?.posterFile) formData.append('poster', options.posterFile);
    if (options?.durationMs != null) formData.append('durationMs', String(options.durationMs));
    if (options?.width != null) formData.append('width', String(options.width));
    if (options?.height != null) formData.append('height', String(options.height));

    const response = await api.post<ApiResponse<StoryVideoUploadResponse>>('/media/upload/story/video', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      signal: options?.signal,
      onUploadProgress: options?.onUploadProgress
        ? (ev) => {
            const total = ev.total ?? 0;
            if (total > 0) options.onUploadProgress!(ev.loaded / total);
          }
        : undefined,
    });
    return response.data.data;
  },

  newClientUploadId,
};
