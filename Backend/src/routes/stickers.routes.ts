import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as stickersController from '../controllers/stickers.controller';

const router = Router();

router.get('/packs', authenticate, stickersController.listPacks);
router.get('/packs/:packId', authenticate, stickersController.getPack);
router.get('/me/prefs', authenticate, stickersController.getMyPrefs);
router.put('/me/prefs', authenticate, stickersController.putMyPrefs);
router.post('/me/from-message', authenticate, stickersController.saveFromMessage);
router.delete('/me/:stickerId', authenticate, stickersController.deactivateMine);
router.get('/:stickerId', authenticate, stickersController.getSticker);

export default router;
