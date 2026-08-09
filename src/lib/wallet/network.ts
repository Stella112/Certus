type EthereumProvider = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };

/** Ensure the connected wallet is on the selected Certus network, adding it when needed. */
export async function ensureWalletChain(
  provider: EthereumProvider,
  input: { chainId: number; chainName: string; rpcUrl: string; nativeSymbol: string; explorerUrl: string },
) {
  const chainId = `0x${input.chainId.toString(16)}`;
  const current = String(await provider.request({ method: 'eth_chainId' })).toLowerCase();
  if (current === chainId) return;
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? (error as { code?: number }).code : undefined;
    if (code !== 4902 && code !== -32603) throw new Error(`Wallet refused the switch to ${input.chainName}. Open your wallet network menu and select ${input.chainName}.`);
    await provider.request({ method: 'wallet_addEthereumChain', params: [{
      chainId,
      chainName: input.chainName,
      nativeCurrency: { name: input.nativeSymbol, symbol: input.nativeSymbol, decimals: 18 },
      rpcUrls: [input.rpcUrl],
      blockExplorerUrls: [input.explorerUrl],
    }] });
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
  }
}
