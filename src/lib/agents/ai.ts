import { isAddress } from 'viem';
import { z } from 'zod';

const ProposalSchema = z.object({
  recipientAddress: z.string(),
  amount: z.string(),
  rationale: z.string().min(1).max(500),
});

export type AgentPlan = z.infer<typeof ProposalSchema> & { model: string };

/** Ask a model to interpret a payment task. It proposes only; Certus decides and settles. */
export async function planPaymentTask(task: string, chain: string, symbol: string): Promise<AgentPlan> {
  const provider = (process.env.CERTUS_AGENT_PROVIDER?.trim() || (process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai')).toLowerCase();
  if (provider === 'anthropic') return planWithAnthropic(task, chain, symbol);
  if (provider !== 'openai') throw new Error(`Unsupported agent provider "${provider}"`);
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('AI agent runtime is not configured. Set OPENAI_API_KEY.');
  const model = process.env.CERTUS_AGENT_MODEL?.trim() || 'gpt-5.6-terra';
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: 'low' },
      instructions: [
        'You are the Certus payment agent. Interpret the user task and make one payment proposal.',
        `The only network is ${chain}. The payment asset is ${symbol}.`,
        'Never invent or transform a wallet address. Return the exact 0x address from the task.',
        'Return a decimal amount, not base units. Do not propose swaps, bridges, approvals, signing, or release.',
        'If the task is missing a valid recipient or amount, return an empty string for that field and explain why in rationale.',
      ].join('\n'),
      input: task,
      text: {
        format: {
          type: 'json_schema',
          name: 'certus_payment_proposal',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              recipientAddress: { type: 'string' },
              amount: { type: 'string' },
              rationale: { type: 'string' },
            },
            required: ['recipientAddress', 'amount', 'rationale'],
            additionalProperties: false,
          },
        },
      },
    }),
  });
  const body = await response.json() as { output_text?: string; error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? `AI provider returned HTTP ${response.status}`);
  let raw: unknown;
  try { raw = JSON.parse(body.output_text ?? ''); } catch { throw new Error('AI agent returned an invalid proposal'); }
  const parsed = ProposalSchema.safeParse(raw);
  if (!parsed.success) throw new Error('AI agent returned an invalid proposal shape');
  if (!parsed.data.recipientAddress || !isAddress(parsed.data.recipientAddress)) throw new Error(parsed.data.rationale || 'AI agent did not identify a valid recipient');
  if (!/^\d+(\.\d+)?$/.test(parsed.data.amount)) throw new Error(parsed.data.rationale || 'AI agent did not identify a payment amount');
  return { ...parsed.data, model };
}

async function planWithAnthropic(task: string, chain: string, symbol: string): Promise<AgentPlan> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error('Claude agent runtime is not configured. Set ANTHROPIC_API_KEY.');
  // Prefer the currently supported Haiku tier so the demo stays inexpensive.
  const model = process.env.ANTHROPIC_MODEL?.trim() || 'claude-haiku-4-5-20251001';
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      system: [
        'You are the Certus payment agent. Interpret the user task and make one payment proposal.',
        `The only network is ${chain}. The payment asset is ${symbol}.`,
        'Never invent or transform a wallet address. Return the exact 0x address from the task.',
        'Return a decimal amount, not base units. Do not propose swaps, bridges, approvals, signing, or release.',
      ].join('\n'),
      messages: [{ role: 'user', content: task }],
      tools: [{
        name: 'propose_payment',
        description: 'Return one proposed payment. Use empty strings when the task lacks a valid recipient or amount.',
        input_schema: {
          type: 'object',
          properties: {
            recipientAddress: { type: 'string' },
            amount: { type: 'string' },
            rationale: { type: 'string' },
          },
          required: ['recipientAddress', 'amount', 'rationale'],
        },
      }],
      tool_choice: { type: 'tool', name: 'propose_payment' },
    }),
  });
  const body = await response.json() as { content?: Array<{ type?: string; input?: unknown }>; error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? `Claude returned HTTP ${response.status}`);
  const toolUse = body.content?.find((item) => item.type === 'tool_use');
  const parsed = ProposalSchema.safeParse(toolUse?.input);
  if (!parsed.success) throw new Error('Claude returned an invalid proposal shape');
  if (!parsed.data.recipientAddress || !isAddress(parsed.data.recipientAddress)) throw new Error(parsed.data.rationale || 'Claude did not identify a valid recipient');
  if (!/^\d+(\.\d+)?$/.test(parsed.data.amount)) throw new Error(parsed.data.rationale || 'Claude did not identify a payment amount');
  return { ...parsed.data, model };
}
