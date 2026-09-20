import { Router } from 'express';
import authRoutes from './auth.routes';
import telegramAuthRoutes from './telegramAuth.routes';
import userRoutes from './user.routes';
import cityRoutes from './city.routes';
import clubRoutes from './club.routes';
import courtRoutes from './court.routes';
import gameRoutes from './game.routes';
import gameTeamRoutes from './gameTeam.routes';
import leagueRoutes from './league.routes';
import resultsRoutes from './results.routes';
import inviteRoutes from './invite.routes';
import rankingRoutes from './ranking.routes';
import adminRoutes from './admin.routes';
import logsRoutes from './logs.routes';
import chatRoutes from './chat.routes';
import stickersRoutes from './stickers.routes';
import giphyRoutes from './giphy.routes';
import linkPreviewRoutes from './linkPreview.routes';
import mediaRoutes from './media.routes';
import favoritesRoutes from './favorites.routes';
import bugRoutes from './bug.routes';
import gameCourtRoutes from './gameCourt.routes';
import transactionRoutes from './transaction.routes';
import goodsRoutes from './goods.routes';
import levelChangeRoutes from './levelChange.routes';
import pushRoutes from './push.routes';
import blockedUsersRoutes from './blockedUsers.routes';
import faqRoutes from './faq.routes';
import gameSubscriptionRoutes from './gameSubscription.routes';
import playIntentRoutes from './playIntent.routes';
import trainingRoutes from './training.routes';
import trainersRoutes from './trainers.routes';
import groupChannelRoutes from './groupChannel.routes';
import betRoutes from './bet.routes';
import appRoutes from './app.routes';
import marketItemRoutes from './marketItem.routes';
import userGameNoteRoutes from './userGameNoteRoutes';
import currencyRoutes from './currency.routes';
import userTeamRoutes from './userTeam.routes';
import clubAdminRoutes from './clubAdmin.routes';
import storyRoutes from './story.routes';
import adRoutes from './ad.routes';
import adLandingRoutes from './adLanding.routes';
import linkToAppRoutes from './linkToApp.routes';
import booktimeRoutes from './booktime.routes';
import padelooRoutes from './padeloo.routes';
import klikterenRoutes from './klikteren.routes';
import nspadelRoutes from './nspadel.routes';
import weltnerRoutes from './weltner.routes';
import weatherRoutes from './weather.routes';
import meRoutes from './me.routes';
// PRDs 345–357 — routers pre-created by the Wave 2 backend scaffold so the
// feature agents never have to touch this file. See the mount block below.
import seriesRoutes from './series.routes';
import gameSeriesRoutes from './gameSeries.routes';
import gameAttendanceRoutes from './gameAttendance.routes';
import gameCostRoutes from './gameCost.routes';
import gameWeatherRoutes from './gameWeather.routes';
import liveGamesRoutes from './liveGames.routes';
import onboardingRoutes from './onboarding.routes';
import recapRoutes from './recap.routes';
import referralRoutes from './referral.routes';
import publicReferralRoutes from './publicReferral.routes';
import pairRankingRoutes from './pairRanking.routes';
import clubPublicRoutes from './clubPublic.routes';
import shopRoutes from './shop.routes';
import { optionalAuth, type AuthRequest } from '../middleware/auth';
import { buildDetailedHealthPayload, buildPublicHealthPayload } from '../utils/healthInfo';
import { isLoopbackIp } from '../utils/isLoopbackIp';
import { ApiError } from '../utils/ApiError';
import { config } from '../config/env';

const router = Router();

router.get('/health', (_req, res) => {
  res.json(buildPublicHealthPayload());
});

router.get('/health/details', optionalAuth, (req: AuthRequest, res, next) => {
  try {
    const isAdmin = Boolean(req.user?.isAdmin);
    // Use TCP peer (socket.remoteAddress), not req.ip — req.ip is spoofable via XFF when trust proxy is on.
    const peer = req.socket?.remoteAddress;
    const localDevProbe = config.nodeEnv !== 'production' && isLoopbackIp(peer);
    if (!isAdmin && !localDevProbe) {
      throw new ApiError(403, 'Detailed health probe requires admin or local loopback');
    }
    res.json(buildDetailedHealthPayload());
  } catch (err) {
    next(err);
  }
});

