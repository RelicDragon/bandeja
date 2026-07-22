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
import booktimeRoutes from './booktime.routes';
import padelooRoutes from './padeloo.routes';
import klikterenRoutes from './klikteren.routes';
import weatherRoutes from './weather.routes';
import meRoutes from './me.routes';
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
router.use('/booktime', booktimeRoutes);
router.use('/padeloo', padelooRoutes);
router.use('/klikteren', klikterenRoutes);
router.use('/weather', weatherRoutes);

export default router;
