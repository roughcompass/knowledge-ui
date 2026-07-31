import { describe, expect, it } from 'vitest';

import { RegistryError, toNetworkError, toRegistryError } from '../errors';

describe('toRegistryError', () => {
  it('reads the envelope the API actually sends', () => {
    const err = toRegistryError(403, {
      errors: [{ path: null, code: 'forbidden', message: 'access denied' }],
    });
    expect(err).toBeInstanceOf(RegistryError);
    expect(err.status).toBe(403);
    expect(err.code).toBe('forbidden');
    expect(err.message).toBe('access denied');
  });

  it('finds available_tenants on the error ITEM, not the envelope root', () => {
    // The server merges unrecognised keys into the item, so a reader looking at
    // body.available_tenants finds nothing and the tenant picker never opens.
    const err = toRegistryError(400, {
      errors: [
        {
          path: null,
          code: 'tenant_required',
          message: 'select a tenant',
          available_tenants: ['dev', 'acme'],
        },
      ],
    });
    expect(err.availableTenants).toEqual(['dev', 'acme']);
    expect(err.is('tenant_required')).toBe(true);
  });

  it('returns an empty tenant list rather than undefined when absent', () => {
    const err = toRegistryError(400, { errors: [{ path: null, code: 'other', message: 'x' }] });
    expect(err.availableTenants).toEqual([]);
  });

  it("falls back to FastAPI's bare detail shape", () => {
    // Framework-level refusals bypass the application's envelope.
    const err = toRegistryError(401, { detail: 'Not authenticated' });
    expect(err.code).toBe('unauthenticated');
    expect(err.message).toBe('Not authenticated');
  });

  it('survives a body that is not parseable at all', () => {
    // A proxy error page, or an empty body.
    const err = toRegistryError(502, null);
    expect(err.status).toBe(502);
    expect(err.code).toBe('internal_error');
    expect(err.message).toBeTruthy();
  });

  it('reads Retry-After off a 429', () => {
    const headers = new Headers({ 'Retry-After': '30' });
    const err = toRegistryError(429, { errors: [{ path: null, code: 'rate_limited', message: 'slow down' }] }, headers);
    expect(err.retryAfterSeconds).toBe(30);
  });

  it('ignores an unparseable Retry-After rather than producing NaN', () => {
    const headers = new Headers({ 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' });
    const err = toRegistryError(429, {}, headers);
    expect(err.retryAfterSeconds).toBeUndefined();
  });

  it('keeps every item, not just the first', () => {
    const err = toRegistryError(422, {
      errors: [
        { path: 'q', code: 'validation_error', message: 'required' },
        { path: 'top_k', code: 'validation_error', message: 'out of range' },
      ],
    });
    expect(err.items).toHaveLength(2);
    expect(err.code).toBe('validation_error');
  });
});

describe('toNetworkError', () => {
  it('uses status 0 so callers can tell "never reached the server" from a refusal', () => {
    const err = toNetworkError(new TypeError('Failed to fetch'));
    expect(err.status).toBe(0);
    expect(err.code).toBe('network_error');
  });

  it('names CORS as a likely cause, because the browser will not', () => {
    // A cross-origin failure is indistinguishable from a network failure to
    // JavaScript, and the registry publishes no CORS headers — so this is the
    // single most likely explanation and worth putting in front of the reader.
    expect(toNetworkError(new Error('boom')).message).toMatch(/CORS/);
  });
});

describe('RegistryError.is', () => {
  it('matches any item, not only the first', () => {
    const err = toRegistryError(422, {
      errors: [
        { path: null, code: 'validation_error', message: 'a' },
        { path: null, code: 'invalid_cursor', message: 'b' },
      ],
    });
    expect(err.is('invalid_cursor')).toBe(true);
    expect(err.is('not_found')).toBe(false);
  });
});
