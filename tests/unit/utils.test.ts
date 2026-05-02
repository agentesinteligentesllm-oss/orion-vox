import { describe, expect, it } from 'vitest';
import { validateEmail } from '../../src/lib/utils.ts';

describe('validateEmail', () => {
  it('accepts a standard email', () => {
    expect(validateEmail('user@example.com')).toBe(true);
  });

  it('accepts email with subdomain', () => {
    expect(validateEmail('user@mail.example.co.ar')).toBe(true);
  });

  it('accepts email with + alias', () => {
    expect(validateEmail('user+tag@example.com')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(validateEmail('')).toBe(false);
  });

  it('rejects missing @', () => {
    expect(validateEmail('userexample.com')).toBe(false);
  });

  it('rejects missing domain', () => {
    expect(validateEmail('user@')).toBe(false);
  });

  it('rejects missing TLD', () => {
    expect(validateEmail('user@example')).toBe(false);
  });

  it('rejects spaces', () => {
    expect(validateEmail('user @example.com')).toBe(false);
  });
});
