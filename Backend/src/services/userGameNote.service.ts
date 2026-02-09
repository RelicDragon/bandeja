import prisma from '../config/database';
import { ApiError } from '../utils/ApiError';

export const getUserGameNote = async (userId: string, gameId: string) => {
  const note = await prisma.userGameNote.findUnique({
    where: {
      userId_gameId: {
        userId,
        gameId,
      },
    },
  });

  return note;
};

export const createUserGameNote = async (userId: string, gameId: string, content: string) => {
  // Check if game exists
  const game = await prisma.game.findUnique({
    where: { id: gameId },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  const note = await prisma.userGameNote.create({
    data: {
      userId,
      gameId,
      content,
    },
  });

  return note;
};

export const updateUserGameNote = async (userId: string, gameId: string, content: string) => {
  // Check if note exists
  const existingNote = await prisma.userGameNote.findUnique({
    where: {
      userId_gameId: {
        userId,
        gameId,
      },
    },
  });

  if (!existingNote) {
    throw new ApiError(404, 'Note not found');
  }

  const note = await prisma.userGameNote.update({
    where: {
      userId_gameId: {
        userId,
        gameId,
      },
    },
    data: {
      content,
    },
  });

  return note;
};

export const deleteUserGameNote = async (userId: string, gameId: string) => {
  // Check if note exists
  const existingNote = await prisma.userGameNote.findUnique({
    where: {
      userId_gameId: {
        userId,
        gameId,
      },
    },
  });

  if (!existingNote) {
    throw new ApiError(404, 'Note not found');
  }

  await prisma.userGameNote.delete({
    where: {
      userId_gameId: {
        userId,
        gameId,
      },
    },
  });

  return { message: 'Note deleted successfully' };
};

export const upsertUserGameNote = async (userId: string, gameId: string, content: string) => {
  // Check if game exists
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { id: true },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  const note = await prisma.userGameNote.upsert({
    where: {
      userId_gameId: {
        userId,
        gameId,
      },
    },
    create: {
      userId,
      gameId,
      content,
    },
    update: {
      content,
    },
  });

  return note;
};

export const hasUserGameNote = async (userId: string, gameId: string): Promise<boolean> => {
  const note = await prisma.userGameNote.findUnique({
    where: {
      userId_gameId: {
        userId,
        gameId,
      },
    },
    select: { id: true },
  });

  return !!note;
};

export const getGameIdsWithNotes = async (userId: string, gameIds: string[]): Promise<Set<string>> => {
  const notes = await prisma.userGameNote.findMany({
    where: {
      userId,
      gameId: { in: gameIds },
    },
    select: { gameId: true },
  });

  return new Set(notes.map(note => note.gameId));
};

export const getUserNotesForGames = async (userId: string, gameIds: string[]): Promise<Map<string, string>> => {
  const notes = await prisma.userGameNote.findMany({
    where: {
      userId,
      gameId: { in: gameIds },
    },
    select: { gameId: true, content: true },
  });

  return new Map(notes.map(note => [note.gameId, note.content]));
};