router.use('/app', appRoutes);
router.use('/me', meRoutes);
router.use('/auth', authRoutes);
router.use('/telegram', telegramAuthRoutes);

/*
 * PRDs 345–357 sub-routers that share a mount path with an existing domain
 * router are mounted FIRST. Express runs `router.use` mounts in registration
 * order and a router that matches nothing calls `next()`, so:
 *   - nothing declared in these routers can be shadowed by `user.routes.ts` /
 *     `club.routes.ts` / `game.routes.ts` / `ranking.routes.ts` parameterised
 *     routes (`/:id`, `/:userId/stats`, `/:clubId/booktime/auth`, …);
 *   - everything they do not match falls straight through to those routers, so
 *     no existing endpoint changes behaviour.
 * The trade is that a path declared in one of these routers WINS over the same
 * path in the older router — each file's header says so. In particular
 * `gameWeather.routes.ts` must not re-declare `GET /games/:id/weather`.
 */
router.use('/users', onboardingRoutes); // PRD 350 — /users/me/onboarding
router.use('/users', recapRoutes); // PRD 353 — /users/me/recaps
router.use('/clubs', clubPublicRoutes); // PRD 354 — /clubs/:id/public
router.use('/games', gameSeriesRoutes); // PRD 345 — /games/:id/series
router.use('/games', gameAttendanceRoutes); // PRD 346
router.use('/games', gameCostRoutes); // PRD 348
router.use('/games', gameWeatherRoutes); // PRD 357
router.use('/rankings', pairRankingRoutes); // PRD 352 — /rankings/pairs

router.use('/users', userRoutes);
router.use('/cities', cityRoutes);
router.use('/clubs', clubRoutes);
router.use('/courts', courtRoutes);
router.use('/games', gameRoutes);
router.use('/game-teams', gameTeamRoutes);
router.use('/leagues', leagueRoutes);
router.use('/results', resultsRoutes);
router.use('/invites', inviteRoutes);
router.use('/rankings', rankingRoutes);
router.use('/admin', adminRoutes);
router.use('/logs', logsRoutes);
router.use('/chat', chatRoutes);
router.use('/stickers', stickersRoutes);
router.use('/giphy', giphyRoutes);
router.use('/link-preview', linkPreviewRoutes);
router.use('/media', mediaRoutes);
router.use('/favorites', favoritesRoutes);
router.use('/bugs', bugRoutes);
router.use('/game-courts', gameCourtRoutes);
router.use('/transactions', transactionRoutes);
router.use('/goods', goodsRoutes);
router.use('/level-changes', levelChangeRoutes);
router.use('/push', pushRoutes);
router.use('/blocked-users', blockedUsersRoutes);
router.use('/faqs', faqRoutes);
router.use('/game-subscriptions', gameSubscriptionRoutes);
router.use('/play-intents', playIntentRoutes);
router.use('/training', trainingRoutes);
router.use('/trainers', trainersRoutes);
router.use('/group-channels', groupChannelRoutes);
router.use('/bets', betRoutes);
router.use('/market-items', marketItemRoutes);
router.use('/user-game-notes', userGameNoteRoutes);
router.use('/currency', currencyRoutes);
router.use('/user-teams', userTeamRoutes);
router.use('/club-admin', clubAdminRoutes);
router.use('/stories', storyRoutes);
router.use('/ads', adRoutes);
router.use('/public/landings', adLandingRoutes);
router.use('/public/link-to-app', linkToAppRoutes);
router.use('/booktime', booktimeRoutes);
router.use('/padeloo', padelooRoutes);
router.use('/klikteren', klikterenRoutes);
router.use('/nspadel', nspadelRoutes);
router.use('/weltner', weltnerRoutes);
router.use('/weather', weatherRoutes);

/* PRDs 345–357 routers on their own new mount paths — no shadowing possible. */
router.use('/series', seriesRoutes); // PRD 345
router.use('/live', liveGamesRoutes); // PRD 349
router.use('/referrals', referralRoutes); // PRD 351
router.use('/public/referral', publicReferralRoutes); // PRD 351
router.use('/shop', shopRoutes); // PRD 355

export default router;
