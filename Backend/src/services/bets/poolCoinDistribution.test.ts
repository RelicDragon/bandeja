import assert from 'node:assert/strict';
import {
  distributePoolCoins,
  totalDistributedShares,
} from './poolCoinDistribution';

async function run() {
  {
    const { sharePerWinner, winnerShares } = distributePoolCoins(10, ['u-c', 'u-a', 'u-b']);
    assert.equal(sharePerWinner, 3);
    assert.equal(winnerShares['u-a'], 4);
    assert.equal(winnerShares['u-b'], 3);
    assert.equal(winnerShares['u-c'], 3);
    assert.equal(totalDistributedShares(winnerShares), 10);
  }

  {
    const { winnerShares } = distributePoolCoins(12, ['w1', 'w2', 'w3']);
    assert.equal(totalDistributedShares(winnerShares), 12);
    assert.deepEqual(Object.values(winnerShares).sort((a, b) => a - b), [4, 4, 4]);
  }

  {
    const { sharePerWinner, winnerShares } = distributePoolCoins(7, ['solo']);
    assert.equal(sharePerWinner, 7);
    assert.equal(winnerShares['solo'], 7);
    assert.equal(totalDistributedShares(winnerShares), 7);
  }

  {
    const { winnerShares } = distributePoolCoins(0, ['w1', 'w2']);
    assert.equal(totalDistributedShares(winnerShares), 0);
    assert.equal(winnerShares['w1'], 0);
    assert.equal(winnerShares['w2'], 0);
  }

  {
    const { winnerShares } = distributePoolCoins(5, []);
    assert.deepEqual(winnerShares, {});
    assert.equal(totalDistributedShares(winnerShares), 0);
  }

  console.log('ok: poolCoinDistribution');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
