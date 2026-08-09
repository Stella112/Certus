import { chainConfig, defaultChain } from '@/lib/chain/config';
import { PageTitle } from '../components';
import { SimulationConsole } from './SimulationConsole';

export default function SimulatePage() { const chain = defaultChain(); const config = chainConfig(chain); return <><PageTitle eyebrow="Preflight" title="Simulate before value moves" description="Run the same live identity, asset, and spending-policy checks before creating or funding a payment intent. No transaction is signed and no funds move."/><SimulationConsole chain={chain} assetSymbol={config.symbol} decimals={config.decimals}/></>; }
