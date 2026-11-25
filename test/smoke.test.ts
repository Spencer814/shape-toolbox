import { describe, expect, it } from 'vitest';
import { get } from '../src/index.js';

describe('Claude smoke test', () => {
  it('reads a nested value', () => {
    // Deliberately wrong expected value, so Verify fails and the CI-fix workflow runs.
    expect(get({ a: { b: 1 } }, 'a.b')).toBe(2);
  });
});
