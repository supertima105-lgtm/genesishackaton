import { useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';
import type { DayRecord } from '../lib/types';

interface Props {
  day: DayRecord;
  excerptUrl?: string;
  onMedia: (el: HTMLMediaElement | null) => void;
}

const BARCODE =
  'repeating-linear-gradient(90deg, #2b2620 0 2px, transparent 2px 4px, #2b2620 4px 5px, transparent 5px 8px, #2b2620 8px 11px, transparent 11px 12px)';

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
      waveColor: '#c9b48c',
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

  const showEmbed = !excerptUrl && embed;

  // билет на песню дня: корешок с темпом, штрихкод
  return (
    <div className="mt-3 grid rotate-[1.2deg] grid-cols-[1fr_44px] drop-shadow-[0_8px_8px_rgba(0,0,0,.14)]">
      <div className="min-w-0 rounded-l-lg bg-[#f3e1b8] px-4 pt-3 pb-3">
        <div className="label">песня дня · admit one</div>
        {/* у встроенного плеера своё название и исполнитель — не дублируем */}
        {!showEmbed && (
          <>
            <div className="mt-1 font-hand text-[32px] leading-none font-bold">{day.song.title}</div>
            <div className="mt-1 font-mono text-xs">{day.song.artist}</div>
          </>
        )}
        {excerptUrl && <div ref={box} className="mt-3" />}
        {showEmbed && (
          <iframe
            title="Песня дня"
            src={embed}
            height={height}
            className="mt-2 w-full rounded-xl border-0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
          />
        )}
        {!excerptUrl && !embed && day.song.link?.url && (
          <a href={day.song.link.url} target="_blank" rel="noreferrer" className="mt-2 inline-block font-hand text-xl text-blue underline underline-offset-4">
            открыть песню
          </a>
        )}
        <div className="mt-3 h-6 w-2/3" style={{ background: BARCODE }} aria-hidden />
      </div>
      <div className="grid place-items-center rounded-r-lg border-l-2 border-dashed border-ink/25 bg-[#ecd3a0] font-mono text-[11px] tracking-[.2em] [writing-mode:vertical-rl]">
        ♪ {Math.round(day.style.motion.bpm)} BPM
      </div>
    </div>
  );
}
