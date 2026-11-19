import { Check, Circle, ImagePlus, LoaderCircle, Minus, Music2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createDay, type Step } from '../lib/pipeline';
import { localToday } from '../lib/useDays';

/** initialDate — когда день записывают из календаря задним числом. */
export function NewDay({ initialDate }: { initialDate?: string }) {
  const [text, setText] = useState('');
  const [date, setDate] = useState(initialDate && initialDate <= localToday() ? initialDate : localToday());
  const [photos, setPhotos] = useState<File[]>([]);
  const [artist, setArtist] = useState('');
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [audio, setAudio] = useState<File | undefined>();
  const [withWeather, setWithWeather] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gemini, setGemini] = useState<boolean | null>(null);

  useEffect(() => {
    if (import.meta.env.MODE === 'standalone') return setGemini(false);
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setGemini(Boolean(d.gemini)))
      .catch(() => setGemini(false));
  }, []);

  const previews = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos]);
  useEffect(() => () => previews.forEach(URL.revokeObjectURL), [previews]);

  const songOk = Boolean(audio) || (artist.trim() && title.trim());
  const ready = text.trim().length >= 20 && photos.length > 0 && songOk && !busy;

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const imgs = [...files].filter((f) => f.type.startsWith('image/'));
    setPhotos((p) => [...p, ...imgs].slice(0, 8));
  };

  const onAudio = (f?: File) => {
    setAudio(f);
    if (f && !title) {
      const name = f.name.replace(/\.[^.]+$/, '');
      const [a, t] = name.split(/\s+[-–—]\s+/);
      if (t) {
        if (!artist) setArtist(a);
        setTitle(t);
      } else setTitle(name);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    setSteps([]);
    try {
      const day = await createDay(
        { text: text.trim(), date, photos, artist: artist.trim() || 'Без исполнителя', title: title.trim() || 'Без названия', link: link.trim() || undefined, audio, withWeather },
        (s) => setSteps((prev) => (prev.some((p) => p.id === s.id) ? prev.map((p) => (p.id === s.id ? s : p)) : [...prev, s])),
      );
      setTimeout(() => (location.hash = `#/day/${day.id}`), 900);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_380px]">
      <section>
        <h1 className="font-serif text-3xl">
          {date === localToday() ? 'Как прошёл день?' : `Как прошло ${new Date(date + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}?`}
        </h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Пишите так, как рассказали бы близкому другу: погода, свет, запахи, звуки, кто был рядом, мелочи, которые запомнились.
        </p>

        <div className="mt-8">
          <div className="flex items-baseline justify-between">
            <span className="label">01 · запись</span>
            <input type="date" value={date} max={localToday()} onChange={(e) => setDate(e.target.value)} className="label bg-transparent" />
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={9}
            placeholder="Гуляли по парку, всё в жёлтых листьях. Было холодно, но мы пили какао из термоса и долго разговаривали…"
            className="mt-3 w-full resize-y border border-line bg-paper-2/40 p-4 font-serif text-xl leading-relaxed outline-none focus:border-ink"
          />
          <div className="label mt-1 text-right">{text.trim().length < 20 ? `ещё ${20 - text.trim().length} символов` : `${text.trim().split(/\s+/).length} слов`}</div>
        </div>

        <div className="mt-8">
          <span className="label">02 · фото дня (до 8)</span>
          <div
            className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              addPhotos(e.dataTransfer.files);
            }}
          >
            {previews.map((src, i) => (
              <div key={src} className="group relative aspect-square overflow-hidden bg-paper-2">
                <img src={src} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  aria-label="Убрать фото"
                  onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                  className="absolute top-1 right-1 bg-ink/70 p-1 text-paper opacity-0 transition group-hover:opacity-100 focus:opacity-100"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {photos.length < 8 && (
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-ink-soft/50 text-ink-soft hover:border-ink hover:text-ink">
                <ImagePlus size={22} />
                <span className="label">добавить</span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => addPhotos(e.target.files)} />
              </label>
            )}
          </div>
        </div>

        <div className="mt-8">
          <span className="label">03 · песня дня</span>
          <div className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <input className="field" placeholder="Исполнитель" value={artist} onChange={(e) => setArtist(e.target.value)} />
            <input className="field" placeholder="Название" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input className="field sm:col-span-2" placeholder="Ссылка: Spotify, Яндекс Музыка, YouTube, SoundCloud" value={link} onChange={(e) => setLink(e.target.value)} />
          </div>
          <label className="mt-4 flex cursor-pointer items-center gap-3 border border-dashed border-ink-soft/50 p-3 hover:border-ink">
            <Music2 size={18} />
            <span className="text-sm">
              {audio ? audio.name : 'или аудиофайл — тогда система сама услышит темп, лад и энергию'}
            </span>
            {audio && (
              <button type="button" className="ml-auto" aria-label="Убрать файл" onClick={(e) => (e.preventDefault(), setAudio(undefined))}>
                <X size={14} />
              </button>
            )}
            <input type="file" accept="audio/*" className="hidden" onChange={(e) => onAudio(e.target.files?.[0])} />
          </label>
          <p className="label mt-2 normal-case tracking-normal">
            Целиком песня не хранится: в папку дня попадает только фрагмент ~40 с, остальное — ссылка.
          </p>
        </div>

        <div className="mt-8">
          <span className="label">04 · по желанию</span>
          <label className="mt-3 flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={withWeather} onChange={(e) => setWithWeather(e.target.checked)} className="mt-1 accent-[var(--color-ink)]" />
            <span className="text-sm">
              Добавить погоду этого дня
              <span className="block text-ink-soft">
                Браузер спросит геолокацию; координаты округляются до ~1 км и уходят только в Open-Meteo. Дождь и снег пойдут по кадру,
                солнце даст ореол.
              </span>
            </span>
          </label>
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <button type="button" className="btn btn-solid" disabled={!ready} onClick={submit}>
            {busy ? <LoaderCircle size={14} className="animate-spin" /> : null} Собрать воспоминание
          </button>
          <span className="label">
            {gemini === null
              ? ''
              : gemini
                ? 'анализ: Gemini'
                : import.meta.env.MODE === 'standalone'
                  ? 'анализ: эвристика (офлайн-версия, без сервера)'
                  : 'анализ: эвристика (нет GEMINI_API_KEY)'}
          </span>
        </div>
        {error && <p className="mt-4 text-sm text-rust">{error}</p>}
      </section>

      <aside className="lg:sticky lg:top-8 lg:self-start">
        <span className="label">что делает система</span>
        {steps.length === 0 ? (
          <ol className="mt-4 space-y-3 text-sm text-ink-soft">
            <li>Смотрит на фото — палитра, свет, тёплые и холодные тона.</li>
            <li>Слушает песню — темп, лад, энергия, жанр и эпоха.</li>
            <li>Читает запись — настроение, время, место, люди.</li>
            <li>Если разрешите — узнаёт погоду этого дня.</li>
            <li>Сводит всё в оси настроения и выбирает «почерк» страницы.</li>
            <li>Придумывает название и складывает всё в папку дня.</li>
            <li>Озвучивает запись голосом, подобранным под атмосферу.</li>
          </ol>
        ) : (
          <ol className="mt-4 space-y-4">
            {steps.map((s) => (
              <li key={s.id} className="flex gap-3">
                <span className="mt-0.5 shrink-0">
                  {s.status === 'run' ? (
                    <LoaderCircle size={16} className="animate-spin" />
                  ) : s.status === 'done' ? (
                    <Check size={16} />
                  ) : s.status === 'skip' ? (
                    <Minus size={16} className="text-ink-soft" />
                  ) : (
                    <Circle size={16} className="text-rust" />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="text-sm">{s.label}</div>
                  {s.detail && <div className="label mt-1 normal-case tracking-normal">{s.detail}</div>}
                  {s.swatches && (
                    <div className="mt-2 flex gap-1">
                      {s.swatches.map((c, i) => (
                        <span key={i} className="h-4 w-6 border border-ink/10" style={{ background: c }} title={c} />
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </aside>
    </div>
  );
}
