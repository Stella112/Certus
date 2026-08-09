/**
 * Minimal typed client for integrating Certus into wallets, marketplaces, and agents.
 * It is intentionally transport-only: the caller still controls wallet signing.
 */
export type CertusPurpose = { type: 'INVOICE' | 'PURCHASE_ORDER' | 'CONTRACT' | 'MILESTONE' | 'PAYROLL' | 'OTHER'; reference: string; hash?: `0x${string}` };
export type IntentRequest = { chain: string; senderCvi: string; recipientCvi: string; amount: string; policyId: 'PERMISSIVE' | 'STANDARD' | 'STRICT'; assetMode?: 'AUSDC' | 'USDC'; privacyMode?: 'PUBLIC' | 'PRIVATE_METADATA'; purpose?: CertusPurpose };

export class CertusClient {
  constructor(private readonly baseUrl = '') {}

  async simulateIntent(request: IntentRequest) {
    const response = await fetch(`${this.baseUrl}/api/simulate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...request, sender: request.senderCvi, recipient: request.recipientCvi, purposeType: request.purpose?.type, purposeReference: request.purpose?.reference, purposeHash: request.purpose?.hash }) });
    return this.read(response);
  }

  async createIntent(request: IntentRequest) {
    const response = await fetch(`${this.baseUrl}/api/intents`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...request, purposeType: request.purpose?.type, purposeReference: request.purpose?.reference, purposeHash: request.purpose?.hash }) });
    return this.read(response);
  }

  async getComplianceState(txHash: string) {
    const response = await fetch(`${this.baseUrl}/api/reports/${encodeURIComponent(txHash)}`);
    return this.read(response);
  }

  async getMandates() {
    const response = await fetch(`${this.baseUrl}/api/agents`);
    return this.read(response);
  }

  private async read(response: Response) { const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error ?? `Certus request failed (${response.status})`); return body; }
}
