/**
 * The persona roster, shared by the seed and verify scripts and by the app.
 *
 * A persona is a client_id. Under the client-credentials grant the issued JWT's
 * `sub` claim is the client_id, and the entitlement service is keyed by that
 * same `sub` — so choosing a persona is choosing which client to authenticate
 * as, and the role that comes back is whatever the entitlement seed says. The
 * local identity provider accepts any client_id/secret pair, so adding a
 * persona costs one row here and one seed call.
 *
 * `expectedRole` is asserted by verify-personas.mjs. It is never trusted at
 * runtime: the app reads the role from GET /v1/whoami, because a UI that
 * decided permissions for itself would offer actions the server then rejects.
 *
 * Kept as .mjs rather than .ts so the Node scripts can import it with no build
 * step. The app re-exports it through packages/auth with types attached.
 */

export const TENANT_SLUG = process.env.KUI_TENANT_SLUG ?? 'dev';
export const SECOND_TENANT_SLUG = process.env.KUI_SECOND_TENANT_SLUG ?? 'acme';
export const DISCRIMINATOR = process.env.KUI_DISCRIMINATOR ?? 'REGISTRY';

/** Entitlement strings use the grammar `<tenant_slug>_<DISCRIMINATOR>_<ROLE>`. */
const grant = (slug, role) => `${slug}_${DISCRIMINATOR}_${role}`;

export const PERSONAS = [
  {
    key: 'consumer',
    label: 'Tenant — Consumer',
    description: 'Read-only browse of the capability catalog.',
    clientId: 'knowledge-ui-consumer',
    clientSecret: 'dev-secret',
    entitlements: [grant(TENANT_SLUG, 'CONSUMER')],
    expectedRole: 'consumer',
  },
  {
    key: 'producer',
    label: 'Tenant — Producer',
    description: 'Everything a consumer sees, plus the write surfaces when they land.',
    clientId: 'knowledge-ui-producer',
    clientSecret: 'dev-secret',
    entitlements: [grant(TENANT_SLUG, 'PRODUCER')],
    expectedRole: 'producer',
  },
  {
    key: 'admin',
    label: 'Platform — Admin',
    description: 'Platform operations: health and metrics. Cannot read the audit log — that needs the auditor.',
    clientId: 'knowledge-ui-admin',
    clientSecret: 'dev-secret',
    entitlements: [grant(TENANT_SLUG, 'ADMIN')],
    expectedRole: 'admin',
  },
  {
    key: 'auditor',
    label: 'Platform — Auditor',
    description: 'The only role permitted to read the audit log.',
    clientId: 'knowledge-ui-auditor',
    clientSecret: 'dev-secret',
    entitlements: [grant(TENANT_SLUG, 'AUDITOR')],
    expectedRole: 'auditor',
  },
  {
    key: 'multi-tenant',
    label: 'Tenant — Two grants',
    description: 'Exercises tenant selection: whoami returns 400 until a tenant is chosen.',
    clientId: 'knowledge-ui-multi',
    clientSecret: 'dev-secret',
    entitlements: [grant(TENANT_SLUG, 'CONSUMER'), grant(SECOND_TENANT_SLUG, 'CONSUMER')],
    expectedRole: 'consumer',
  },
];

export const IDP_URL = process.env.KUI_IDP_URL ?? 'http://localhost:8090';
export const ENTITLEMENT_URL = process.env.KUI_ENTITLEMENT_URL ?? 'http://localhost:8091';
export const API_URL = process.env.KUI_API_URL ?? 'http://localhost:8000';

/** Mint a token the same way the app does, but from Node where there is no CORS. */
export async function mintToken(persona) {
  const res = await fetch(`${IDP_URL}/default/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: persona.clientId,
      client_secret: persona.clientSecret,
      // Becomes the `aud` claim, which must be in the API's resource allowlist.
      scope: 'registry',
    }),
  });
  if (!res.ok) throw new Error(`token endpoint returned ${res.status}: ${await res.text()}`);
  const body = await res.json();
  if (!body.access_token) throw new Error('token response carried no access_token');
  return body.access_token;
}

/** Decode a JWT payload. Decode only — never a substitute for server-side validation. */
export function decodeJwtPayload(token) {
  const part = token.split('.')[1];
  if (!part) throw new Error('token is not a JWT');
  return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
}
