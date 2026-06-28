import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { MeController } from '../controllers/me.controller';

const router = Router();

/**
 * My Tab Data Routes
 *
 * All routes require authentication.
 */

/**
 * GET /me/my-tab-data
 *
 * Unified endpoint for My Tab data aggregation.
 * Returns games, invites, teams, and unread counts in a single optimized call.
 *
 * Query parameters:
 * - includeStories: boolean - Include stories count (default: false)
 * - includeBooktime: boolean - Include booktime connection status (default: false)
 * - pastGamesLimit: number - Number of past games to include (not implemented yet)
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     games: [...],
 *     invites: [...],
 *     teams: [...],
 *     unreadCounts: { gameId: count },
 *     storiesCount: number,
 *     booktimeConnected: boolean,
 *     _meta: {
 *       etag: string,
 *       timestamp: string
 *     }
 *   }
 * }
 */
router.get('/my-tab-data', authenticate, MeController.getMyTabData);

export default router;
