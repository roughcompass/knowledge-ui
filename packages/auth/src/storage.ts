/**
 * Token cache, namespaced by API origin and persona.
 *
 * Two namespacing decisions, both from real failure modes:
 *
 * - By API base URL, because running two registry stacks in one browser is
 *   ordinary during development, and a token minted against one is rejected by
 *   the other. The hash only has to separate keys, so a small non-cryptographic
 *   digest is the right tool — there is nothing secret about the base URL and
 *   nothing here depends on collision resistance.
 * - By persona, so switching identity does not invalidate the token you were
 *   using a moment ago and will want again.
 *
 * `sessionStorage`, not `localStorage`: a persona is a per-tab experiment, and a
 * credential that dies with the tab is one fewer thing to remember to clear.
 *
 * Every operation tolerates storage being unavailable. Private browsing modes
 * and some embedded webviews throw on access rather than returning null, and a
 * token cache is a convenience — losing it should cost a re-mint, not a crash.
 */

/** FNV-1a, 32-bit. Short, stable, synchronous, no Web Crypto round trip. */
function shortHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36).padStart(7, '0');
}

export function tokenStorageKey(apiBaseUrl: string, personaKey: string): string {
  // An empty base URL means same-origin, which is the normal case behind the dev
  // proxy. Naming it explicitly keeps the key readable in devtools.
  const scope = apiBaseUrl === '' ? 'same-origin' : apiBaseUrl;
  return `kui:token:${shortHash(scope)}:${personaKey}`;
}

export interface CachedToken {
  token: string;
  /** Epoch seconds, from the token's own `exp`. */
  expiresAt: number;
}

function storage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function readToken(key: string): CachedToken | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedToken>;
    if (typeof parsed.token !== 'string' || typeof parsed.expiresAt !== 'number') return null;
    return { token: parsed.token, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

export function writeToken(key: string, value: CachedToken): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or a disabled store. The caller re-mints; nothing is broken.
  }
}

export function clearToken(key: string): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(key);
  } catch {
    /* nothing to do */
  }
}

/**
 * Which persona was last chosen, for this API origin.
 *
 * Without this, every reload silently drops the reader back to the first persona
 * in the roster. That is worst exactly where the switcher matters most: reading
 * the audit log requires becoming the auditor, and the natural next actions —
 * refresh, or paste the URL to a colleague — would land back on a consumer
 * looking at an empty table.
 *
 * Namespaced by origin like the token cache, and in `sessionStorage` for the same
 * reason: a persona is a per-tab experiment, not a lasting preference.
 */
function selectedPersonaKey(apiBaseUrl: string): string {
  const scope = apiBaseUrl === '' ? 'same-origin' : apiBaseUrl;
  return `kui:persona:${shortHash(scope)}`;
}

export function readSelectedPersona(apiBaseUrl: string): string | null {
  const s = storage();
  if (!s) return null;
  try {
    return s.getItem(selectedPersonaKey(apiBaseUrl));
  } catch {
    return null;
  }
}

export function writeSelectedPersona(apiBaseUrl: string, personaKey: string): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(selectedPersonaKey(apiBaseUrl), personaKey);
  } catch {
    // Same tolerance as the token cache: losing this costs a default, not a crash.
  }
}

/**
 * Seconds of headroom before `exp` at which a token counts as expired.
 *
 * A token that is valid for another second is not useful: the request carrying
 * it may still be in flight when it lapses, and the resulting 401 looks like an
 * auth bug rather than a clock race.
 */
export const EXPIRY_MARGIN_SECONDS = 30;

/** Written as a type predicate so a caller can read `.token` after checking. */
export function isUsable(
  cached: CachedToken | null,
  nowSeconds = Date.now() / 1000,
): cached is CachedToken {
  return cached !== null && cached.expiresAt - EXPIRY_MARGIN_SECONDS > nowSeconds;
}
