#!/usr/bin/env node
/**
 * Prove the persona mechanism actually works, end to end, before the app
 * relies on it.
 *
 * The mechanism rests on one property: under the client-credentials grant the
 * issued token's `sub` equals the client_id, and the entitlement service is
 * keyed by `sub`. That holds for the identity provider we run locally, but it
 * is a property of that provider rather than a guarantee of the grant type. If
 * it ever stops holding, every persona silently resolves to the wrong identity
 * and the app shows an opaque 403. This turns that into one clear message.
 *
 * For each persona: mint a token, decode it, assert sub === client_id, call
 * whoami, assert the role matches what the seed should have produced.
 */
import { PERSONAS, API_URL, mintToken, decodeJwtPayload } from './personas.mjs';

let failed = 0;

for (const persona of PERSONAS) {
  const label = persona.key.padEnd(13);
  try {
    const token = await mintToken(persona);
    const claims = decodeJwtPayload(token);

    if (claims.sub !== persona.clientId) {
      failed++;
      console.error(
        `  FAIL ${label} token sub is "${claims.sub}", expected "${persona.clientId}".`,
      );
      console.error(
        '       The persona model assumes the identity provider echoes client_id into sub.',
      );
      continue;
    }

    const res = await fetch(`${API_URL}/v1/whoami`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));

    // The multi-grant persona is supposed to be refused until a tenant is
    // picked. That 400 is the behaviour under test, not a failure.
    if (persona.entitlements.length > 1) {
      const code = body?.errors?.[0]?.code;
      if (res.status === 400 && code === 'tenant_required') {
        const available = body.errors[0].available_tenants ?? [];
        console.log(
          `  ok   ${label} tenant_required as expected (${available.join(', ') || 'no list'})`,
        );
      } else {
        failed++;
        console.error(
          `  FAIL ${label} expected 400 tenant_required, got ${res.status} ${JSON.stringify(body)}`,
        );
      }
      continue;
    }

    if (!res.ok) {
      failed++;
      console.error(`  FAIL ${label} whoami ${res.status} ${JSON.stringify(body)}`);
      if (res.status === 403)
        console.error('       Most likely an unseeded entitlement — run: npm run seed:personas');
      continue;
    }

    const role = body.roles?.[0];
    if (role !== persona.expectedRole) {
      failed++;
      console.error(`  FAIL ${label} role is "${role}", expected "${persona.expectedRole}"`);
      continue;
    }
    console.log(`  ok   ${label} sub=${claims.sub} role=${role} tenant=${body.tenant_slug}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL ${label} ${err.message}`);
  }
}

if (failed > 0) {
  console.error(`\nverify-personas: ${failed} failed`);
  process.exit(1);
}
console.log(`\nverify-personas: all ${PERSONAS.length} personas resolve correctly`);
