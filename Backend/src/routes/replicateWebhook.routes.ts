import { Router } from 'express';
import { handleReplicateWebhook } from '../controllers/replicateWebhook.controller';

const router = Router();

router.post('/replicate', handleReplicateWebhook);

export default router;
