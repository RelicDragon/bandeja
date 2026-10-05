/**
 * `/api/reservation-changes/:id/...` — reschedule journal (docs/domains/booking.md
 * "Reschedule journal"). Permission (owner/admin of the change's game) is checked in the
 * service, which resolves the game from the change. Game-scoped routes live in game.routes.ts.
 */
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as controller from '../controllers/reservationChange.controller';

const router = Router();

router.patch('/:id/steps/:idempotencyKey', authenticate, controller.patchReservationChangeStepHandler);
router.post('/:id/finish', authenticate, controller.postFinishReservationChange);
router.post('/:id/save-game', authenticate, controller.postSaveGameForReservationChange);

export default router;
