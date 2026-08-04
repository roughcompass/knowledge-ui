import { describe, expect, it } from 'vitest';

import { makeQueryClient } from '../providers';

/**
 * The cache and retry policy, which is load-bearing in a way that is easy to lose.
 *
 * Three of these defaults are not preferences. `mutations: { retry: 0 }` is the one
 * worth stating loudly: the write helpers mint an idempotency key *inside* the
 * mutation function, so a retry at this layer would mint a second key for the same
 * intent — and a second key is a second operation as far as the server is concerned.
 * Raising it to 1 to "harden" the write path would silently convert idempotent
 * retries into duplicate writes.
 *
 * The retry predicate is the other one. Retrying a 4xx cannot succeed and delays the
 * explanation the reader needs, so a refusal has to fail fast rather than after
 * three attempts.
 */

describe('mutation retries', () => {
  it('never retries a mutation, because the idempotency key is minted per attempt', () => {
    /*
     * The invariant this test exists for. The write helpers generate the key inside
     * the mutation function; a retry produces a new key, which the server reads as a
     * new operation. So retrying here turns "the same write, again" into "a second
     * write" — the exact failure idempotency keys exist to prevent.
     */
    const options = makeQueryClient().getDefaultOptions();
    expect(options.mutations?.retry).toBe(0);
  });
});

describe('query retries', () => {
  const retry = () => {
    const value = makeQueryClient().getDefaultOptions().queries?.retry;
    if (typeof value !== 'function') throw new Error('the retry policy is not a predicate');
    return value as (failureCount: number, error: unknown) => boolean;
  };

  it('does not retry a refusal, which will not become a success', () => {
    // Retrying a 403 delays the explanation the reader needs by three round trips
    // and cannot change the answer.
    expect(retry()(0, { status: 403 })).toBe(false);
    expect(retry()(0, { status: 404 })).toBe(false);
    expect(retry()(0, { status: 422 })).toBe(false);
  });

  it('retries a server error, which might', () => {
    expect(retry()(0, { status: 503 })).toBe(true);
  });

  it('retries a transport failure, which carries no status at all', () => {
    // A network error is the case retries were invented for, and it arrives with no
    // status — so a predicate keyed only on status codes would never retry it.
    expect(retry()(0, null)).toBe(true);
    expect(retry()(0, new Error('network'))).toBe(true);
  });

  it('gives up after two attempts rather than retrying indefinitely', () => {
    expect(retry()(1, { status: 503 })).toBe(true);
    expect(retry()(2, { status: 503 })).toBe(false);
  });

  it('treats a non-numeric status as unknown rather than as a refusal', () => {
    // Defensive, and the safe direction: an odd error shape should get the benefit
    // of a retry rather than being silently classified as permanent.
    expect(retry()(0, { status: 'nope' })).toBe(true);
  });
});

describe('cache freshness', () => {
  it('holds a result briefly so several panels mounting at once do not each refetch', () => {
    const queries = makeQueryClient().getDefaultOptions().queries;
    expect(queries?.staleTime).toBe(30_000);
  });

  it('does not refetch on window focus, which on an always-open tab is noise', () => {
    expect(makeQueryClient().getDefaultOptions().queries?.refetchOnWindowFocus).toBe(false);
  });
});

describe('client identity', () => {
  it('returns a new client per call, so no cache outlives what created it', () => {
    /*
     * A module-scoped client would be shared across every test in a file and across
     * a hot reload, so entries outlive their owner. The app holds exactly one because
     * it creates it in state, not because this function memoises.
     */
    expect(makeQueryClient()).not.toBe(makeQueryClient());
  });
});
