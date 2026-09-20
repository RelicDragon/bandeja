/**
 * PRD 355 — admin side of the cosmetics catalogue.
 *
 * Everything here is reachable only behind `requireAdmin`. Withdrawing an item
 * never deletes the `Goods` row: transaction history points at it, and deleting
 * would null out `TransactionRow.goodsId`. Withdrawal deactivates the row,
 * refunds every owner exactly once and drops the ownership rows (which also
 * clears whatever was equipped).
 */
import { GoodsKind, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { isShopKind } from './shopRules';
import { refundGoodsOwners } from './shopPurchase.service';
import type { AdminGoodsRow, AdminGoodsWithdrawResult, AdminGoodsWithdrawSummary } from './shop.types';

const ADMIN_SELECT = {
  id: true,
  kind: true,
  name: true,
  description: true,
  assetKey: true,
  previewUrl: true,
  price: true,
  isActive: true,
  isFeatured: true,
  premiumOnly: true,
  sortOrder: true,
  stickerPackId: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { owners: true } },
} as const;

type AdminRow = Prisma.GoodsGetPayload<{ select: typeof ADMIN_SELECT }>;

function projectAdminRow(row: AdminRow): AdminGoodsRow {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    description: row.description,
    assetKey: row.assetKey,
    previewUrl: row.previewUrl,
    price: row.price,
    isActive: row.isActive,
    isFeatured: row.isFeatured,
    premiumOnly: row.premiumOnly,
    sortOrder: row.sortOrder,
    stickerPackId: row.stickerPackId,
    salesCount: row._count.owners,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface AdminGoodsWriteInput {
  name?: unknown;
  kind?: unknown;
  assetKey?: unknown;
  price?: unknown;
  description?: unknown;
  previewUrl?: unknown;
  isActive?: unknown;
  isFeatured?: unknown;
  premiumOnly?: unknown;
  sortOrder?: unknown;
  stickerPackId?: unknown;
}

function readString(value: unknown, field: string, { max = 200 }: { max?: number } = {}): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ApiError(400, `${field} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new ApiError(400, `${field} must be at most ${max} characters`);
  }
  return trimmed;
}

function readOptionalString(value: unknown, field: string, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw new ApiError(400, `${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new ApiError(400, `${field} must be at most ${max} characters`);
  return trimmed;
}

function readNonNegativeInt(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new ApiError(400, `${field} must be a non-negative integer`);
  }
  return value;
}

function readBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new ApiError(400, `${field} must be a boolean`);
  return value;
}

function readKind(value: unknown): GoodsKind {
  if (!isShopKind(value)) throw new ApiError(400, 'Unknown goods kind');
  return value;
}

/** A STICKER_PACK item is useless without the pack it unlocks; nothing else may carry one. */
async function resolveStickerPackId(kind: GoodsKind, value: unknown): Promise<string | null> {
  if (kind !== GoodsKind.STICKER_PACK) {
    if (typeof value === 'string' && value.trim() !== '') {
      throw new ApiError(400, 'Only sticker packs may reference a sticker pack');
    }
    return null;
  }
  const packId = readString(value, 'stickerPackId');
  const pack = await prisma.stickerPack.findUnique({ where: { id: packId }, select: { id: true } });
  if (!pack) throw new ApiError(404, 'Sticker pack not found');
  return pack.id;
}

function mapUniqueViolation(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new ApiError(409, 'Another item already uses that kind and asset key');
  }
  throw error;
}

