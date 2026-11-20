import { useEffect, useRef, type CSSProperties } from 'react';
import WaveSurfer from 'wavesurfer.js';
import type { DayRecord } from '../lib/types';

interface Props {
  day: DayRecord;
  excerptUrl?: string;
  onMedia: (el: HTMLMediaElement | null) => void;
  /** день «проживается» — пластинка выезжает из конверта и крутится */
  playing?: boolean;
}

/** Пластинка дня и под ней — фрагмент песни с волной (wavesurfer) или официальный плеер сервиса по ссылке. */
export function SongPlayer({ day, excerptUrl, onMedia, playing = false }: Props) {
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
  const era = day.signals.music.era;

  // пластинка дня: винил выглядывает из бумажного конверта и выезжает, когда день играет
  return (
    <div>
      <div className="label">пластинка дня</div>
      <div className="relative mt-3 aspect-[340/178] w-full max-w-[340px]">
        <div
          className={`absolute top-[5.1%] left-[20%] aspect-square w-[47%] transition-transform duration-700 ease-out ${playing ? 'translate-x-[70%]' : 'translate-x-[38%]'}`}
          aria-hidden
        >
          <div className={`vinyl h-full w-full ${playing ? 'spinning' : ''}`} style={{ '--label': accent } as CSSProperties}>
            <span className="absolute top-[38%] left-1/2 -translate-x-1/2 font-mono text-[9px] tracking-widest text-white/80 mix-blend-difference">33⅓</span>
          </div>
          <div className="vinyl-sheen" />
        </div>
        <div className="sleeve absolute top-0 left-0 z-10 flex aspect-square w-[52%] -rotate-2 flex-col justify-end p-[7%]">
          <div className="absolute top-[7%] right-[8%] font-mono text-[10px] text-ink-soft">
            ♪ {Math.round(day.style.motion.bpm)}
            {era ? ` · ’${String(era).slice(-2)}` : ''}
          </div>
          <div className="line-clamp-3 font-hand text-[clamp(22px,7vw,30px)] leading-[0.95] font-bold">{day.song.title}</div>
          <div className="mt-1 truncate font-mono text-[11px]">{day.song.artist}</div>
        </div>
      </div>
      {excerptUrl && <div ref={box} className="mt-4" />}
      {showEmbed && (
        <iframe
          title="Песня дня"
          src={embed}
          height={height}
          className="mt-4 w-full rounded-xl border-0"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
        />
      )}
      {!excerptUrl && !embed && day.song.link?.url && (
        <a href={day.song.link.url} target="_blank" rel="noreferrer" className="mt-3 inline-block font-hand text-xl text-blue underline underline-offset-4">
          открыть песню
        </a>
      )}
    </div>
  );
}
