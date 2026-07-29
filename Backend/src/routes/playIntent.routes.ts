import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  cancelPlayIntent,
  confirmMatchProposal,
  createPlayIntent,
  declineMatchProposal,
  getMatchProposal,
  getMyPlayIntent,
  getPlayIntentPool,
  releaseMatchProposal,
  removeMatchProposalMember,
  addMatchProposalMember,
} from '../controllers/playIntent.controller';

const router = Router();

router.get('/me', authenticate, getMyPlayIntent);
router.post('/', authenticate, createPlayIntent);
router.delete('/me', authenticate, cancelPlayIntent);
router.get('/pool', authenticate, getPlayIntentPool);

router.get('/proposals/:id', authenticate, getMatchProposal);
router.post('/proposals/:id/confirm', authenticate, confirmMatchProposal);
router.post('/proposals/:id/decline', authenticate, declineMatchProposal);
router.post('/proposals/:id/release', authenticate, releaseMatchProposal);
router.post('/proposals/:id/remove-member', authenticate, removeMatchProposalMember);
router.post('/proposals/:id/add-member', authenticate, addMatchProposalMember);

router.delete('/:id', authenticate, cancelPlayIntent);

export default router;
