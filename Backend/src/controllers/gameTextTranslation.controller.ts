import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';
import {
  assertCanEditGameTextTranslations,
  listGameTextTranslations,
  patchGameTextTranslation,
  retryGameTextTranslation,
  type GameTextEditorFieldPatch,
} from '../services/gameText/gameTextEditor.service';

function parseFieldPatch(raw: unknown, field: 'name' | 'description'): GameTextEditorFieldPatch | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ApiError(400, `Invalid ${field} translation patch`);
  }
  const body = raw as Record<string, unknown>;
  const action = body.action;
  if (action !== 'set' && action !== 'clear') {
    throw new ApiError(400, `${field}.action must be set or clear`);
  }
  if (typeof body.expectedSourceRevision !== 'number' || !Number.isInteger(body.expectedSourceRevision)) {
    throw new ApiError(400, `${field}.expectedSourceRevision must be an integer`);
  }
  if (
    body.expectedRecordRevision !== null &&
    (typeof body.expectedRecordRevision !== 'number' ||
      !Number.isInteger(body.expectedRecordRevision))
  ) {
    throw new ApiError(400, `${field}.expectedRecordRevision must be an integer or null`);
  }
  return {
    action,
    text: typeof body.text === 'string' ? body.text : body.text === null ? null : undefined,
    expectedSourceRevision: body.expectedSourceRevision,
    expectedRecordRevision: body.expectedRecordRevision as number | null,
  };
}

export const getGameTranslations = asyncHandler(async (req: AuthRequest, res: Response) => {
  const gameId = req.params.id;
  await assertCanEditGameTextTranslations(gameId, req.userId!, req.user?.isAdmin);
  const data = await listGameTextTranslations(gameId);
  res.json({ success: true, data });
});

export const patchGameTranslationLocale = asyncHandler(async (req: AuthRequest, res: Response) => {
  const gameId = req.params.id;
  const locale = req.params.locale;
  await assertCanEditGameTextTranslations(gameId, req.userId!, req.user?.isAdmin);

  const name = parseFieldPatch(req.body?.name, 'name');
  const description = parseFieldPatch(req.body?.description, 'description');
  if (!name && !description) {
    throw new ApiError(400, 'Provide name and/or description patch');
  }

  const data = await patchGameTextTranslation({
    gameId,
    locale,
    editorUserId: req.userId!,
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
  });
  res.json({ success: true, data });
});

export const retryGameTranslationLocale = asyncHandler(async (req: AuthRequest, res: Response) => {
  const gameId = req.params.id;
  const locale = req.params.locale;
  await assertCanEditGameTextTranslations(gameId, req.userId!, req.user?.isAdmin);
  const data = await retryGameTextTranslation({ gameId, locale });
  res.json({ success: true, data });
});
