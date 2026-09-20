import { beforeEach, describe, expect, it } from 'vitest';
import {
  useWalletHighlightStore,
  WALLET_OPEN_WITHOUT_HIGHLIGHT,
} from './walletHighlightStore';

/**
 * PRD 351 — the hand-off from a reward push to the Wallet modal.
 *
 * The distinction that matters: `null` means "no request", and the empty-string
 * sentinel means "open the Wallet, nothing to highlight". Collapsing the two
 * would make a plain wallet push silently do nothing.
 */

beforeEach(() => {
  useWalletHighlightStore.getState().reset();
});

describe('walletHighlightStore', () => {
  it('starts with no request', () => {
    expect(useWalletHighlightStore.getState().pendingTransactionId).toBeNull();
    expect(useWalletHighlightStore.getState().hasRequest()).toBe(false);
    expect(useWalletHighlightStore.getState().consumeRequest()).toBeNull();
  });

  it('carries a transaction id through to the consumer', () => {
    useWalletHighlightStore.getState().requestWallet('tx-1');
    expect(useWalletHighlightStore.getState().hasRequest()).toBe(true);
    expect(useWalletHighlightStore.getState().consumeRequest()).toBe('tx-1');
  });

  it('records a request with nothing to highlight', () => {
    useWalletHighlightStore.getState().requestWallet();
    expect(useWalletHighlightStore.getState().pendingTransactionId).toBe(
      WALLET_OPEN_WITHOUT_HIGHLIGHT,
    );
    expect(useWalletHighlightStore.getState().hasRequest()).toBe(true);
    expect(useWalletHighlightStore.getState().consumeRequest()).toBeNull();
  });

  it('treats an explicit null the same as no id', () => {
    useWalletHighlightStore.getState().requestWallet(null);
    expect(useWalletHighlightStore.getState().hasRequest()).toBe(true);
    expect(useWalletHighlightStore.getState().consumeRequest()).toBeNull();
  });

  it('consumes exactly once, so reopening Profile does not re-flash the row', () => {
    useWalletHighlightStore.getState().requestWallet('tx-1');
    expect(useWalletHighlightStore.getState().consumeRequest()).toBe('tx-1');
    expect(useWalletHighlightStore.getState().hasRequest()).toBe(false);
    expect(useWalletHighlightStore.getState().consumeRequest()).toBeNull();
  });

  it('lets a newer push replace an unconsumed request', () => {
    useWalletHighlightStore.getState().requestWallet('tx-1');
    useWalletHighlightStore.getState().requestWallet('tx-2');
    expect(useWalletHighlightStore.getState().consumeRequest()).toBe('tx-2');
  });
});
