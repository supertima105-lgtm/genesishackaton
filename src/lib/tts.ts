import type { VoiceChoice } from './types';

/** Озвучка через Gemini TTS (на сервере). null — если ключа нет или сервис недоступен. */
export async function synthesize(text: string, voice: VoiceChoice): Promise<Blob | null> {
  try {
    const r = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, voice: voice.name, style: voice.style }),
    });
    if (!r.ok) return null;
    return await r.blob();
  } catch {
    return null;
  }
}

/** Запасной вариант — голос браузера, но темп и высота всё равно задаются правилами системы. */
export function speakInBrowser(text: string, voice: VoiceChoice, onEnd?: () => void): () => void {
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ru-RU';
  u.rate = voice.rate;
  u.pitch = voice.pitch;
  const ru = synth.getVoices().find((v) => v.lang.startsWith('ru'));
  if (ru) u.voice = ru;
  u.onend = () => onEnd?.();
  synth.speak(u);
  return () => synth.cancel();
}
