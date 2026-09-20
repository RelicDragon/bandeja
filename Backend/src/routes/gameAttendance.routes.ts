/**
 * PRD 346 — per-participant attendance on a game (`/games/:id/attendance`, …).
 *
 * Mounted at `/api/games` from `routes/index.ts` **before** `game.routes.ts`, so
 * `game.routes.ts`'s `/:id` routes cannot shadow anything declared here. The
 * flip side: a path declared here wins over the same path in `game.routes.ts` —
 * never declare a bare `/`, `/:id` or an existing `game.routes.ts` path here.
 * Anything this router does not match falls through to `game.routes.ts`.
 *
 * **Product principle.** Every endpoint below is informative. None of them may
 * ever remove a player, change a seat, reorder the queue, or write `level` /
 * `reliability` / `ratingUncertainty`. See `services/gameAttendance/`.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { body, param } from 'express-validator';
import { rateLimitKeyFromRequest } from '../utils/rateLimitClientKey';
import { validate } from '../middleware/validate';
import {
  authenticate,
  canAccessGame,
  canEditGameIncludingArchived,
} from '../middleware/auth';
import {
  getGameAttendance,
  getMyAttendanceRate,
  getMyNoShowNotes,
  noteParticipantNoShow,
  nudgeGameAttendance,
  setGameAttendance,
  undoParticipantNoShow,
} from '../controllers/gameAttendance.controller';
// Importing the service here is what registers the `attendance` push action
// handler and the `attendanceSummary` Find-card enricher (both are import-time
// side effects on a module this already-mounted router pulls in).
import '../services/gameAttendance/gameAttendance.service';

const router = Router();

/** A player can flip their answer freely, but not thousands of times a minute. */
const attendanceWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyFromRequest(req),
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
    code: 'attendance.rateLimit',
  },
});

/** The 6 h per-game cooldown is enforced in the service; this only caps abuse. */
const nudgeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyFromRequest(req),
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
    code: 'attendance.nudgeRateLimit',
  },
});

const gameIdParam = param('id').isString().trim().notEmpty();
const userIdParam = param('userId').isString().trim().notEmpty();

router.get(
  '/me/no-show-notes',
  authenticate,
  getMyNoShowNotes,
);

router.get(
  '/me/attendance-rate',
  authenticate,
  getMyAttendanceRate,
);

router.get(
  '/:id/attendance',
  authenticate,
  validate([gameIdParam]),
  canAccessGame,
  getGameAttendance,
);

router.post(
  '/:id/attendance',
  authenticate,
  attendanceWriteLimiter,
  validate([
    gameIdParam,
    body('state').isIn(['CONFIRMED', 'UNSURE']),
  ]),
  setGameAttendance,
);

router.post(
  '/:id/attendance/nudge',
  authenticate,
  nudgeLimiter,
  validate([gameIdParam]),
  canEditGameIncludingArchived,
  nudgeGameAttendance,
);

router.post(
  '/:id/participants/:userId/no-show',
  authenticate,
  attendanceWriteLimiter,
  validate([gameIdParam, userIdParam]),
  canEditGameIncludingArchived,
  noteParticipantNoShow,
);

router.delete(
  '/:id/participants/:userId/no-show',
  authenticate,
  attendanceWriteLimiter,
  validate([gameIdParam, userIdParam]),
  canEditGameIncludingArchived,
  undoParticipantNoShow,
);

export default router;
