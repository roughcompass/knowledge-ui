/**
 * The reading-description helpers. The response model serves no unit field, so
 * the key suffix is the only signal separating a seconds-valued reading from a
 * count — and the two must never share a rendering or an aggregate: an age
 * formatted as a count reads as items, and a max() over depths that includes
 * an age compares seconds to items.
 */
import { describe, expect, it } from 'vitest';

import { describeScope, isSecondsReading, processScopeCaveat } from '../operationalHealth';

describe('isSecondsReading', () => {
  it('recognises a seconds-valued key', () => {
    expect(isSecondsReading('oldest_open_proposal_age_seconds')).toBe(true);
  });

  it('leaves counts as counts', () => {
    expect(isSecondsReading('curation_queue_depth')).toBe(false);
    expect(isSecondsReading('dead_letters')).toBe(false);
  });

  it('reads the key off a reading object as well as a bare string', () => {
    expect(isSecondsReading({ key: 'oldest_open_proposal_age_seconds' })).toBe(true);
    expect(isSecondsReading({ key: 'curation_queue_depth' })).toBe(false);
  });

  it('does not match seconds appearing anywhere but the suffix', () => {
    expect(isSecondsReading('seconds_since_start_count')).toBe(false);
  });
});

describe('describeScope', () => {
  it('states each scope in its own words', () => {
    expect(describeScope({ scope: 'cluster' })).toBe('Counted across the deployment, now.');
    expect(describeScope({ scope: 'process' })).toBe('One replica, since it last restarted.');
  });
});

describe('processScopeCaveat', () => {
  it('names the replicas that answered', () => {
    expect(processScopeCaveat(['api-1'])).toContain('Read from api-1.');
  });

  it('still carries the caveat when no instance is named', () => {
    expect(processScopeCaveat([])).toContain('a zero here does not prove zero everywhere');
  });
});
