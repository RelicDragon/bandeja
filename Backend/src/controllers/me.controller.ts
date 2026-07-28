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
      const options = {
        includeStories: req.query.includeStories === 'true',
        includeBooktime: req.query.includeBooktime === 'true',
        pastGamesLimit: req.query.pastGamesLimit
          ? parseInt(req.query.pastGamesLimit as string)
          : undefined,
      };

      const ifNoneMatch = req.get('If-None-Match');
      if (ifNoneMatch) {
        try {
          const versionEtag = await MyTabDataService.computeVersionETag(userId, options);
          if (ifNoneMatch === versionEtag) {
            res.set('ETag', versionEtag);
            res.set('Cache-Control', 'private, no-cache, must-revalidate');
            res.status(304).end();
            return;
          }
        } catch (err) {
          // Short-circuit must never block the fat path.
          console.warn('[MeController] version etag short-circuit failed; loading full payload', err);
        }
      }

      const data = await MyTabDataService.getMyTabData({
        userId,
        userCityId: req.user?.currentCityId,
        options,
      });

      let etag: string;
      try {
        etag = await MyTabDataService.computeVersionETag(userId, options, {
          storiesCount: data.storiesCount ?? null,
          booktimeConnected: data.booktimeConnected ?? null,
        });
      } catch (err) {
        console.warn('[MeController] version etag failed after load; using payload hash', err);
        etag = MyTabDataService.generateETag(data);
      }

      data._meta = {
        timestamp: data._meta?.timestamp ?? new Date().toISOString(),
        etag,
      };

      // `no-cache, must-revalidate` lets the client store the response but forces
      // revalidation before reuse (invite accept/decline safety).
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
