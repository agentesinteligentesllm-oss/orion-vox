import { registerSW } from 'virtual:pwa-register';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

class PwaStore {
  canInstall = $state(false);
  needsUpdate = $state(false);

  private _deferredPrompt: BeforeInstallPromptEvent | null = null;
  private _updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
  private _initialized = false;

  init(): void {
    if (typeof window === 'undefined' || this._initialized) return;
    this._initialized = true;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this._deferredPrompt = e as BeforeInstallPromptEvent;
      this.canInstall = true;
    });

    window.addEventListener('appinstalled', () => {
      this._deferredPrompt = null;
      this.canInstall = false;
    });

    this._updateSW = registerSW({
      onNeedRefresh: () => {
        this.needsUpdate = true;
      },
    });
  }

  async install(): Promise<void> {
    if (!this._deferredPrompt) return;
    await this._deferredPrompt.prompt();
    const { outcome } = await this._deferredPrompt.userChoice;
    this._deferredPrompt = null;
    if (outcome === 'accepted') this.canInstall = false;
  }

  dismissInstall(): void {
    this.canInstall = false;
  }

  async applyUpdate(): Promise<void> {
    if (!this._updateSW) return;
    this.needsUpdate = false;
    await this._updateSW(true);
  }
}

export const pwa = new PwaStore();
