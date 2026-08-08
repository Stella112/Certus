// Step 1: prove auth + api-id header + response shape, non-destructively.
// Empty body first so the error tells us required fields, then a guessed body.
import { call } from './call.mjs';

console.log('--- Probe A: query_apass_list with EMPTY body (learn required fields) ---');
await call('/query_apass_list', {}, { encrypted: false });

console.log('\n--- Probe B: query_apass_list with pagination guess ---');
await call('/query_apass_list', { pageNo: 1, pageSize: 5 }, { encrypted: false });
