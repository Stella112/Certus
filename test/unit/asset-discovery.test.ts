import { describe, expect, it, vi } from 'vitest';
import { listDepositAssets } from '../../src/lib/cleanverse/cva';
import { deployment } from '../../src/lib/chain/config';

vi.mock('../../src/lib/cleanverse/client', () => ({ post: vi.fn() }));
import { post } from '../../src/lib/cleanverse/client';

describe('canonical asset discovery boundary', () => {
  it('keeps each deployed Monad contract bound to its actual asset', () => {
    const monad = deployment('monad');
    expect(monad.escrowAsset).toBe('0xaC0893567D43C3E7e6e35a72803df05416C1f20D');
    expect(monad.escrowAssetSymbol).toBe('aUSDC');
    expect(monad.escrowAssetVerified).toBe(true);
    expect(monad.batchAsset).toBe('0xaC0893567D43C3E7e6e35a72803df05416C1f20D');
    expect(monad.batchAssetSymbol).toBe('aUSDC');
  });

  it('validates the supported-pair response before use', async () => {
    vi.mocked(post).mockResolvedValueOnce({
      kind: 'ok', code: '0000', message: 'ok', data: {
        chain: 'monad', tokens: [{
          origin_token: { address: '0xorigin', symbol: 'usdc', decimals: 6 },
          atoken: { address: '0xatoken', symbol: 'aUSDC', decimals: 18 },
          accesscore_address: '0xaccess', apass_address: '0xapass',
        }],
      },
    });
    const result = await listDepositAssets('monad');
    expect(result?.tokens?.[0].atoken.decimals).toBe(18);
  });

  it('fails closed on malformed pair metadata', async () => {
    vi.mocked(post).mockResolvedValueOnce({
      kind: 'ok', code: '0000', message: 'ok', data: { chain: 'monad', tokens: [{ atoken: {} }] },
    });
    await expect(listDepositAssets('monad')).resolves.toBeNull();
  });
});
