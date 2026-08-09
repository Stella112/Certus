import { NextResponse } from 'next/server';
import { isAddress, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { agentRequestMessage } from '@/lib/agents/mandate';
import { planPaymentTask } from '@/lib/agents/ai';
import { chainConfig } from '@/lib/chain/config';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  mandateId: z.string().min(1),
  task: z.string().trim().min(8).max(500),
  recipientAddress: z.string().optional(),
  amount: z.string().optional(),
});

/** Public agent identity only; the private key is never returned. */
export async function GET() {
  const key = process.env.CERTUS_AGENT_PRIVATE_KEY?.trim();
  const provider = (process.env.CERTUS_AGENT_PROVIDER?.trim() || (process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai')).toLowerCase();
  const aiConfigured = provider === 'anthropic' ? Boolean(process.env.ANTHROPIC_API_KEY?.trim()) : Boolean(process.env.OPENAI_API_KEY?.trim());
  if (!key) return NextResponse.json({ configured: false, aiConfigured });
  try {
    return NextResponse.json({ configured: aiConfigured, aiConfigured, agentAddress: privateKeyToAccount(key as Hex).address });
  } catch {
    return NextResponse.json({ configured: false, error: 'CERTUS_AGENT_PRIVATE_KEY is invalid' }, { status: 503 });
  }
}

/**
 * Run the local Certus agent. It turns a human task into a bounded payment proposal,
 * signs that proposal with the agent identity, and sends it through the same decision
 * endpoint used by every other caller. It cannot fund or release principal funds.
 */
export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid agent task', issues: parsed.error.issues }, { status: 400 });
  const key = process.env.CERTUS_AGENT_PRIVATE_KEY?.trim();
  if (!key) return NextResponse.json({ error: 'Agent runtime is not configured. Set CERTUS_AGENT_PRIVATE_KEY.' }, { status: 503 });
  const provider = (process.env.CERTUS_AGENT_PROVIDER?.trim() || (process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai')).toLowerCase();
  if (provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY?.trim()) return NextResponse.json({ error: 'Claude agent runtime is not configured. Set ANTHROPIC_API_KEY.' }, { status: 503 });
  if (provider === 'openai' && !process.env.OPENAI_API_KEY?.trim()) return NextResponse.json({ error: 'OpenAI agent runtime is not configured. Set OPENAI_API_KEY.' }, { status: 503 });

  const mandate = await prisma.agentMandate.findUnique({ where: { id: parsed.data.mandateId } });
  if (!mandate) return NextResponse.json({ error: 'Agent mandate not found' }, { status: 404 });
  if (mandate.status !== 'ACTIVE') return NextResponse.json({ error: `Agent mandate is ${mandate.status.toLowerCase()}` }, { status: 409 });

  let account;
  try { account = privateKeyToAccount(key as Hex); } catch { return NextResponse.json({ error: 'Agent runtime key is invalid' }, { status: 503 }); }
  if (account.address.toLowerCase() !== mandate.agentAddress.toLowerCase()) return NextResponse.json({ error: `Configured agent address ${account.address} does not match this mandate` }, { status: 409 });

  // Explicit inputs are useful for deterministic demos (including refusal cases).
  // They still receive the agent signature and pass through the same Certus checks.
  const plan = parsed.data.recipientAddress && parsed.data.amount
    ? { recipientAddress: parsed.data.recipientAddress, amount: parsed.data.amount, rationale: 'Explicit payment request submitted for Certus checks', model: 'explicit-input' }
    : await planPaymentTask(parsed.data.task, mandate.chain, chainConfig(mandate.chain).symbol).catch((error) => ({ error: error instanceof Error ? error.message : 'AI agent failed to interpret the task' }));
  if ('error' in plan) return NextResponse.json({ error: plan.error }, { status: 502 });
  const recipientAddress = parsed.data.recipientAddress ?? plan.recipientAddress;
  const amountText = parsed.data.amount ?? plan.amount;
  if (!recipientAddress || !isAddress(recipientAddress)) return NextResponse.json({ error: plan.rationale || 'Agent could not identify a valid recipient address' }, { status: 422 });
  if (!amountText || !/^\d+(\.\d+)?$/.test(amountText)) return NextResponse.json({ error: plan.rationale || 'Agent could not identify a valid payment amount' }, { status: 422 });

  let amount: string;
  try { amount = toBaseUnits(amountText); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid agent amount' }, { status: 422 }); }
  const requestId = crypto.randomUUID();
  const agentSignature = await account.signMessage({ message: agentRequestMessage({ mandateId: mandate.id, principalAddress: mandate.principalAddress, agentAddress: account.address, recipientAddress, amount, chain: mandate.chain, requestId }) });
  const decisionResponse = await fetch(new URL('/api/agents/decide', req.url), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mandateId: mandate.id, principalAddress: mandate.principalAddress, recipientAddress, amount, chain: mandate.chain, agentAddress: account.address, agentSignature, requestId }),
  });
  const decision = await decisionResponse.json();
  return NextResponse.json({
    ...decision,
    agent: { address: account.address, requestId, task: parsed.data.task, rationale: plan.rationale, model: plan.model },
    proposal: { recipientAddress, amount, chain: mandate.chain },
  }, { status: decisionResponse.status });
}

function toBaseUnits(value: string) {
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > 6) throw new Error('Agent amount exceeds 6 decimal places');
  // Normalize to a canonical integer string (e.g. 0.50 -> 500000), so
  // signatures, audit records, and policy comparisons are deterministic.
  return (BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0') || '0')).toString();
}
