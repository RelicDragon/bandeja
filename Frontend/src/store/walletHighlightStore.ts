import { create } from 'zustand';

/**
 * PRD 351 — "open the Wallet and highlight this transaction".
 *
 * The Wallet is a modal owned by the Profile page, so a push tap cannot open it
 * by navigating alone. The push handler navigates to Profile and parks the
 * transaction id here; Profile picks it up, opens `WalletModal` and passes the
 * id down. A tiny store rather than a query param because the id is a private
 * identifier and must not end up in a URL.
 */
export interface WalletHighlightState {
  /** Set by a reward push, cleared once the Wallet has opened. */
  pendingTransactionId: string | null;
  /** Ask Profile to open the Wallet, optionally highlighting a transaction. */
  requestWallet: (transactionId?: string | null) => void;
  /** Profile calls this after opening; returns the id it should highlight. */
  consumeRequest: () => string | null;
  /** True while a request is waiting to be consumed. */
  hasRequest: () => boolean;
  reset: () => void;
}

/** Sentinel for "open the Wallet, nothing to highlight" — distinct from "no request". */
export const WALLET_OPEN_WITHOUT_HIGHLIGHT = '';

export const useWalletHighlightStore = create<WalletHighlightState>((set, get) => ({
  pendingTransactionId: null,
  requestWallet: (transactionId) =>
    set({ pendingTransactionId: transactionId ?? WALLET_OPEN_WITHOUT_HIGHLIGHT }),
  consumeRequest: () => {
    const pending = get().pendingTransactionId;
    if (pending === null) return null;
    set({ pendingTransactionId: null });
    return pending === WALLET_OPEN_WITHOUT_HIGHLIGHT ? null : pending;
  },
  hasRequest: () => get().pendingTransactionId !== null,
  reset: () => set({ pendingTransactionId: null }),
}));
