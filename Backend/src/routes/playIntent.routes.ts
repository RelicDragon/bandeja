import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validateZod } from '../middleware/validateZod';
import {
  cancelPlayIntent,
  confirmMatchProposal,
  createPlayIntent,
  declineMatchProposal,
  getMatchProposal,
  getMyPlayIntent,
  getPlayIntentPool,
  getSharedPlayIntent,
  joinSharedPlayIntent,
  releaseMatchProposal,
  removeMatchProposalMember,
  addMatchProposalMember,
  discussPlayIntent,
} from '../controllers/playIntent.controller';
import {
  addProposalMemberBodySchema,
  discussPlayIntentBodySchema,
  createPlayIntentBodySchema,
  playIntentIdParamsSchema,
  playIntentOptionalScopeQuerySchema,
  proposalIdParamsSchema,
  removeProposalMemberBodySchema,
} from '../services/playIntent/playIntent.schemas';

const router = Router();

router.get(
  '/me',
  authenticate,
  validateZod({ query: playIntentOptionalScopeQuerySchema }),
  getMyPlayIntent,
);
router.post(
  '/',
  authenticate,
  validateZod({ body: createPlayIntentBodySchema }),
  createPlayIntent,
);
router.delete('/me', authenticate, cancelPlayIntent);
router.get(
  '/pool',
  authenticate,
  validateZod({ query: playIntentOptionalScopeQuerySchema }),
  getPlayIntentPool,
);
router.get(
  '/shared/:id',
  authenticate,
  validateZod({ params: playIntentIdParamsSchema }),
  getSharedPlayIntent,
);
router.post(
  '/shared/:id/join',
  authenticate,
  validateZod({ params: playIntentIdParamsSchema }),
  joinSharedPlayIntent,
);

router.get(
  '/proposals/:id',
  authenticate,
  validateZod({ params: proposalIdParamsSchema }),
  getMatchProposal,
);
router.post(
  '/proposals/:id/confirm',
  authenticate,
  validateZod({ params: proposalIdParamsSchema }),
  confirmMatchProposal,
);
router.post(
  '/proposals/:id/decline',
  authenticate,
  validateZod({ params: proposalIdParamsSchema }),
  declineMatchProposal,
);
router.post(
  '/proposals/:id/release',
  authenticate,
  validateZod({ params: proposalIdParamsSchema }),
  releaseMatchProposal,
);
router.post(
  '/proposals/:id/remove-member',
  authenticate,
  validateZod({
    params: proposalIdParamsSchema,
    body: removeProposalMemberBodySchema,
  }),
  removeMatchProposalMember,
);
router.post(
  '/discuss',
  authenticate,
  validateZod({ body: discussPlayIntentBodySchema }),
  discussPlayIntent,
);

router.post(
  '/proposals/:id/add-member',
  authenticate,
  validateZod({
    params: proposalIdParamsSchema,
    body: addProposalMemberBodySchema,
  }),
  addMatchProposalMember,
);

router.delete(
  '/:id',
  authenticate,
  validateZod({ params: playIntentIdParamsSchema }),
  cancelPlayIntent,
);

export default router;
