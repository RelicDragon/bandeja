import { Response } from 'express';
import { MyTabDataService } from '../services/me/myTabData.service';
import { ApiError } from '../utils/ApiError';
import type { AuthRequest } from '../middleware/auth';
import { attachLocalizedTextToGames } from '../services/gameText/gameTextLocalizedText.batch';
import { resolveRequestAppUiLocale } from '../services/gameText/gameTextRequestLocale';

function localeScopedEtag(etag: string, locale: string): string {
  return `${etag}:locale=${locale}`;
}

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
   * - locale: app UI language for additive localizedText on games
   *
   * Headers:
   * - If-None-Match: ETag for conditional request
   * - X-App-Locale / Accept-Language: locale fallbacks
   *
   * Response headers:
   * - ETag: Data hash for caching (locale-scoped)
   * - Cache-Control: private, no-cache, must-revalidate
   */
  static async getMyTabData(req: AuthRequest, res: Response): Promise<void> {
    const userId = req.userId;

    if (!userId) {
      throw new ApiError(401, 'Unauthorized', true, { code: 'auth.notAuthenticated' });
    }

    const startTime = Date.now();
    const locale = resolveRequestAppUiLocale(req);

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
          const versionEtag = localeScopedEtag(
            await MyTabDataService.computeVersionETag(userId, options),
            locale,
          );
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
      data.games = await attachLocalizedTextToGames(data.games, locale);

      let etag: string;
      try {
        etag = localeScopedEtag(
          await MyTabDataService.computeVersionETag(userId, options, {
            storiesCount: data.storiesCount ?? null,
            booktimeConnected: data.booktimeConnected ?? null,
          }),
          locale,
        );
      } catch (err) {
        console.warn('[MeController] version etag failed after load; using payload hash', err);
        etag = localeScopedEtag(MyTabDataService.generateETag(data), locale);
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
