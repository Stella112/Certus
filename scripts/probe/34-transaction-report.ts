import { downloadTransactionReport } from '../../src/lib/cleanverse/reports';

const txHash = '0x7058a447ea7fbb192f14b1d6b4a1b0a64e3d195dcd0ab53a60495d0f4c7bea0b';
const walletAddress = '0xdC646c197d0202FC2A0326af8ab55066A3549E2E';

const result = await downloadTransactionReport({ chain: 'monad', walletAddress, txHash });
console.log(JSON.stringify({ txHash, walletAddress, result }, null, 2));
if (!result.ok) process.exitCode = 1;
