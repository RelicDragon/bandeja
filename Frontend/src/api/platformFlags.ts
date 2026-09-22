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

/**
 * Mirror of `PUBLIC_PLATFORM_FLAG_DEFAULTS` on the server: what a flag reads
 * before the first answer arrives or when the key is missing from the wire.
 * Keeping the two in step means the first render already shows the shipped
 * state and the answer only ever changes it when an admin actually flipped it.
 */
export const PUBLIC_PLATFORM_FLAG_DEFAULTS: Record<PublicPlatformFlagKey, boolean> = {
  /** PRD 364 — on by default. */
  GAME_ORGANIZER_NEXT_ACTIONS_ENABLED: true,
  /** PRD 363 — on by default (product decision 2026-09-22); the admin row is the kill switch. */
  FIND_LOOKING_COUNT_ENABLED: true,
};

export const platformFlagsApi = {
  async get(): Promise<PublicPlatformFlags> {
    const response = await api.get<ApiResponse<{ flags: PublicPlatformFlags }>>(
      '/public/platform-flags',
    );
    return response.data.data.flags ?? {};
  },
};
