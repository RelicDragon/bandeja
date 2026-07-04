import assert from 'node:assert/strict';
import express from 'express';
import type { RequestHandler } from 'express';
import { ApiError } from '../utils/ApiError';
import { saveDraft, deleteDraft } from './chat.controller';
import { GameChatViewerAccessService } from '../services/chat/gameChatViewerAccess.service';
import { DraftService } from '../services/chat/draft.service';

type JsonBody = Record<string, unknown>;

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

async function requestDraftRoute(
  method: 'POST' | 'DELETE',
  path: '/drafts',
  body: JsonBody
): Promise<{ status: number; json: JsonBody }> {
  const app = express();
  app.use(express.json());
  app.use(((req, _res, next) => {
    (req as { userId?: string }).userId = 'user-1';
    next();
  }) as RequestHandler);
  app.post('/drafts', saveDraft);
  app.delete('/drafts', deleteDraft);
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof ApiError) {
      res.status(err.statusCode).json({
        success: false,
        message: err.message,
        ...(err.data && { ...err.data }),
      });
      return;
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  });

  const server = app.listen(0);
  const { port } = server.address() as { port: number };

  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await response.json()) as JsonBody;
    return { status: response.status, json };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function testSaveDraftPreservesArchivedCode(): Promise<void> {
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
      const response = await requestDraftRoute('POST', '/drafts', {
        chatContextType: 'GAME',
        contextId: 'game-archived',
        chatType: 'PUBLIC',
        content: 'draft text',
      });
      assert.equal(response.status, 403);
      assert.equal(response.json.code, 'chat.threadArchived');
    }
  );
}

async function testSaveDraftHidesArchiveForDeniedViewer(): Promise<void> {
  await withPatchedMethod(
    GameChatViewerAccessService,
    'assertWritable',
    (async () => {
      throw new ApiError(403, 'Access denied');
    }) as typeof GameChatViewerAccessService.assertWritable,
    async () => {
      const response = await requestDraftRoute('POST', '/drafts', {
        chatContextType: 'GAME',
        contextId: 'game-hidden',
        chatType: 'PUBLIC',
        content: 'draft text',
      });
      assert.equal(response.status, 403);
      assert.equal(response.json.code, undefined);
    }
  );
}

async function testDeleteDraftPreservesArchivedCode(): Promise<void> {
  let deleted = false;
  await withPatchedMethod(
    GameChatViewerAccessService,
    'resolve',
    (async () => ({
      lifecycle: 'archived',
      stub: {} as never,
      participant: undefined,
      archivedAt: new Date(),
      isParticipant: true,
    })) as typeof GameChatViewerAccessService.resolve,
    async () => {
      await withPatchedMethod(
        DraftService,
        'deleteDraft',
        (async () => {
          deleted = true;
        }) as typeof DraftService.deleteDraft,
        async () => {
          const response = await requestDraftRoute('DELETE', '/drafts', {
            chatContextType: 'GAME',
            contextId: 'game-archived',
            chatType: 'PUBLIC',
          });
          assert.equal(response.status, 403);
          assert.equal(response.json.code, 'chat.threadArchived');
          assert.equal(deleted, false);
        }
      );
    }
  );
}

async function testDeleteDraftHidesArchiveForDeniedViewer(): Promise<void> {
  await withPatchedMethod(
    GameChatViewerAccessService,
    'resolve',
    (async () => ({
      lifecycle: 'archived',
      stub: {} as never,
      participant: undefined,
      archivedAt: new Date(),
      isParticipant: false,
    })) as typeof GameChatViewerAccessService.resolve,
    async () => {
      const response = await requestDraftRoute('DELETE', '/drafts', {
        chatContextType: 'GAME',
        contextId: 'game-hidden',
        chatType: 'PUBLIC',
      });
      assert.equal(response.status, 403);
      assert.equal(response.json.code, undefined);
    }
  );
}

async function testDeleteDraftStaysAllowedForActiveGame(): Promise<void> {
  let deleted = false;
  await withPatchedMethod(
    GameChatViewerAccessService,
    'resolve',
    (async () => ({
      lifecycle: 'active',
      game: {} as never,
      participant: undefined,
      isParticipant: false,
      hasPendingInvite: false,
    })) as typeof GameChatViewerAccessService.resolve,
    async () => {
      await withPatchedMethod(
        DraftService,
        'deleteDraft',
        (async () => {
          deleted = true;
        }) as typeof DraftService.deleteDraft,
        async () => {
          const response = await requestDraftRoute('DELETE', '/drafts', {
            chatContextType: 'GAME',
            contextId: 'game-active',
            chatType: 'PUBLIC',
          });
          assert.equal(response.status, 200);
          assert.equal(response.json.success, true);
          assert.equal(deleted, true);
        }
      );
    }
  );
}

async function main(): Promise<void> {
  await testSaveDraftPreservesArchivedCode();
  await testSaveDraftHidesArchiveForDeniedViewer();
  await testDeleteDraftPreservesArchivedCode();
  await testDeleteDraftHidesArchiveForDeniedViewer();
  await testDeleteDraftStaysAllowedForActiveGame();
  console.log('chatDraftRoute.test.ts: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
