# Certus API and SDK

Certus can be integrated as a policy-aware payment service. The caller declares the payment, simulates it, and only then asks its own wallet to sign funding.

```ts
import { CertusClient } from '@/lib/sdk';

const certus = new CertusClient('https://your-certus-host');
const request = {
  chain: 'monad',
  senderCvi: '0x...',
  recipientCvi: '0x...',
  amount: '1000000', // base units
  policyId: 'STANDARD',
  assetMode: 'AUSDC',
  purpose: { type: 'INVOICE', reference: 'INV-2048' },
};

const preview = await certus.simulateIntent(request);
if (preview.decision.verdict === 'PASS') {
  const intent = await certus.createIntent(request);
  // The principal wallet signs the approval and funding transaction.
  console.log(intent.intentId);
}
```

The dry-run response includes the four check results, verdict, reason code, selected chain, asset, and purpose evidence. Certus never receives or stores a private key.
