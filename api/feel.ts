import { GoogleGenAI, Type } from '@google/genai';

/**
 * POST /api/feel — второй слой ощущений дня («Глубже в день»).
 * Тело: { text, song: { artist, title } } → { love, freedom, … } (0..1).
 */

const KEYS = ['love', 'freedom', 'wonder', 'gratitude', 'hope', 'play', 'vigor', 'novelty', 'meaning', 'loudness', 'light'] as const;

const SYSTEM = `Ты — внимательный читатель личного дневника. По записи дня оцени, как этот день ощущался. Это художественная оценка атмосферы, НЕ психологическая диагностика.
Все шкалы от 0 до 1, 0.5 — нейтрально или не понятно из текста:
- love: 0 равнодушие … 1 любовь, нежность, влюблённость, близость с дорогими людьми
- freedom: 0 скованность, обязанности … 1 свобода, простор, «можно всё»
- wonder: 0 обыденность … 1 восторг, удивление, чудо
- gratitude: 0 досада, обида … 1 благодарность, «повезло»
- hope: 0 безнадёжность … 1 надежда, планы, ожидание хорошего
- play: 0 всерьёз … 1 игриво, смешно, дурачились
- vigor: 0 усталость, сонливость … 1 бодрость, силы
- novelty: 0 рутина, как всегда … 1 впервые, новое
- meaning: 0 обычный день … 1 особенный, запомнится надолго
- loudness: 0 тишина … 1 шум, музыка, толпа
- light: 0 темно, ночь, сумрак … 1 светло, солнце
Не ставь крайние значения без явных признаков в тексте.`;

const SCHEMA = {
  type: Type.OBJECT,
  properties: Object.fromEntries(KEYS.map((k) => [k, { type: Type.NUMBER }])),
  required: [...KEYS],
};

export async function POST(req: Request): Promise<Response> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json({ error: 'GEMINI_API_KEY не задан' }, 503);
  const body = (await req.json()) as { text?: string; song?: { artist?: string; title?: string } };
  if (!body?.text?.trim()) return json({ error: 'пустой текст' }, 400);

  const ai = new GoogleGenAI({ apiKey: key });
  const prompt = `Песня дня: ${body.song?.artist ?? ''} — ${body.song?.title ?? ''}\n\nЗапись дня:\n${body.text.slice(0, 6000)}`;
  const models: [string, number][] = [
    // задача простая — быстрая lite-модель первой
    ['gemini-3.1-flash-lite', 8000],
    ['gemini-3.5-flash-lite', 10000],
    ...(process.env.GEMINI_MODEL ? [[process.env.GEMINI_MODEL, 15000] as [string, number]] : []),
    ['gemini-3.8-flash', 15000],
  ];
  let lastError: unknown;
  for (const [model, timeout] of models) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          systemInstruction: SYSTEM,
          responseMimeType: 'application/json',
          responseSchema: SCHEMA,
          temperature: 0.4,
          abortSignal: AbortSignal.timeout(timeout),
        },
      });
      const raw = JSON.parse(res.text ?? '{}') as Record<string, unknown>;
      const num = (v: unknown) => (Number.isFinite(Number(v)) ? Math.min(1, Math.max(0, Number(v))) : 0.5);
      const out = Object.fromEntries(KEYS.map((k) => [k, num(raw[k])]));
      return json({ ...out, model });
    } catch (e) {
      lastError = e;
      if (!/404|NOT_FOUND|no longer available|503|UNAVAILABLE|429|RESOURCE_EXHAUSTED|abort|timeout/i.test(String((e as Error).message) + (e as Error).name)) break;
    }
  }
  return json({ error: String((lastError as Error)?.message ?? lastError) }, 502);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}
