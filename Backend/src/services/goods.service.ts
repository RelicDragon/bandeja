/**
 * PRD 355 — catalogue CRUD, now modelled on the real shop item.
 *
 * This used to be a name/price-only CRUD that predated the cosmetics shop and
 * minted a throwaway `legacy-…` asset key so the new required columns would
 * accept a write. It is now a thin, typed facade over `ShopAdminService`, which
 * owns validation (kind, asset key uniqueness, sticker-pack linkage) and the
 * withdraw/refund path.
 *
 * Every caller reaches this through `requireAdmin` (`routes/goods.routes.ts`).
 */
import { ShopAdminService, type AdminGoodsWriteInput } from './shop/shopAdmin.service';
import type { AdminGoodsRow, AdminGoodsWithdrawResult, AdminGoodsWithdrawSummary } from './shop/shop.types';

export class GoodsService {
  static async createGoods(input: AdminGoodsWriteInput): Promise<AdminGoodsRow> {
    return ShopAdminService.create(input);
  }

  static async getAllGoods(options?: { kind?: unknown }): Promise<AdminGoodsRow[]> {
    return ShopAdminService.list({ kind: options?.kind });
  }

  static async getGoodsById(id: string): Promise<AdminGoodsRow> {
    return ShopAdminService.getById(id);
  }

  static async updateGoods(id: string, input: AdminGoodsWriteInput): Promise<AdminGoodsRow> {
    return ShopAdminService.update(id, input);
  }

  /** Preview the blast radius before an admin confirms a withdrawal. */
  static async getWithdrawSummary(id: string): Promise<AdminGoodsWithdrawSummary> {
    return ShopAdminService.withdrawSummary(id);
  }

  /** Deactivate, refund every owner exactly once, clear ownership + equipped state. */
  static async withdrawGoods(id: string): Promise<AdminGoodsWithdrawResult> {
    return ShopAdminService.withdraw(id);
  }

  /**
   * Hard delete, only for catalogue rows nobody ever touched. Anything with
   * purchase history must be withdrawn instead — deleting would null out
   * `TransactionRow.goodsId` and erase the item name from wallet history.
   */
  static async deleteGoods(id: string): Promise<{ success: true }> {
    return ShopAdminService.remove(id);
  }
}
