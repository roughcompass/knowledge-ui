import type { Role } from './types';

/**
 * The development persona roster.
 *
 * Kept in its own module so the environment guard in `personas.ts` can elide it
 * from a production build: the guard wraps a dynamic import of this file, which
 * gives the bundler a boundary it can actually drop. Inlining the roster behind
 * an `if` would keep the strings — including the client secrets below — in the
 * shipped bundle. A CI step greps dist/ for them.
 *
 * `scripts/personas.mjs` is the same roster in plain JavaScript, imported by the
 * Node seed and verify scripts. The two must stay in step; the verify script is
 * what catches a drift, by minting a token per persona and asserting the role
 * the server resolves matches `expectedRole`.
 */

/**
 * The shared development client secret, from the environment rather than a literal.
 *
 * Tree-shaking removes this module's *code* from a production build, but a
 * sourcemap keeps every module's original text in `sourcesContent` — so a literal
 * here still shipped inside `dist/**.map`, which is exactly what a published
 * bundle exposes. Reading it from the environment means no artefact contains the
 * credential, whether or not the elision works.
 *
 * `.env.development` supplies it for `vite dev`, and `build:e2e` passes it
 * explicitly for the mocked end-to-end build. A production build has neither, so
 * this is the empty string — correct, because the switcher is disabled there and
 * nothing ever reads it.
 *
 * The mock identity provider accepts any client_id/secret pair, so the value only
 * has to be present, not correct.
 */
const CLIENT_SECRET =
  (import.meta as unknown as { env: { VITE_PERSONA_SECRET: string | undefined } }).env
    .VITE_PERSONA_SECRET ?? '';
export interface Persona {
  key: string;
  label: string;
  description: string;
  /** Becomes the JWT `sub` under the client-credentials grant. */
  clientId: string;
  clientSecret: string;
  entitlements: string[];
  /** Asserted by the verify script. Never trusted at runtime. */
  expectedRole: Role;
}

const TENANT = 'dev';
const SECOND_TENANT = 'acme';
const DISCRIMINATOR = 'REGISTRY';

const grant = (slug: string, role: string) => `${slug}_${DISCRIMINATOR}_${role}`;

export const PERSONA_ROSTER: readonly Persona[] = [
  {
    key: 'consumer',
    label: 'Tenant — Consumer',
    description: 'Read-only browse of the capability catalog.',
    clientId: 'knowledge-ui-consumer',
    clientSecret: CLIENT_SECRET,
    entitlements: [grant(TENANT, 'CONSUMER')],
    expectedRole: 'consumer',
  },
  {
    key: 'producer',
    label: 'Tenant — Producer',
    description: 'Everything a consumer sees, plus the write surfaces when they land.',
    clientId: 'knowledge-ui-producer',
    clientSecret: CLIENT_SECRET,
    entitlements: [grant(TENANT, 'PRODUCER')],
    expectedRole: 'producer',
  },
  {
    key: 'admin',
    label: 'Platform — Admin',
    description:
      'Sync connectors and platform operations. Cannot read the audit log — that needs the auditor.',
    clientId: 'knowledge-ui-admin',
    clientSecret: CLIENT_SECRET,
    entitlements: [grant(TENANT, 'ADMIN')],
    expectedRole: 'admin',
  },
  {
    key: 'auditor',
    label: 'Platform — Auditor',
    description: 'The only role the server permits to read the audit log.',
    clientId: 'knowledge-ui-auditor',
    clientSecret: CLIENT_SECRET,
    entitlements: [grant(TENANT, 'AUDITOR')],
    expectedRole: 'auditor',
  },
  {
    key: 'multi-tenant',
    label: 'Tenant — Two grants',
    description: 'Exercises tenant selection: whoami is refused until a tenant is chosen.',
    clientId: 'knowledge-ui-multi',
    clientSecret: CLIENT_SECRET,
    entitlements: [grant(TENANT, 'CONSUMER'), grant(SECOND_TENANT, 'CONSUMER')],
    expectedRole: 'consumer',
  },
] as const;
