import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as giphyController from '../controllers/giphy.controller';

const router = Router();

router.get('/status', authenticate, giphyController.getStatus);
router.get('/search', authenticate, giphyController.search);
router.get('/trending', authenticate, giphyController.trending);
router.post('/import', authenticate, giphyController.importGif);

export default router;
