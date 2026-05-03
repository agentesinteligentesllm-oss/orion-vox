// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VoiceInputError, VoiceInputState } from '../../src/lib/voice/recognition.ts';
import { VoiceInputController } from '../../src/lib/voice/recognition.ts';

let _mock: MockSR | null = null;

class MockSR {
  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onstart: (() => void) | null = null;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null = null;
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
  constructor() {
    _mock = this;
  }
}

function resultEvent(transcript: string, isFinal: boolean): SpeechRecognitionEvent {
  const alt = { transcript, confidence: 1 };
  const result = Object.assign([alt], { isFinal, length: 1 });
  const results = Object.assign([result], { length: 1 });
  return { results } as unknown as SpeechRecognitionEvent;
}

function errorEvent(error: string): SpeechRecognitionErrorEvent {
  return { error, message: error } as unknown as SpeechRecognitionErrorEvent;
}

beforeEach(() => {
  _mock = null;
  vi.clearAllMocks();
  // @ts-expect-error
  window.SpeechRecognition = MockSR;
  // @ts-expect-error
  delete (window as Window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
});

describe('VoiceInputController', () => {
  it('getState() returns idle initially', () => {
    const ctrl = new VoiceInputController();
    expect(ctrl.getState()).toBe('idle');
  });

  it('configures SpeechRecognition with M1 settings (es-MX, continuous:false, interimResults:true, maxAlternatives:1)', () => {
    new VoiceInputController();
    expect(_mock?.lang).toBe('es-MX');
    expect(_mock?.continuous).toBe(false);
    expect(_mock?.interimResults).toBe(true);
    expect(_mock?.maxAlternatives).toBe(1);
  });

  it('start() calls recognition.start', async () => {
    const ctrl = new VoiceInputController();
    await ctrl.start();
    expect(_mock?.start).toHaveBeenCalledOnce();
  });

  it('start() is no-op when not idle', async () => {
    const ctrl = new VoiceInputController();
    await ctrl.start();
    _mock?.onstart?.(); // → listening
    await ctrl.start(); // second call while listening
    expect(_mock?.start).toHaveBeenCalledOnce();
  });

  it('onstart → state: listening + emits state event', async () => {
    const ctrl = new VoiceInputController();
    const states: VoiceInputState[] = [];
    ctrl.on('state', (s) => states.push(s));
    await ctrl.start();
    _mock?.onstart?.();
    expect(ctrl.getState()).toBe('listening');
    expect(states).toContain('listening');
  });

  it('interim result emits interim event, not result event', () => {
    const ctrl = new VoiceInputController();
    const interims: string[] = [];
    const results: string[] = [];
    ctrl.on('interim', (t) => interims.push(t));
    ctrl.on('result', (t) => results.push(t));
    _mock?.onresult?.(resultEvent('hola mun', false));
    expect(interims).toEqual(['hola mun']);
    expect(results).toHaveLength(0);
  });

  it('final result → state: processing + emits result text', () => {
    const ctrl = new VoiceInputController();
    const results: string[] = [];
    const states: VoiceInputState[] = [];
    ctrl.on('result', (t) => results.push(t));
    ctrl.on('state', (s) => states.push(s));
    _mock?.onresult?.(resultEvent('hola mundo', true));
    expect(states).toContain('processing');
    expect(results).toEqual(['hola mundo']);
  });

  it('stop() calls recognition.stop', () => {
    const ctrl = new VoiceInputController();
    ctrl.stop();
    expect(_mock?.stop).toHaveBeenCalledOnce();
  });

  it('cancel() calls abort and state → idle', () => {
    const ctrl = new VoiceInputController();
    ctrl.cancel();
    expect(_mock?.abort).toHaveBeenCalledOnce();
    expect(ctrl.getState()).toBe('idle');
  });

  it('onerror aborted → state idle, no error event emitted', () => {
    const ctrl = new VoiceInputController();
    const errors: VoiceInputError[] = [];
    ctrl.on('error', (e) => errors.push(e));
    _mock?.onerror?.(errorEvent('aborted'));
    expect(ctrl.getState()).toBe('idle');
    expect(errors).toHaveLength(0);
  });

  it('onerror not-allowed → state: error + Spanish message mentioning permiso', () => {
    const ctrl = new VoiceInputController();
    const errors: VoiceInputError[] = [];
    ctrl.on('error', (e) => errors.push(e));
    _mock?.onerror?.(errorEvent('not-allowed'));
    expect(ctrl.getState()).toBe('error');
    expect(errors[0].code).toBe('not-allowed');
    expect(errors[0].message).toContain('permiso');
  });

  it('onerror no-speech → state: error + Spanish message', () => {
    const ctrl = new VoiceInputController();
    const errors: VoiceInputError[] = [];
    ctrl.on('error', (e) => errors.push(e));
    _mock?.onerror?.(errorEvent('no-speech'));
    expect(ctrl.getState()).toBe('error');
    expect(errors[0].code).toBe('no-speech');
    expect(errors[0].message).toContain('escuché');
  });

  it('onend while listening → state: idle (no result received)', () => {
    const ctrl = new VoiceInputController();
    _mock?.onstart?.(); // → listening
    _mock?.onend?.(); // → idle (no result)
    expect(ctrl.getState()).toBe('idle');
  });

  it('resetToIdle() forces state to idle', () => {
    const ctrl = new VoiceInputController();
    _mock?.onresult?.(resultEvent('texto', true)); // → processing
    ctrl.resetToIdle();
    expect(ctrl.getState()).toBe('idle');
  });

  it('start() emits unavailable error when SpeechRecognition missing', async () => {
    // @ts-expect-error
    delete window.SpeechRecognition;
    // @ts-expect-error
    delete (window as Window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    const ctrl = new VoiceInputController();
    const errors: VoiceInputError[] = [];
    ctrl.on('error', (e) => errors.push(e));
    await ctrl.start();
    expect(ctrl.getState()).toBe('error');
    expect(errors[0].code).toBe('unavailable');
  });
});
