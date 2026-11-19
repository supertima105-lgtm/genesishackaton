import { useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';
import type { DayRecord } from '../lib/types';

interface Props {
  day: DayRecord;
  excerptUrl?: string;
  onMedia: (el: HTMLMediaElement | null) => void;
}

/** Фрагмент песни с волной (wavesurfer) или официальный плеер сервиса по ссылке. */
export function SongPlayer({ day, excerptUrl, onMedia }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const { ink, accent } = day.style.palette;

  useEffect(() => {
    if (!excerptUrl || !box.current) return;
    const el = new Audio();
    if (/^https?:/.test(excerptUrl)) el.crossOrigin = 'anonymous'; // живой анализ звука работает и для Supabase
    const ws = WaveSurfer.create({
      container: box.current,
      media: el,
      url: excerptUrl,
      height: 48,
      waveColor: '#b9afa2',
      progressColor: day.style.palette.dark ? accent : ink,
      cursorWidth: 0,
      barWidth: 2,
      barGap: 2,
      barRadius: 2,
      normalize: true,
    });
    const media = ws.getMediaElement();
    if (media) media.loop = true;
    onMedia(media ?? null);
    return () => {
      onMedia(null);
      ws.destroy();
    };
  }, [excerptUrl, ink, accent, day.style.palette.dark, onMedia]);

  const embed = day.song.link?.embedUrl;
  const height = day.song.link?.provider === 'spotify' ? 152 : day.song.link?.provider === 'youtube' ? 200 : 120;

  return (
    <div>
      <div className="label">песня дня</div>
      <div className="mt-1 font-serif text-xl">
        {day.song.artist} — {day.song.title}
      </div>
      {excerptUrl && <div ref={box} className="mt-3" />}
      {excerptUrl && (
        <p className="label mt-1 normal-case tracking-normal">
          фрагмент {Math.round(day.song.excerptDuration ?? 0)} с — самый энергичный участок; страница дышит в его доли
        </p>
      )}
      {!excerptUrl && embed && (
        <>
          <iframe
            title="Песня дня"
            src={embed}
            height={height}
            className="mt-3 w-full border-0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
          />
          <p className="label mt-1 normal-case tracking-normal">
            включите плеер и «Прожить день» — страница идёт в темпе ~{Math.round(day.style.motion.bpm)} BPM
          </p>
        </>
      )}
      {!excerptUrl && !embed && day.song.link?.url && (
        <a href={day.song.link.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm underline underline-offset-4">
          открыть песню
        </a>
      )}
    </div>
  );
}
