#!/usr/bin/env node
/**
 * Seed each persona's entitlements into the local entitlement service.
 *
 * The mock's seed store is in-memory, so it empties on every container
 * restart. When it does, the API answers a bare 403 "access denied" with no
 * indication that a seed is missing — which is a twenty-minute debugging
 * session the first time and an annoying one every time after. Re-running this
 * is the fix, it is idempotent, and `npm run doctor` does it for you.
 */
import { PERSONAS, ENTITLEMENT_URL } from './personas.mjs';

let failed = 0;

for (const persona of PERSONAS) {
  // The mock validates the scenario name against a known set; the multi-grant
  // case must declare itself, matching what the backend's own bootstrap does.
  const scenario = persona.entitlements.length > 1 ? 'success_multi_tenant' : 'success_one_tenant';
  const url = `${ENTITLEMENT_URL}/admin/entitlements/${encodeURIComponent(persona.clientId)}`;

  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario, entitlements: persona.entitlements }),
    });
    if (res.status !== 200 && res.status !== 204) {
      failed++;
      console.error(`  FAIL ${persona.key.padEnd(13)} ${res.status} ${await res.text()}`);
    } else {
      console.log(`  ok   ${persona.key.padEnd(13)} ${persona.clientId} -> ${persona.entitlements.join(', ')}`);
    }
  } catch (err) {
    failed++;
    console.error(`  FAIL ${persona.key.padEnd(13)} ${err.message}`);
    console.error(`       is the stack up? ${ENTITLEMENT_URL} is unreachable.`);
    break;
  }
}

if (failed > 0) {
  console.error(`\nseed-personas: ${failed} failed`);
  process.exit(1);
}
console.log(`\nseed-personas: ${PERSONAS.length} personas seeded`);
