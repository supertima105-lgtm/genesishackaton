import { Check, Circle, ImagePlus, LoaderCircle, Minus, Music2, Pause, Play, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LIBRARY, LIBRARY_ARTIST, libraryFile } from '../lib/library';
import { createDay, type Step } from '../lib/pipeline';
import { lookupSong, readAudioTags, type SongMeta } from '../lib/songMeta';
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

  // ── песня: исполнитель и название определяются сами, ручная правка важнее ──
  const touched = useRef({ artist: false, title: false });
  const lookup = useRef<Promise<SongMeta | null> | null>(null);
  const [songFound, setSongFound] = useState<null | 'looking' | 'link' | 'file' | 'none' | 'preset'>(null);
  const applyMeta = (m: SongMeta | null, from: 'link' | 'file') => {
    if (!m) return;
    if (m.artist && !touched.current.artist) setArtist(m.artist);
    if (m.title && !touched.current.title) setTitle(m.title);
    setSongFound(from);
  };
  useEffect(() => {
    const url = link.trim();
    if (!/^https?:\/\/\S+\.\S+/.test(url)) {
      lookup.current = null;
      setSongFound((s) => (s === 'link' || s === 'looking' || s === 'none' ? null : s));
      return;
    }
    setSongFound('looking');
    let alive = true;
    const t = window.setTimeout(() => {
      const p = lookupSong(url);
      lookup.current = p;
      void p.then((m) => {
        if (!alive) return;
        if (m) applyMeta(m, 'link');
        else setSongFound('none');
      });
    }, 400);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link]);

  const hasLink = /^https?:\/\/\S+\.\S+/.test(link.trim());
  const songOk = Boolean(audio) || hasLink || Boolean(artist.trim() && title.trim());
  const ready = text.trim().length >= 20 && photos.length > 0 && songOk && !busy;

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const imgs = [...files].filter((f) => f.type.startsWith('image/'));
    setPhotos((p) => [...p, ...imgs].slice(0, 8));
  };

  const onAudio = async (f?: File) => {
    pickPreset(null);
    setAudio(f);
    if (f && !hasLink) applyMeta(await readAudioTags(f), 'file');
  };

  // ── готовая музыка: выбрать мелодию из библиотеки дневника и сразу её услышать ──
  const [preset, setPreset] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: string; state: 'load' | 'play' } | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const stopPreview = () => {
    player.current?.pause();
    setPreview(null);
  };
  useEffect(() => () => player.current?.pause(), []);
  const pickPreset = (id: string | null) => {
    if (!id) {
      if (preset) {
        stopPreview();
        setPreset(null);
        setSongFound(null);
      }
      return;
    }
    if (preset === id && preview?.id === id) return stopPreview();
    setPreset(id);
    setPreview({ id, state: 'load' });
    void libraryFile(id).then((f) => {
      setAudio(f);
      setArtist(LIBRARY_ARTIST);
      setTitle(LIBRARY.find((t) => t.id === id)!.name);
      touched.current = { artist: false, title: false };
      setSongFound('preset');
      const url = URL.createObjectURL(f);
      player.current?.pause();
      const a = new Audio(url);
      a.volume = 0.8;
      a.onended = () => setPreview((p) => (p?.id === id ? null : p));
      player.current = a;
      void a.play().catch(() => {});
      setPreview((p) => (p?.id === id ? { id, state: 'play' } : p));
    });
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    setSteps([]);
    try {
      // ссылку вставили и сразу нажали — дождёмся, пока узнаем песню
      let a = artist.trim();
      let t = title.trim();
      if ((!a || !t) && lookup.current) {
        const m = await lookup.current.catch(() => null);
        if (!touched.current.artist) a = a || m?.artist || '';
        if (!touched.current.title) t = t || m?.title || '';
      }
      const day = await createDay(
        { text: text.trim(), date, photos, artist: a || 'Без исполнителя', title: t || 'Без названия', link: link.trim() || undefined, audio, withWeather },
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
        <h1 className="font-hand text-5xl leading-none font-bold text-blue">
          {date === localToday() ? 'Как прошёл день?' : `Как прошло ${new Date(date + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}?`}
        </h1>
        <p className="mt-2 max-w-2xl text-ink-soft">Как рассказали бы другу: свет, звуки, кто был рядом.</p>

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
            className="lined mt-3 w-full resize-y bg-white/50 py-[6px] pr-4 pl-6 text-[19px] leading-[32px] shadow-[inset_0_0_0_1px_var(--color-line)] outline-none focus:shadow-[inset_0_0_0_2px_var(--color-blue)]"
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
              <div key={src} className="group polaroid relative aspect-square p-1.5 pb-5 odd:-rotate-2 even:rotate-2">
                <img src={src} alt="" className="h-full w-full object-cover" />
                <span className="tape -top-2 left-1/2 h-4 w-12 -translate-x-1/2 -rotate-3" />
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
          <input
            className="field mt-3 w-full"
            placeholder="Ссылка: Spotify, YouTube, Яндекс Музыка, SoundCloud"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
          <label className="mt-3 flex cursor-pointer items-center gap-3 border border-dashed border-ink-soft/50 p-3 hover:border-ink">
            <Music2 size={18} />
            <span className="text-sm">{audio ? audio.name : 'или аудиофайл — услышу темп и энергию'}</span>
            {audio && (
              <button type="button" className="ml-auto" aria-label="Убрать файл" onClick={(e) => (e.preventDefault(), pickPreset(null), setAudio(undefined))}>
                <X size={14} />
              </button>
            )}
            <input type="file" accept="audio/*" className="hidden" onChange={(e) => void onAudio(e.target.files?.[0])} />
          </label>

          <div className="mt-5">
            <div className="label normal-case tracking-normal">или готовая музыка дневника — нажмите, чтобы послушать и выбрать</div>
            <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {LIBRARY.map((t, k) => {
                const on = preset === t.id;
                const st = preview?.id === t.id ? preview.state : null;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => pickPreset(t.id)}
                    aria-pressed={on}
                    className={`flex min-w-0 items-center gap-2.5 rounded-sm px-2.5 py-2 text-left shadow-[0_2px_0_rgba(0,0,0,.07)] transition-transform hover:-translate-y-0.5 ${on ? 'bg-note ring-2 ring-blue/60' : 'bg-white/60'}`}
                    style={{ rotate: `${[-0.8, 0.6, -0.4, 0.9, -0.6, 0.4][k % 6]}deg` }}
                  >
                    {/* маленькая пластинка в цвет настроения */}
                    <span
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-white ${st === 'play' ? 'animate-[spin_3s_linear_infinite]' : ''}`}
                      style={{ background: `radial-gradient(circle, ${t.color} 0 34%, #1d1a17 36% 100%)` }}
                    >
                      {st === 'load' ? <LoaderCircle size={13} className="animate-spin" /> : st === 'play' ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-hand text-[20px] leading-none font-semibold">{t.name}</span>
                      <span className="mt-1 block truncate font-mono text-[10px] text-ink-soft">
                        {t.bpm} BPM · {t.tags}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <input
              className="field"
              placeholder="Исполнитель"
              value={artist}
              onChange={(e) => ((touched.current.artist = true), setArtist(e.target.value))}
            />
            <input
              className="field"
              placeholder="Название"
              value={title}
              onChange={(e) => ((touched.current.title = true), setTitle(e.target.value))}
            />
          </div>
          <p className="label mt-2 h-4 normal-case tracking-normal">
            {songFound === 'looking'
              ? 'узнаю песню по ссылке…'
              : songFound === 'link'
                ? '✓ определено по ссылке — можно поправить'
                : songFound === 'file'
                  ? '✓ определено по файлу — можно поправить'
                  : songFound === 'none'
                    ? 'по ссылке не узнал — впишите сами'
                    : songFound === 'preset'
                      ? '✓ мелодия из дневника — темп и энергию услышу сам'
                      : ''}
          </p>
        </div>

        <div className="mt-6">
          <label className="flex cursor-pointer items-center gap-3 text-sm" title="Браузер спросит геолокацию; координаты округляются до ~1 км и уходят только в Open-Meteo.">
            <input type="checkbox" checked={withWeather} onChange={(e) => setWithWeather(e.target.checked)} className="accent-[var(--color-ink)]" />
            Добавить погоду дня
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
        {steps.length === 0 ? (
          <ul className="note space-y-1 text-[22px]">
            <li>фото → палитра</li>
            <li>песня → темп и лад</li>
            <li>текст → настроение</li>
          </ul>
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
