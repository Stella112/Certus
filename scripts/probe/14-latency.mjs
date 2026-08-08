// Measure real latency per endpoint so the client timeout is evidence-based,
// not a guess. Fail-closed only helps if the threshold is above real-world latency.
const BASE = process.env.CLEANVERSE_BASE_URL;
const API_ID = process.env.CLEANVERSE_API_ID;

async function timeIt(label, path, body) {
  const samples = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    try {
      const res = await fetch(BASE + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-id': API_ID },
        body: JSON.stringify(body),
      });
      await res.text();
      samples.push(Math.round(performance.now() - t0));
    } catch {
      samples.push(-1);
    }
  }
  const ok = samples.filter((s) => s > 0);
  const avg = ok.length ? Math.round(ok.reduce((a, b) => a + b, 0) / ok.length) : -1;
  const max = ok.length ? Math.max(...ok) : -1;
  console.log(`${label.padEnd(20)} samples=${JSON.stringify(samples).padEnd(32)} avg=${avg}ms max=${max}ms`);
  return max;
}

const ATOKEN = '0xaC0893567D43C3E7e6e35a72803df05416C1f20D';
const ACTIVE = '0x2e2BA14F6784B72fE9874b41811193B5B0bdd0cA';

const maxima = [];
maxima.push(await timeIt('verify_apass', '/verify_apass', { chain: 'monad', atoken: ATOKEN, address: ACTIVE }));
maxima.push(await timeIt('query_apass', '/query_apass', { chain: 'monad', address: ACTIVE }));
maxima.push(await timeIt('atoken/rules', '/atoken/rules', { chain: 'monad', atoken_address: ATOKEN }));

console.log(`\nWorst observed: ${Math.max(...maxima)}ms`);
