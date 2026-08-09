import { PaymentComposer, type PaymentNetwork } from '@/app/components/PaymentComposer';
import { chainConfig, deployment, listChains } from '@/lib/chain/config';
import { selectedChain, type SearchParams } from '@/lib/chain/selection';
function networks():PaymentNetwork[]{return listChains().map(key=>{const chain=chainConfig(key);return{key,label:chain.label,symbol:chain.symbol,aToken:chain.aToken,decimals:chain.decimals,settlementReady:Boolean(deployment(key).escrow)}})}
export default async function Links({searchParams}:{searchParams:SearchParams}){return <PaymentComposer mode="link" networks={networks()} initialChain={await selectedChain(searchParams)}/>}
