import { describe, expect, it } from 'vitest';
import { verifyTypedData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { signProvenance, verifyProvenance } from '../../src/lib/provenance/attestation';

const types = {
  Provenance: [
    { name: 'batchId', type: 'bytes32' },
    { name: 'legId', type: 'string' },
    { name: 'sender', type: 'address' },
    { name: 'recipient', type: 'address' },
    { name: 'asset', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'txHash', type: 'bytes32' },
    { name: 'auditRef', type: 'bytes32' },
    { name: 'issuedAt', type: 'uint256' },
  ],
} as const;

describe('signed payroll provenance', () => {
  it('produces a self-verifying EIP-712 artifact bound to settlement evidence', async () => {
    const account = privateKeyToAccount(`0x${'11'.repeat(32)}`);
    const attestation = await signProvenance({
      chain: 'monad',
      batchContract: '0x000000000000000000000000000000000000ba7c',
      batchId: `0x${'22'.repeat(32)}`,
      legId: 'moment-a-leg-1',
      sender: account.address,
      recipient: '0x0000000000000000000000000000000000001234',
      asset: '0x000000000000000000000000000000000000a55e',
      amount: '10000000000000000',
      txHash: `0x${'33'.repeat(32)}`,
      auditRef: `0x${'44'.repeat(32)}`,
      issuedAt: 1_786_210_000n,
    }, account);

    const valid = await verifyTypedData({
      address: attestation.signer,
      domain: {
        name: 'Certus Provenance',
        version: '1',
        chainId: attestation.chainId,
        verifyingContract: attestation.batchContract,
      },
      types,
      primaryType: 'Provenance',
      message: {
        batchId: attestation.batchId,
        legId: attestation.legId,
        sender: attestation.sender,
        recipient: attestation.recipient,
        asset: attestation.asset,
        amount: BigInt(attestation.amount),
        txHash: attestation.txHash,
        auditRef: attestation.auditRef,
        issuedAt: BigInt(attestation.issuedAt),
      },
      signature: attestation.signature,
    });
    expect(valid).toBe(true);
    await expect(verifyProvenance(attestation)).resolves.toBe(true);
    expect(attestation.schema).toBe('certus.provenance.v1');
  });
});
