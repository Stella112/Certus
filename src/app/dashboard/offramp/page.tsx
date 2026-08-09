import { PageTitle } from '../components';
import { defaultChain, chainConfig } from '@/lib/chain/config';
import { RampConsole } from './RampConsole';

export default function OfframpPage() {
  const chain = defaultChain();
  const config = chainConfig(chain);
  return <>
    <PageTitle
      eyebrow="Cleanverse ramp"
      title="Move between fiat and verified assets"
      description="Request a binding Cleanverse quote, open the hosted provider widget, and track the order without handling payment credentials inside Certus."
    />
    <RampConsole chain={config.cleanverseChain} walletChainId={config.chainId} defaultCrypto={config.symbol === 'aUSDC' ? 'USDC' : config.symbol} />
    <p className="mt-5 max-w-3xl text-[11px] leading-5 text-slate-500">Cleanverse documents this as an Issue Member capability. The wallet must have a non-frozen A-Pass on the quoted network; supported assets, fiat routes, and payment methods are market-dependent. This flow does not make public blockchain transfers private.</p>
  </>;
}