export class ShopAdminService {
  static async list(options?: { kind?: unknown; includeInactive?: boolean }): Promise<AdminGoodsRow[]> {
    const rawKind = options?.kind;
    const kind = rawKind === undefined || rawKind === '' ? undefined : readKind(rawKind);
    const rows = await prisma.goods.findMany({
      where: {
        ...(kind ? { kind } : {}),
        ...(options?.includeInactive === false ? { isActive: true } : {}),
      },
      select: ADMIN_SELECT,
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map(projectAdminRow);
  }

  static async getById(id: string): Promise<AdminGoodsRow> {
    const row = await prisma.goods.findUnique({ where: { id }, select: ADMIN_SELECT });
    if (!row) throw new ApiError(404, 'Goods not found');
    return projectAdminRow(row);
  }

  static async create(input: AdminGoodsWriteInput): Promise<AdminGoodsRow> {
    const kind = readKind(input.kind);
    const data: Prisma.GoodsUncheckedCreateInput = {
      name: readString(input.name, 'Name'),
      kind,
      assetKey: readString(input.assetKey, 'Asset key', { max: 80 }),
      price: readNonNegativeInt(input.price, 'Price'),
      description: readOptionalString(input.description, 'Description', 400) ?? null,
      previewUrl: readOptionalString(input.previewUrl, 'Preview URL', 500) ?? null,
      isActive: readBoolean(input.isActive, 'isActive') ?? true,
      isFeatured: readBoolean(input.isFeatured, 'isFeatured') ?? false,
      premiumOnly: readBoolean(input.premiumOnly, 'premiumOnly') ?? false,
      sortOrder: input.sortOrder === undefined ? 0 : readNonNegativeInt(input.sortOrder, 'Sort order'),
      stickerPackId: await resolveStickerPackId(kind, input.stickerPackId),
    };

    try {
      const row = await prisma.goods.create({ data, select: ADMIN_SELECT });
      return projectAdminRow(row);
    } catch (error) {
      return mapUniqueViolation(error);
    }
  }

  static async update(id: string, input: AdminGoodsWriteInput): Promise<AdminGoodsRow> {
    const existing = await prisma.goods.findUnique({
      where: { id },
      select: { id: true, kind: true },
    });
    if (!existing) throw new ApiError(404, 'Goods not found');

    const kind = input.kind === undefined ? existing.kind : readKind(input.kind);
    const data: Prisma.GoodsUncheckedUpdateInput = {
      ...(input.name !== undefined ? { name: readString(input.name, 'Name') } : {}),
      ...(input.kind !== undefined ? { kind } : {}),
      ...(input.assetKey !== undefined
        ? { assetKey: readString(input.assetKey, 'Asset key', { max: 80 }) }
        : {}),
      ...(input.price !== undefined ? { price: readNonNegativeInt(input.price, 'Price') } : {}),
      ...(input.description !== undefined
        ? { description: readOptionalString(input.description, 'Description', 400) ?? null }
        : {}),
      ...(input.previewUrl !== undefined
        ? { previewUrl: readOptionalString(input.previewUrl, 'Preview URL', 500) ?? null }
        : {}),
      ...(input.isActive !== undefined ? { isActive: readBoolean(input.isActive, 'isActive') } : {}),
      ...(input.isFeatured !== undefined
        ? { isFeatured: readBoolean(input.isFeatured, 'isFeatured') }
        : {}),
      ...(input.premiumOnly !== undefined
        ? { premiumOnly: readBoolean(input.premiumOnly, 'premiumOnly') }
        : {}),
      ...(input.sortOrder !== undefined
        ? { sortOrder: readNonNegativeInt(input.sortOrder, 'Sort order') }
        : {}),
      ...(input.kind !== undefined || input.stickerPackId !== undefined
        ? { stickerPackId: await resolveStickerPackId(kind, input.stickerPackId) }
        : {}),
    };

    try {
      const row = await prisma.goods.update({ where: { id }, data, select: ADMIN_SELECT });
      return projectAdminRow(row);
    } catch (error) {
      return mapUniqueViolation(error);
    }
  }

  /** What the withdraw confirmation says before anything is spent. */
  static async withdrawSummary(id: string): Promise<AdminGoodsWithdrawSummary> {
    const row = await prisma.goods.findUnique({
      where: { id },
      select: { id: true, price: true, _count: { select: { owners: true } } },
    });
    if (!row) throw new ApiError(404, 'Goods not found');
    return {
      goodsId: row.id,
      ownerCount: row._count.owners,
      refundPerOwner: row.price,
      totalRefund: row.price * row._count.owners,
    };
  }

  /** Deactivate, refund every owner exactly once, clear ownership and equipped state. */
  static async withdraw(id: string): Promise<AdminGoodsWithdrawResult> {
    const summary = await ShopAdminService.withdrawSummary(id);
    await prisma.goods.update({
      where: { id },
      data: { isActive: false, isFeatured: false },
      select: { id: true },
    });
    const refund = await refundGoodsOwners(id);
    return {
      ...summary,
      refundedCount: refund.refundedUserIds.length,
      skippedCount: refund.skippedUserIds.length,
      totalRefund: refund.totalRefund,
    };
  }

  static async remove(id: string): Promise<{ success: true }> {
    const row = await prisma.goods.findUnique({
      where: { id },
      select: { id: true, _count: { select: { transactionRows: true, owners: true } } },
    });
    if (!row) throw new ApiError(404, 'Goods not found');
    if (row._count.transactionRows > 0 || row._count.owners > 0) {
      throw new ApiError(400, 'Cannot delete goods with purchase history — withdraw it instead');
    }
    await prisma.goods.delete({ where: { id } });
    return { success: true };
  }
}
