import api from './axios';
import type { ApiResponse } from '@/types';

/**
 * PRD 363 / 364 — `GET /public/platform-flags`.
 *
 * Mirrors `Backend/src/services/platformFlags.service.ts`. The map is a closed
 * allow-list of booleans, unauthenticated and cacheable; a missing key on the
 * wire must read as `false`, never as "unknown".
 */
export type PublicPlatformFlagKey =
  | 'GAME_ORGANIZER_NEXT_ACTIONS_ENABLED'
  | 'FIND_LOOKING_COUNT_ENABLED';

export type PublicPlatformFlags = Partial<Record<PublicPlatformFlagKey, boolean>>;

export const platformFlagsApi = {
  async get(): Promise<PublicPlatformFlags> {
    const response = await api.get<ApiResponse<{ flags: PublicPlatformFlags }>>(
      '/public/platform-flags',
    );
    return response.data.data.flags ?? {};
  },
};
