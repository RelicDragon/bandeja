import assert from 'node:assert/strict';
import { ChatContextType } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { MessageService } from './message.service';
import { GameChatViewerAccessService } from './gameChatViewerAccess.service';
import { assertDraftWriteAccess } from './draftWriteAccess.service';

async function expectApiError(
  promise: Promise<unknown>,
  statusCode: number,
  code: string | undefined,
  label: string
): Promise<void> {
  try {
    await promise;
    throw new Error(`${label}: expected ApiError`);
  } catch (error) {
    assert(error instanceof ApiError, `${label}: expected ApiError instance`);
    assert.equal(error.statusCode, statusCode, `${label}: status`);
    assert.equal(error.data?.code, code, `${label}: code`);
  }
}

async function withPatchedMethod<T extends object, K extends keyof T>(
  target: T,
  key: K,
  replacement: T[K],
  run: () => Promise<void>
): Promise<void> {
  const original = target[key];
  target[key] = replacement;
  try {
    await run();
  } finally {
    target[key] = original;
  }
}

async function testArchivedErrorPreserved(): Promise<void> {
  const archivedError = new ApiError(403, 'This chat is archived', true, {
    code: 'chat.threadArchived',
  });
  await withPatchedMethod(
    GameChatViewerAccessService,
    'assertWritable',
    (async () => {
      throw archivedError;
    }) as typeof GameChatViewerAccessService.assertWritable,
    async () => {
      await expectApiError(
        assertDraftWriteAccess('user-1', ChatContextType.GAME, 'game-1'),
        403,
        'chat.threadArchived',
        'archived game participant'
      );
    }
  );
}

async function testArchiveStateDoesNotLeak(): Promise<void> {
  await withPatchedMethod(
    GameChatViewerAccessService,
    'assertWritable',
    (async () => {
      throw new ApiError(403, 'Access denied');
    }) as typeof GameChatViewerAccessService.assertWritable,
    async () => {
      await expectApiError(
        assertDraftWriteAccess('user-2', ChatContextType.GAME, 'game-2'),
        403,
        undefined,
        'archived non-participant'
      );
    }
  );
}

async function testActiveGamePassesThrough(): Promise<void> {
  let called = false;
  await withPatchedMethod(
    GameChatViewerAccessService,
    'assertWritable',
    (async (contextId: string, userId: string) => {
      called = contextId === 'game-3' && userId === 'user-3';
      return {
        lifecycle: 'active',
        game: {} as never,
        participant: undefined,
        isParticipant: true,
        hasPendingInvite: false,
      };
    }) as typeof GameChatViewerAccessService.assertWritable,
    async () => {
      await assertDraftWriteAccess('user-3', ChatContextType.GAME, 'game-3');
      assert.equal(called, true);
    }
  );
}

async function testUserChatStillUsesExistingValidator(): Promise<void> {
  let called = false;
  await withPatchedMethod(
    MessageService,
    'validateUserChatAccess',
    (async (contextId: string, userId: string) => {
      called = contextId === 'user-chat-1' && userId === 'user-4';
      return {
        userChat: {
          id: contextId,
          lastMessagePreview: null,
          createdAt: new Date(0),
          updatedAt: new Date(0),
          user1Id: userId,
          user2Id: 'peer-1',
          user1allowed: true,
          user2allowed: true,
        },
      };
    }) as typeof MessageService.validateUserChatAccess,
    async () => {
      await assertDraftWriteAccess('user-4', ChatContextType.USER, 'user-chat-1');
      assert.equal(called, true);
    }
  );
}

async function main(): Promise<void> {
  await testArchivedErrorPreserved();
  await testArchiveStateDoesNotLeak();
  await testActiveGamePassesThrough();
  await testUserChatStillUsesExistingValidator();
  console.log('draftWriteAccess.test.ts: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
