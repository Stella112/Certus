import QRCode from 'qrcode';
import { prisma } from '../db';
import { evaluate } from '../pipeline/evaluate';
import { assets } from '../cleanverse/cva';
import type { ChainKey } from '../chain/config';
import type { PolicyId } from '../pipeline/policies';
import type { Decision } from '../pipeline/types';

export interface OpenablePaymentLink {
  status: string;
  expiresAt: Date | null;
  recipientCvi: string;
  amount: string;
  intentId: string;
  intent: { chain: string; policyId: string };
}

export async function decidePaymentLinkOpen(
  link: OpenablePaymentLink | null,
  visitorAddress: string,
  evaluateOpen: (link: OpenablePaymentLink, visitorAddress: string) => Promise<Decision>,
  now = new Date()
) {
  if (!link || link.status !== 'ACTIVE') return { opened: false as const, reason: 'LINK_NOT_ACTIVE' };
  if (link.expiresAt && link.expiresAt <= now) return { opened: false as const, reason: 'LINK_EXPIRED' };
  const decision = await evaluateOpen(link, visitorAddress);
  if (decision.verdict !== 'PASS') {
    return {
      opened: false as const, reason: decision.reason, detail: decision.detail,
      attestationRequired: decision.reason === 'NO_CVI', chain: link.intent.chain,
    };
  }
  return { opened: true as const, verdict: 'PASS' as const, link };
}

export function paymentLinkUrl(slug: string, origin: string): string {
  return new URL(`/pay/${encodeURIComponent(slug)}`, origin).toString();
}

export async function paymentLinkQr(slug: string, origin: string): Promise<string> {
  return QRCode.toString(paymentLinkUrl(slug, origin), {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
    color: { dark: '#111827', light: '#ffffff' },
  });
}

export async function openPaymentLink(args: { slug: string; visitorAddress: string }) {
  const link = await prisma.paymentLink.findUnique({ where: { slug: args.slug }, include: { intent: true } });
  return decidePaymentLinkOpen(link, args.visitorAddress, async (candidate, visitorAddress) => {
    const chain = candidate.intent.chain as ChainKey;
    const A = assets(chain);
    return evaluate({
      trigger: 'LINK_OPEN', chain: A.chain, atoken: A.aToken, senderAddress: visitorAddress,
      recipientAddress: candidate.recipientCvi, amount: BigInt(candidate.amount),
      policyId: candidate.intent.policyId as PolicyId, intentId: candidate.intentId,
    });
  });
}
