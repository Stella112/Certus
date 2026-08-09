import { afterEach, describe, expect, it } from 'vitest';
import { requireOperator } from '../../src/lib/http/operator';

const original = process.env.CERTUS_OPERATOR_TOKEN;
afterEach(() => {
  if (original === undefined) delete process.env.CERTUS_OPERATOR_TOKEN;
  else process.env.CERTUS_OPERATOR_TOKEN = original;
});

describe('operator route boundary', () => {
  it('keeps an unauthenticated local development workspace usable', () => {
    delete process.env.CERTUS_OPERATOR_TOKEN;
    expect(requireOperator(new Request('http://localhost:3000/api/freeze'))).toBeNull();
  });

  it('fails closed for a remote deployment without configured credentials', async () => {
    delete process.env.CERTUS_OPERATOR_TOKEN;
    const denied = requireOperator(new Request('https://certus.example/api/freeze'));
    expect(denied?.status).toBe(503);
  });

  it('requires the exact bearer token when credentials are configured', () => {
    process.env.CERTUS_OPERATOR_TOKEN = 'test-operator-secret';
    expect(requireOperator(new Request('https://certus.example/api/freeze'))?.status).toBe(401);
    expect(requireOperator(new Request('https://certus.example/api/freeze', { headers: { authorization: 'Bearer wrong-secret' } }))?.status).toBe(403);
    expect(requireOperator(new Request('https://certus.example/api/freeze', { headers: { authorization: 'Bearer test-operator-secret' } }))).toBeNull();
  });
});
