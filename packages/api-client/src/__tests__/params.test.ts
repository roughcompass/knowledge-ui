import { describe, expect, it } from 'vitest';

import {
  IDEMPOTENCY_HEADER,
  PAGE_LIMITS,
  clampPageSize,
  compact,
  newIdempotencyKey,
  toApiTimestamp,
} from '../params';

describe('toApiTimestamp', () => {
  it('always emits a timezone-aware string', () => {
    // The API rejects a naive timestamp with a 400, so the Z is not cosmetic.
    expect(toApiTimestamp(new Date('2026-07-31T12:00:00Z'))).toBe('2026-07-31T12:00:00.000Z');
    expect(toApiTimestamp('2026-07-31T12:00:00Z')).toMatch(/Z$/);
  });

  it('adds a zone to an input that has none', () => {
    // A local-time string parses as local and serialises as UTC — which is the
    // point: the server never receives an ambiguous value.
    expect(toApiTimestamp('2026-07-31T12:00:00')).toMatch(/Z$/);
  });

  it('throws on an unparseable input rather than sending it', () => {
    expect(() => toApiTimestamp('not a date')).toThrow(TypeError);
  });
});

describe('clampPageSize', () => {
  it("uses each endpoint's own default when unset", () => {
    expect(clampPageSize('capabilities', undefined)).toBe(PAGE_LIMITS.capabilities.default);
    expect(clampPageSize('audit', undefined)).toBe(PAGE_LIMITS.audit.default);
    expect(clampPageSize('search', undefined)).toBe(PAGE_LIMITS.search.default);
  });

  it('clamps to the server ceiling, which differs per endpoint', () => {
    expect(clampPageSize('capabilities', 9999)).toBe(200);
    expect(clampPageSize('audit', 9999)).toBe(500);
    // Search's ceiling is lower than the list endpoints', which is easy to miss.
    expect(clampPageSize('search', 9999)).toBe(100);
  });

  it('clamps to the floor and truncates', () => {
    expect(clampPageSize('capabilities', 0)).toBe(1);
    expect(clampPageSize('capabilities', -5)).toBe(1);
    expect(clampPageSize('capabilities', 20.7)).toBe(20);
  });

  it('falls back rather than sending NaN', () => {
    expect(clampPageSize('capabilities', Number.NaN)).toBe(20);
  });
});

describe('compact', () => {
  it('drops undefined, null and empty string', () => {
    expect(compact({ a: 1, b: undefined, c: null, d: '', e: 'x' })).toEqual({ a: 1, e: 'x' });
  });

  it('keeps false and zero, which are meaningful values', () => {
    expect(compact({ active: false, count: 0 })).toEqual({ active: false, count: 0 });
  });
});

describe('the idempotency header', () => {
  it('is spelled with the X- prefix', () => {
    /*
     * This is the whole point of the constant. Getting the name wrong fails
     * silently — the server's dependency returns an inert context when the header
     * is absent, so both lookup and persist become no-ops and a retried POST
     * duplicates the write with nothing logged.
     *
     * And it is a live trap, not a hypothetical: the registry's own
     * `docs/04-guides/03-sync-connectors.md` documents it without the prefix.
     */
    expect(IDEMPOTENCY_HEADER).toBe('X-Idempotency-Key');
  });

  it('mints a distinct key per call', () => {
    // A key reused across two different bodies is a 409 from the server; a key
    // reused for the same body silently replays the first response.
    const keys = new Set(Array.from({ length: 50 }, () => newIdempotencyKey()));
    expect(keys.size).toBe(50);
    for (const key of keys) expect(key.length).toBeGreaterThan(8);
  });
});
