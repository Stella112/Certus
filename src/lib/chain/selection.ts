import { chainConfig, defaultChain, listChains } from './config';

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function selectedChain(searchParams: SearchParams): Promise<string> {
  const params = await searchParams;
  const candidate = Array.isArray(params.chain) ? params.chain[0] : params.chain;
  return candidate && listChains().includes(candidate) ? candidate : defaultChain();
}

export function chainOptions() {
  return listChains().map((key) => { const chain = chainConfig(key); return { key, label: chain.label, symbol: chain.nativeSymbol }; });
}
