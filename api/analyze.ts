import { GoogleGenAI, Type } from '@google/genai';

interface Body {
  text: string;
  date: string;
  photos: { mime: string; data: string }[];
  song: { artist: string; title: string; hasAudio: boolean };
}

const SYSTEM = `Ты — внимательный редактор личного дневника. Пользователь описывает свой день, прикладывает фото и называет песню.
Твоя задача — перевести день в параметры настроения для визуальной системы дневника. Ты НЕ ставишь психологических диагнозов: оцениваешь только атмосферу текста.

Шкалы (числа):
- valence: от -1 (грустно, тяжело) до 1 (радостно, светло)
- energy: 0..1 — насколько день был подвижным, насыщенным событиями
- tension: 0..1 — спешка, стресс, напряжение, дедлайн
- warmth: 0..1 — уют, близость, тепло между людьми и «внутри» (не температура воздуха!)
- nostalgia: 0..1 — воспоминания, прошлое, «как раньше»
- social: 0..1 — 0 один, 0.5 вдвоём, 1 много людей
Учитывай и фото: свет, место, людей, время суток.

title — название папки дня. Правила (строго):
- 3–7 слов, по-русски, именная фраза без глагола, без кавычек, эмодзи и точки в конце
- конкретные образы из этого дня: место, время, люди, предмет — то, что человек узнает через год
- тон спокойный, как подпись к фотоальбому; с заглавной буквы только первое слово (кроме имён)
- примеры: «Осенний парк и какао», «Ночь в офисе перед сдачей», «Первый снег на Арбате», «Мамин пирог и долгий разговор»

caption — подпись на странице дневника: одна строка до 10 слов, от первого лица, самая живая деталь дня, без пафоса и клише.
images — 3–5 ключевых образов (существительные). moodWords — 2–3 слова о настроении.

music — оценка песни по исполнителю и названию (ты знаешь многие песни): bpm, energy 0..1, mode major/minor, brightness 0..1 (насколько звучание яркое, звонкое), genre (коротко, по-английски), era (год выхода). Если песню не знаешь — оцени правдоподобно по исполнителю.`;

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    text: {
      type: Type.OBJECT,
      properties: {
        valence: { type: Type.NUMBER },
        energy: { type: Type.NUMBER },
        tension: { type: Type.NUMBER },
        warmth: { type: Type.NUMBER },
        nostalgia: { type: Type.NUMBER },
        social: { type: Type.NUMBER },
        timeOfDay: { type: Type.STRING, enum: ['morning', 'day', 'evening', 'night'] },
        season: { type: Type.STRING, enum: ['winter', 'spring', 'summer', 'autumn'] },
        setting: { type: Type.STRING, enum: ['nature', 'water', 'city', 'indoor', 'road'] },
        light: { type: Type.STRING, enum: ['soft', 'golden', 'hard', 'overcast', 'low', 'neon'] },
        images: { type: Type.ARRAY, items: { type: Type.STRING } },
        moodWords: { type: Type.ARRAY, items: { type: Type.STRING } },
        title: { type: Type.STRING },
        caption: { type: Type.STRING },
      },
      required: ['valence', 'energy', 'tension', 'warmth', 'nostalgia', 'social', 'timeOfDay', 'season', 'setting', 'light', 'images', 'moodWords', 'title', 'caption'],
    },
    music: {
      type: Type.OBJECT,
      properties: {
        bpm: { type: Type.NUMBER },
        energy: { type: Type.NUMBER },
        mode: { type: Type.STRING, enum: ['major', 'minor'] },
        brightness: { type: Type.NUMBER },
        genre: { type: Type.STRING },
        era: { type: Type.INTEGER },
      },
      required: ['bpm', 'energy', 'mode', 'brightness', 'genre', 'era'],
    },
  },
  required: ['text', 'music'],
};

export async function POST(req: Request): Promise<Response> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json({ error: 'GEMINI_API_KEY не задан' }, 503);
  const body = (await req.json()) as Body;
  if (!body?.text?.trim()) return json({ error: 'пустой текст' }, 400);

  const ai = new GoogleGenAI({ apiKey: key });
  const parts = [
    {
      text: `Дата: ${body.date}\nПесня: ${body.song.artist} — ${body.song.title}\n\nЗапись дня:\n${body.text.slice(0, 6000)}`,
    },
    ...body.photos.slice(0, 4).map((p) => ({ inlineData: { mimeType: p.mime, data: p.data } })),
  ];
  // Лучшая модель первой; если она перегружена или молчит дольше таймаута — быстрая lite-модель.
  const models: [string, number][] = [
    ...(process.env.GEMINI_MODEL ? [[process.env.GEMINI_MODEL, 25000] as [string, number]] : []),
    ['gemini-3.8-flash', 10000],
    ['gemini-3.1-flash-lite', 25000],
    ['gemini-3.5-flash-lite', 25000],
  ];
  let lastError: unknown;
  for (const [model, timeout] of models) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction: SYSTEM,
          responseMimeType: 'application/json',
          responseSchema: SCHEMA,
          temperature: 0.6,
          abortSignal: AbortSignal.timeout(timeout),
        },
      });
      return json({ ...JSON.parse(res.text ?? '{}'), model });
    } catch (e) {
      lastError = e;
      // модель снята, перегружена или упёрлась в лимит — пробуем следующую
      if (!/404|NOT_FOUND|no longer available|503|UNAVAILABLE|429|RESOURCE_EXHAUSTED|abort|timeout/i.test(String((e as Error).message) + (e as Error).name)) break;
    }
  }
  return json({ error: String((lastError as Error)?.message ?? lastError) }, 502);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}
