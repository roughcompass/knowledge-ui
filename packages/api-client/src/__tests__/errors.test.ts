import { describe, expect, it } from 'vitest';

import {
  RegistryError,
  fieldErrors,
  formErrors,
  toNetworkError,
  toRegistryError,
} from '../errors';

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
    const err = toRegistryError(
      429,
      { errors: [{ path: null, code: 'rate_limited', message: 'slow down' }] },
      headers,
    );
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

describe('fieldErrors() / formErrors()', () => {
  /**
   * The shape Pydantic actually produces through the app's exception handler:
   * `path` is JSON-Path with a `$.` root, and `code` is the Pydantic error *type*
   * rather than a registry error code.
   */
  const validation = toRegistryError(422, {
    errors: [
      { path: '$.display_name', code: 'missing', message: 'Field required' },
      { path: '$.config.url', code: 'string_too_short', message: 'too short' },
      { path: null, code: 'unprocessable_entity', message: 'unknown connector type "nope"' },
    ],
  });

  it('strips the JSON-Path root so the key matches the field name', () => {
    expect(fieldErrors(validation)).toEqual({
      display_name: ['Field required'],
      'config.url': ['too short'],
    });
  });

  it('keeps a null-path item out of the field map and in the form list', () => {
    // The half of a 422 that has nowhere else to go. `admin_sync.py` raises this
    // for an unknown connector, and `connector.validate()` failing during create
    // arrives the same way — a form rendering only field errors shows nothing.
    expect(Object.keys(fieldErrors(validation))).toEqual(['display_name', 'config.url']);
    expect(formErrors(validation)).toEqual(['unknown connector type "nope"']);
  });

  it('collects repeated errors on one field rather than keeping the last', () => {
    const err = toRegistryError(422, {
      errors: [
        { path: '$.schedule', code: 'a', message: 'not a cron expression' },
        { path: '$.schedule', code: 'b', message: 'five fields required' },
      ],
    });
    expect(fieldErrors(err).schedule).toEqual(['not a cron expression', 'five fields required']);
  });

  it('reads an error thrown by a DIFFERENT copy of this module', () => {
    /*
     * The regression that cost real debugging time.
     *
     * `api-client` is not a federation share: the shell bundles one copy and each
     * remote bundles another. The client that throws lives in the shell's copy, the
     * page that catches lives in the remote's — so `instanceof RegistryError` is
     * false across that boundary and an `instanceof` guard silently reported zero
     * field errors and one form-level message, the exact opposite of the truth.
     *
     * This stand-in is envelope-shaped and deliberately NOT a RegistryError.
     */
    class ForeignRegistryError extends Error {
      status = 422;
      items = [
        { path: '$.display_name', code: 'missing', message: 'Field required' },
        { path: null, code: 'unprocessable_entity', message: 'unknown connector type' },
      ];
    }
    const foreign = new ForeignRegistryError('Field required');

    expect(foreign).not.toBeInstanceOf(RegistryError);
    expect(fieldErrors(foreign)).toEqual({ display_name: ['Field required'] });
    expect(formErrors(foreign)).toEqual(['unknown connector type']);
  });

  it('says something for a thrown non-RegistryError rather than nothing', () => {
    // Otherwise a failed submit renders as silence.
    expect(formErrors(new TypeError('boom'))).toEqual(['boom']);
    expect(fieldErrors(new TypeError('boom'))).toEqual({});
    expect(formErrors(undefined)).toEqual([]);
  });
});
