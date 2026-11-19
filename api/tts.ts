/**
 * Озвучка записи голосом, выбранным правилами системы. Возвращает audio/wav.
 * Прямой REST: текущий SDK неверно сериализует speechConfig для новых TTS-моделей.
 */
const MODELS = ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts', 'gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts'];
const RETRYABLE = /404|NOT_FOUND|no longer available|503|UNAVAILABLE|429|RESOURCE_EXHAUSTED|abort|timeout/i;

export async function POST(req: Request): Promise<Response> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return err('GEMINI_API_KEY не задан', 503);
  const { text, voice, style } = (await req.json()) as { text: string; voice: string; style: string };
  if (!text?.trim()) return err('пустой текст', 400);

  const body = JSON.stringify({
    contents: [{ parts: [{ text: `${style}:\n\n${text.slice(0, 2500)}` }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  });

  let last = 'нет ответа';
  for (const model of [process.env.GEMINI_TTS_MODEL, ...MODELS].filter(Boolean) as string[]) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body,
        signal: AbortSignal.timeout(45000),
      });
      const data = (await r.json()) as {
        error?: { message: string; status: string };
        candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[];
      };
      if (!r.ok) {
        last = `${r.status} ${data.error?.status ?? ''} ${data.error?.message ?? ''}`;
        if (RETRYABLE.test(last)) continue;
        break;
      }
      const inline = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
      if (!inline?.data) {
        last = `${model}: нет аудио в ответе`;
        continue;
      }
      const bytes = Buffer.from(inline.data, 'base64');
      const mime = inline.mimeType ?? '';
      const audio = /wav/i.test(mime) ? bytes : wav(bytes, Number(/rate=(\d+)/i.exec(mime)?.[1] ?? 24000));
      return new Response(new Uint8Array(audio), { headers: { 'content-type': 'audio/wav', 'x-model': model } });
    } catch (e) {
      last = `${(e as Error).name}: ${(e as Error).message}`;
      if (!RETRYABLE.test(last)) break;
    }
  }
  return err(last, 502);
}

function err(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), { status, headers: { 'content-type': 'application/json' } });
}

function wav(pcm: Buffer, sampleRate: number): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
