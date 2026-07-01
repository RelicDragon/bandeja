import { Response } from 'express';
import { MyTabDataService } from '../services/me/myTabData.service';
import { ApiError } from '../utils/ApiError';
import type { AuthRequest } from '../middleware/auth';

export class MeController {
  /**
   * GET /me/my-tab-data
   *
   * Unified endpoint for My Tab data aggregation.
   * Returns games, invites, teams, and unread counts in a single optimized call.
   *
   * Query parameters:
   * - includeStories: boolean - Include stories count
   * - includeBooktime: boolean - Include booktime connection status
   * - pastGamesLimit: number - Number of past games to include
   *
   * Headers:
   * - If-None-Match: ETag for conditional request
   *
   * Response headers:
   * - ETag: Data hash for caching
   * - Cache-Control: private, no-cache, must-revalidate
   */
  static async getMyTabData(req: AuthRequest, res: Response): Promise<void> {
    const userId = req.userId;

    if (!userId) {
      throw new ApiError(401, 'Unauthorized', true, { code: 'auth.notAuthenticated' });
    }

    const startTime = Date.now();

    try {
      // Parse query options
      const options = {
        includeStories: req.query.includeStories === 'true',
        includeBooktime: req.query.includeBooktime === 'true',
        pastGamesLimit: req.query.pastGamesLimit ? parseInt(req.query.pastGamesLimit as string) : undefined,
      };

      // Fetch data
      const data = await MyTabDataService.getMyTabData({
        userId,
        userCityId: req.user?.currentCityId,
        options,
      });

      // Generate ETag
      const etag = MyTabDataService.generateETag(data);
      data._meta = {
        timestamp: data._meta?.timestamp ?? new Date().toISOString(),
        etag,
      };

      // Check for conditional request (If-None-Match header)
      const ifNoneMatch = req.get('If-None-Match');
      if (ifNoneMatch && ifNoneMatch === etag) {
        res.status(304).end();
        return;
      }

      // Set caching headers.
      // `no-cache, must-revalidate` lets the client (and native WebView) store the
      // response but forces a revalidation (conditional GET) before reuse, so an
      // accepted/declined invite can never be resurrected from a stale transport
      // cache after the local ETag cache is cleared. 304/ETag behavior is preserved.
      res.set('ETag', etag);
      res.set('Cache-Control', 'private, no-cache, must-revalidate');

      const duration = Date.now() - startTime;
      console.info('[MeController] getMyTabData success', {
        userId,
        duration: `${duration}ms`,
        gamesCount: data.games.length,
        invitesCount: data.invites.length,
      });

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('[MeController] getMyTabData error', {
        userId,
        duration: `${duration}ms`,
        error: error instanceof Error ? error.message : 'unknown',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError(500, 'Failed to fetch My Tab data', true, {
        code: 'me.my_tab_data.fetch_failed',
      });
    }
  }
}

export const meController = new MeController();
