export interface MandateMessageInput {
  name: string;
  principalAddress: string;
  agentAddress: string;
  chain: string;
  policyId: string;
  perTransactionLimit: string;
  dailyLimit: string;
  expiresAt: string;
}

/** Stable message format signed by the principal wallet during registration. */
export function mandateMessage(input: MandateMessageInput) {
  return [
    'CERTUS_AGENT_MANDATE_V1',
    `name:${input.name}`,
    `principal:${input.principalAddress.toLowerCase()}`,
    `agent:${input.agentAddress.toLowerCase()}`,
    `chain:${input.chain}`,
    `policy:${input.policyId}`,
    `per_transaction:${input.perTransactionLimit}`,
    `daily_limit:${input.dailyLimit}`,
    `expires_at:${input.expiresAt}`,
  ].join('\n');
}

export interface AgentRequestMessageInput {
  mandateId: string;
  principalAddress: string;
  agentAddress: string;
  recipientAddress: string;
  amount: string;
  chain: string;
  requestId: string;
}

/** Stable payload signed by the agent runtime for every proposed payment. */
export function agentRequestMessage(input: AgentRequestMessageInput) {
  return [
    'CERTUS_AGENT_REQUEST_V1',
    `mandate:${input.mandateId}`,
    `principal:${input.principalAddress.toLowerCase()}`,
    `agent:${input.agentAddress.toLowerCase()}`,
    `recipient:${input.recipientAddress.toLowerCase()}`,
    `amount:${input.amount}`,
    `chain:${input.chain}`,
    `request:${input.requestId}`,
  ].join('\n');
}
