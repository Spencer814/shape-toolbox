import { describe, expect, it } from 'vitest';
import { get } from '../src/index.js';

describe('Claude smoke test', () => {
  it('reads a nested value', () => {
    expect(get({ a: { b: 1 } }, 'a.b')).toBe(1);
  });
});
