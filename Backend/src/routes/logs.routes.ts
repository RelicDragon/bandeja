import { Router } from 'express';
import { getHistoricalLogs, streamLogs, clearLogs } from '../controllers/logs.controller';
import { requireAdmin } from '../middleware/auth';

const router = Router();

router.get('/historical', requireAdmin, getHistoricalLogs);
router.get('/stream', requireAdmin, streamLogs);
router.delete('/clear', requireAdmin, clearLogs);

export default router;

