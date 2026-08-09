import { describe, expect, it } from 'vitest';
import { getPolicy } from '../../src/lib/pipeline/policies';

describe('multi-chain policy precision', () => {
  it('rescales the same human policy limit to each asset precision', () => {
    expect(getPolicy('STANDARD', 6).maxPerLeg).toBe(25_000n * 10n ** 6n);
    expect(getPolicy('STANDARD', 18).maxPerLeg).toBe(25_000n * 10n ** 18n);
  });
});
