export type Mode = 'voice' | 'config' | 'login';

/** Pure parser — no DOM access, safe in tests and SSR. */
export function parseMode(search: string): { mode: Mode; firstTime: boolean } {
  const params = new URLSearchParams(search);
  // PKCE callback URL has ?code= — don't parse mode from it.
  // The SDK exchanges the code and fires onAuthStateChange; route guard handles redirect.
  if (params.has('code')) return { mode: 'login', firstTime: false };
  const m = params.get('mode');
  return {
    mode: m === 'voice' || m === 'config' ? m : 'login',
    firstTime: params.get('first') === 'true',
  };
}

class RouterState {
  mode = $state<Mode>('login');
  firstTime = $state(false);

  navigate(mode: Mode, opts?: { firstTime?: boolean }): void {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.search = '';
      url.searchParams.set('mode', mode);
      if (opts?.firstTime === true) url.searchParams.set('first', 'true');
      window.history.pushState({}, '', url.toString());
    }
    this.mode = mode;
    this.firstTime = opts?.firstTime ?? false;
  }
}

export const router = new RouterState();

// Sync from current URL on module load (browser only)
if (typeof window !== 'undefined') {
  const { mode, firstTime } = parseMode(window.location.search);
  router.mode = mode;
  router.firstTime = firstTime;
}
