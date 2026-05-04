export type VoiceInputState = 'idle' | 'listening' | 'processing' | 'error';

export interface VoiceInputError {
  code:
    | 'no-speech'
    | 'audio-capture'
    | 'not-allowed'
    | 'network'
    | 'aborted'
    | 'service-not-allowed'
    | 'unavailable';
  message: string;
}

type EventMap = {
  state: VoiceInputState;
  interim: string;
  result: string;
  error: VoiceInputError;
};

const ERROR_MESSAGES: Record<VoiceInputError['code'], string> = {
  'no-speech': 'No escuché nada. Tocá para volver a intentar.',
  'audio-capture': 'No pude usar el micrófono. Verificá que ningún otro app lo use.',
  'not-allowed': 'Necesito permiso de micrófono. Abrí ajustes del navegador.',
  network: 'Falló la red al transcribir. Probá con teclado o reintentá.',
  aborted: '',
  'service-not-allowed': 'Tu navegador bloqueó el servicio de voz. Probá en Chrome reciente.',
  unavailable: 'Tu navegador no soporta voz. Usá teclado.',
};

export class VoiceInputController {
  private recognition: SpeechRecognition | null = null;
  private _state: VoiceInputState = 'idle';
  private listeners: { [K in keyof EventMap]?: Array<(v: EventMap[K]) => void> } = {};

  constructor() {
    const SR =
      window.SpeechRecognition ??
      (window as Window & { webkitSpeechRecognition?: typeof SpeechRecognition })
        .webkitSpeechRecognition;
    if (!SR) return;

    this.recognition = new SR();
    this.recognition.lang = 'es-MX';
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;
    this._bindEvents();
  }

  private _bindEvents(): void {
    if (!this.recognition) return;
    const r = this.recognition;

    r.onstart = () => this._setState('listening');

    r.onresult = (ev: SpeechRecognitionEvent) => {
      const result = ev.results[ev.results.length - 1];
      if (!result) return;
      const text = result[0]?.transcript.trim() ?? '';
      if (result.isFinal) {
        this._setState('processing');
        this._emit('result', text);
      } else {
        this._emit('interim', text);
      }
    };

    r.onerror = (ev: SpeechRecognitionErrorEvent) => {
      const code = ev.error as VoiceInputError['code'];
      console.warn({ code, message: ev.message, ts: Date.now() });
      if (code === 'aborted') {
        this._setState('idle');
        return;
      }
      this._setState('error');
      this._emit('error', { code, message: ERROR_MESSAGES[code] ?? ev.message });
    };

    r.onend = () => {
      if (this._state === 'listening') this._setState('idle');
    };
  }

  private _setState(s: VoiceInputState): void {
    this._state = s;
    this._emit('state', s);
  }

  private _emit<K extends keyof EventMap>(event: K, value: EventMap[K]): void {
    for (const cb of this.listeners[event] ?? []) {
      (cb as (v: EventMap[K]) => void)(value);
    }
  }

  on<K extends keyof EventMap>(event: K, cb: (v: EventMap[K]) => void): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    (this.listeners[event] as Array<(v: EventMap[K]) => void>).push(cb);
  }

  getState(): VoiceInputState {
    return this._state;
  }

  async start(): Promise<void> {
    if (!this.recognition) {
      this._setState('error');
      this._emit('error', {
        code: 'unavailable',
        message: ERROR_MESSAGES.unavailable,
      });
      return;
    }
    if (this._state !== 'idle') return;
    try {
      this.recognition.start();
    } catch (e) {
      if (e instanceof DOMException && e.name === 'InvalidStateError') {
        // Browser already started — abort and re-start cleanly
        this.recognition.abort();
        setTimeout(() => { this.recognition?.start(); }, 100);
      }
    }
  }

  stop(): void {
    this.recognition?.stop();
  }

  cancel(): void {
    this.recognition?.abort();
    this._setState('idle');
  }

  resetToIdle(): void {
    this._setState('idle');
  }
}
