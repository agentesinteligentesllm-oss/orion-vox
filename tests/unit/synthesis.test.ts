// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TtsOutputController } from '../../src/lib/voice/synthesis.ts';

let capturedUtterance: MockUtterance | null = null;

class MockUtterance {
  text: string;
  rate = 1;
  pitch = 1;
  volume = 1;
  voice: SpeechSynthesisVoice | null = null;
  lang = '';
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((ev: SpeechSynthesisErrorEvent) => void) | null = null;
  constructor(text: string) {
    this.text = text;
    capturedUtterance = this;
  }
}

const mockSynth = {
  speaking: false,
  pending: false,
  getVoices: vi.fn().mockReturnValue([]),
  speak: vi.fn((u: MockUtterance) => {
    capturedUtterance = u;
    u.onstart?.();
    u.onend?.();
  }),
  cancel: vi.fn(),
  onvoiceschanged: null as (() => void) | null,
};

beforeEach(() => {
  capturedUtterance = null;
  vi.clearAllMocks();
  mockSynth.speaking = false;
  mockSynth.pending = false;
  mockSynth.getVoices.mockReturnValue([]);
  // @ts-expect-error
  global.speechSynthesis = mockSynth;
  // @ts-expect-error
  global.SpeechSynthesisUtterance = MockUtterance;
});

describe('TtsOutputController', () => {
  it('isAvailable() returns false when speechSynthesis is undefined', () => {
    // @ts-expect-error
    delete global.speechSynthesis;
    const ctrl = new TtsOutputController();
    expect(ctrl.isAvailable()).toBe(false);
  });

  it('isAvailable() returns true when speechSynthesis is available', () => {
    const ctrl = new TtsOutputController();
    expect(ctrl.isAvailable()).toBe(true);
  });

  it('speak() calls synth.speak with utterance containing the text', async () => {
    const ctrl = new TtsOutputController();
    await ctrl.speak('hola mundo');
    expect(mockSynth.speak).toHaveBeenCalledOnce();
    expect(capturedUtterance?.text).toBe('hola mundo');
  });

  it('speak() truncates text > 300 chars and appends "más en pantalla"', async () => {
    const ctrl = new TtsOutputController();
    await ctrl.speak('a'.repeat(350));
    expect(capturedUtterance?.text.length).toBeLessThan(340);
    expect(capturedUtterance?.text).toContain('más en pantalla');
  });

  it('speak() does not truncate text at exactly 300 chars', async () => {
    const ctrl = new TtsOutputController();
    const exact = 'b'.repeat(300);
    await ctrl.speak(exact);
    expect(capturedUtterance?.text).toBe(exact);
  });

  it('speak() cancels previous utterance if already speaking', async () => {
    const ctrl = new TtsOutputController();
    mockSynth.speaking = true;
    await ctrl.speak('segundo');
    expect(mockSynth.cancel).toHaveBeenCalledOnce();
  });

  it('speak() applies default rate=1.0, pitch=1.0, volume=1.0', async () => {
    const ctrl = new TtsOutputController();
    await ctrl.speak('test');
    expect(capturedUtterance?.rate).toBe(1.0);
    expect(capturedUtterance?.pitch).toBe(1.0);
    expect(capturedUtterance?.volume).toBe(1.0);
  });

  it('speak() respects setDefaultOptions overrides', async () => {
    const ctrl = new TtsOutputController();
    ctrl.setDefaultOptions({ rate: 1.2, pitch: 0.9, volume: 0.8 });
    await ctrl.speak('test');
    expect(capturedUtterance?.rate).toBe(1.2);
    expect(capturedUtterance?.pitch).toBe(0.9);
    expect(capturedUtterance?.volume).toBe(0.8);
  });

  it('speak() sets lang to es-MX on utterance', async () => {
    const ctrl = new TtsOutputController();
    await ctrl.speak('test');
    expect(capturedUtterance?.lang).toBe('es-MX');
  });

  it('speak() emits start then end events', async () => {
    const ctrl = new TtsOutputController();
    const events: string[] = [];
    ctrl.on('start', () => events.push('start'));
    ctrl.on('end', () => events.push('end'));
    await ctrl.speak('test');
    expect(events).toEqual(['start', 'end']);
  });

  it('speak() resolves after end event', async () => {
    const ctrl = new TtsOutputController();
    let resolved = false;
    const p = ctrl.speak('test').then(() => {
      resolved = true;
    });
    await p;
    expect(resolved).toBe(true);
  });

  it('cancel() calls synth.cancel', () => {
    const ctrl = new TtsOutputController();
    ctrl.cancel();
    expect(mockSynth.cancel).toHaveBeenCalledOnce();
  });

  it('selectVoiceForLang picks exact lang match (es-MX over es-AR)', async () => {
    const esAR = { lang: 'es-AR', name: 'AR' } as SpeechSynthesisVoice;
    const esMX = { lang: 'es-MX', name: 'MX' } as SpeechSynthesisVoice;
    mockSynth.getVoices.mockReturnValue([esAR, esMX]);
    const ctrl = new TtsOutputController();
    ctrl.selectVoiceForLang('es-MX');
    await ctrl.speak('test');
    expect(capturedUtterance?.voice).toBe(esMX);
  });

  it('selectVoiceForLang falls back to es-* prefix when exact not available', async () => {
    const esES = { lang: 'es-ES', name: 'ES' } as SpeechSynthesisVoice;
    mockSynth.getVoices.mockReturnValue([esES]);
    const ctrl = new TtsOutputController();
    ctrl.selectVoiceForLang('es-MX');
    await ctrl.speak('test');
    expect(capturedUtterance?.voice).toBe(esES);
  });

  it('speak() resolves immediately and emits unavailable error when synth missing', async () => {
    // @ts-expect-error
    delete global.speechSynthesis;
    const ctrl = new TtsOutputController();
    const errors: string[] = [];
    ctrl.on('error', (e) => errors.push(e.code));
    await ctrl.speak('test');
    expect(errors).toContain('unavailable');
  });
});
