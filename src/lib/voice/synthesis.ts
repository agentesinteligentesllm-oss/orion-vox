import type { Idioma } from '../storage/types.ts';

export interface SpeakOptions {
  voice?: SpeechSynthesisVoice;
  rate?: number;
  pitch?: number;
  volume?: number;
}

export interface SpeechError {
  code: 'unavailable' | 'voice-missing' | 'interrupted' | 'unknown';
  message: string;
}

type TtsEventMap = {
  start: undefined;
  end: undefined;
  error: SpeechError;
};

const TTS_MAX_CHARS = 300;

export class TtsOutputController {
  private synth: SpeechSynthesis | null = null;
  private selectedVoice: SpeechSynthesisVoice | null = null;
  private defaults: Required<Omit<SpeakOptions, 'voice'>> = {
    rate: 1.0,
    pitch: 1.0,
    volume: 1.0,
  };
  private listeners: { [K in keyof TtsEventMap]?: Array<(v: TtsEventMap[K]) => void> } = {};

  constructor() {
    if (typeof speechSynthesis === 'undefined') return;
    this.synth = speechSynthesis;
    this._loadVoices();
    this.synth.onvoiceschanged = () => this._loadVoices();
  }

  private _loadVoices(preferred: Idioma = 'es-MX'): void {
    const voices = this.synth?.getVoices() ?? [];
    this.selectedVoice =
      voices.find((v) => v.lang === preferred) ??
      voices.find((v) => v.lang.startsWith('es')) ??
      null;
    if (!this.selectedVoice && voices.length > 0) {
      console.warn({ code: 'voice-missing', ts: Date.now() });
    }
  }

  selectVoiceForLang(lang: Idioma): void {
    this._loadVoices(lang);
  }

  isAvailable(): boolean {
    return this.synth !== null;
  }

  setDefaultOptions(opts: Partial<SpeakOptions>): void {
    if (opts.rate !== undefined) this.defaults.rate = opts.rate;
    if (opts.pitch !== undefined) this.defaults.pitch = opts.pitch;
    if (opts.volume !== undefined) this.defaults.volume = opts.volume;
  }

  on<K extends keyof TtsEventMap>(event: K, cb: (v: TtsEventMap[K]) => void): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    (this.listeners[event] as Array<(v: TtsEventMap[K]) => void>).push(cb);
  }

  private _emit<K extends keyof TtsEventMap>(event: K, value: TtsEventMap[K]): void {
    for (const cb of this.listeners[event] ?? []) {
      (cb as (v: TtsEventMap[K]) => void)(value);
    }
  }

  speak(text: string, opts?: SpeakOptions): Promise<void> {
    return new Promise((resolve) => {
      if (!this.synth) {
        this._emit('error', { code: 'unavailable', message: '' });
        resolve();
        return;
      }

      if (this.synth.speaking || this.synth.pending) {
        this.synth.cancel();
      }

      const truncated =
        text.length > TTS_MAX_CHARS ? `${text.slice(0, TTS_MAX_CHARS)}... más en pantalla.` : text;

      const utter = new SpeechSynthesisUtterance(truncated);
      utter.rate = opts?.rate ?? this.defaults.rate;
      utter.pitch = opts?.pitch ?? this.defaults.pitch;
      utter.volume = opts?.volume ?? this.defaults.volume;
      utter.voice = opts?.voice ?? this.selectedVoice;
      utter.lang = 'es-MX';

      utter.onstart = () => this._emit('start', undefined as undefined);
      utter.onend = () => {
        this._emit('end', undefined as undefined);
        resolve();
      };
      utter.onerror = (ev) => {
        const code =
          ev.error === 'interrupted' || ev.error === 'canceled' ? 'interrupted' : 'unknown';
        if (code !== 'interrupted') {
          console.warn({ code, error: ev.error, ts: Date.now() });
        }
        this._emit('error', { code, message: '' });
        resolve();
      };

      this.synth.speak(utter);
    });
  }

  cancel(): void {
    this.synth?.cancel();
  }
}
