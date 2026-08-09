import { describe, expect, it } from 'vitest';
import { decidePaymentLinkOpen, paymentLinkQr, paymentLinkUrl, type OpenablePaymentLink } from '../../src/lib/settlement/payment-links';
import { ReasonCode } from '../../src/lib/pipeline/reasonCodes';

const checks = [
  { check: 'SENDER_CVI' as const, passed: false, reason: ReasonCode.NO_CVI, detail: 'no A-Pass' },
  { check: 'RECIPIENT_CVI' as const, passed: true, detail: 'ok' },
  { check: 'ASSET_RULES' as const, passed: true, detail: 'ok' },
  { check: 'POLICY' as const, passed: true, detail: 'ok' },
];
const link: OpenablePaymentLink = {
  status: 'ACTIVE', expiresAt: null, recipientCvi: '0xrecipient', amount: '1000000', intentId: 'intent-link',
  intent: { chain: 'monad', policyId: 'STANDARD' },
};

describe('payment link QR', () => {
  it('encodes the canonical payment URL into a real SVG QR', async () => {
    expect(paymentLinkUrl('invoice-42', 'https://certus.example')).toBe('https://certus.example/pay/invoice-42');
    const svg = await paymentLinkQr('invoice-42', 'https://certus.example');
    expect(svg).toContain('<svg');
    expect(svg).toContain('<path');
    expect(svg).not.toContain('invoice-42');
  });

  it('routes an unverified payer to attestation and never opens the payment', async () => {
    const result = await decidePaymentLinkOpen(link, '0xvisitor', async () => ({
      verdict: 'FAIL', reason: ReasonCode.NO_CVI, detail: 'no A-Pass', checks,
    }));
    expect(result).toMatchObject({ opened: false, reason: ReasonCode.NO_CVI, attestationRequired: true, chain: 'monad' });
  });

  it('opens only after the fresh link-open evaluation passes', async () => {
    const passChecks = checks.map((check) => ({ ...check, passed: true, reason: undefined }));
    const result = await decidePaymentLinkOpen(link, '0xvisitor', async () => ({ verdict: 'PASS', checks: passChecks }));
    expect(result).toMatchObject({ opened: true, verdict: 'PASS' });
  });
});
