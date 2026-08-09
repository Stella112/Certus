import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { type Address, type Hex, verifyTypedData } from 'viem';
import { chainConfig, type ChainKey } from '../chain/config';

export interface ProvenanceAttestation {
  schema: 'certus.provenance.v1';
  chain: ChainKey;
  chainId: number;
  batchContract: Address;
  batchId: Hex;
  legId: string;
  sender: Address;
  recipient: Address;
  asset: Address;
  amount: string;
  txHash: Hex;
  auditRef: Hex;
  issuedAt: string;
  signer: Address;
  signature: Hex;
}

const provenanceTypes = {
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

function typedMessage(attestation: Omit<ProvenanceAttestation, 'schema' | 'signature' | 'signer'>) {
  return {
    batchId: attestation.batchId,
    legId: attestation.legId,
    sender: attestation.sender,
    recipient: attestation.recipient,
    asset: attestation.asset,
    amount: BigInt(attestation.amount),
    txHash: attestation.txHash,
    auditRef: attestation.auditRef,
    issuedAt: BigInt(attestation.issuedAt),
  } as const;
}

export async function verifyProvenance(attestation: ProvenanceAttestation): Promise<boolean> {
  if (attestation.schema !== 'certus.provenance.v1') return false;
  return verifyTypedData({
    address: attestation.signer,
    domain: {
      name: 'Certus Provenance',
      version: '1',
      chainId: attestation.chainId,
      verifyingContract: attestation.batchContract,
    },
    types: provenanceTypes,
    primaryType: 'Provenance',
    message: typedMessage(attestation),
    signature: attestation.signature,
  });
}

export async function signProvenance(
  args: Omit<ProvenanceAttestation, 'schema' | 'chainId' | 'issuedAt' | 'signer' | 'signature'> & { issuedAt?: bigint },
  signingAccount?: PrivateKeyAccount
): Promise<ProvenanceAttestation> {
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  const account = signingAccount ?? (key ? privateKeyToAccount(key as Hex) : null);
  if (!account) throw new Error('DEPLOYER_PRIVATE_KEY missing; cannot sign provenance attestation');
  const chainId = chainConfig(args.chain).chainId;
  const issuedAt = args.issuedAt ?? BigInt(Math.floor(Date.now() / 1000));
  const message = {
    batchId: args.batchId,
    legId: args.legId,
    sender: args.sender,
    recipient: args.recipient,
    asset: args.asset,
    amount: BigInt(args.amount),
    txHash: args.txHash,
    auditRef: args.auditRef,
    issuedAt,
  } as const;
  const signature = await account.signTypedData({
    domain: { name: 'Certus Provenance', version: '1', chainId, verifyingContract: args.batchContract },
    types: provenanceTypes,
    primaryType: 'Provenance',
    message,
  });
  return {
    schema: 'certus.provenance.v1',
    chain: args.chain,
    chainId,
    batchContract: args.batchContract,
    batchId: args.batchId,
    legId: args.legId,
    sender: args.sender,
    recipient: args.recipient,
    asset: args.asset,
    amount: args.amount,
    txHash: args.txHash,
    auditRef: args.auditRef,
    issuedAt: issuedAt.toString(),
    signer: account.address,
    signature,
  };
}
