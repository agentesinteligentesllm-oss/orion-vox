import { describe, expect, it, vi } from 'vitest';
import { parseMode } from '../../src/lib/router.svelte.ts';

// parseMode is a pure function — no DOM needed, safe in node environment.
describe('parseMode', () => {
  it('returns voice for ?mode=voice', () => {
    expect(parseMode('?mode=voice')).toEqual({ mode: 'voice', firstTime: false });
  });

  it('returns config for ?mode=config', () => {
    expect(parseMode('?mode=config')).toEqual({ mode: 'config', firstTime: false });
  });

  it('returns config + firstTime for ?mode=config&first=true', () => {
    expect(parseMode('?mode=config&first=true')).toEqual({ mode: 'config', firstTime: true });
  });

  it('returns voice for unknown mode (default)', () => {
    expect(parseMode('?mode=unknown')).toEqual({ mode: 'voice', firstTime: false });
  });

  it('returns voice for empty search string (default)', () => {
    expect(parseMode('')).toEqual({ mode: 'voice', firstTime: false });
  });

  it('returns voice when ?code= is present (PKCE callback — do not parse mode)', () => {
    expect(parseMode('?code=abc123&state=xyz')).toEqual({ mode: 'voice', firstTime: false });
  });

  it('ignores ?mode= when ?code= is also present (PKCE guard wins)', () => {
    expect(parseMode('?code=abc&mode=config')).toEqual({ mode: 'voice', firstTime: false });
  });
});

describe('router.navigate state', () => {
  it('updates mode and firstTime when navigate is called', async () => {
    // Mock window so navigate() does not crash in node environment
    vi.stubGlobal('window', {
      location: { href: 'http://localhost/' },
      history: { pushState: vi.fn() },
    });

    // Dynamic import AFTER window is stubbed so module-level guard works
    const { router } = await import('../../src/lib/router.svelte.ts');

    router.navigate('config', { firstTime: true });
    expect(router.mode).toBe('config');
    expect(router.firstTime).toBe(true);

    router.navigate('voice');
    expect(router.mode).toBe('voice');
    expect(router.firstTime).toBe(false);

    vi.unstubAllGlobals();
  });
});
