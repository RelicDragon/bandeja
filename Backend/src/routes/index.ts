import { Router } from 'express';
import authRoutes from './auth.routes';
import telegramAuthRoutes from './telegramAuth.routes';
import userRoutes from './user.routes';
import cityRoutes from './city.routes';
import clubRoutes from './club.routes';
import courtRoutes from './court.routes';
import gameRoutes from './game.routes';
import gameTeamRoutes from './gameTeam.routes';
import resultsRoutes from './results.routes';
import inviteRoutes from './invite.routes';
import rankingRoutes from './ranking.routes';
import adminRoutes from './admin.routes';
import logsRoutes from './logs.routes';
import chatRoutes from './chat.routes';
import mediaRoutes from './media.routes';
import favoritesRoutes from './favorites.routes';
import bugRoutes from './bug.routes';
import bugChatRoutes from './bugChat.routes';
import lundaRoutes from './lunda.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/telegram', telegramAuthRoutes);
router.use('/users', userRoutes);
router.use('/cities', cityRoutes);
router.use('/clubs', clubRoutes);
router.use('/courts', courtRoutes);
router.use('/games', gameRoutes);
router.use('/game-teams', gameTeamRoutes);
router.use('/results', resultsRoutes);
router.use('/invites', inviteRoutes);
router.use('/rankings', rankingRoutes);
router.use('/admin', adminRoutes);
router.use('/logs', logsRoutes);
router.use('/chat', chatRoutes);
router.use('/media', mediaRoutes);
router.use('/favorites', favoritesRoutes);
router.use('/bugs', bugRoutes);
router.use('/bug-chat', bugChatRoutes);
router.use('/lunda', lundaRoutes);

export default router;

