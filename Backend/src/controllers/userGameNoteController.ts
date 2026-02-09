import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import * as userGameNoteService from '../services/userGameNote.service';

export const getNote = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { gameId } = req.params;

  const note = await userGameNoteService.getUserGameNote(userId, gameId);

  res.json({ data: note });
});

export const createNote = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { gameId } = req.params;
  const { content } = req.body;

  const note = await userGameNoteService.createUserGameNote(userId, gameId, content);

  res.status(201).json({ data: note });
});

export const updateNote = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { gameId } = req.params;
  const { content } = req.body;

  const note = await userGameNoteService.updateUserGameNote(userId, gameId, content);

  res.json({ data: note });
});

export const deleteNote = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { gameId } = req.params;

  const result = await userGameNoteService.deleteUserGameNote(userId, gameId);

  res.json(result);
});

export const upsertNote = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { gameId } = req.params;
  const { content } = req.body;

  const note = await userGameNoteService.upsertUserGameNote(userId, gameId, content);

  res.json({ data: note });
});
