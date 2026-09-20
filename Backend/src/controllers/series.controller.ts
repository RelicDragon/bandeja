import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import {
  GameSeriesService,
  MAX_ACTIVE_SERIES_PER_USER,
  SEAT_DEADLINE_HOUR_CHOICES,
  type CreateSeriesFromGameInput,
  type UpdateSeriesInput,
} from '../services/gameSeries/gameSeries.service';
import { GameSeriesCarryOverService } from '../services/gameSeries/gameSeriesCarryOver.service';
import { isGameSeriesEditScope } from '../services/gameSeries/gameSeriesEditScope';
import type { GameSeriesCadenceValue } from '../services/gameSeries/gameSeriesOccurrenceDates';
// Registering the card enricher is a module side effect; this router is the
// import chain that reaches `app.ts` (Wave 2 backend scaffold §2.2).
import '../services/gameSeries/gameSeriesCardEnricher';

/**
 * PRD 345 — recurring game series.
 *
 * Every mutating endpoint goes through `GameSeriesService`, which owns the
 * ownership check (`assertSeriesOwner`) and the `resultsStatus !== 'NONE'`
 * mutation lock. Nothing here re-implements either.
 */

function readCadence(value: unknown): GameSeriesCadenceValue {
  if (value === 'WEEKLY' || value === 'BIWEEKLY') return value;
  throw new ApiError(400, 'errors.series.invalidCadence', true, {
    code: 'series.invalidCadence',
  });
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readOptionalInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new ApiError(400, 'errors.series.invalidNumber', true, {
      code: 'series.invalidNumber',
    });
  }
  return parsed;
}

function readUserIdList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((entry): entry is string => typeof entry === 'string');
}

export const createSeriesFromGame = asyncHandler(async (req: AuthRequest, res: Response) => {
  const gameId = req.params.id;
  const userId = req.userId!;
  const body = (req.body ?? {}) as Record<string, unknown>;

  const input: CreateSeriesFromGameInput = {
    cadence: readCadence(body.cadence),
    name: readOptionalString(body.name) ?? null,
    endsOn: body.endsOn === null ? null : readOptionalString(body.endsOn) ?? null,
    seatDeadlineHours: readOptionalInt(body.seatDeadlineHours),
    horizonDays: readOptionalInt(body.horizonDays),
    weekday: readOptionalInt(body.weekday),
    keepRegularUserIds: readUserIdList(body.keepRegularUserIds),
  };

  const created = await GameSeriesService.createSeriesFromGame(gameId, userId, input);
  res.status(201).json({ success: true, data: created });
});

export const getSeriesNextOccurrence = asyncHandler(async (req: AuthRequest, res: Response) => {
  const context = await GameSeriesCarryOverService.getSeriesContext(
    req.params.id,
    req.userId!,
    req.user?.isAdmin ?? false,
  );
  res.json({ success: true, data: context });
});

export const respondToSeriesNextOccurrence = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const action = (req.body ?? {}).action;
    if (action !== 'accept' && action !== 'decline') {
      throw new ApiError(400, 'errors.series.invalidAction', true, {
        code: 'series.invalidAction',
      });
    }

    const result =
      action === 'accept'
        ? await GameSeriesCarryOverService.acceptSeat(req.userId!, req.params.id)
        : await GameSeriesCarryOverService.declineSeat(req.userId!, req.params.id);

    if (!result.success) {
      throw new ApiError(400, result.message, true, { code: result.message });
    }
    res.json({ success: true, data: { message: result.message, action } });
  },
);

export const listMySeries = asyncHandler(async (req: AuthRequest, res: Response) => {
  const [series, activeCount] = await Promise.all([
    GameSeriesService.listMySeries(req.userId!),
    GameSeriesService.countActiveSeries(req.userId!),
  ]);
  res.json({
    success: true,
    data: {
      series,
      activeCount,
      maxActive: MAX_ACTIVE_SERIES_PER_USER,
      seatDeadlineChoices: SEAT_DEADLINE_HOUR_CHOICES,
    },
  });
});

