import type { Persona } from './personaRoster';
import {
  clearToken,
  isUsable,
  readToken,
  tokenStorageKey,
  writeToken,
  type CachedToken,
} from './storage';

/**
 * The seam between the app and however it obtains a token.
 *
 * Development mints from a local identity provider with client credentials.
 * A hosted deployment would receive one from its shell, or run a real
 * authorisation-code flow. Keeping that behind an interface means the session
 * bootstrap, the API client and every hook are written once.
 */
export interface AuthProvider {
  /** Names the mechanism, for the debug screen. */
  readonly strategy: string;
  /** The current principal's identifier, when the strategy has a notion of one. */
  readonly personaKey: string | undefined;
  /** A usable bearer token, minting or refreshing as needed. */
  getToken(): Promise<string | null>;
  /** Drop any cache, so the next getToken() re-mints. Called on a 401. */
  invalidate(): void;
  /** Present only when the strategy supports switching identity. */
  switchTo?(personaKey: string): Promise<void>;
}

/** Decode a JWT payload. Decoding only — this is not validation and cannot be. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export interface DevPersonaAuthProviderOptions {
  /** Where the token endpoint lives. Proxied by default, so same-origin. */
  idpBase?: string;
  /** Namespaces the token cache. Empty string means same-origin. */
  apiBaseUrl?: string;
  personas: readonly Persona[];
  initialPersonaKey?: string;
  /** Notified after a switch, so the host can clear caches and refetch. */
  onPersonaChange?: (personaKey: string) => void;
}

/**
 * Mints tokens from the local identity provider, one persona at a time.
 *
 * The mechanism the whole persona model rests on: under the client-credentials
 * grant the issued token's `sub` claim is the client_id, and the entitlement
 * service is keyed by `sub`. So the client_id chooses the identity, and the
 * seeded entitlements for that identity choose the role. Nothing about the role
 * is asserted here — the app reads it back from whoami.
 *
 * Because minting is a single unattended round trip, a refresh is invisible: on
 * a 401 the caller invalidates and retries once, with no interruption. That is
 * why the 401 path reports rather than navigating anywhere.
 */
export class DevPersonaAuthProvider implements AuthProvider {
  readonly strategy = 'dev-persona';

  private readonly idpBase: string;
  private readonly apiBaseUrl: string;
  private readonly personas: readonly Persona[];
  private readonly onPersonaChange: ((personaKey: string) => void) | undefined;
  private current: Persona;
  /** De-duplicates concurrent mints; several hooks may ask at once on first paint. */
  private inFlight: Promise<string | null> | null = null;

  constructor(options: DevPersonaAuthProviderOptions) {
    if (options.personas.length === 0) {
      throw new Error('DevPersonaAuthProvider needs at least one persona');
    }
    this.idpBase = options.idpBase ?? '/__idp';
    this.apiBaseUrl = options.apiBaseUrl ?? '';
    this.personas = options.personas;
    this.onPersonaChange = options.onPersonaChange;

    const initial =
      options.personas.find((p) => p.key === options.initialPersonaKey) ?? options.personas[0];
    // Narrowed by the length check above; the index signature cannot see that.
    this.current = initial as Persona;
  }

  get personaKey(): string {
    return this.current.key;
  }

  get persona(): Persona {
    return this.current;
  }

  get available(): readonly Persona[] {
    return this.personas;
  }

  private get cacheKey(): string {
    return tokenStorageKey(this.apiBaseUrl, this.current.key);
  }

  async getToken(): Promise<string | null> {
    const cached = readToken(this.cacheKey);
    if (isUsable(cached)) return cached.token;

    this.inFlight ??= this.mint().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  invalidate(): void {
    clearToken(this.cacheKey);
  }

  async switchTo(personaKey: string): Promise<void> {
    const next = this.personas.find((p) => p.key === personaKey);
    if (!next) throw new Error(`unknown persona "${personaKey}"`);
    this.current = next;
    // Deliberately not clearing the outgoing persona's token: switching back is
    // common and the cache is per-persona, so keeping it costs nothing.
    this.onPersonaChange?.(personaKey);
  }

  private async mint(): Promise<string | null> {
    const res = await fetch(`${this.idpBase}/default/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.current.clientId,
        client_secret: this.current.clientSecret,
        // Becomes the token's `aud`, which the API checks against its resource
        // allowlist. Omitting it produces a token the API refuses.
        scope: 'registry',
      }),
    });

    if (!res.ok) {
      throw new Error(
        `could not mint a token for "${this.current.key}" (${res.status}). ` +
          `Is the local identity provider running?`,
      );
    }

    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new Error('the token response carried no access_token');

    const claims = decodeJwtPayload(body.access_token);
    const exp = typeof claims?.exp === 'number' ? claims.exp : undefined;
    const cached: CachedToken = {
      token: body.access_token,
      // Prefer the token's own claim over expires_in: the claim is what the API
      // will actually check.
      expiresAt: exp ?? Date.now() / 1000 + (body.expires_in ?? 3600),
    };
    writeToken(this.cacheKey, cached);
    return cached.token;
  }
}
