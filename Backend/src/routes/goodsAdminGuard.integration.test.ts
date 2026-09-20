/**
 * PRD 355 — regression test for a live security hole.
 *
 * Before this PRD, `POST`/`PUT`/`DELETE` on `/api/goods` carried `authenticate`
 * only, so **any signed-in player could create, reprice or delete catalogue
 * items**, and the unfiltered `GET` leaked unreleased ones. This test mounts the
 * real router and asserts that a valid non-admin token gets 403 on every route,
 * while an admin token gets through.
 *
 * Safe to run against `padelpulse_dev`: two throwaway users, removed in `finally`.
 */
import assert from 'node:assert/strict';
import express from 'express';
import { GoodsKind, Sport } from '@prisma/client';
import prisma from '../config/database';
import goodsRoutes from './goods.routes';
import { errorHandler } from '../middleware/errorHandler';
import { generateShortAccessToken } from '../utils/jwt';

process.env.E2E_TEST = '1';

type Call = { method: string; path: string; body?: Record<string, unknown> };

void (async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const userIds: string[] = [];
  const goodsIds: string[] = [];

  const app = express();
  app.use(express.json());
  app.use('/goods', goodsRoutes);
  app.use(errorHandler);
  const server = app.listen(0);
  const { port } = server.address() as { port: number };

  const request = async (call: Call, token: string | null) => {
    const response = await fetch(`http://127.0.0.1:${port}${call.path}`, {
      method: call.method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(call.body ? { body: JSON.stringify(call.body) } : {}),
    });
    return response.status;
  };

  try {
    const player = await prisma.user.create({
      data: { phone: `qa-goods-player-${suffix}`, firstName: 'Player', primarySport: Sport.PADEL },
    });
    userIds.push(player.id);
    const admin = await prisma.user.create({
      data: {
        phone: `qa-goods-admin-${suffix}`,
        firstName: 'Admin',
        isAdmin: true,
        primarySport: Sport.PADEL,
      },
    });
    userIds.push(admin.id);

    const item = await prisma.goods.create({
      data: {
        name: `Guarded ${suffix}`,
        kind: GoodsKind.PROFILE_FRAME,
        assetKey: `qa-guard-${suffix}`,
        price: 50,
      },
    });
    goodsIds.push(item.id);

    const playerToken = generateShortAccessToken({ userId: player.id, phone: player.phone ?? undefined });
    const adminToken = generateShortAccessToken({
      userId: admin.id,
      phone: admin.phone ?? undefined,
      isAdmin: true,
    });

    const mutations: Call[] = [
      {
        method: 'POST',
        path: '/goods',
        body: {
          name: `Hacked ${suffix}`,
          kind: 'PROFILE_FRAME',
          assetKey: `qa-hacked-${suffix}`,
          price: 0,
        },
      },
      { method: 'PUT', path: `/goods/${item.id}`, body: { price: 0 } },
      { method: 'PATCH', path: `/goods/${item.id}`, body: { price: 0 } },
      { method: 'DELETE', path: `/goods/${item.id}` },
      { method: 'POST', path: `/goods/${item.id}/withdraw` },
      { method: 'POST', path: `/goods/${item.id}/preview` },
    ];
    const reads: Call[] = [
      { method: 'GET', path: '/goods' },
      { method: 'GET', path: `/goods/${item.id}` },
      { method: 'GET', path: `/goods/${item.id}/withdraw-summary` },
    ];

    for (const call of [...mutations, ...reads]) {
      assert.equal(
        await request(call, playerToken),
        403,
        `${call.method} ${call.path} must be admin-only`,
      );
      assert.equal(
        await request(call, null),
        401,
        `${call.method} ${call.path} must reject anonymous callers`,
      );
    }

    // Nothing leaked through: the price is untouched and no new row appeared.
    const untouched = await prisma.goods.findUniqueOrThrow({ where: { id: item.id } });
    assert.equal(untouched.price, 50);
    assert.equal(untouched.isActive, true);
    assert.equal(await prisma.goods.count({ where: { name: `Hacked ${suffix}` } }), 0);

    // An admin does get through.
    assert.equal(await request({ method: 'GET', path: '/goods' }, adminToken), 200);
    assert.equal(
      await request({ method: 'PATCH', path: `/goods/${item.id}`, body: { price: 70 } }, adminToken),
      200,
    );
    assert.equal(
      (await prisma.goods.findUniqueOrThrow({ where: { id: item.id } })).price,
      70,
    );

    console.log('goodsAdminGuard.integration.test.ts: ok');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.goods.deleteMany({ where: { id: { in: goodsIds } } });
    await prisma.goods.deleteMany({ where: { assetKey: { startsWith: 'qa-hacked-' } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