export const getSeriesDetail = asyncHandler(async (req: AuthRequest, res: Response) => {
  const detail = await GameSeriesService.getSeriesDetail(req.params.id, req.userId!, {
    skipCache: req.query.fresh === '1',
    isAdmin: req.user?.isAdmin ?? false,
  });
  res.json({ success: true, data: detail });
});

export const updateSeries = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  if (body.scope !== undefined && !isGameSeriesEditScope(body.scope)) {
    throw new ApiError(400, 'errors.series.invalidScope', true, { code: 'series.invalidScope' });
  }

  const input: UpdateSeriesInput = {
    name: readOptionalString(body.name),
    cadence: body.cadence === undefined ? undefined : readCadence(body.cadence),
    weekday: readOptionalInt(body.weekday),
    startTimeLocal: readOptionalString(body.startTimeLocal),
    durationMinutes: readOptionalInt(body.durationMinutes),
    endsOn: body.endsOn === null ? null : readOptionalString(body.endsOn),
    seatDeadlineHours: readOptionalInt(body.seatDeadlineHours),
    horizonDays: readOptionalInt(body.horizonDays),
    template:
      body.template && typeof body.template === 'object' && !Array.isArray(body.template)
        ? (body.template as Record<string, unknown>)
        : undefined,
    scope: isGameSeriesEditScope(body.scope) ? body.scope : undefined,
    fromDayKey: readOptionalString(body.fromDayKey),
  };

  const result = await GameSeriesService.updateSeries(
    req.params.id,
    req.userId!,
    input,
    req.user?.isAdmin ?? false,
  );
  res.json({ success: true, data: result });
});

export const endSeries = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await GameSeriesService.endSeries(
    req.params.id,
    req.userId!,
    req.user?.isAdmin ?? false,
  );
  res.json({ success: true, data: result });
});

export const skipOccurrence = asyncHandler(async (req: AuthRequest, res: Response) => {
  const occurrenceDate = readOptionalString((req.body ?? {}).occurrenceDate);
  if (!occurrenceDate) {
    throw new ApiError(400, 'errors.series.invalidOccurrenceDate', true, {
      code: 'series.invalidOccurrenceDate',
    });
  }
  const result = await GameSeriesService.skipOccurrence(
    req.params.id,
    req.userId!,
    occurrenceDate,
    req.user?.isAdmin ?? false,
  );
  res.json({ success: true, data: result });
});

export const undoSkipOccurrence = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await GameSeriesService.undoSkip(
    req.params.id,
    req.userId!,
    req.params.occurrenceDate,
    req.user?.isAdmin ?? false,
  );
  res.json({ success: true, data: result });
});

/**
 * Owner/admin only — `GameSeriesService.addRegular` asserts it for every
 * caller. The `?? req.userId` default is the owner putting *themselves* on
 * their own roster; it is not a self-service join, and it never was.
 */
export const addSeriesRegular = asyncHandler(async (req: AuthRequest, res: Response) => {
  const targetUserId = readOptionalString((req.body ?? {}).userId) ?? req.userId!;
  await GameSeriesService.addRegular(
    req.params.id,
    req.userId!,
    targetUserId,
    req.user?.isAdmin ?? false,
  );
  res.json({ success: true, data: { userId: targetUserId, isRegular: true } });
});

export const removeSeriesRegular = asyncHandler(async (req: AuthRequest, res: Response) => {
  const targetUserId = req.params.userId;
  await GameSeriesService.removeRegular(
    req.params.id,
    req.userId!,
    targetUserId,
    req.user?.isAdmin ?? false,
  );
  res.json({ success: true, data: { userId: targetUserId, isRegular: false } });
});

export const openSeriesChat = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await GameSeriesService.ensureSeriesChat(
    req.params.id,
    req.userId!,
    req.user?.isAdmin ?? false,
  );
  res.json({ success: true, data: result });
});
